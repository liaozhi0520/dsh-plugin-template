/**
 * dsh-plugin-template, browser half: registers the demo configuration page on
 * the Plugins page (plugins.bundle.config, keyed by this bundle's package
 * name — 问候语编辑器 + ping 演示).
 * 数据经 host 半代理（template/*）读写。
 *
 * 【0.2.2 起】方案 A：不再注册 shell.overlay 版本提醒条目、不再有面板更新条、
 * 不再查 registry——插件零出网，版本检查/更新由官方插件页（plugin-manager
 * 的 Versions 区）接管。见 docs/compat-plan-0.2.2-rc.1.md。
 *
 * 【状态来源】host 半门禁软禁用时不再注入页面 global；client 每次加载查询
 * host 的只读状态路由（PLUGIN_STATUS_PATH）。路由由当前 host fiber 提供，
 * 因此插件升级/重新启用后读取的是新 host 的真实状态，不依赖页面刷新。
 */
// Type-only: client 侧 Context（直接用 cordis Context，按官方插件惯例）。
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: ctx.slots 服务增强（SlotRegistry 归属 dsh-client-ui-renderer）。
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
// Type-only: ctx.locale service augmentation (LocaleRuntime + 'locale/change' 事件).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the Plugins page's SlotMap merge (the 'plugins.bundle.config' entry).
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { TEMPLATE_NS, en, zh, type TemplatePanelKey } from './locales'
import { BUNDLE_KEY as bundleKey } from './bundle-key'
import { fetchPluginStatus } from './status'
import type { PluginStatusDisabled } from '../shared/plugin-status'
import { getConfigViaHost, pingHost, saveConfigViaHost } from './api'
import { TemplateSection, type TemplateSectionInjected } from './TemplateSection'
import { TemplateDisabledSection, type TemplateDisabledSectionInjected } from './TemplateDisabledSection'

export const name = 'dsh-plugin-template'
export const inject = ['slots', 'locale', 'connection']

/**
 * plugins.bundle.config 槽位的注册 key：见 ./bundle-key.ts（smoke-offline 0c 节
 * 守护与包清单一致）。
 */
const BUNDLE_KEY = bundleKey

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** 面板与停用说明的文案。 */
    'template.panel': TemplatePanelKey
  }
}

/** 挂「已停用」说明面板（停用分支的唯一渲染路径）。 */
function registerDisabledPanel(ctx: ClientContext, status: PluginStatusDisabled): void {
  const reason = status.reason
  const min = status.min
  const max = status.max
  const installVersion = status.installVersion
  // 当前 harness 版本（host 半尽力解析；缺席 = 锚点全失败 → 面板不渲染该行）。
  const runtimeVersion = status.runtimeVersion ?? null
  console.warn('[dsh-plugin-template] host half disabled:', reason)
  ctx.slots.inject('plugins.bundle.config', () =>
    ctx.slots.register(
      {
        name: 'plugins.bundle.config',
        key: BUNDLE_KEY,
        locale: TEMPLATE_NS,
        inject: (): TemplateDisabledSectionInjected => ({ reason, min, max, installVersion, runtimeVersion }),
      },
      TemplateDisabledSection,
    ),
  )
}

export async function apply(ctx: ClientContext): Promise<void> {
  console.log('[dsh-plugin-template] client half loaded (plugins page config)')

  // 注册本插件的双语词典（zh/en 键集一致，注册即完成校验）；
  // ctx.effect 让词典随插件停用自动撤下。
  ctx.effect(() => ctx.locale.register(TEMPLATE_NS, { zh, en }), 'dsh-plugin-template: dictionaries')

  // 查询当前 host 的插件状态。状态接口不可得 = 旧 host 或启动竞态：按正常
  // 配置页处理（不再读取任何页面 global；旧 host 通过重新启用插件或重启恢复）。
  const status = await fetchPluginStatus()
  if (status?.state === 'disabled') {
    registerDisabledPanel(ctx, status)
    return
  }
  if (status === undefined) {
    console.warn('[dsh-plugin-template] 插件状态接口不可用，按正常配置页处理。')
  }

  // 通用 RPC 通道（连接层提供）：浏览器 → host 的 template/* 代理。
  // 官方未给 client 侧 Context 增补 connection 属性，get + 类型断言是收敛的取法。
  const connection = ctx.get('connection') as ConnectionHandle

  // plugins.bundle.config：demo 配置页（问候语编辑器 + ping 演示），渲染在
  // 「插件」页本组合包详情页的描述与「包含的组件」之间（ui-plugin-manager
  // 声明的槽位，key 必须逐字等于 package.json 的 name——见 BUNDLE_KEY 的注释）。
  ctx.slots.inject('plugins.bundle.config', () =>
    ctx.slots.register(
      {
        name: 'plugins.bundle.config',
        key: BUNDLE_KEY,
        locale: TEMPLATE_NS,
        inject: (): TemplateSectionInjected => ({
          api: {
            ping: (text) => pingHost(connection.rpc, text),
            getConfig: () => getConfigViaHost(connection.rpc),
            saveConfig: (value) => saveConfigViaHost(connection.rpc, value),
          },
        }),
      },
      TemplateSection,
    ),
  )
}
