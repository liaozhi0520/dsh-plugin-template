/**
 * Harness 版本门禁。
 *
 * `dsh plugin --profile <name> add …` 只是 pnpm 转发器（harness
 * apps/cli/src/plugin.ts），harness 侧没有插件版本门禁钩子，安装期无法从
 * 插件包内拦截；门禁在插件 apply 时执行（见 index.ts），已安装 harness 版本
 * 落在 [MIN_HARNESS_VERSION, MAX_HARNESS_VERSION] 窗口外时默认软禁用：
 * 打印醒目错误日志后插件整体 no-op，不影响 dsh web 启动。
 *
 * 失败语义之所以是软禁用而不是抛错 fail-loud：cordis Loader 与
 * dsh-app-boot 对插件 import/apply 抛错零容忍（boot reject →
 * installFailLoud → exit(1)，见 harness packages/boot/app-boot/README.md），
 * 插件抛错会拖垮整个 harness，影响面远超插件自身。设 DSH_PLUGIN_TEMPLATE_STRICT=1
 * 可恢复抛错（CI / 排查场景）。
 *
 * 版本源：@deepseek-ai/dsh（CLI 包本体）——`dsh --version` 与 npm dist-tag
 * （latest/next）所指的就是这个包的 version 字段，语义上唯一正确的 "harness 版本"。
 * 【不能】读 @deepseek-ai/dsh-tools 等内嵌依赖当 harness 版本：CLI 包对内嵌
 * 依赖是 caret 语义，实装版本可能高于 CLI 本体（实测 @deepseek-ai/dsh@0.1.5-rc.1
 * 内嵌的 dsh-tools 已解析到 0.1.5-rc.2，读它会误判版本不匹配）。
 *
 * 解析锚点：正在运行的 harness CLI 脚本（process.argv[1]）所在包——从入口
 * 脚本向上找最近的 package.json 并校验包名。全局安装
 * （…/@deepseek-ai/dsh/lib/bin.js）与源码运行（apps/cli/src/bin.ts，`pnpm dsh`）
 * 两种场景都落在 @deepseek-ai/dsh 的包根；而按包名 require.resolve 在源码场景
 * 会失败（workspace 不链接自引用包名）。入口永远在 harness 侧，name 校验
 * 兜底拒绝一切非 harness 包（含插件自身的依赖副本）。
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'

/**
 * 支持窗口下限（含）：已安装 harness 版本 < 该值时拒绝加载。
 *
 * 窗口当前为 [0.1.5-rc.1, 0.1.5-rc.2]——同属 0.1.5 预发布线内的两个 tag，
 * MIN 是已实测的最低版本，MAX 是已追新验证的最新 tag。预发布线跨版本的
 * API 破坏频繁（0.1.2-rc.1 → 0.1.5-rc.1 一次跨越就改了槽位词表、PTC 事件名与
 * 子调用 ID、persona 段位、Session 格式 V3、attachment file 通道），版本范围
 * 放宽救不了这类破坏，故窗口只在实测验证通过后逐 tag 上调 MAX
 * （MIN 保持已实测的最低版本），并同一轮同步指引文件
 * （AGENTS.md / README.md / 本文件头注释）。差异取证手册见
 * docs/compat-guide-0.1.2-to-0.1.5.md；0.1.5 线内 rc.1→rc.2 为插件面零变化，
 * 取证见 docs/compat-plan-0.1.5-rc.2.md。
 */
export const MIN_HARNESS_VERSION = '0.1.5-rc.1'

/**
 * 支持窗口上限（含）：已安装 harness 版本 > 该值时拒绝加载。
 * 只写已实测验证的 tag；追新验证通过后再上调。当前为 0.1.5-rc.2
 * （rc.1→rc.2 的区间取证：插件面零 API 变化，见 docs/compat-plan-0.1.5-rc.2.md）。
 */
export const MAX_HARNESS_VERSION = '0.1.5-rc.2'

/** harness CLI 脚本路径（全局安装与源码 `pnpm dsh` 下均为 process.argv[1]）。 */
function harnessEntry(): string {
  const entry = process.argv[1]
  if (!entry) {
    throw new Error('dsh-plugin-template: 无法确定 harness CLI 入口（process.argv[1] 为空）')
  }
  return isAbsolute(entry) ? entry : resolve(process.cwd(), entry)
}

/**
 * 从 CLI 入口脚本向上找最近的 package.json——入口必在其所属包内，
 * 第一个命中的就是 CLI 包根（与 `dsh --version` 的 readVersion 同源）。
 */
