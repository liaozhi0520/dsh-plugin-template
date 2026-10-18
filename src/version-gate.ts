/**
 * Harness 版本门禁（desktop-only）。
 *
 * 设计决策：本插件仅支持 DeepSeek 桌面版（见 ./profile-gate.ts）——桌面版的
 * host 子进程由 Electron（node 模式）spawn，argv 布局是 launcher 的硬契约，
 * 版本锚点因此收敛为**桌面单锚**。
 *
 * 失败语义是软禁用而不是抛错 fail-loud。harness 对插件失败另有分层兜底
 * （dsh-v0.2.0-rc.2 源码取证，0.2.1 线复核未变）：Loader 对入口 import 失败是
 * catch → logger.error → entry 停摆（vendor/loader/src/config/entry.ts 的
 * _init）；apply 抛错是 fiber FAILED + 已注册 effects 回滚 + labeled warning
 * （cordis vendor/cordis/src/fiber.ts 的 _reload）；exit(1)（app-boot 的
 * installFailLoud）只覆盖 unhandled rejection / uncaught exception /
 * required entries。软禁用比这些兜底更友好：不产生 unhandled rejection，
 * 且经 webserver/index-inject 注入 client 停用面板。设
 * DSH_PLUGIN_TEMPLATE_STRICT=1 可恢复抛错（CI / 排查场景）。
 *
 * 与 harness 内建 peer 预检的分工（0.1.7 起 app-boot
 * packages/boot/app-boot/src/plugin-compatibility.ts；0.2.1 线复核：判定语义
 * 未变，仍是 `semver.satisfies(runtime, range, { includePrerelease: true })`）：
 * 校验各 @deepseek-ai/dsh-* peer 与运行时版本（runtime = app-boot 包 version，
 * 与 `dsh --version` 同源；workspace:^ / workspace:~ / workspace:* 一律视为
 * 等于 runtime），不满足的插件行在启动组装期直接 disabled，插件代码不会被
 * import。它守护的是「声明面」：本插件 peer 写 caret ^<MIN>（AGENTS.md 依赖
 * 约定），放行集宽于本窗口（^0.2.1-rc.1 数学上还放行 rc.3+/正式版）。本门禁
 * 守护「验证面」：MAX 只写已实测 tag。因此本门禁的实际生效域是「peer 声明内
 * 但未验证」的差集（追新未验证版本、用户 `dsh plugin allow-version` 豁免后）；
 * 声明外场景不会走到本文件（行已被 preflight disabled、插件未被 import）。
 * 声明面与验证面相等的唯一途径是 peer 写精确版本，与 caret 约定冲突，故两者
 * 并存、缺一不可。
 *
 * 0.2.1 线新增的 `engines.dsh` 本插件**刻意不用**：声明它则它单独决定、peers
 * 被忽略（plugin-compatibility.ts:56-61），且三个执行点（安装期 / 运行时
 * bundle 级每次启动+每次重组 / 运行时行级）全在 import 之前——只能拒绝、
 * 不能解释，本文件这套软禁用面板与可执行指引会全部失效。决策记录、激活条件
 * 与将来采纳时的硬约束见 docs/harness-defect-workarounds.md
 * 「已评估、暂不采用的上游机制」一节。
 *
 * 版本源：runtime 内的 @deepseek-ai/dsh 包 version。桌面版的 runtime 由
 * desktop 包携带，全部 dsh-* 包锁步同版发版（0.2.1-rc.2 实装取证：
 * apps/desktop、apps/desktop-host、runtime 内 @deepseek-ai/dsh 三者 version
 * 同值）——runtime 版本即桌面版应用版本，语义与 `dsh --version` 一致。
 * 【不能】读 @deepseek-ai/dsh-tools 等内嵌依赖当 harness 版本：caret 语义下
 * 实装版本可能高于 CLI 本体（实测 @deepseek-ai/dsh@0.1.5-rc.1 内嵌的
 * dsh-tools 已解析到 0.1.5-rc.2，读它会误判版本不匹配）。
 *
 * 解析锚点（桌面单锚）：桌面版 host 子进程的 spawn 契约
 * （apps/desktop/src/host-process.ts；0.2.1 线复核：该文件两 tag 零 diff）
 * 把 runtimeDir 放在 process.argv[2]，runtime 内自带锁步同版的
 * @deepseek-ai/dsh（desktop-host 自己的 installAnchor 就是同款路径，见
 * apps/desktop-host/src/index.ts）——直接读
 * <argv[2]>/node_modules/@deepseek-ai/dsh/package.json。name 校验兜底拒绝
 * 一切非 harness 包（含插件自身的依赖副本）。
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { compareVersions } from './shared/version-compare.js'

/**
 * 支持窗口下限（含）：已安装 harness 版本 < 该值时拒绝加载。
 *
 * 窗口当前为 [0.2.1-rc.1, 0.2.1-rc.2]（0.2.1 线窗口）——rc.1 是 0.2.1 线首个
 * 发布候选，rc.2 是实测基线（本机桌面版内置版本，app.asar 取证）。
 * 把 rc.1 纳入的依据：与 rc.2 同 tuple，且 rc.1 已具备本线关键事实
 * （packages/runtime-diagnostics 整组已移除、precheck 已读 engines.dsh），
 * rc.1→rc.2 仅 9 commits / 456 files（取证见 docs/compat-plan-0.2.1-rc.2.md）。
 * 【如实标注】MIN 的原始语义是「已实测的最低版本」，rc.1 属**用户指定纳入**的
 * 相邻预发布——承诺面 = rc.2 实测 + rc.1 取证覆盖。若要收紧为严格已实测，把
 * MIN 抬到 0.2.1-rc.2 即可（依赖下限 ^0.2.1-rc.1 已覆盖 rc.2，无需同步改）。
 *
 * MIN 语义 = 已实测（或指定纳入）的最低版本。MIN 上移时依赖 caret 下限同步
 * 改写（AGENTS.md 版本窗口硬约定）：本轮已把 peer + dev 全部
 * @deepseek-ai/dsh-* 改写为 ^0.2.1-rc.1——实测该下限在**默认解析语义**下也能
 * 落到 rc.2（同 tuple 预发布），而旧的 ^0.2.0-rc.1 取不到 rc.2 的类型面，这
 * 正是 tuple 变化时必须改写下限的硬理由。
 */
