/**
 * Typert 远程端点：host 半向浏览器暴露 `template/*`。
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
 *
 * 端点表驱动：`template/*` 的描述符集中成 {@link DESCRIPTORS}（parameters 为
 * 位置参数名表，no-arg 端点传 `[]`），新增端点 = 表里加一行 + 服务对象加一个
 * 同名方法。codec 一律 src-json（仅 JSON 安全检查），边界校验在服务方法内。
 */
import type { InvocationDescriptor } from '@deepseek-ai/dsh-typert-protocol'
import { getUpdateMachineState, startSelfUpdate, startUpdateCheck } from './update-state.js'
import type {
  UpdateActionResult,
  UpdateStateResult,
} from './shared/update-contract.js'

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

/** `template/*` 端点的调用描述符表（id 格式 `<短插件id>#template/<method>`）。 */
export const DESCRIPTORS: InvocationDescriptor[] = (
  [
    ['ping', ['request']],
    ['checkUpdate', []],
    ['updateSelf', []],
    ['getUpdateState', []],
  ] as const
).map(([method, parameters]) => ({
  id: `dsh-plugin-template#template/${method}`,
  service: 'template',
  namespace: 'template',
  method,
  invocation: { kind: 'direct' as const },
  parameters: parameters.map((name) => ({ name, wire: name, source: 'json' as const, codec: { mode: 'src-json' as const } })),
  result: { mode: 'src-json' as const },
}))

/**
 * 远程服务（纯数据对象）：Gateway 分发只要求结构合法的
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

  // -----------------------------------------------------------------------
  // RPC 端点：插件自更新（状态机在 ./update-state.ts，host 半唯一权威源；
  // 本类只是触发器 + 快照读取，不持有状态）。
  // -----------------------------------------------------------------------

  /**
   * 检查更新触发器：同步把状态机落为 checking 后立即返回触发后快照，
   * registry 往返在 host 内异步完成；结论经 getUpdateState 轮询透出。
   */
  async checkUpdate(): Promise<UpdateActionResult> {
    startUpdateCheck(true)
    return { ok: true, state: getUpdateMachineState() }
  }

  /**
   * 立即更新触发器：同步把状态机落为 updating 后立即返回；安装
   * fire-and-forget 在 host 内跑完（浏览器刷新 / RPC 断连不中断），
   * 重复调用合并进同一次安装。
   */
  async updateSelf(): Promise<UpdateActionResult> {
    startSelfUpdate()
    return { ok: true, state: getUpdateMachineState() }
  }

  /**
   * 更新状态机快照（设置面板与更新通知气泡的唯一读通道）。
   * 纯状态读取，不会失败，也无网络请求。
   */
  async getUpdateState(): Promise<UpdateStateResult> {
    return { ok: true, state: getUpdateMachineState() }
  }
}
