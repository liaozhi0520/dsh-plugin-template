/**
 * Harness 版本门禁（desktop-only）。
 *
 * 设计决策：本插件仅支持 DeepSeek 桌面版（见 ./profile-gate.ts）——桌面版的
 * host 子进程由 Electron（node 模式）spawn，argv 布局是 launcher 的硬契约，
 * 版本锚点因此收敛为**桌面单锚**。
 *
 * 失败语义是软禁用而不是抛错 fail-loud。harness 对插件失败另有分层兜底
 * （dsh-v0.2.2-rc.1 复核未变）：Loader 对入口 import 失败是
 * catch → logger.error → entry 停摆（vendor/loader/src/config/entry.ts 的
 * _init）；apply 抛错是 fiber FAILED + 已注册 effects 回滚 + labeled warning
 * （cordis vendor/cordis/src/fiber.ts 的 _reload）；exit(1)（app-boot 的
 * installFailLoud）只覆盖 unhandled rejection / uncaught exception /
 * required entries。软禁用比这些兜底更友好：不产生 unhandled rejection，
 * 且经 webserver/index-inject 注入 client 停用面板。设
 * DSH_PLUGIN_TEMPLATE_STRICT=1 可恢复抛错（CI / 排查场景）。
 *
 * 与 harness 内建 peer 预检的分工（app-boot
 * packages/boot/app-boot/src/plugin-compatibility.ts:52，0.2.2-rc.1 复核
 * 零 diff）：仍是 `semver.satisfies(runtime, range, { includePrerelease: true })`
 * 校验各 @deepseek-ai/dsh-* peer 与运行时版本（runtime = app-boot 包 version，
 * 与 `dsh --version` 同源；workspace:^ / workspace:~ / workspace:* 一律视为
 * 等于 runtime），不满足的插件行在启动组装期直接 disabled，插件代码不会被
 * import。它守护的是「声明面」：本插件 peer 写 caret ^<MIN>（AGENTS.md 依赖
 * 约定），放行集宽于本窗口（数学上还放行更高的同 minor 线预发布/正式版）。
 * 本门禁守护「验证面」：MAX 只写已实测 tag。
 *
 * 【0.2.2-rc.1 取证修正】旧文档写「caret 数学上不跨 minor 线」并不精确：
 * 实测 semver@7.8.5 下 `satisfies('0.2.2-rc.1', '^0.2.1-rc.1',
 * { includePrerelease: true }) === true`（caret 展开 `>=0.2.1-rc.1 <0.3.0-0`）。
 * 即宿主声明面**不会**拒绝跨线版本；跨线仍必须同轮重写 peer/dev，理由是
 * MIN 上移的硬约定、类型面/锁文件要落到新线、以及窗口承诺面须收敛到同
 * tuple——不是 precheck 数学。
 *
 * 0.2.1 线新增的 `engines.dsh` 本插件**刻意不用**：声明它则它单独决定、peers
 * 被忽略（plugin-compatibility.ts:57-61，0.2.2-rc.1 零 diff），且三个执行点
 * （安装期 / 运行时 bundle 级每次启动+每次重组 / 运行时行级）全在 import
 * 之前——只能拒绝、不能解释，本文件这套软禁用面板与可执行指引会全部失效。
 * 决策记录、激活条件与将来采纳时的硬约束见 docs/harness-defect-workarounds.md
 * 「已评估、暂不采用的上游机制」一节。0.2.2 新增的 version exemption
 * （`dsh plugin allow-version`）只影响豁免路径，不改变上述结论。
 *
 * 版本源：runtime 内的 @deepseek-ai/dsh 包 version。桌面版的 runtime 由
 * desktop 包携带，全部 dsh-* 包锁步同版发版（0.2.2-rc.1 实装取证：
 * apps/desktop、apps/desktop-host、runtime 内 @deepseek-ai/dsh 三者 version
 * 同值）——runtime 版本即桌面版应用版本，语义与 `dsh --version` 一致。
 * 【不能】读 @deepseek-ai/dsh-tools 等内嵌依赖当 harness 版本：caret 语义下
 * 实装版本可能高于 CLI 本体（实测 @deepseek-ai/dsh@0.1.5-rc.1 内嵌的
 * dsh-tools 已解析到 0.1.5-rc.2，读它会误判版本不匹配）。
 *
 * 解析锚点（桌面单锚）：桌面版 host 子进程的 spawn 契约
 * （apps/desktop/src/host-process.ts:212-218；0.2.2-rc.1 复核 spawn 参数序
 * `entry, runtimeDir, …` 未变）把 runtimeDir 放在 process.argv[2]，runtime
 * 内自带锁步同版的 @deepseek-ai/dsh（desktop-host 自己的 installAnchor 就是
 * 同款路径）——直接读
 * <argv[2]>/node_modules/@deepseek-ai/dsh/package.json。name 校验兜底拒绝
 * 一切非 harness 包（含插件自身的依赖副本）。
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { compareVersions } from './shared/version-compare.js'

/**
 * 支持窗口下限（含）：已安装 harness 版本 < 该值时拒绝加载。
 *
 * 窗口当前为 `[0.2.2-rc.1, 0.2.2-rc.1]`（**单点**）——0.2.1 线 → 0.2.2 线
 * 属跨 minor 线 / tuple 变化迁移，caret 不承诺跨线，按 AGENTS.md 硬约定
 * MIN/MAX 必须同轮上移，peer + dev 的全部 @deepseek-ai/dsh-* 下限同步改写
 * 为 `^0.2.2-rc.1`。0.2.1 线（rc.1 ~ rc.5）自此**不再承诺**。
 *
 * MIN 语义 = 已实测的最低版本；本轮 MIN 上移到 0.2.2-rc.1 的依据：
 * - `c:/deepseek-harness` 签出 `dsh-v0.2.2-rc.1`（`66491b05`），逐 API 复核
 *   （官方 upgrade-guide rc.5→rc.1 新增 54 条、相关 8 条全判兼容）；
 * - 本机桌面版 `resources/runtime/primary-runtime/runtime.json` 的
 *   `desktopVersion` 已是 0.2.2-rc.1（node 24.21.0），具备真机验证条件；
 * - 取证与验证记录见 docs/compat-plan-0.2.2-rc.1.md。
 */
