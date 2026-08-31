/**
 * 版本不兼容时的设置面板（settings.section 条目）：host 半版本门禁软禁用后，
 * 业务能力全部不可用，本面板代替正常面板向用户说明原因与处置（降级 harness
 * 或等待兼容版本）。原因文本由 host 半经 index 注入的全局标记带来
 * （../shared/disabled-flag.ts），经 inject props 传入，不在浏览器侧重复
 * 版本判断。
 */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import classes from './TemplateSection.module.css'

/** 组件的 inject face：host 半给出的停用原因与支持版本窗口。 */
export interface TemplateDisabledSectionInjected {
  reason: string
  min: string
  max: string
}

export type TemplateDisabledSectionProps = PropsRuntime<'settings.section'> &
  PropsLocale<'template.demo'> &
  TemplateDisabledSectionInjected

/** 版本不兼容说明页（只读，无交互）。 */
export function TemplateDisabledSection(props: TemplateDisabledSectionProps) {
  const { t, reason, min, max } = props
  return (
    <div className={classes.section}>
      <h2 className={classes.title}>{t('title')}</h2>
      <p className={classes.intro}>{t('disabledTitle')}</p>
      <p className={classes.intro}>{reason !== '' ? reason : t('disabledFallback')}</p>
      {min !== '' && max !== '' && <p className={classes.intro}>{t('disabledWindow', { min, max })}</p>}
      <p className={classes.intro}>{t('disabledHint')}</p>
    </div>
  )
}
