/**
 * 响应体 → JSON 的健壮读取（host/client 同构共享）。
 *
 * 为什么不直接用 `response.json()`：宿主进程的全局 `fetch` 在**某些 harness
 * 运行时上**可能不解压响应体——harness 自带的 undici 8 被导入时会安装自己的
 * 全局 dispatcher；若该运行时的**内置 fetch 从 legacy 符号
 * `Symbol.for('undici.globalDispatcher.1')` 取调度器**，导入后它拿到的响应
 * 就会头全为 null、压缩体不解压（社区同款取证：dsh-market/dsh-market#742
 * 「第一次 web_fetch 之后市场全部请求失败（Unexpected token … is not valid
 * JSON）：宿主 undici 8 覆盖了 Node 22 内置 fetch 的全局 dispatcher」——
 * Node 22 的内置 undici 6 读 `.1`）。此时 `response.json()` 只会抛 V8 的
 * "Unexpected token '…' is not valid JSON"，把网络层问题伪装成解析问题。
 *
 * **诚实边界**：本机（系统 Node 26.10.0 / 桌面运行时 Node 24.21.0 与
 * Electron-as-node 24.18.1，内置 undici 7-8 读 `.2`）实测**复现不出**该症状，
 * 本插件设置面板那次失败的原始报文也没留存。故本模块是**防御性**的：
 * 它不假设根因，只保证"响应体是未解压的压缩字节"这一形态可被恢复，
 * 并在不可恢复时给出字节级诊断（好让下一次复发能定论）。
 *
 * 策略：
 * 1. 读原始字节（未解压的压缩流就是一堆二进制）；
 * 2. 先按 UTF-8 文本试 `JSON.parse`（正常路径，浏览器/健康宿主都是明文）；
 * 3. 失败则按**魔数**嗅探 gzip / zlib-deflate / zstd，用 `DecompressionStream`
 *    自行解压再试（最多 MAX_INFLATE_ROUNDS 轮，纯防御：容忍被中间层压了多次的
 *    畸形响应）；
 * 4. 仍失败时抛**带诊断**的错误（HTTP 状态、content-type、content-encoding、
 *    字节数、首字节十六进制）——下次复发一眼定位，不再是一句 V8 文案。
 *
 * **可恢复面**：只有带魔数的 gzip（`1f8b`）与 zlib-deflate（`78xx`）能自解压；
 * brotli 无魔数、zstd 在 Node 24/26 的 DecompressionStream 里不被支持——这两种
 * 只做识别/报错，**不可恢复**。所以调用方更该做的是**从源头要明文**：
 * 显式发 `accept-encoding: identity`（见 registry-latest.ts / comfy-client.ts）。
 *
 * 同构约束：只用双端全局 API（`Response` / `DecompressionStream` / `Blob` /
 * `TextDecoder`），**不得引入任何 Node 依赖**——本目录会被内联进 client bundle。
 */

/** 嗅探出的压缩格式（比 `DecompressionStream` 的类型面多一个 zstd：只为诊断识别）。 */
type CompressionFormat = 'gzip' | 'deflate' | 'zstd'

/** `DecompressionStream` 构造参数的类型面（运行时能力以构造是否抛错为准，不做版本判断）。 */
type WebCompressionFormat = ConstructorParameters<typeof DecompressionStream>[0]

/** 响应体读取上限（字节）：`/<pkg>/latest` 是单版本 manifest，正常远小于此。 */
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024

/** 解压轮数上限（纯防御：现实里没有可靠来源产生多层压缩；到顶即诚实地报错）。 */
const MAX_INFLATE_ROUNDS = 3

/** 解压结果超过 maxBytes（≠ 格式不支持/流损坏：必须抛出去，不能降级成"未知格式"）。 */
class InflateLimitError extends Error {}

/** readJsonBody 的可调面。 */
export interface JsonBodyOptions {
  /** 响应体读取上限（字节，压缩体与解压产物都受此约束）；缺省 8 MiB。 */
  maxBytes?: number
}

/** 首字节十六进制（诊断用；最多前 8 字节）。 */
function headHex(bytes: Uint8Array): string {
  let out = ''
  for (const byte of bytes.subarray(0, 8)) out += byte.toString(16).padStart(2, '0')
  return out
}

