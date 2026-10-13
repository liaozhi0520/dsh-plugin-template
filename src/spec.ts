/**
 * dsh-plugin-template 的持久化设置（0.1.7 settings 模型）。
 *
 * 0.1.7 起插件设置由「当前 Profile 的插件配置」保存（cordis.patch.yml 里本插件
 * 条目的 config 段；ns = 条目 id，即 SETTINGS_NS），不再有
 * settings.register/SettingsScope：本文件导出 cordis Loader 约定名的 `Config`
 * schema，**全部字段 volatile**——面板写回走 ctx.settings.replace（只放行
 * volatile 字段），且字段变更不触发插件重载；apply(ctx, config) 收到的
 * `TemplateConfig` 里每个字段是宿主原地更新的 Volatile 引用（get() 即时取
 * 当前值，配置即时更新免重读）。
 *
 * 配置页（「插件」页本插件详情页）经 backend RPC（getConfig/saveConfig）
 * 读写，schema 只负责持久化形态与默认值——面板做完校验后提交（host 半
 * saveConfig 内还有一道边界校验）。
 */
import type { Volatile } from '@deepseek-ai/cosmokit'
import Schema from '@deepseek-ai/schemastery'

/** 设置命名空间（= profile 组合里本插件条目的 id，settings.update/replace 的 ns）。 */
export const SETTINGS_NS = 'dsh-plugin-template'

/** 持久化的设置值形态（与 client 半 shared/contract.ts 的 TemplateConfigValue 同形）。 */
export interface TemplateSettings {
  /** 问候语前缀（demo 工具与配置页共用）。 */
  greeting: string
  /** 句尾标点。 */
  punctuation: string
}

/**
 * apply(ctx, config) 收到的运行时形态：全部字段 volatile，宿主持有稳定引用并
 * 原地更新快照，get() 即时返回当前值（Volatile 从 cosmokit 导入——npm 的
 * cordis 4.0.2 构建未 re-export 该类型；type-only，运行时宿主塞入的即其实现）。
 */
export interface TemplateConfig {
  greeting: Volatile<string>
  punctuation: Volatile<string>
}

/**
 * 0.1.7 settings 面的最小句柄（替代 0.1.5 的 SettingsScope）：
 * 门控/服务/工具只经它读写本插件命名空间，不直接依赖 dsh-settings 服务面。
 */
export interface TemplateSettingsHandle {
  /**
   * 当前设置快照（volatile 引用即时取值，读到的总是最新值）。浅拷贝剥离
   * VolatileSnapshot 的 deep-readonly 壳——消费者不得把快照当作与配置存储的
   * 持续引用。
   */
  get(): TemplateSettings
  /**
   * 整段替换本插件命名空间的 live 配置（面板保存通道）。整段语义
   * （0.1.7 SettingsForms.replace：重置全部 live 字段后以传入值铺底）保证
   * 删得掉键——深合并 update 会把缺席键留在存储里。
   */
  replace(section: TemplateSettings): Promise<void>
}

/** cordis Loader 约定名（entry.fiber.runtime.Config）：全字段 volatile。 */
export const Config = Schema.object({
  greeting: Schema.string().volatile().default('Hello'),
  punctuation: Schema.string().volatile().default('!'),
})
