/**
 * Harness 版本门禁。
 *
 * `dsh plugin --profile <name> add …` 只是 pnpm 转发器（harness
 * apps/cli/src/plugin.ts），harness 侧没有插件版本门禁钩子，安装期无法从
 * 插件包内拦截；门禁在插件 apply 时执行（见 index.ts），版本落在
 * [MIN_HARNESS_VERSION, MAX_HARNESS_VERSION] 窗口外默认软禁用：打印醒目
 * 错误日志后插件整体 no-op，不影响 dsh web 启动。
 *
 * 失败语义之所以是软禁用而不是抛错 fail-loud：cordis Loader 与
 * dsh-app-boot 对插件 import/apply 抛错零容忍（boot reject →
 * installFailLoud → exit(1)，见 harness packages/boot/app-boot/README.md），
 * 插件抛错会拖垮整个 harness，影响面远超插件自身。设 DSH_PLUGIN_TEMPLATE_STRICT=1
 * 可恢复抛错（CI / 排查场景）。
 *
 * 版本源：@deepseek-ai/dsh-tools——本插件的 peer 之一，与 harness 各包
 * 同版本发布（monorepo 同步版本），其 exports 导出了 ./package.json。
 *
 * 解析锚点：正在运行的 harness CLI 脚本（process.argv[1]），而【不是】
 * 插件自己的 import.meta.url——插件的 devDependencies 为编译钉着一份旧版
 * dsh-tools，以自身为锚点 require.resolve 会优先命中插件 node_modules 里
 * 的开发副本，永远量不到 harness 的真实版本（曾导致门禁静默失效）。解析
 * 结果落在插件包目录内同样视为失败（防退化守卫）。
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 支持下限（含）：harness 版本 < 0.1.1-rc.2 时插件拒绝加载。
 * 语义 = 插件代码实际使用的 API 面所要求的最低 harness 版本，
 * 只实测过 0.1.1-rc.2；更低的 0.1.0 线未调研，如需支持另做分析后下调。
 */
export const MIN_HARNESS_VERSION = '0.1.1-rc.2'

/**
 * 支持上限（含）：仅当 harness 版本 <= 0.1.1 时插件允许加载。
 * semver 上 0.1.1-rc.x < 0.1.1 < 0.1.2-alpha.1，上限写 0.1.1 正好把
 * 0.1.2 线整体排除（0.1.2 的会话视图拆分删除了 dsh-client-runtime、
 * 移动了 ctx.slots 类型归属，本插件按 0.1.1 的 API 面编写）；
 * 追新验证通过后再上调。
 */
export const MAX_HARNESS_VERSION = '0.1.1'

/** 插件包根目录（lib/version-gate.js → ../），用于拒绝解析到自身依赖副本。 */
const PLUGIN_ROOT = fileURLToPath(new URL('..', import.meta.url)).toLowerCase()

/** harness CLI 脚本路径（全局安装与源码 `pnpm dsh` 下均为 process.argv[1]）。 */
function harnessEntry(): string {
  const entry = process.argv[1]
  if (!entry) {
    throw new Error('dsh-plugin-template: 无法确定 harness CLI 入口（process.argv[1] 为空）')
  }
  return isAbsolute(entry) ? entry : resolve(process.cwd(), entry)
}

/** 解析并读取 @deepseek-ai/dsh-tools 的已安装版本（= harness 版本）。 */
export function installedHarnessVersion(): string {
  let manifestPath: string
  try {
    manifestPath = createRequire(harnessEntry()).resolve('@deepseek-ai/dsh-tools/package.json')
  } catch (error) {
    throw new Error(
      'dsh-plugin-template: 无法从 harness CLI 入口解析 @deepseek-ai/dsh-tools'
      + '——请确认插件运行在 dsh 托管的进程里（dsh web / dsh …），而不是独立目录。',
    )
  }
  if (manifestPath.toLowerCase().startsWith(PLUGIN_ROOT)) {
    throw new Error(
      'dsh-plugin-template: @deepseek-ai/dsh-tools 解析到了插件自己的依赖副本'
      + `（${manifestPath}），无法确定 harness 的真实版本。`,
    )
  }
  const manifest = JSON.parse(
    readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''),
  ) as { version?: unknown }
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

/** 版本门禁：harness 版本落在 [MIN, MAX] 窗口外时抛错（由调用方决定软禁用还是 fail-loud），否则直接返回。 */
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
