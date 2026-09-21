/**
 * 浏览器端调用 host 半 `template/*` 端点的数据访问层。
 * 走通用 RPC 通道（ctx.connection.rpc.call），所有通道/业务错误都折叠进
 * OpResult 返回（不抛出）——面板据此内联报错或静默降级，不打断渲染。
 */
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import {
  UPDATE_ENDPOINT,
  type UpdateMachineState,
} from '../shared/update-contract'

export type { UpdateMachineState } from '../shared/update-contract'

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

/**
 * 读 host 半更新状态机快照（设置面板轮询与更新通知气泡共用）。
 * host 状态机是唯一权威源（见 src/update-state.ts）：client 不持有更新状态，
 * 失败（含旧版 host 无此端点的自举窗口）由调用方静默降级，不打断渲染。
 */
export async function getUpdateStateViaHost(rpc: ClientConnectionRpc): Promise<OpResult<UpdateMachineState>> {
  const result = await callTemplate<{ ok: boolean; state?: UpdateMachineState; error?: { code?: string; message?: string } }>(
    rpc,
    UPDATE_ENDPOINT.getUpdateState,
    {},
  )
  if (!result.ok) return result
  const body = result.value
  if (!body || typeof body !== 'object') return { ok: false, kind: 'http', detail: 'bad result' }
  if (!body.ok || body.state === undefined) return { ok: false, kind: 'business', detail: body.error?.message ?? body.error?.code }
  return { ok: true, value: body.state }
}

/** 动作触发器的公共解包（checkUpdate / updateSelf 同形态：触发后快照）。 */
function unwrapTrigger(
  result: OpResult<{ ok: boolean; state?: UpdateMachineState; error?: { code?: string; message?: string } }>,
): OpResult<UpdateMachineState> {
  if (!result.ok) return result
  const body = result.value
  if (!body || typeof body !== 'object') return { ok: false, kind: 'http', detail: 'bad result' }
  if (!body.ok || body.state === undefined) return { ok: false, kind: 'business', detail: body.error?.message ?? body.error?.code }
  return { ok: true, value: body.state }
}

/** 触发检查更新：host 同步落 checking 后返回触发后快照，结论仍走轮询。 */
export async function checkUpdateViaHost(rpc: ClientConnectionRpc): Promise<OpResult<UpdateMachineState>> {
  return unwrapTrigger(await callTemplate(rpc, UPDATE_ENDPOINT.checkUpdate, {}))
}

/** 触发立即更新：host 同步落 updating 后 fire-and-forget 安装，结论走轮询。 */
export async function updateSelfViaHost(rpc: ClientConnectionRpc): Promise<OpResult<UpdateMachineState>> {
  return unwrapTrigger(await callTemplate(rpc, UPDATE_ENDPOINT.updateSelf, {}))
}