export const MIN_HARNESS_VERSION = '0.2.2-rc.1'

/**
 * 支持窗口上限（含）：已安装 harness 版本 > 该值时拒绝加载。
 * 只写已实测验证的 tag；追新验证通过后再上调。当前 = 0.2.2-rc.1。
 *
 * 0.2.1-rc.2 → 0.2.2-rc.1 区间 2642 commits / 8278 files，逐包复核结论：
 * plugin-compatibility / PLATFORM_MODULES / skill 零 diff；
 * plugins.bundle.config（keyed/root）与 shell.overlay（list/root）声明未变；
 * defineTool / tools.register / settings.configure·replace / typert.register /
 * webserver.register 签名未变；desktop argv[2] 锚未变。**无强制 API 适配**。
 * 唯一环境层改动 = `engines.node >=24.9.0`（官方指南 v0.2.1-rc.2/node-24）。
 *
 * 窗口内宿主（当前仅 rc.1）正常加载；高于 MAX 的宿主由本门禁软禁用并给出
 * 「降级桌面版 / 等待插件更新」指引——这正是保留本门禁（而非改用
 * engines.dsh）的核心价值。桌面版形态下 MAX 同时是「建议更新到的桌面版版本」
 * （应用与 runtime 锁步）。
 */
export const MAX_HARNESS_VERSION = '0.2.2-rc.1'

