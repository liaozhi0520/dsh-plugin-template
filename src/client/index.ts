/**
 * dsh-plugin-template, browser half: registers the demo configuration page on
 * the Plugins page (plugins.bundle.config, keyed by this bundle's package
 * name — 问候语编辑器 + ping 演示 + 插件更新条), and the two version-notice
 * entries on `shell.overlay`（NoticeModal）.
 * 数据经 host 半代理（template/*）读写。
 * 唯一生效路径 = `pnpm build` 后重启/重装 DeepSeek Harness（无热更工作流）。
 * host 半门禁软禁用时（index.html 注入了 DISABLED_GLOBAL 标记），本入口
 * 只挂"已停用"说明面板，不注册任何业务能力。
 */
// Type-only: client 侧 Context（直接用 cordis Context，按官方插件惯例）。
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: ctx.slots 服务增强（SlotRegistry 归属 dsh-client-ui-renderer）。
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
// Type-only: ctx.locale service augmentation (LocaleRuntime + 'locale/change' 事件
// + TranslateNS 类型——GlobalNotice 的槽位外翻译函数)。
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the Plugins page's SlotMap merge (the 'plugins.bundle.config' entry).
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
// Type-only: pulls the app frame's SlotMap merge (the 'shell.overlay' entry — 版本提醒条目).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { TEMPLATE_NS, en, zh, type TemplatePanelKey } from './locales'
import { BUNDLE_KEY as bundleKey } from './bundle-key'
import { DISABLED_GLOBAL, type DisabledFlag, type DisabledPluginStatus } from '../shared/disabled-flag'
import { checkUpdateViaHost, getConfigViaHost, getUpdateStateViaHost, pingHost, saveConfigViaHost } from './api'
import { TemplateSection, type TemplateSectionInjected } from './TemplateSection'
import { TemplateDisabledSection, type TemplateDisabledSectionInjected } from './TemplateDisabledSection'
import { GlobalNotice, type GlobalNoticeInjected } from './GlobalNotice'
import { StaleBanner, type StaleBannerInjected } from './StaleBanner'

export const name = 'dsh-plugin-template'
export const inject = ['slots', 'locale', 'connection']

/**
 * plugins.bundle.config 槽位的注册 key：见 ./bundle-key.ts（与升级提示的
 * 安装 spec 命令片共用同一来源；smoke-offline 0c 节守护与包清单一致）。
 */
const BUNDLE_KEY = bundleKey

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** 面板与版本提醒条目的文案。 */
    'template.panel': TemplatePanelKey
  }
}

export function apply(ctx: ClientContext): void {
  console.log('[dsh-plugin-template] client half loaded (plugins page config + version notices)')

  // 注册本插件的双语词典（zh/en 键集一致，注册即完成校验）；
  // ctx.effect 让词典随插件停用自动撤下。
  ctx.effect(() => ctx.locale.register(TEMPLATE_NS, { zh, en }), 'dsh-plugin-template: dictionaries')

  // host 半门禁软禁用时注入的全局标记（shared/disabled-flag.ts）：
  // 存在 → 只挂"已停用"说明面板，不注册任何业务能力；不存在 → 正常加载。
  const disabledFlag = (window as unknown as Record<string, unknown>)[DISABLED_GLOBAL] as DisabledFlag | undefined
  if (disabledFlag !== undefined) {
    const reason = typeof disabledFlag.reason === 'string' ? disabledFlag.reason : ''
    const min = typeof disabledFlag.min === 'string' ? disabledFlag.min : ''
    const max = typeof disabledFlag.max === 'string' ? disabledFlag.max : ''
    const installVersion = typeof disabledFlag.installVersion === 'string' ? disabledFlag.installVersion : ''
    // 当前 harness 版本（host 半尽力解析；缺席 = 两锚点全失败 → 面板不渲染该行）。
    const runtimeVersion = typeof disabledFlag.runtimeVersion === 'string' ? disabledFlag.runtimeVersion : null
    // 插件版本标识（旧 host / 包清单不可读时缺席 → null，面板不渲染该段）；
    // 「是否最新」由面板组件自查 registry（disabled-version-check.ts）。
    const rawPlugin: unknown = disabledFlag.plugin
    const plugin: DisabledPluginStatus | null = typeof rawPlugin === 'object' && rawPlugin !== null
      ? {
          name: typeof (rawPlugin as DisabledPluginStatus).name === 'string' ? (rawPlugin as DisabledPluginStatus).name : '',
          installed: typeof (rawPlugin as DisabledPluginStatus).installed === 'string' ? (rawPlugin as DisabledPluginStatus).installed : '',
        }
      : null
    console.warn('[dsh-plugin-template] host half disabled:', reason)
    ctx.slots.inject('plugins.bundle.config', () =>
      ctx.slots.register(
        {
          name: 'plugins.bundle.config',
          key: BUNDLE_KEY,
          locale: TEMPLATE_NS,
          inject: (): TemplateDisabledSectionInjected => ({ reason, min, max, installVersion, runtimeVersion, plugin }),
        },
        TemplateDisabledSection,
      ),
    )
    return
  }

  // 通用 RPC 通道（连接层提供）：浏览器 → host 的 template/* 代理。
  // 官方未给 client 侧 Context 增补 connection 属性，get + 类型断言是收敛的取法。
  const connection = ctx.get('connection') as ConnectionHandle

  // plugins.bundle.config：demo 配置页（问候语编辑器 + ping 演示 + 插件更新条），
  // 渲染在「插件」页本组合包详情页的描述与「包含的组件」之间（ui-plugin-manager
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
            getUpdateState: () => getUpdateStateViaHost(connection.rpc),
            checkUpdate: () => checkUpdateViaHost(connection.rpc),
          },
        }),
      },
      TemplateSection,
    ),
  )

  // 版本提醒条目 ×2（shell.overlay，NoticeModal；各自独立生命周期与确认语义）：
  // - StaleBanner（danger）：运行中模块自报版本 ≠ 构建期 BUILD_VERSION 时弹，
  //   共提醒两次（第二次升级文案），见 StaleBanner.tsx；
  // - GlobalNotice（neutral）：registry 检查 available 时弹新版本提示，
  //   「我知道了」仅内存态关闭，见 GlobalNotice.tsx。
  // 两条件同时成立时两个对话框按官方层栈叠放（关上层露下层）。软禁用早退
  // 路径（上方）不注册——彼时无 RPC，停用面板已承担版本修复指引。
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      {
        name: 'shell.overlay',
        id: 'template-stale-banner',
        order: 100,
        locale: TEMPLATE_NS,
        inject: (): StaleBannerInjected => ({
          api: { getUpdateState: () => getUpdateStateViaHost(connection.rpc) },
        }),
      },
      StaleBanner,
    ),
  )
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      {
        name: 'shell.overlay',
        id: 'template-update-notice',
        order: 101,
        locale: TEMPLATE_NS,
        inject: (): GlobalNoticeInjected => ({
          api: { getUpdateState: () => getUpdateStateViaHost(connection.rpc) },
        }),
      },
      GlobalNotice,
    ),
  )
}
