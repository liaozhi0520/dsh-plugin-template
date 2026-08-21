import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import Schema from '@deepseek-ai/schemastery'

export const name = 'dsh-plugin-template'
export const inject = ['tools']

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

  console.log(`[dsh-plugin-template] host half loaded, greeting = ${JSON.stringify(config.greeting)}`)
}
