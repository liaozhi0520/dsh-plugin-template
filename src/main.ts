/**
 * dsh-plugin-template, host half 主体（重模块图）——两段式入口的第二段。
 *
 * 本模块由薄门禁入口 ./index.ts 在 profile 门禁与版本门禁全部通过后动态
 * import（`await import('./main.js')`）。**在门禁全过前绝不能被任何入口
 * 静态 import**：本文件的静态 import 图拉起全部 @deepseek-ai/dsh-* 运行时
 * 依赖（tools/typert/settings…），若在门禁前求值，窗口内未验证 harness 版本
 * 的 API 漂移会让入口 import 失败（Loader catch → entry 停摆），软禁用与
 * client 停用面板将没有机会运行——这正是两段式入口要堵的缺口。入口隔离
 * 检查见 scripts/smoke-offline.mjs。
 *
 * 业务（模板演示面）：
 * - settings：0.1.7 settings 模型——Config schema（./spec.ts，全字段 volatile）
 *   由 Loader 求值后经 apply(ctx, config) 注入，配置页经 TemplateSettingsHandle
 *   读写（写回走 ctx.settings.replace，ns = 条目 id）；
 * - 后端服务：TemplateRemote（ping 演示 + 配置读写 + 版本提示端点），实现见
 *   ./remote.ts，端点声明见 ./remote.ts 的 DESCRIPTORS；
 * - 插件版本提示：registry latest 检查（状态机见 ./update-state.ts）+ 运行中
 *   模块自报版本（./package-info.ts，client 半陈旧代码检测的事实源）。
 *   无安装动作——发现新版本仅提示用户到「插件」页卸载后重装。
 *
 * 浏览器经 `ctx.connection.rpc.call('/api', 'template/<method>')` 调用，
 * 由 Typert Gateway 按描述符分发到服务实例。
 *
 * 注：官方服务包是"服务类 default 导出"形态（端点靠 TypertRemoteService +
 * \@Remote 的模块级标记发现）。linked 插件与 harness 各有一份该模块实例时
 * 标记失联，故本插件用函数型入口手动注册描述符（模板实验结论，勿改回装饰器）。
 *
 * 所有注册（provide/typert.register/工具）都是 fiber-bound effect：插件重挂
 * （重装/重启）时自动撤销并重建。
 *
 * apply 体内的错误不做软禁用兜底：cordis 只在 apply 抛错时自动回滚已注册
 * effects（fiber FAILED + 回滚 + labeled warning，不产生 unhandled rejection），
 * 在这里 catch 会留下无法回滚的半注册状态。重模块图的加载失败则由 index.ts
 * 捕获并软禁用（彼时状态保证干净——除 settings-page-policy 外什么都没注册）。
 */
import type { Context } from '@deepseek-ai/cordis'
// Type-only: 给 TypertRegistryContract 增补 register() 等方法（声明合并）。
import type {} from '@deepseek-ai/dsh-typert-registry'
// Type-only: ctx.settings 服务增补（configure/replace 的类型面）。
import type {} from '@deepseek-ai/dsh-settings'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { DESCRIPTORS, TemplateRemote } from './remote.js'
import { SETTINGS_NS, type TemplateConfig, type TemplateSettings, type TemplateSettingsHandle } from './spec.js'
import { startUpdateCheck } from './update-state.js'

/**
 * 业务主体装配。profile 门禁已由入口（index.ts）判定通过，profileDir 为其
 * 返回的 profile.dir（版本提示不需要 profile 锚点，参数保留以维持入口调用
 * 形态稳定）。
 */
export function apply(ctx: Context, config: TemplateConfig, _profileDir: string): void {
  // 0.1.7 设置句柄：读 = volatile 引用即时取值（浅拷贝剥离 deep-readonly 壳）；
  // 写 = ctx.settings.replace 整段替换（ns = 条目 id，只放行 volatile 字段）。
  const settings: TemplateSettingsHandle = {
    get: () => ({
      greeting: config.greeting.get(),
      punctuation: config.punctuation.get(),
    }),
    replace: (section: TemplateSettings) => ctx.settings.replace(SETTINGS_NS, section),
  }

  // 通过 ctx 注册的任何东西（工具、监听器、定时器……）都是一个可逆 effect：
  // 插件重挂（重装/重启）时自动卸载旧实例的全部注册，再用新代码重新 apply。
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
      const { greeting, punctuation } = settings.get()
      return `${greeting}, ${args.name}${punctuation}`
    },
  }))

  // 观察自己工具的执行结果，方便在终端确认重装/重启后的新行为。
  ctx.on('tools/result', (exec, result) => {
    if (exec.name !== 'greet') return
    const text = result.content
      .map(block => (block.type === 'text' ? block.text : ''))
      .join('')
    console.log(`[dsh-plugin-template] ${exec.name} -> ${text}`)
  })

  // Typert 远程端点：提供 template 服务 + 注册调用描述符（形态选择原因见
  // ./remote.ts 头注释）。
  ctx.provide('template', new TemplateRemote(settings))
  ctx.typert.register({
    package: 'dsh-plugin-template',
    face: 'host',
    schemas: [],
    model: { services: [], events: [], objects: [] },
    invocations: DESCRIPTORS,
  })

  // 启动更新检查（fire-and-forget，见 ./update-state.ts）：状态机结论经
  // template/getUpdateState 端点供前端面板/全局提示轮询；检查失败不影响本
  // 函数与启动。
  startUpdateCheck(false)

  console.log(`[dsh-plugin-template] host half loaded, greeting = ${JSON.stringify(settings.get().greeting)}`)
}
