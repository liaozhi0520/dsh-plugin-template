/**
 * Typert 远程端点：host 半向浏览器暴露 `template/*`。
 *
 * ⚠️ 第三方插件的形态选择（模板实验证实，勿改回装饰器）：
 * 官方包用 `TypertRemoteService` + `@Remote` 装饰器，端点发现依赖
 * typert-protocol 的模块级 WeakMap 标记 + cordis 服务实例的原型链。
 * 模板插件走 linked 开发时：插件从自身 node_modules 解析该包，与 harness
 * 各持一个模块实例，标记失联；cordis 把服务实例包装成追踪代理，原型链断开，
 * 标记读不到。官方包不受影响是因为它们走构建期生成（typert-generator 产出
 * ./typert 产物）。因此第三方插件的正确形态：手写调用描述符注册进
 * `ctx.typert`，服务用纯数据对象 + 结构化 `typertRemote` 绑定（官方文档
 * docs/api-gateway.md 认可的等价物）。
 *
 * 端点表驱动：`template/*` 的描述符集中成 {@link DESCRIPTORS}（parameters 为
 * 位置参数名表，no-arg 端点传 `[]`），新增端点 = 表里加一行 + 服务对象加一个
 * 同名方法。codec 一律 src-json（仅 JSON 安全检查），边界校验在服务方法内。
 */
import type { InvocationDescriptor } from '@deepseek-ai/dsh-typert-protocol'
import { getUpdateMachineState, startUpdateCheck } from './update-state.js'
import type { TemplateSettings, TemplateSettingsHandle } from './spec.js'
import type { TemplateGetConfigResult, TemplateSaveConfigResult } from './shared/contract.js'
import type { UpdateActionResult, UpdateStateResult } from './shared/update-contract.js'

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
    ['getConfig', []],
    ['saveConfig', ['request']],
    ['checkUpdate', []],
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

/** saveConfig 的边界校验上限（超出即拒；面板侧另有长度提示）。 */
const GREETING_MAX_CHARS = 200
const PUNCTUATION_MAX_CHARS = 8

/**
 * 远程服务：Gateway 分发只要求结构合法的 `typertRemote` 绑定
 * （service === 自身、serviceKey/namespace 一致）。
 * 配置读写经 {@link TemplateSettingsHandle}（0.1.7 settings 模型，volatile
 * 引用即时读 + ctx.settings.replace 整段写，见 spec.ts）。
 */
export class TemplateRemote {
  readonly typertRemote = Object.freeze({
    service: this,
    serviceKey: 'template',
    namespace: 'template',
  })

  constructor(private readonly settings: TemplateSettingsHandle) {}

  /** 回显文本并打上 host 时间戳，证明调用越过了浏览器边界。 */
  async ping(request: TemplatePingRequest): Promise<TemplatePingResult> {
    const text = typeof request?.text === 'string' && request.text.trim() ? request.text.trim() : 'ping'
    return { ok: true, pong: text, at: Date.now() }
  }

  // -----------------------------------------------------------------------
  // RPC 端点：配置读写（0.1.7 settings 模型的示范面；配置页在「插件」页
  // 本插件详情页，经 client 半 plugins.bundle.config 槽位渲染）。
  // -----------------------------------------------------------------------

  /** 读当前配置（volatile 引用即时取值，总是最新）。 */
  async getConfig(): Promise<TemplateGetConfigResult> {
    return { ok: true, config: this.settings.get() }
  }

  /**
   * 整段保存配置：边界校验（字符串类型 + 长度上限）后走
   * ctx.settings.replace 整段替换（ns = 条目 id；只放行 volatile 字段）。
   */
  async saveConfig(request: TemplateSettings): Promise<TemplateSaveConfigResult> {
    const greeting = typeof request?.greeting === 'string' ? request.greeting : null
    const punctuation = typeof request?.punctuation === 'string' ? request.punctuation : null
    if (greeting === null || greeting.length > GREETING_MAX_CHARS) {
      return { ok: false, error: { code: 'invalid-config', message: `greeting 必须是不超过 ${GREETING_MAX_CHARS} 字符的字符串` } }
    }
    if (punctuation === null || punctuation.length > PUNCTUATION_MAX_CHARS) {
      return { ok: false, error: { code: 'invalid-config', message: `punctuation 必须是不超过 ${PUNCTUATION_MAX_CHARS} 字符的字符串` } }
    }
    await this.settings.replace({ greeting, punctuation })
    return { ok: true }
  }

  // -----------------------------------------------------------------------
  // RPC 端点：插件版本提示（状态机在 ./update-state.ts，host 半唯一权威源；
  // 本类只是触发器 + 快照读取，不持有状态。无安装动作——发现新版本仅提示
  // 用户到「插件」页卸载后重装）。
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
   * 更新状态机快照（配置页更新条与全局提示弹窗的唯一读通道）。
   * 纯状态读取，不会失败，也无网络请求。
   */
  async getUpdateState(): Promise<UpdateStateResult> {
    return { ok: true, state: getUpdateMachineState() }
  }
}
