/**
 * dsh-plugin-template, browser half: registers a demo settings section so the
 * client-bundle HMR chain is visible end to end — edit sources, the local
 * `tsdown --watch` rewrites lib/client.js, the host's client-hmr stat poll
 * broadcasts the rebuild over SSE, and the browser swaps this plugin's fiber
 * in place without a page reload.
 *
 * 官方结构约定（packages/client/AGENTS.md）：入口不含 JSX（组件各自成文件）、
 * 无 default 导出、只导出 cordis 加载所需（name/inject/apply）；
 * 文案走 locale 词典、样式走 CSS Modules、组件数据走四份 props shares。
 */
// Type-only: client 侧 Context（alpha.2 起 dsh-client-runtime 移除，按官方插件惯例用 cordis Context）。
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: ctx.slots 服务增强（alpha.2 起 SlotRegistry 归属 ui-renderer）。
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
// Type-only: ctx.locale service augmentation (LocaleRuntime) + common namespace merge.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the settings shell's SlotMap merge (the 'settings.section' entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { DEMO_NS, en, zh, type TemplateDemoKey } from './locales'
import { DISABLED_GLOBAL, type DisabledFlag } from '../shared/disabled-flag'
import { pingHost } from './api'
import { TemplateSection, type TemplateSectionInjected } from './TemplateSection'
import { TemplateDisabledSection, type TemplateDisabledSectionInjected } from './TemplateDisabledSection'
import { cssText } from './TemplateSection.module.css'

export const name = 'dsh-plugin-template'
export const inject = ['slots', 'locale', 'connection']

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The demo panel's copy. */
    'template.demo': TemplateDemoKey
  }
}

export function apply(ctx: ClientContext): void {
  console.log('[dsh-plugin-template] client half loaded (v2)')

  // 注册双语词典（zh/en 键集一致，注册即校验）；ctx.effect 让词典随 HMR 卸载自动撤下。
  ctx.effect(() => ctx.locale.register(DEMO_NS, { zh, en }), 'dsh-plugin-template: demo dictionaries')

  // 面板样式：构建期 css-modules-inline 插件把 TemplateSection.module.css 编译成
  // 文本内联进 bundle；这里注入 <style> 并把生命周期挂到本 fiber（HMR 卸载即移除，
  // 重载以新 CSS 重新注入，不残留旧样式）。
  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset.plugin = name
    tag.textContent = cssText
    document.head.appendChild(tag)
    return () => tag.remove()
  }, 'dsh-plugin-template: demo styles')

  // 列表 label 支持 thunk：locale 切换时重读，无需重注册。
  const t = ctx.locale.bind(DEMO_NS)

  // host 半版本门禁软禁用时注入的全局标记（shared/disabled-flag.ts）：
  // 存在 → 只挂"已停用"说明面板，不注册任何业务能力；不存在 → 正常加载。
  // 版本判断只有 host 半一份，client 不复制。
  const disabledFlag = (window as unknown as Record<string, unknown>)[DISABLED_GLOBAL] as DisabledFlag | undefined
  if (disabledFlag !== undefined) {
    const reason = typeof disabledFlag.reason === 'string' ? disabledFlag.reason : ''
    const min = typeof disabledFlag.min === 'string' ? disabledFlag.min : ''
    const max = typeof disabledFlag.max === 'string' ? disabledFlag.max : ''
    console.warn(`[dsh-plugin-template] host half disabled: ${reason}`)
    ctx.slots.inject('settings.section', () =>
      ctx.slots.register(
        {
          name: 'settings.section',
          id: 'dsh-plugin-template',
          order: 100,
          label: () => t('nav'),
          locale: DEMO_NS,
          inject: (): TemplateDisabledSectionInjected => ({ reason, min, max }),
        },
        TemplateDisabledSection,
      ),
    )
    return
  }

  // 通用 RPC 通道（连接层提供）：浏览器 → host 的 template/ping。
  // 官方未给 client 侧 Context 增补 connection 属性，get + 类型断言是收敛的取法。
  const connection = ctx.get('connection') as ConnectionHandle

  // settings.section 由设置域在运行时声明；slots.inject 等声明出现后注册，
  // 声明坍缩时自动撤下，重新声明时再注册。locale 声明让框架给组件注入 `t`，
  // inject 工厂把演示数据面注入组件 props。
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: 'dsh-plugin-template',
        order: 100,
        label: () => t('nav'),
        locale: DEMO_NS,
        inject: (): TemplateSectionInjected => ({
          demo: {
            ping: (text) => pingHost(connection.rpc, text),
          },
        }),
      },
      TemplateSection,
    ),
  )
}
