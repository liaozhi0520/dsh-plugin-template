/**
 * 演示面板组件（settings.section 条目）：纯渲染层。
 * 文案经 locale `t` seat，样式经 CSS Modules（./TemplateSection.module.css），
 * 数据/动作经 inject 面（demo.ping）——组件不碰 ctx。
 */
import { useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import classes from './TemplateSection.module.css'

/** 组件的 inject face：host 远程调用演示。 */
export interface TemplateSectionInjected {
  demo: {
    /** 调用 host 半的 template/ping 端点，返回应答文本与时间戳。 */
    ping: (text: string) => Promise<{ ok: true; pong: string; at: number }>
  }
}

export type TemplateSectionProps = PropsRuntime<'settings.section'> &
  PropsLocale<'template.demo'> &
  TemplateSectionInjected

/** Demo settings page：HMR 文案 + 一次 host 往返调用。 */
export function TemplateSection(props: TemplateSectionProps) {
  const { t, demo } = props
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string>('')

  const ping = async () => {
    setBusy(true)
    try {
      const { pong, at } = await demo.ping('ping')
      setResult(t('pingResult', { pong, at: new Date(at).toLocaleTimeString() }))
    } catch (error) {
      setResult(t('pingFailed', { message: error instanceof Error ? error.message : String(error) }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={classes.section}>
      <h2 className={classes.title}>{t('title')}</h2>
      <p className={classes.intro}>{t('intro')}</p>
      <div className={classes.row}>
        <button className={classes.button} disabled={busy} onClick={() => void ping()}>
          {busy ? t('pinging') : t('ping')}
        </button>
        {result && <span className={classes.result}>{result}</span>}
      </div>
    </div>
  )
}
