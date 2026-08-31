/**
 * host 半版本门禁软禁用时的跨进程标记（host → client）。
 *
 * host 半（index.ts）软禁用时不注册任何业务能力，只经
 * `webserver/index-inject` 向 index.html 注入一个全局变量（harness 渲染时
 * `<` 已转义，值纯 JSON）；client 半（client/index.ts）加载时读取该变量，
 * 存在即改挂"已停用"说明面板，不存在则走正常注册路径。
 *
 * 版本判断逻辑只在 host 半（version-gate.ts）有一份，client 不复制——
 * 此文件只是两侧共享的常量与载荷形状，不得引入任何 Node 依赖（client
 * bundle 会内联本文件）。
 */

/** 注入 index.html 的全局标记名（`globalThis[DISABLED_GLOBAL]`）。 */
export const DISABLED_GLOBAL = '__DSH_PLUGIN_TEMPLATE_DISABLED__'

/** 标记载荷：host 半给出的停用原因（含 harness 版本指引）与支持窗口。 */
export interface DisabledFlag {
  reason: string
  /** 支持下限（含），与 version-gate.ts 的 MIN_HARNESS_VERSION 一致。 */
  min: string
  /** 支持上限（含），与 version-gate.ts 的 MAX_HARNESS_VERSION 一致。 */
  max: string
}
