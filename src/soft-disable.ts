/**
 * 软禁用装配：醒目错误日志 + 把插件状态切换为 disabled。
 *
 * 两个门禁（profile-gate / version-gate）与宿主端重模块图加载失败
 * （index.ts 对 ./main.js 的动态 import，见其头注释）共用本出口。
 *
 * 失败语义是软禁用而不是抛错 fail-loud。harness 对插件失败另有分层兜底
 * （dsh-v0.2.3-alpha.2 复核未变）：Loader 对入口 import 失败是 catch →
 * logger.error → entry 停摆（vendor/loader/src/config/entry.ts 的 _init）；
 * apply 抛错是 fiber FAILED + 已注册 effects 回滚 + labeled warning
 * （cordis vendor/cordis/src/fiber.ts 的 _reload）；exit(1)（app-boot 的
 * installFailLoud）只覆盖 unhandled rejection / uncaught exception /
 * required entries。软禁用比这些兜底更友好：不产生 unhandled rejection
 * （不会撞上 installFailLoud 的进程级出口），并让 client 通过只读状态路由
 * 读到原因与修复指引，而不是入口停摆后面板静默消失、或正常注册路径下
 * RPC 全挂的假活状态。strict 抛错开关（DSH_PLUGIN_TEMPLATE_STRICT=1）
 * 由各调用方在调本函数之前自行处理。
 *
 * 【状态载体】0.2.3 起不再使用 `webserver/index-inject` 的页面级
 * DISABLED_GLOBAL；host 的状态由 `src/plugin-status.ts` 的只读路由提供，
 * 本模块只负责日志与调用 reporter.disable()。详见 docs/pitfalls.md §15。
 *
 * 依赖面约束：本模块属于薄门禁入口（index.ts）的静态 import 图——图内所有
 * 模块在 apply 之前求值。shared/* 是纯数据/同构纯函数——不破坏入口隔离
 * （smoke-offline 第 0 节守护：dsh-* 拦截 + 相对图/裸依赖白名单）；不得在
 * 此拉入任何 dsh-* 运行时依赖或业务模块。
 */
import type { PluginStatusReporter } from './plugin-status.js'

/** 软禁用：醒目错误日志 + 把插件状态切换为 disabled（两个门禁与重模块图加载失败共用）。 */
export function softDisable(reporter: PluginStatusReporter, reason: string): void {
  console.error(`[dsh-plugin-template] ${reason}`)
  console.error('[dsh-plugin-template] 插件已停用（不影响 DSH 启动与其他插件）。')
  reporter.disable(reason)
}
