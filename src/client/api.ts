/**
 * 浏览器端调用 host 半 `template/*` 端点的数据访问层。
 * 走通用 RPC 通道（ctx.connection.rpc.call），所有通道/业务错误都折叠进
 * OpResult 返回（不抛出）——面板据此内联报错或静默降级，不打断渲染。
 *
 * 【0.2.2 起】方案 A 删除了 checkUpdate / getUpdateState 两个更新端点，本层
 * 只剩 ping / getConfig / saveConfig 三个业务端点；插件不再查 registry。
 */
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import {
  TEMPLATE_ENDPOINT,
  type TemplateConfigValue,
  type TemplateGetConfigResult,
  type TemplateSaveConfigResult,
} from '../shared/contract'

export type { TemplateConfigValue } from '../shared/contract'

/** 一次远端操作的 UI 侧统一结果。 */
export type OpResult<T> =
  | { ok: true; value: T }
  | { ok: false; kind: 'network' | 'http' | 'business'; detail?: string; code?: string }

/** RPC 通道返回的最小包络（与 Typert Gateway 的 invokeRpc 一致）。 */
interface RpcEnvelope {
  ok: boolean
  value?: unknown
  error?: { code?: string; message?: string }
}

/** 调用 host 半 template/* 端点，统一把通道错误折叠进 OpResult。 */
async function callTemplate<T>(rpc: ClientConnectionRpc, endpoint: string, args: Record<string, unknown> = {}): Promise<OpResult<T>> {
  let envelope: RpcEnvelope
  try {
    envelope = (await rpc.call('/api', endpoint, { args })) as RpcEnvelope
  } catch (error) {
    return { ok: false, kind: 'network', detail: error instanceof Error ? error.message : String(error) }
  }
  if (!envelope || typeof envelope !== 'object') return { ok: false, kind: 'http', detail: 'bad envelope' }
  if (!envelope.ok) return { ok: false, kind: 'http', detail: envelope.error?.message ?? 'rpc failed' }
  return { ok: true, value: envelope.value as T }
}

/** 业务失败包络（host 半返回 {ok:false,error} 时折叠成 business）。 */
function unwrapBusiness<T extends { ok: boolean; error?: { code?: string; message?: string } }>(body: T): OpResult<T> {
  if (!body || typeof body !== 'object') return { ok: false, kind: 'http', detail: 'bad result' }
  if (!body.ok) return { ok: false, kind: 'business', detail: body.error?.message ?? body.error?.code }
  return { ok: true, value: body }
}

/** ping 应答主体（host 半 TemplateRemote.ping 的返回形态剥掉 ok 字段）。 */
export interface PingValue {
  pong: string
  at: number
}

/** 调用 host 半 template/ping（回显文本 + host 时间戳）。 */
export async function pingHost(rpc: ClientConnectionRpc, text: string): Promise<OpResult<PingValue>> {
  const result = await callTemplate<{ pong?: unknown; at?: unknown }>(rpc, TEMPLATE_ENDPOINT.ping, { request: { text } })
  if (!result.ok) return result
  const body = result.value
  if (body === null || typeof body !== 'object' || typeof body.pong !== 'string' || typeof body.at !== 'number') {
    return { ok: false, kind: 'http', detail: 'bad result' }
  }
  return { ok: true, value: { pong: body.pong, at: body.at } }
}

/** 读取 host 端当前配置（volatile 引用即时取值，总是最新）。 */
export async function getConfigViaHost(rpc: ClientConnectionRpc): Promise<OpResult<TemplateConfigValue>> {
  const result = await callTemplate<TemplateGetConfigResult>(rpc, TEMPLATE_ENDPOINT.getConfig)
  if (!result.ok) return result
  const body = result.value
  if (!body || typeof body !== 'object' || !body.ok) {
    return { ok: false, kind: 'business', detail: body && typeof body === 'object' && 'error' in body ? String(body.error?.message ?? body.error?.code) : 'bad result' }
  }
  const config = body.config
  if (!config || typeof config !== 'object' || typeof config.greeting !== 'string' || typeof config.punctuation !== 'string') {
    return { ok: false, kind: 'http', detail: 'bad result' }
  }
  return { ok: true, value: { greeting: config.greeting, punctuation: config.punctuation } }
}

/** 整段保存配置（host 半做边界校验后走 ctx.settings.replace）。 */
export async function saveConfigViaHost(rpc: ClientConnectionRpc, value: TemplateConfigValue): Promise<OpResult<null>> {
  const result = await callTemplate<TemplateSaveConfigResult>(rpc, TEMPLATE_ENDPOINT.saveConfig, { request: value })
  if (!result.ok) return result
  const unwrapped = unwrapBusiness(result.value)
  if (!unwrapped.ok) return { ok: false, kind: unwrapped.kind, detail: unwrapped.detail, code: unwrapped.code }
  return { ok: true, value: null }
}
