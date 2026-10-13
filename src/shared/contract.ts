/**
 * host 与 client 共享的插件业务 RPC 契约（纯数据 / 类型 / 常量）。
 * 浏览器端经 `ctx.connection.rpc.call('/api', <endpoint>, { args })` 调用
 * host 半 `template` 服务（描述符见 src/remote.ts 的 DESCRIPTORS 表）。
 * 与 update-contract.ts（版本提示）分文件：版本提示契约的占位语义有专门的
 * 两处同步纪律，业务契约没有——分开放避免误伤。
 */

/** 业务 RPC 端点（`<namespace>/<method>`；namespace 与 Typert 服务同源）。 */
export const TEMPLATE_ENDPOINT = {
  /** ping 演示端点（回显文本 + host 时间戳）。 */
  ping: 'template/ping',
  /** 读当前配置（配置页打开时拉取）。 */
  getConfig: 'template/getConfig',
  /** 整段保存配置（host 半走 ctx.settings.replace，只放行 volatile 字段）。 */
  saveConfig: 'template/saveConfig',
} as const

/** 持久化设置值（与 host 半 spec.ts 的 TemplateSettings 同形；单一来源在 host）。 */
export interface TemplateConfigValue {
  /** 问候语前缀（demo 工具与配置页共用）。 */
  greeting: string
  /** 句尾标点。 */
  punctuation: string
}

/** getConfig 返回主体。 */
export type TemplateGetConfigResult =
  | { ok: true; config: TemplateConfigValue }
  | { ok: false; error: { code: string; message?: string } }

/** saveConfig 返回主体（整段替换语义）。 */
export type TemplateSaveConfigResult =
  | { ok: true }
  | { ok: false; error: { code: string; message?: string } }
