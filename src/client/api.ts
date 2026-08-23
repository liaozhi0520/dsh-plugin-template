/**
 * 浏览器端调用 host 半 `template/ping` 端点。
 * 走通用 RPC 通道（ctx.connection.rpc.call），无需客户端描述符挂载。
 */
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'

/** ping 端点的 wire 名（与 host 半 src/remote.ts 对齐）。 */
const PING_ENDPOINT = 'template/ping'

/** RPC 通道返回的最小包络（与 Typert Gateway 的 invokeRpc 一致）。 */
interface RpcEnvelope {
  ok: boolean
  value?: unknown
  error?: { code?: string; message?: string }
}

/**
 * 调用 host 半 template/ping。
 * @param rpc - ctx.connection.rpc（连接层提供的通用通道）。
 * @param text - 回显文本。
 * @returns host 应答；通道失败直接抛错（演示最小错误面）。
 */
export async function pingHost(rpc: ClientConnectionRpc, text: string): Promise<{ ok: true; pong: string; at: number }> {
  const envelope = (await rpc.call('/api', PING_ENDPOINT, { args: { request: { text } } })) as RpcEnvelope
  if (!envelope?.ok) throw new Error(envelope?.error?.message ?? 'rpc failed')
  return envelope.value as { ok: true; pong: string; at: number }
}
