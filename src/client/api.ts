/**
 * 浏览器端调用 host 半 `template/*` 端点的数据访问层。
 * 走通用 RPC 通道（ctx.connection.rpc.call），所有通道/业务错误都折叠进
 * OpResult 返回（不抛出）——面板据此内联报错或静默降级，不打断渲染。
 */
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import {
  UPDATE_ENDPOINT,
  type TemplateUpdateApply,
  type TemplateUpdateApplyResult,
  type TemplateUpdateCheck,
  type TemplateUpdateCheckResult,
  type TemplateUpdateNoticeCheck,
  type TemplateUpdateNoticePhase,
  type TemplateUpdateNoticeResult,
} from '../shared/update-contract'

export type { TemplateUpdateApply, TemplateUpdateCheck } from '../shared/update-contract'

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

/** ping 端点的 wire 名（与 host 半 src/remote.ts 的描述符表同源）。 */
const PING_ENDPOINT = 'template/ping'

/** 调用 host 半 template/* 端点，统一把通道错误折叠进 OpResult。 */
async function callTemplate<T>(rpc: ClientConnectionRpc, endpoint: string, args: Record<string, unknown>): Promise<OpResult<T>> {
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

/** ping 应答主体（host 半 TemplateRemote.ping 的返回形态剥掉 ok 字段）。 */
export interface PingValue {
  pong: string
  at: number
}

/** 调用 host 半 template/ping（回显文本 + host 时间戳）。 */
export async function pingHost(rpc: ClientConnectionRpc, text: string): Promise<OpResult<PingValue>> {
  const result = await callTemplate<{ pong?: unknown; at?: unknown }>(rpc, PING_ENDPOINT, { request: { text } })
  if (!result.ok) return result
  const body = result.value
  if (body === null || typeof body !== 'object' || typeof body.pong !== 'string' || typeof body.at !== 'number') {
    return { ok: false, kind: 'http', detail: 'bad result' }
  }
  return { ok: true, value: { pong: body.pong, at: body.at } }
}

/** 检查插件更新（host 半查 npm registry latest 并与运行版本比较）。 */
export async function checkUpdateViaHost(rpc: ClientConnectionRpc): Promise<OpResult<TemplateUpdateCheck>> {
  const result = await callTemplate<TemplateUpdateCheckResult>(rpc, UPDATE_ENDPOINT.checkUpdate, {})
  if (!result.ok) return result
  const body = result.value
  if (!body || typeof body !== 'object') return { ok: false, kind: 'http', detail: 'bad result' }
  if (!body.ok) return { ok: false, kind: 'business', detail: body.error?.message ?? body.error?.code }
  return { ok: true, value: body }
}

/** 立即更新：host 半走官方 dsh plugin add 通道安装最新版（重启后 host 半生效）。 */
export async function updateSelfViaHost(rpc: ClientConnectionRpc): Promise<OpResult<TemplateUpdateApply>> {
  const result = await callTemplate<TemplateUpdateApplyResult>(rpc, UPDATE_ENDPOINT.updateSelf, {})
  if (!result.ok) return result
  const body = result.value
  if (!body || typeof body !== 'object') return { ok: false, kind: 'http', detail: 'bad result' }
  if (!body.ok) return { ok: false, kind: 'business', detail: body.error?.message ?? body.error?.code }
  return { ok: true, value: body }
}

/** 启动更新检查的状态快照（apply 时检查一次；更新通知气泡据此轮询，见 UpdateBubble.tsx）。 */
export async function getUpdateNoticeViaHost(
  rpc: ClientConnectionRpc,
): Promise<OpResult<{ ok: true; phase: TemplateUpdateNoticePhase; check?: TemplateUpdateNoticeCheck }>> {
  const result = await callTemplate<TemplateUpdateNoticeResult>(rpc, UPDATE_ENDPOINT.getUpdateNotice, {})
  if (!result.ok) return result
  const body = result.value
  if (!body || typeof body !== 'object') return { ok: false, kind: 'http', detail: 'bad result' }
  if (!body.ok) return { ok: false, kind: 'business', detail: body.error?.message ?? body.error?.code }
  return {
    ok: true,
    value: { ok: true, phase: body.phase, ...(body.check !== undefined ? { check: body.check } : {}) },
  }
}
