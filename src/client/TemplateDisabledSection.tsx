/**
 * 版本不兼容时的设置面板（settings.section 条目）：host 半版本门禁软禁用后，
 * 业务能力全部不可用，本面板代替正常面板向用户说明原因与处置（装回受支持
 * 版本的 harness，或等待兼容版本）。原因文本与推荐安装版本由 host 半经
 * index 注入的全局标记带来（../shared/disabled-flag.ts），经 inject props
 * 传入，不在浏览器侧重复版本判断。
 */
import { useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import classes from './TemplateSection.module.css'

/** 组件的 inject face：host 半给出的停用原因、支持版本窗口与推荐安装版本。 */
export interface TemplateDisabledSectionInjected {
  reason: string
  min: string
  max: string
  /** 推荐安装目标版本（host 半给定，固定为支持上限 MAX）。 */
  installVersion: string
}

export type TemplateDisabledSectionProps = PropsRuntime<'settings.section'> &
  PropsLocale<'template.demo'> &
  TemplateDisabledSectionInjected

/** 复制成功反馈的显示时长（ms）。 */
const COPIED_FEEDBACK_MS = 2000

/** 版本不兼容说明页（含安装命令与复制按钮）。 */
export function TemplateDisabledSection(props: TemplateDisabledSectionProps) {
  const { t, reason, min, max, installVersion } = props
  const [copied, setCopied] = useState(false)
  const installCommand = `npm install -g @deepseek-ai/dsh@${installVersion}`

  const copyCommand = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(installCommand)
      setCopied(true)
      setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS)
    } catch (error) {
      console.warn('[dsh-plugin-template] copy install command failed:', error)
    }
  }

  return (
    <div className={classes.section}>
      <h2 className={classes.title}>{t('title')}</h2>
      <p className={classes.intro}>{t('disabledTitle')}</p>
      <p className={classes.intro}>{reason !== '' ? reason : t('disabledFallback')}</p>
      {min !== '' && max !== '' && <p className={classes.intro}>{t('disabledWindow', { min, max })}</p>}
      {installVersion !== '' && (
        <p className={classes.intro}>
          {t('disabledInstallLabel')}
          <span className={classes.row}>
            <code className={classes.command}>{installCommand}</code>
            <button type="button" className={classes.button} onClick={() => void copyCommand()}>
              {copied ? t('disabledCopied') : t('disabledCopy')}
            </button>
          </span>
        </p>
      )}
      <p className={classes.intro}>{t('disabledHint')}</p>
    </div>
  )
}