/** harness 版本解析结果：version + 命中的锚点描述（诊断用）。 */
export interface HarnessVersionResolution {
  version: string
  /** 命中的锚点：`desktop:<manifestPath>`。 */
  anchor: string
}

/**
 * 读取 harness manifest 并校验身份。非 @deepseek-ai/dsh 包 / 缺 version 字段 /
 * 文件异常都以 Error 抛出（软禁用文案可直出）。
 */
function readHarnessManifest(manifestPath: string): string {
  let manifest: { name?: unknown; version?: unknown }
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, '')) as { name?: unknown; version?: unknown }
  } catch (error) {
    throw new Error(`${manifestPath} 读取失败（${error instanceof Error ? error.message : String(error)}）`)
  }
  if (manifest.name !== '@deepseek-ai/dsh') {
    throw new Error(`${manifestPath} 属于 ${String(manifest.name)}（期望 @deepseek-ai/dsh）`)
  }
  if (typeof manifest.version !== 'string' || manifest.version === '') {
    throw new Error(`${manifestPath} 没有 version 字段`)
  }
  return manifest.version
}

/**
 * 解析正在运行的 harness 版本（桌面单锚，见文件头注释）。
 * @param argv 可注入的 process.argv（冒烟测试用构造的 argv 复现桌面形态）。
 * @throws 锚点落空时抛错——文案指明仅支持桌面版，软禁用面板可直出。
 */
export function resolveHarnessVersion(argv: readonly string[] = process.argv): HarnessVersionResolution {
  const runtimeDir = argv[2]
  if (!runtimeDir) {
    throw new Error(
      'dsh-plugin-template: 无法确定 DeepSeek Harness 版本（process.argv[2] 为空）——'
      + '本插件仅支持 DeepSeek 桌面版（host 子进程的 argv[2] 为 runtimeDir）。',
    )
  }
  const manifestPath = join(runtimeDir, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
  if (!existsSync(manifestPath)) {
    throw new Error(
      `dsh-plugin-template: 无法确定 DeepSeek Harness 版本——${manifestPath} 不存在，`
      + '请确认桌面版安装完整（runtime 内应自带锁步同版的 @deepseek-ai/dsh）。',
    )
  }
  return { version: readHarnessManifest(manifestPath), anchor: `desktop:${manifestPath}` }
}

/** 读取正在运行的 harness（@deepseek-ai/dsh）版本（锚点见文件头注释）。 */
export function installedHarnessVersion(): string {
  return resolveHarnessVersion().version
}

/**
 * 严格 semver 比较（含预发布标识，忽略 build 元数据）——实现在
 * ./shared/version-compare.ts（纯函数、零依赖；client 停用面板也共享本模块，
 * 不能拉进 node:fs/node:path 依赖）。本模块窗口判定与 re-export 共用。
 */
export { compareVersions }

/** 版本门禁：已安装 harness 版本落在 [MIN, MAX] 窗口外时抛错（由调用方决定软禁用还是 fail-loud），否则直接返回。 */
export function assertHarnessSupported(): void {
  const installed = installedHarnessVersion()
  if (compareVersions(installed, MIN_HARNESS_VERSION) < 0) {
    throw new Error(
      `dsh-plugin-template: 该插件要求 DeepSeek Harness >= ${MIN_HARNESS_VERSION}，`
      + `当前桌面版内置的是 ${installed}。请将 DeepSeek 桌面版更新到 >= ${MIN_HARNESS_VERSION}，`
      + '或改用与旧版兼容的插件版本。',
    )
  }
  if (compareVersions(installed, MAX_HARNESS_VERSION) > 0) {
    throw new Error(
      `dsh-plugin-template: 该插件仅支持 DeepSeek Harness <= ${MAX_HARNESS_VERSION}，`
      + `当前桌面版内置的是 ${installed}。请将 DeepSeek 桌面版降级到 <= ${MAX_HARNESS_VERSION}，`
      + '或等待与该桌面版兼容的插件版本。',
    )
  }
}