/**
 * 嗅探压缩魔数（只看头部；看起来是明文/未知格式返回 null）：
 * - gzip：`1f 8b`；
 * - zstd：`28 b5 2f fd`（Node 24/26 的 DecompressionStream 尚不支持，识别只为诊断）；
 * - zlib 包裹的 deflate：`CMF=0x78` 且 `(CMF<<8 | FLG) % 31 === 0`（RFC1950 校验，
 *   弱校验——明文恰好以 `0x78` 开头时可能误判，故报错文案用"疑似"）。
 */
function sniffCompression(bytes: Uint8Array): CompressionFormat | null {
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) return 'gzip'
  if (bytes.length >= 4 && bytes[0] === 0x28 && bytes[1] === 0xb5 && bytes[2] === 0x2f && bytes[3] === 0xfd) return 'zstd'
  if (bytes.length >= 2 && bytes[0] === 0x78 && (((bytes[0] ?? 0) << 8) | (bytes[1] ?? 0)) % 31 === 0) return 'deflate'
  return null
}

/** Uint8Array → 独立 ArrayBuffer（BlobPart 的类型面只认 ArrayBuffer，不吃 ArrayBufferLike 视图）。 */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

/**
 * 试解压：格式不被运行时支持或流损坏时返回 null（调用方转诊断错误）；
 * 解压产物超过 maxBytes 时抛 InflateLimitError（边解压边计量，防解压炸弹）。
 */
async function inflate(bytes: Uint8Array, format: CompressionFormat, maxBytes: number): Promise<Uint8Array | null> {
  if (typeof DecompressionStream !== 'function') return null
  let stream: ReadableStream<Uint8Array>
  try {
    // 'zstd' 不在 TS 的格式字面量里，但运行时（将来支持时）直接可用；不支持即构造抛错。
    stream = new Blob([toArrayBuffer(bytes)]).stream().pipeThrough(new DecompressionStream(format as WebCompressionFormat))
  } catch {
    return null
  }
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value === undefined) continue
      total += value.byteLength
      if (total > maxBytes) throw new InflateLimitError(`响应解压后过大（> ${String(maxBytes)} 字节）——拒绝解析`)
      chunks.push(value)
    }
  } catch (error) {
    if (error instanceof InflateLimitError) throw error
    return null // DataError 等：流损坏或格式不符
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

/** 响应摘要（错误文案用：只给字节级线索，不回显响应体内容）。 */
function describeResponse(response: Response, bytes: Uint8Array): string {
  const contentType = response.headers.get('content-type') ?? '（未提供）'
  const contentEncoding = response.headers.get('content-encoding') ?? '（未提供）'
  return `HTTP ${String(response.status)}，content-type ${contentType}，content-encoding ${contentEncoding}，`
    + `${String(bytes.byteLength)} 字节，首字节 ${headHex(bytes)}`
}

/**
 * 读取响应体并解析为 JSON（压缩体未解压时自行解压；见文件头注释的边界说明）。
 * @throws 读取失败/响应过大/既非 JSON 也非可解压压缩体时抛错（含诊断信息）。
 */
export async function readJsonBody(response: Response, options: JsonBodyOptions = {}): Promise<unknown> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await response.arrayBuffer())
  } catch (error) {
    throw new Error(`读取响应体失败：${error instanceof Error ? error.message : String(error)}`)
  }
  if (bytes.byteLength > maxBytes) {
    throw new Error(`响应体过大（${String(bytes.byteLength)} 字节 > 上限 ${String(maxBytes)} 字节）——拒绝解析`)
  }
  let current = bytes
  for (let round = 0; ; round += 1) {
    const text = new TextDecoder('utf-8').decode(current).replace(/^\uFEFF/, '')
    if (text.trim() !== '') {
      try {
        return JSON.parse(text) as unknown
      } catch {
        // 不是 JSON：可能整个响应体是未解压的压缩流，落到下面的魔数嗅探。
      }
    }
    const format = round < MAX_INFLATE_ROUNDS ? sniffCompression(current) : null
    if (format === null) {
      throw new Error(round > 0
        ? `响应解压后仍不是 JSON（原始响应 ${describeResponse(response, bytes)}）`
        : `响应不是 JSON（${describeResponse(response, bytes)}）`)
    }
    const inflated = await inflate(current, format, maxBytes)
    if (inflated === null) {
      throw new Error(`响应不是 JSON：疑似 ${format} 压缩数据但解压失败（${describeResponse(response, bytes)}）`)
    }
    current = inflated
  }
}
