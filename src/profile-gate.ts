/**
 * Profile 启动门禁（desktop-only）。
 *
 * 设计决策：本插件**仅支持 DeepSeek 桌面版**（desktop profile）——「插件」页的
 * 配置页是插件的主交互面，桌面版自带固定形态的 runtime（Electron node 模式子进程 +
 * 内置 pnpm + 锁步同版的 dsh 包集），只考虑这一个 runtime 可以砍掉全部
 * 多形态兼容面（CLI/自定义 profile 的 argv 差异、无 profile 的 SDK 嵌入、
 * headless 等）。其他 profile 或无 profile 启动一律软禁用（软禁用语义见
 * ./soft-disable.ts）。
 *
 * 判定依据（harness 官方源码取证，tag dsh-v0.1.7-rc.2）：
 * - `ctx.get('profileContext')`：仅 profile 启动存在（profile-context.ts：
 *   「Present only in a profile launched by dsh」）；
 * - 桌面版 launcher 把 profile 目录写死为 `<dshHome>/profiles/desktop`
 *   （apps/desktop/src/paths.ts），而 ProfileContext.name = profile 目录
 *   basename（loadProfileDirectory 的 name: basename(dir)）——故
 *   `profileContext.name === 'desktop'` 是桌面版的稳定指纹。
 *
 * 失败语义与 version-gate.ts 同构：门禁只抛错，由调用方决定软禁用还是
 * fail-loud（DSH_COMFYUI_BASED_TOOLS_STRICT=1，见 index.ts）。
 */
import type { Context } from '@deepseek-ai/cordis'

/** app-boot ProfileContext 的最小重声明（app-boot 非本插件依赖，只认领用到的字段）。 */
export interface DshProfileContext {
  /** profile 名（桌面版 launcher 写死 'desktop'，= profile 目录 basename）。 */
  readonly name: string
  /** profile 目录——插件 per-profile 数据的锚点。 */
  readonly dir: string
  /** profile 组合 patch 路径（cordis.patch.yml）。 */
  readonly patchPath: string
  readonly home: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** 仅 profile 启动的 harness 存在；无 profile 启动时为 undefined。 */
    profileContext: DshProfileContext | undefined
  }
}

/**
 * 断言当前进程由 DeepSeek 桌面版以 desktop profile 启动；成立则返回 profile
 * 上下文（dir 即插件数据目录锚点），不成立抛错（无 profile / 其他 profile）。
 */
export function assertDesktopProfileLaunched(ctx: Context): DshProfileContext {
  const profile = ctx.get('profileContext')
  if (profile === undefined) {
    throw new Error(
      'dsh-plugin-template: 未检测到 profile 启动——本插件仅支持 DeepSeek 桌面版'
      + '（desktop profile），不支持 dsh web / 自定义 profile / SDK 嵌入等形态。',
    )
  }
  if (profile.name !== 'desktop') {
    throw new Error(
      'dsh-plugin-template: 本插件仅支持 DeepSeek 桌面版（desktop profile）——'
      + `当前 profile 为 "${profile.name}"，请改用桌面版，或卸载本插件。`,
    )
  }
  return profile
}
