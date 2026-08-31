import type { Context } from '@deepseek-ai/cordis'
// Type-only: 给 TypertRegistryContract 增补 register() 等方法（声明合并）。
import type {} from '@deepseek-ai/dsh-typert-registry'
// Type-only：'webserver/index-inject' 事件 + IndexInjection 行类型（软禁用标记注入）。
import type {} from '@deepseek-ai/dsh-host-webserver'
import { defineTool } from '@deepseek-ai/dsh-tools'
import Schema from '@deepseek-ai/schemastery'
import { PING_DESCRIPTOR, TemplateRemote } from './remote.js'
import { DISABLED_GLOBAL } from './shared/disabled-flag.js'
import { assertHarnessSupported, MAX_HARNESS_VERSION, MIN_HARNESS_VERSION } from './version-gate.js'

export const name = 'dsh-plugin-template'
export const inject = ['tools', 'typert']

export interface Config {
  /** 问候语前缀。 */
  greeting: string
  /** 句尾标点。 */
  punctuation: string
}

export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default('Hello'),
  punctuation: Schema.string().default('!'),
})

export function apply(ctx: Context, config: Config) {
  // 版本门禁：超出上限默认软禁用——醒目错误日志 + 插件不注册任何业务能力，
  // 不影响 dsh web 启动与其他插件（Loader/app-boot 对插件抛错零容忍，
  // 抛错 = 整个 harness exit(1)，见 version-gate.ts 注释）。
  // DSH_PLUGIN_TEMPLATE_STRICT=1 恢复抛错 fail-loud（CI / 排查场景）。
  try {
    assertHarnessSupported()
  } catch (error) {
    if (process.env.DSH_PLUGIN_TEMPLATE_STRICT) throw error
    const reason = error instanceof Error ? error.message : String(error)
    console.error(`[dsh-plugin-template] ${reason}`)
    console.error('[dsh-plugin-template] 版本不兼容，插件已停用（不影响 DSH 启动与其他插件）。')
    // 告知 client 半：经 webserver/index-inject 向 index.html 注入全局标记，
    // 浏览器端据此刻出"已停用"说明面板（client/index.ts）。这是软禁用路径
    // 唯一注册的东西；ctx.on 是 fiber-bound effect——插件卸载/HMR 重载即
    // 撤销监听，注入表每次 index 请求现收现渲（webserver
    // collectIndexInjections），无持久状态、无残留。
    ctx.on('webserver/index-inject', (table) => {
      table.push({ kind: 'global', name: DISABLED_GLOBAL, value: { reason, min: MIN_HARNESS_VERSION, max: MAX_HARNESS_VERSION } })
    })
    return
  }

  // 通过 ctx 注册的任何东西（工具、监听器、定时器……）都是一个可逆 effect：
  // HMR 重载本插件时会自动卸载旧实例的全部注册，再用新代码重新 apply。
  ctx.tools.register(defineTool({
    name: 'greet',
    description: 'Greet someone by name.',
    parameters: {
      name: { type: 'string', required: true, description: 'The name to greet' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return `${config.greeting}, ${args.name}${config.punctuation}`
    },
  }))

  // 观察自己工具的执行结果，方便在终端确认 HMR 后的新行为。
  ctx.on('tools/result', (exec, result) => {
    if (exec.name !== 'greet') return
    const text = result.content
      .map(block => (block.type === 'text' ? block.text : ''))
      .join('')
    console.log(`[dsh-plugin-template] ${exec.name} -> ${text}`)
  })

  // Typert 远程端点演示：提供 template 服务 + 注册调用描述符（形态选择原因见
  // ./remote.ts 头注释）。浏览器经 ctx.connection.rpc.call('/api', 'template/ping',
  // { args: { request } }) 调用，由 Typert Gateway 分发到服务实例。
  ctx.provide('template', new TemplateRemote())
  ctx.typert.register({
    package: 'dsh-plugin-template',
    face: 'host',
    schemas: [],
    model: { services: [], events: [], objects: [] },
    invocations: [PING_DESCRIPTOR],
  })

  console.log(`[dsh-plugin-template] host half loaded(v2), greeting = ${JSON.stringify(config.greeting)}`)
}
