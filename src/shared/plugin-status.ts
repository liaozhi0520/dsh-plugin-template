/**
 * Soft-disable 状态契约（host ↔ client，同构纯数据，禁 Node 依赖）。
 *
 * 页面级 global 方案已退役：host 在入口 apply 开始时注册一个只读状态路由，
 * client 每次加载时查询当前 host 的真实状态。状态路由与 host fiber 同生命周期，
 * 因此插件升级/重新启用后不会留下旧页面标记。
 */

/** 只读插件状态路由的绝对路径（host 注册与 client 查询同源）。 */
export const PLUGIN_STATUS_PATH = '/dsh-plugin-template/status'

/** 插件正常加载时的状态。 */
export interface PluginStatusActive {
  state: 'active'
}

/** 门禁或宿主端重模块图加载失败时的状态。 */
export interface PluginStatusDisabled {
  state: 'disabled'
  /** 面向用户的原因文案（含版本锚点/修复指引）。 */
  reason: string
  /** 支持窗口下限（major.minor.patch）。 */
  min: string
  /** 支持窗口上限（major.minor.patch）。 */
  max: string
  /** 推荐安装目标版本（当前恒为 MAX）。 */
  installVersion: string
  /** 当前检测到的 harness 版本；锚点失败时省略。 */
  runtimeVersion?: string
}

/** host 状态路由返回的完整状态。 */
export type PluginStatus = PluginStatusActive | PluginStatusDisabled

/**
 * 校验状态路由返回的 JSON。client 不信任网络输入：字段缺失或类型不符时
 * 返回 `undefined`，调用方按正常配置页处理。
 */
export function parsePluginStatus(value: unknown): PluginStatus | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  if (record.state === 'active') return { state: 'active' }
  if (record.state !== 'disabled') return undefined
  const { reason, min, max, installVersion, runtimeVersion } = record
  if (typeof reason !== 'string' || typeof min !== 'string' || typeof max !== 'string' || typeof installVersion !== 'string') {
    return undefined
  }
  if (runtimeVersion !== undefined && typeof runtimeVersion !== 'string') return undefined
  return {
    state: 'disabled',
    reason,
    min,
    max,
    installVersion,
    ...(runtimeVersion === undefined ? {} : { runtimeVersion }),
  }
}
