/**
 * Client 半：查询 host 的只读插件状态。
 *
 * 状态接口不可得（旧 host、启动竞态、网络错误、非法 JSON）时返回 undefined；
 * 调用方按正常配置页处理，不读取任何页面 global。
 */
import { PLUGIN_STATUS_PATH, parsePluginStatus, type PluginStatus } from '../shared/plugin-status'

/** 状态查询超时（毫秒）。 */
const STATUS_TIMEOUT_MS = 1500

/**
 * 请求当前 host 的插件状态。
 *
 * @returns 通过校验的状态；接口不可用/格式错误时为 undefined。
 */
export async function fetchPluginStatus(): Promise<PluginStatus | undefined> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), STATUS_TIMEOUT_MS)
  try {
    const response = await fetch(PLUGIN_STATUS_PATH, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) return undefined
    return parsePluginStatus(await response.json())
  } catch {
    return undefined
  } finally {
    clearTimeout(timer)
  }
}
