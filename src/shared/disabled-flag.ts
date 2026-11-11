/**
 * host 半门禁软禁用时的跨进程标记（host → client）。
 *
 * host 半（index.ts 的两个门禁与重模块图加载失败共用 soft-disable.ts 出口）
 * 软禁用时不注册任何业务能力，只经 `webserver/index-inject` 向 index.html
 * 注入一个全局变量（harness 渲染时 `<` 已转义，值纯 JSON）；client 半
 * （client/index.ts）加载时读取该变量，存在即改挂"已停用"说明面板，
 * 不存在则走正常注册路径。
 *
 * 版本判断逻辑只在 host 半（version-gate.ts）有一份，client 不复制——
 * 此文件只是两侧共享的常量与载荷形状，不得引入任何 Node 依赖（client
 * bundle 会内联本文件）。
 *
 * 【0.2.2 起】方案 A 删除了 `plugin?: DisabledPluginStatus` 段：client 停用
 * 面板不再自查 registry 判断「插件是否最新」（那是官方插件页 Versions 区的
 * 职责），面板只呈现 harness 侧的原因 / 窗口 / 当前版本 / 桌面指引，断网可用。
 */

/** 注入 index.html 的全局标记名（`globalThis[DISABLED_GLOBAL]`）。 */
export const DISABLED_GLOBAL = '__DSH_PLUGIN_TEMPLATE_DISABLED__'

/** 标记载荷：host 半给出的停用原因（含 harness 版本指引）与支持窗口。 */
export interface DisabledFlag {
  reason: string
  /** 支持窗口下限（含），与 version-gate.ts 的 MIN_HARNESS_VERSION 一致（major.minor.patch）。 */
  min: string
  /** 支持窗口上限（含），与 version-gate.ts 的 MAX_HARNESS_VERSION 一致（major.minor.patch）。 */
  max: string
  /**
   * 推荐安装目标版本：固定取支持上限 MAX（major.minor.patch，窗口内最新版，
   * 升级/降级都装它），由 host 半软禁用分支给出——保留本字段以支撑「可执行
   * 指引」这一自家门禁的核心价值（不改用 engines.dsh 的理由之一）。
   */
  installVersion: string
  /**
   * 当前检测到的 harness 版本（host 半尽力解析）；缺席 = 锚点全失败，
   * client 面板不渲染该行。
   */
  runtimeVersion?: string
}
