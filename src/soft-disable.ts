/**
 * 软禁用装配：醒目错误日志 + 插件整体 no-op + client 半停用面板标记。
 *
 * 两个门禁（profile-gate / version-gate）与宿主端重模块图加载失败
 * （index.ts 对 ./main.js 的动态 import，见其头注释）共用本出口。
 *
 * 失败语义是软禁用而不是抛错 fail-loud。harness 对插件失败另有分层兜底
 * （dsh-v0.1.7-rc.2 源码取证）：Loader 对入口 import 失败是 catch →
 * logger.error → entry 停摆（vendor/loader/src/config/entry.ts 的 _init）；
 * apply 抛错是 fiber FAILED + 已注册 effects 回滚 + labeled warning（cordis
 * vendor/cordis/src/fiber.ts 的 _reload）；exit(1)（app-boot 的
 * installFailLoud）只覆盖 unhandled rejection / uncaught exception /
 * required entries。软禁用比这些兜底更友好：不产生 unhandled rejection
 * （不会撞上 installFailLoud 的进程级出口），且经 `webserver/index-inject`
 * 注入 DISABLED_GLOBAL，client 半改挂「已停用」说明面板（版本指引 +
 * 推荐 installVersion），而不是入口停摆后面板静默消失、或正常注册路径下
 * RPC 全挂的假活状态。strict 抛错开关（DSH_COMFYUI_BASED_TOOLS_STRICT=1）
 * 由各调用方在调本函数之前自行处理。
 *
 * 面板载荷的插件版本标识：同步从自身 package.json 读 name/version 进载荷
 * （包损坏时缺席该段）。「是否最新」由 **client 半自查**（registry fetch +
 * shared/version-compare）——不放在 host 半：桌面壳在 ready 时一次性快照
 * 注入（apps/desktop/src/web-document.ts 的 boot 流程）、静态部署的 boot
 * payload 同样一次性，host 侧异步补齐后这些形态的页面拿不到；client 组件
 * 是活的 JS，自查对 web / 桌面 / 静态三种交付形态都正确（webserver 侧的
 * index 响应虽是每次重收注入表，但那是唯一的例外形态）。
 *
 * 依赖面约束：本模块属于薄门禁入口（index.ts）的静态 import 图——图内所有
 * 模块在 apply 之前求值。./package-info.js 只用 node:fs/node:path/node:url
 * （读自身包清单这一件事），shared/* 是纯数据/同构纯函数——不破坏入口隔离
 * （smoke-offline 第 0 节守护：dsh-* 拦截 + 相对图/裸依赖白名单）；不得在
 * 此拉入任何 dsh-* 运行时依赖或业务模块。
 */
import type { Context } from '@deepseek-ai/cordis'
// Type-only：'webserver/index-inject' 事件 + IndexInjection 行类型（软禁用标记注入）。
import type {} from '@deepseek-ai/dsh-host-webserver'
import { DISABLED_GLOBAL, type DisabledFlag } from './shared/disabled-flag.js'
import { selfPackageInfo } from './package-info.js'
import { MAX_HARNESS_VERSION, MIN_HARNESS_VERSION, resolveHarnessVersion } from './version-gate.js'

/** 软禁用：醒目错误日志 + 插件整体 no-op + client 半停用面板标记（两个门禁与重模块图加载失败共用）。 */
export function softDisable(ctx: Context, reason: string): void {
  console.error(`[dsh-plugin-template] ${reason}`)
  console.error('[dsh-plugin-template] 插件已停用（不影响 DSH 启动与其他插件）。')
  // 当前 harness 版本（尽力获取）：三个软禁用路径都能拿到（版本门禁通过与否
  // 不影响锚点解析）；两锚点全失败时缺席该行，原因文案已带锚点级诊断。
  let runtimeVersion: string | undefined
  try {
    runtimeVersion = resolveHarnessVersion().version
  } catch {
    runtimeVersion = undefined
  }
  ctx.on('webserver/index-inject', (table) => {
    let plugin: DisabledFlag['plugin']
    try {
      const info = selfPackageInfo()
      plugin = { name: info.name, installed: info.version }
    } catch {
      // 自身 package.json 不可读（包损坏）：载荷缺席插件版本段，client 不渲染。
      plugin = undefined
    }
    table.push({
      kind: 'global',
      name: DISABLED_GLOBAL,
      value: {
        reason,
        min: MIN_HARNESS_VERSION,
        max: MAX_HARNESS_VERSION,
        installVersion: MAX_HARNESS_VERSION,
        ...(runtimeVersion === undefined ? {} : { runtimeVersion }),
        ...(plugin === undefined ? {} : { plugin }),
      } satisfies DisabledFlag,
    })
  })
}
