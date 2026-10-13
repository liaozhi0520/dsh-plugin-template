/**
 * dsh-plugin-template, host half 入口：薄门禁 shim（两段式入口的第一段）。
 *
 * 背景：cordis Loader 先完整求值入口的静态 import 图，再调 apply(ctx, config)。
 * 门禁若写在重模块图所在的文件里，就跑在「全部静态依赖已经求值」之后——窗口内
 * 未验证 harness 版本一旦改掉了我们依赖的导出，入口 import 本身失败（Loader
 * catch → logger.error → entry 停摆，见 vendor/loader/src/config/entry.ts），
 * 软禁用与 client 停用面板将没有机会运行。因此本文件刻意保持无业务，静态
 * import 图只允许包含不会被 harness API 漂移破坏的最小集合：
 * - ./version-gate.ts（node:fs/node:path + ./shared/version-compare 纯函数）、
 *   ./profile-gate.ts（type-only cordis）、./soft-disable.ts（→
 *   ./package-info.ts 的 node builtins + ./shared 纯数据/同构纯函数）；
 * - ./spec.ts（运行时仅 @deepseek-ai/schemastery）：不可约——`Config` 必须
 *   从入口值导出（Loader 只认领 apply 所在入口的 Config 导出，0.1.7 迁移
 *   踩坑），且 schema 求值本就发生在 Loader 侧、先于 apply，不新增风险面；
 * - 业务主体整体迁到 ./main.ts，由 apply 在两道门禁全过后 `await import`
 *   动态拉起；其模块图的加载失败被本文件捕获并软禁用。
 * - 白名单守护：smoke-offline 第 0 节除运行时拦截 dsh-* 外，还静态遍历本图
 *   断言「裸依赖 ⊆ {schemastery}」且相对模块在白名单内——往薄入口加任何
 *   import 都会显式破冒烟，强迫过审。
 *
 * 失败语义：profile/版本门禁与重模块图加载失败默认软禁用（
 * DSH_PLUGIN_TEMPLATE_STRICT=1 恢复抛错，CI / 排查场景）；main.apply 体内的
 * 错误不做兜底（见 main.ts 头注释）。与 harness 内建 peer 预检的分工说明见
 * ./version-gate.ts 头注释。
 */
import type { Context } from '@deepseek-ai/cordis'
import { assertDesktopProfileLaunched } from './profile-gate.js'
import type { TemplateConfig } from './spec.js'
import { softDisable } from './soft-disable.js'
import { assertHarnessSupported } from './version-gate.js'

export const name = 'dsh-plugin-template'
// cordis Loader 约定名：从入口模块读领 Config schema（校验条目配置、填默认值、
// 求值 volatile 引用后作为 apply 的第二参注入）——必须在这里值导出，只放
// spec.ts 里 Loader 看不到，apply(ctx, config) 的 config 会是 undefined
//（0.1.5 的 settings.register 时代无需此导出，迁移踩坑）。spec.ts 也是本入口
// 静态图中唯一的第三方运行时依赖（schemastery）——不得再加 dsh-* 运行时
// import（smoke-offline 的入口隔离检查守护）。
export { Config } from './spec.js'
// cordis 对未声明 inject 的服务连属性探测（含 ctx.get）都直接抛错，故全部硬声明。
// 缺服务的部署下插件保持 pending 不 crash；门禁决定业务是否真正注册。
// （0.8.0 范式起不再声明 'pluginManager'——自更新安装通道已删除，插件只做版本提示。）
export const inject = ['tools', 'typert', 'settings']

export async function apply(ctx: Context, config: TemplateConfig): Promise<void> {
  // 本插件自带自定义配置页（client 半 plugins.bundle.config 槽位，挂在「插件」
  // 页的组合包详情页上），退出自动配置页——否则设置里会出现自动生成的本插件
  // 表单。官方所有带自定义 UI 的插件同款（configure 返回 disposer，挂本
  // fiber，随插件停用自动撤销）。刻意先于门禁：软禁用状态下也不出自动配置
  // 表单（与拆分前行为一致）。
  ctx.effect(() => ctx.settings.configure({ auto: false }), 'dsh-plugin-template: settings-page-policy')

  // 门禁一：profile 门禁（desktop-only）。本插件仅支持 DeepSeek 桌面版——桌面
  // 版是唯一支持的 runtime（自带固定形态 runtime + 内置 pnpm），无 profile 或
  // 其他 profile（dsh web / 自定义）一律软禁用。
  let profile: ReturnType<typeof assertDesktopProfileLaunched>
  try {
    profile = assertDesktopProfileLaunched(ctx)
  } catch (error) {
    if (process.env.DSH_PLUGIN_TEMPLATE_STRICT) throw error
    softDisable(ctx, error instanceof Error ? error.message : String(error))
    return
  }

  // 门禁二：版本门禁。窗口外默认软禁用（Loader/app-boot 对插件失败另有分层
  // 兜底，见 soft-disable.ts 头注释）；DSH_PLUGIN_TEMPLATE_STRICT=1 恢复
  // 抛错 fail-loud（CI / 排查场景）。
  try {
    assertHarnessSupported()
  } catch (error) {
    if (process.env.DSH_PLUGIN_TEMPLATE_STRICT) throw error
    softDisable(ctx, error instanceof Error ? error.message : String(error))
    return
  }

  // 门禁三（两段式入口的核心）：重模块图 ./main.js 只在两道门禁全过后动态拉起。
  // 加载失败 = 窗口内未验证 harness 版本的 API 漂移或安装损坏——按软禁用出口
  // 落地，而不是让入口 import 失败、Loader catch 后 entry 停摆（软禁用没有
  // 机会运行、client 半还在走正常注册路径）。main.apply 体内错误不在此捕获
  // （cordis 需要靠抛错回滚半注册状态，见 main.ts 头注释）。
  try {
    const main = await import('./main.js')
    main.apply(ctx, config, profile.dir)
  } catch (error) {
    if (process.env.DSH_PLUGIN_TEMPLATE_STRICT) throw error
    console.error('[dsh-plugin-template] 宿主端模块加载失败详情:', error)
    softDisable(
      ctx,
      'dsh-plugin-template: 宿主端模块加载失败——可能与当前 DeepSeek Harness 的 API 面不兼容'
      + `（${error instanceof Error ? error.message : String(error)}）。`
      + '请升级/降级插件或 harness 至匹配版本；若为安装损坏请重装插件。',
    )
  }
}
