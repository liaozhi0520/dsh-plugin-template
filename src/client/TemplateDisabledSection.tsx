/**
 * 版本不兼容时的说明面板（plugins.bundle.config 条目，挂「插件」页本组合包
 * 详情页）：host 半门禁软禁用后，业务能力全部不可用，本面板代替正常配置页
 * 向用户说明原因与处置。原因文本与推荐安装版本由 host 半经 index 注入的
 * 全局标记带来（../shared/disabled-flag.ts），经 inject props 传入，不在
 * 浏览器侧重复版本判断。
 *
 * 版式：原因 → 支持窗口 → 当前 harness 版本 → 桌面版更新指引
 * （desktop-only：桌面版应用与内置 harness 锁步同版，处置 = 更新/降级
 * 桌面应用本身，无 CLI 安装命令）。
 *
 * 【0.2.2 起】方案 A 删除了「插件组」（当前安装版本 / registry 最新版本自查 /
 * package@version 安装命令药丸）：插件不再查 registry、不再做任何更新提醒，
 * 版本检查/更新由官方插件页（plugin-manager 的 Versions 区）接管。本面板
 * 只呈现 harness 侧信息，**断网可用**。见 docs/compat-plan-0.2.2-rc.1.md。
 */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import classes from './TemplateSection.module.css'

/** 组件的 inject face：host 半给出的停用原因、支持版本窗口与推荐安装版本。 */
export interface TemplateDisabledSectionInjected {
  reason: string
  min: string
  max: string
  /** 推荐安装目标版本（host 半给定，固定为支持上限 MAX）。 */
  installVersion: string
  /** 当前检测到的 harness 版本；null = host 半锚点全失败，不渲染该行。 */
  runtimeVersion: string | null
}

export type TemplateDisabledSectionProps = PropsRuntime<'plugins.bundle.config'> &
  PropsLocale<'template.panel'> &
  TemplateDisabledSectionInjected

/** 版本不兼容说明页（只呈现 harness 侧的原因 / 窗口 / 当前版本 / 桌面指引）。 */
export function TemplateDisabledSection(props: TemplateDisabledSectionProps) {
  const { t, reason, min, max, installVersion, runtimeVersion } = props
  return (
    <div className={classes.disabledSection}>
      <h2 className={classes.title}>{t('panelTitle')}</h2>
      <p className={classes.intro}>{t('disabledTitle')}</p>
      <p className={classes.intro}>{reason !== '' ? reason : t('disabledFallback')}</p>
      {min !== '' && max !== '' && <p className={classes.intro}>{t('disabledWindow', { min, max })}</p>}
      {runtimeVersion !== null && runtimeVersion !== '' && (
        <p className={classes.intro}>{t('disabledRuntimeCurrent', { runtime: runtimeVersion })}</p>
      )}
      {installVersion !== '' && <p className={classes.intro}>{t('disabledDesktopUpdate', { version: installVersion })}</p>}
    </div>
  )
}