function harnessManifestPath(): string {
  let dir = dirname(harnessEntry())
  while (true) {
    const candidate = join(dir, 'package.json')
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) {
      throw new Error(
        'dsh-plugin-template: 无法从 harness CLI 入口向上定位 package.json'
        + '——请确认插件运行在 dsh 托管的进程里（dsh web / dsh …），而不是独立目录。',
      )
    }
    dir = parent
  }
}

/** 读取正在运行的 harness CLI 包（@deepseek-ai/dsh）的版本。 */
export function installedHarnessVersion(): string {
  const manifestPath = harnessManifestPath()
  const manifest = JSON.parse(
    readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''),
  ) as { name?: unknown; version?: unknown }
  if (manifest.name !== '@deepseek-ai/dsh') {
    throw new Error(
      'dsh-plugin-template: harness CLI 入口解析到了'
      + ` ${String(manifest.name)}（期望 @deepseek-ai/dsh），无法确定 harness 版本。`,
    )
  }
  if (typeof manifest.version !== 'string' || manifest.version === '') {
    throw new Error(
      'dsh-plugin-template: 无法确定已安装的 DeepSeek Harness 版本'
      + `（${manifestPath} 没有 version 字段）。`,
    )
  }
  return manifest.version
}

/**
 * 严格 semver 比较（含预发布标识，忽略 build 元数据）。
 * 门禁的窗口判定（assertHarnessSupported）与 self-update.ts 比较插件自身
 * npm 版本都使用本函数。
 * @returns a<b -> -1，a=b -> 0，a>b -> 1。
 */
export function compareVersions(a: string, b: string): number {
  const parse = (text: string): { core: number[]; pre: string[] } => {
    const withoutBuild = text.split('+')[0]!
    const [coreText = '', preText = ''] = withoutBuild.split('-')
    const core = coreText.split('.').map((part) => {
      const n = Number(part)
      return Number.isSafeInteger(n) && n >= 0 ? n : Number.NaN
    })
    const pre = preText === '' ? [] : preText.split('.')
    return { core, pre }
  }
  const aParsed = parse(a)
  const bParsed = parse(b)
  // 主/次/补丁号逐段数值比较，缺段按 0 处理。
  const coreLen = Math.max(aParsed.core.length, bParsed.core.length)
  for (let i = 0; i < coreLen; i += 1) {
    const x = aParsed.core[i] ?? 0
    const y = bParsed.core[i] ?? 0
    if (x !== y) return x < y ? -1 : 1
  }
  const preA = aParsed.pre
  const preB = bParsed.pre
  if (preA.length === 0 && preB.length === 0) return 0
  // semver 规则：正式版 > 预发布（0.1.1 > 0.1.1-rc.2）。
  if (preA.length === 0) return 1
  if (preB.length === 0) return -1
  const preLen = Math.max(preA.length, preB.length)
  for (let i = 0; i < preLen; i += 1) {
    const x = preA[i]
    const y = preB[i]
    // 前缀相同时，预发布标识更长者更大（rc.2 < rc.2.1）。
    if (x === undefined) return -1
    if (y === undefined) return 1
    if (x === y) continue
    const xNumeric = /^\d+$/.test(x)
    const yNumeric = /^\d+$/.test(y)
    if (xNumeric && yNumeric) {
      const nx = Number(x)
      const ny = Number(y)
      if (nx !== ny) return nx < ny ? -1 : 1
      continue
    }
    // 数字标识 < 字母标识（semver 规则：2 < alpha）。
    if (xNumeric) return -1
    if (yNumeric) return 1
    return x < y ? -1 : 1
  }
  return 0
}

/** 版本门禁：已安装 harness 版本落在 [MIN, MAX] 窗口外时抛错（由调用方决定软禁用还是 fail-loud），否则直接返回。 */
export function assertHarnessSupported(): void {
  const installed = installedHarnessVersion()
  if (compareVersions(installed, MIN_HARNESS_VERSION) < 0) {
    throw new Error(
      `dsh-plugin-template: 该插件要求 DeepSeek Harness >= ${MIN_HARNESS_VERSION}，当前安装的是 ${installed}。`
      + `请将 harness 升级到 >= ${MIN_HARNESS_VERSION}，或改用与旧版 harness 兼容的插件版本。`,
    )
  }
  if (compareVersions(installed, MAX_HARNESS_VERSION) > 0) {
    throw new Error(
      `dsh-plugin-template: 该插件仅支持 DeepSeek Harness <= ${MAX_HARNESS_VERSION}，当前安装的是 ${installed}。`
      + `请将 harness 降级到 <= ${MAX_HARNESS_VERSION}，或等待与该 harness 兼容的插件版本。`,
    )
  }
}
