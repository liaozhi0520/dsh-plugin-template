/**
 * npm registry latest dist-tag 查询（host/client 同构共享）。
 *
 * 使用方：host 半版本检查（update-state.ts，候选源固定官方兜底计划）与
 * client 半停用面板的插件版本自查
 * （disabled-version-check.ts，硬编码 npm → npmmirror 兜底）。
 *
 * 同构约束：本模块会被内联进 client bundle，**不得引入任何 Node 依赖**——
 * 只用双端全局的 `fetch` / `AbortSignal.timeout`（Node ≥17.3 / 现代浏览器）。
 * 版本串比较用 ./version-compare.ts、响应体读取用 ./json-body.ts（同款约束）。
 *
 * 语义（与 host 半既有实现逐位对齐）：
 * - scoped 包名的 registry 路径形如 /@scope%2Fname/latest（npm CLI 同款编码）；
 * - accept 必须是 application/json：/latest 是完整 manifest 文档，报
 *   abbreviated packument 头（application/vnd.npm.install-v1+json）会被
 *   registry 以 406 拒绝（实测）；
 * - **accept-encoding 显式要 identity**：宿主全局 fetch 有"不解压压缩响应"
 *   的坑（见 ./json-body.ts 头注释 + AGENTS.md 坑 9），主动要明文可以让这条
 *   请求根本不经过压缩路径；万一 CDN 不认（或中间层强行压缩），
 *   readJsonBody 的按魔数自解压兜底；浏览器忽略该头（forbidden header，
 *   静默丢弃不抛错），浏览器 fetch 本来就正确解压。
 * - **禁缓存只给 host 半（noCache 选项）**：绕过中间层旧/坏缓存要靠
 *   `cache-control`/`pragma` 请求头，而它们不在 CORS-safelisted 头里——浏览器
 *   跨源 GET 会因此升级成 OPTIONS 预检，`registry.npmjs.org` 对 OPTIONS 回 404
 *   且不带 CORS 头（实测），client 半（停用面板自查）首个候选就会恒失败。
 *   **`fetch(url, { cache: 'no-store' })` 并不能规避**：实测 headless Chromium
 *   会照样把 `cache-control: no-cache` + `pragma: no-cache` 写进请求头（见
 *   AGENTS.md 坑 10）。故浏览器路径一个缓存指令都不加（`/latest` 自带
 *   `max-age=300`，版本检查容忍几分钟陈旧；identity 变更本身也已换缓存键）；
 *   host 半（Node 没有 HTTP 缓存、也没有 CORS）经 noCache 显式加头；
 * - registry 类失败（网络/超时/HTTP 错误/响应缺 version）转问下一候选，
 *   全部失败才抛**逐源原因聚合**的错误（按序列出每个候选的失败原因——
 *   只留最后一个会让人误判"只有最后一个源挂了"）。
 * - 版本串必须命中 /^[\w.+-]+$/（semver 全集子集）。
 */

import { readJsonBody } from './json-body.js'

/** 版本串合法字符集（semver 全集子集；host 半进安装 spec 前的校验同源）。 */
export const VERSION_SPEC = /^[\w.+-]+$/

/** 去尾部斜杠归一化（候选源拼接同一口径；幂等，调用方传已归一化源也安全）。 */
function normalizeRegistryUrl(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url
}

/** 官方兜底候选源（官方 → npmmirror）。 */
export const FALLBACK_REGISTRY_CANDIDATES: readonly string[] = ['https://registry.npmjs.org', 'https://registry.npmmirror.com']

/** 每个候选源的 fetch 超时缺省值（ms）。 */
const DEFAULT_TIMEOUT_MS = 10_000

/** fetchLatestVersion 的可调面（host 传服务计划与 15s 超时；client 走缺省）。 */
export interface RegistryLatestOptions {
  /** 每个候选源的 fetch 超时（ms）；缺省 10s。 */
  timeoutMs?: number
  /** 候选源（base URL，按询问顺序）；缺省官方兜底计划。 */
  candidates?: readonly string[]
  /** 候选失败转问下一个时的回调（host 半写诊断日志用；client 缺省静默）。 */
  onCandidateError?: (base: string, error: unknown) => void
  /**
   * true = 附加 `cache-control: no-cache` + `pragma: no-cache`，强制中间层
   * 不吃旧/坏缓存。**只允许 host 半传**：浏览器里这两个头不是 CORS-safelisted
   * 头，会触发 OPTIONS 预检（见文件头注释 + AGENTS.md 坑 10）。
   */
  noCache?: boolean
}

/**
 * 逐源查询 `/<pkg>/latest` 的 version 字段。注意：候选源经 node fetch 或
 * 浏览器 fetch 询问，语义一致；本函数不感知任何 harness/插件概念。
 * @throws 全部候选失败时抛聚合错误（按序列出每个候选的失败原因）。
 */
export async function fetchLatestVersion(packageName: string, options: RegistryLatestOptions = {}): Promise<string> {
  const candidates = options.candidates ?? FALLBACK_REGISTRY_CANDIDATES
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const failures: string[] = []
  for (const rawBase of candidates) {
    const base = normalizeRegistryUrl(rawBase)
    const url = `${base}/${encodeURIComponent(packageName)}/latest`
    try {
      const response = await fetch(url, {
        headers: {
          accept: 'application/json',
          // 明文优先（见文件头注释；浏览器会忽略 accept-encoding）。
          'accept-encoding': 'identity',
          // 缓存指令只随 host 半发出（浏览器端会触发 CORS 预检）。
          ...(options.noCache === true ? { 'cache-control': 'no-cache', pragma: 'no-cache' } : {}),
        },
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
      const body = (await readJsonBody(response)) as { version?: unknown }
      if (typeof body.version !== 'string' || !VERSION_SPEC.test(body.version)) {
        throw new Error('响应缺少合法的 version 字段')
      }
      return body.version
    } catch (error) {
      failures.push(`${base} → ${error instanceof Error ? error.message : String(error)}`)
      options.onCandidateError?.(base, error)
    }
  }
  // 面板内联展示，聚合文案限长（逐源原因本身已足够定位）。
  const detail = failures.join('；').slice(0, 600)
  throw new Error(`npm registry 最新版本查询失败（已按序尝试 ${candidates.join('、')}）：${detail}`)
}
