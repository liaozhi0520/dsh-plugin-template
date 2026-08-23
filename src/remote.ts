/**
 * Typert 远程端点演示：host 半向浏览器暴露 `template/ping`。
 *
 * ⚠️ 第三方插件的形态选择（实验证实，勿改回装饰器）：
 * 官方包用 `TypertRemoteService` + `@Remote` 装饰器，端点发现依赖
 * typert-protocol 的模块级 WeakMap 标记 + cordis 服务实例的原型链。
 * 模板插件走 linked 开发（HMR）时：
 * 1. 插件从自身 node_modules 解析该包，与 harness 各持一个模块实例，标记失联；
 * 2. cordis 把服务实例包装成追踪代理，原型链断开，标记读不到。
 * 官方包不受影响是因为它们走构建期生成（typert-generator 产出 ./typert 产物）。
 * 因此第三方插件的正确形态：手写调用描述符注册进 `ctx.typert`，服务用纯数据
 * 对象 + 结构化 `typertRemote` 绑定（官方文档 docs/api-gateway.md 认可的等价物）。
 */
import type { InvocationDescriptor } from '@deepseek-ai/dsh-typert-protocol'

/** ping 端点的 wire 名（<namespace>/<method>）。 */
export const PING_ENDPOINT = 'template/ping'

/** ping 请求。 */
export interface TemplatePingRequest {
  /** 回显文本。 */
  text?: string
}

/** ping 结果。 */
export interface TemplatePingResult {
  ok: true
  pong: string
  at: number
}

/** `template/ping` 的调用描述符（src-json：仅 JSON 安全检查，边界校验在方法内）。 */
export const PING_DESCRIPTOR: InvocationDescriptor = {
  id: 'dsh-plugin-template#template/ping',
  service: 'template',
  namespace: 'template',
  method: 'ping',
  invocation: { kind: 'direct' },
  parameters: [{ name: 'request', wire: 'request', source: 'json', codec: { mode: 'src-json' } }],
  result: { mode: 'src-json' },
}

/**
 * 演示远程服务（纯数据对象）：Gateway 分发只要求结构合法的
 * `typertRemote` 绑定（service === 自身、serviceKey/namespace 一致）。
 */
export class TemplateRemote {
  readonly typertRemote = Object.freeze({
    service: this,
    serviceKey: 'template',
    namespace: 'template',
  })

  /** 回显文本并打上 host 时间戳，证明调用越过了浏览器边界。 */
  async ping(request: TemplatePingRequest): Promise<TemplatePingResult> {
    const text = typeof request?.text === 'string' && request.text.trim() ? request.text.trim() : 'ping'
    return { ok: true, pong: text, at: Date.now() }
  }
}