export const MIN_HARNESS_VERSION = '0.2.1-rc.1'

/**
 * 支持窗口上限（含）：已安装 harness 版本 > 该值时拒绝加载。
 * 只写已实测验证的 tag；追新验证通过后再上调。当前 = 0.2.1-rc.2（0.2.1 线
 * 追新：区间 1925 commits / 8431 files 内触点包经源码取证 + 主会话交叉复核，
 * 除 invariants 子系统移除（官方指南：delete）外插件面零 breaking；离线冒烟
 * 全绿——取证与验证记录见 docs/compat-plan-0.2.1-rc.2.md；桌面真机端到端为
 * 常规人工待验项）。窗口内宿主（rc.1/rc.2）正常加载；高于 MAX 的宿主由本
 * 门禁软禁用并给出「降级桌面版 / 等待插件更新」指引——这正是保留本门禁
 * （而非改用 engines.dsh）的核心价值。
 * 桌面版形态下 MAX 同时是「建议更新到的桌面版版本」（应用与 runtime 锁步）。
 */
export const MAX_HARNESS_VERSION = '0.2.1-rc.2'

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
 * ./shared/version-compare.ts（纯函数、零依赖；client 停用面板也要比较
 * 插件当前版本与 registry latest，不能拉进 node:fs/node:path 依赖）。
 * 本模块窗口判定与 re-export（update-state.ts 等既有 import 面）共用。
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
