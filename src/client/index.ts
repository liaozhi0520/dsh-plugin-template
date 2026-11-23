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
 * 唯一生效路径 = `pnpm build` 后重启/重装 DeepSeek Harness（无热更工作流）。
 * host 半门禁软禁用时（index.html 注入了 DISABLED_GLOBAL 标记），本入口
 * 只挂"已停用"说明面板，不注册任何业务能力。
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
import { PLUGIN_VERSION } from './build-info'
import { DISABLED_GLOBAL, isDisabledFlagCurrent, type DisabledFlag } from '../shared/disabled-flag'
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
function registerDisabledPanel(ctx: ClientContext, flag: DisabledFlag): void {
  const reason = typeof flag.reason === 'string' ? flag.reason : ''
  const min = typeof flag.min === 'string' ? flag.min : ''
  const max = typeof flag.max === 'string' ? flag.max : ''
  const installVersion = typeof flag.installVersion === 'string' ? flag.installVersion : ''
  // 当前 harness 版本（host 半尽力解析；缺席 = 锚点全失败 → 面板不渲染该行）。
  const runtimeVersion = typeof flag.runtimeVersion === 'string' ? flag.runtimeVersion : null
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
  console.log(`[dsh-plugin-template] client half loaded (plugins page config, v${PLUGIN_VERSION})`)

  // 注册本插件的双语词典（zh/en 键集一致，注册即完成校验）；
  // ctx.effect 让词典随插件停用自动撤下。
  ctx.effect(() => ctx.locale.register(TEMPLATE_NS, { zh, en }), 'dsh-plugin-template: dictionaries')

  // host 半门禁软禁用时注入的全局标记（shared/disabled-flag.ts）：
  // 存在且属于当前插件构建 → 只挂"已停用"说明面板，不注册任何业务能力；不存在 → 正常加载。
  //
  // 【必须校验 pluginVersion】`webserver/index-inject` 的 global 行只在 index.html
  // 首次渲染时写入页面；插件页升级会热替换 host/client 模块，但**不会重建文档**，
  // 旧版 host 留下的 `window[DISABLED_GLOBAL]` 会一直存在。若直接信任它，新版本
  // 明明已支持当前 harness，新的 client 仍会挂出停用面板（真机踩坑）。版本不一致
  // = 旧页面残留，先用 `template/ping` 探活当前 host 业务半：
  // - 新 host 已在跑 → ping 成功，删掉旧标记按正常路径注册；
  // - host 仍是旧模块（link: 本地构建不经过插件页安装时）→ ping 失败，保留面板
  //   并提示重启（不要把「旧 host + 新 client」伪装成正常配置页）。
  const disabledFlag = (window as unknown as Record<string, unknown>)[DISABLED_GLOBAL] as DisabledFlag | undefined
  if (disabledFlag !== undefined) {
    if (isDisabledFlagCurrent(disabledFlag, PLUGIN_VERSION)) {
      registerDisabledPanel(ctx, disabledFlag)
      return
    }
    const connection = ctx.get('connection') as ConnectionHandle
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1500)
    let hostAlive = false
    try {
      hostAlive = (await pingHost(connection.rpc, 'soft-disable-probe', controller.signal)).ok
    } catch {
      hostAlive = false
    } finally {
      clearTimeout(timer)
    }
    if (!hostAlive) {
      console.warn(
        '[dsh-plugin-template] 页面里仍是旧版本停用标记，且当前 host 的 template/ping 不可用'
        + '（host 可能仍是旧模块）——按停用处理；若刚更新过插件，请重启 DeepSeek Harness。',
      )
      registerDisabledPanel(ctx, disabledFlag)
      return
    }
    console.warn(
      '[dsh-plugin-template] 忽略旧页面残留的停用标记：标记版本 '
      + `${typeof disabledFlag.pluginVersion === 'string' ? disabledFlag.pluginVersion : '(none)'}`
      + `，当前 client 版本 ${PLUGIN_VERSION}（host template/ping 探活成功）。`,
    )
    delete (window as unknown as Record<string, unknown>)[DISABLED_GLOBAL]
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
