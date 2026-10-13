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
 */

/** 注入 index.html 的全局标记名（`globalThis[DISABLED_GLOBAL]`）。 */
export const DISABLED_GLOBAL = '__DSH_PLUGIN_TEMPLATE_DISABLED__'

/** 插件自身版本标识（软禁用面板的「插件组」段）。 */
export interface DisabledPluginStatus {
  /** 插件包名（= package.json 的 name）。 */
  name: string
  /** 已安装（磁盘上）的插件版本。 */
  installed: string
}

/** 标记载荷：host 半给出的停用原因（含 harness 版本指引）与支持窗口。 */
export interface DisabledFlag {
  reason: string
  /** 支持窗口下限（含），与 version-gate.ts 的 MIN_HARNESS_VERSION 一致。 */
  min: string
  /** 支持窗口上限（含），与 version-gate.ts 的 MAX_HARNESS_VERSION 一致。 */
  max: string
  /**
   * 推荐安装目标版本：固定取支持上限 MAX（窗口内最新版，升级/降级都装它），
   * 由 host 半软禁用分支给出。
   */
  installVersion: string
  /**
   * 当前检测到的 harness 版本（host 半尽力解析）；缺席 = 两锚点全失败，
   * client 面板不渲染该行。
   */
  runtimeVersion?: string
  /**
   * 插件自身版本标识（host 半从自身 package.json 同步读出）；缺席 = 包损坏
   * / 旧 host，client 不渲染「插件组」段。「是否最新」由 client 半自查
   * registry（disabled-version-check.ts）。
   */
  plugin?: DisabledPluginStatus
}
