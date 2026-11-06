/**
 * 演示配置页组件（plugins.bundle.config 条目，挂「插件」页本组合包详情页）：
 * 纯渲染层 + 内联数据流。文案经 locale `t` seat，样式经 CSS Modules
 * （./TemplateSection.module.css，构建期物化自注入），数据/动作经 inject 面
 * （api）——组件不碰 ctx。
 * 布局：标题 → intro → 配置编辑卡（0.1.7 settings 模型示范面：volatile
 * 读取 + saveConfig 整段写回）→ ping 演示行。
 *
 * 【0.2.2 起】方案 A 删除了标题右侧的插件更新条、available 提示条与有界
 * 轮询：插件不再查 registry、不再有任何更新提醒，版本检查/更新由官方插件页
 * 接管。见 docs/compat-plan-0.2.2-rc.1.md。
 */
import { useCallback, useEffect, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { OpResult, PingValue } from './api'
import type { TemplateConfigValue } from '../shared/contract'
import { Button } from './ui/Button'
import classes from './TemplateSection.module.css'

/** 组件的 inject face：host 数据面（ping 演示 + 配置读写）。 */
export interface TemplateSectionInjected {
  api: {
    /** 调用 host 半的 template/ping 端点，返回应答文本与时间戳。 */
    ping: (text: string) => Promise<OpResult<PingValue>>
    /** 读 host 端当前配置。 */
    getConfig: () => Promise<OpResult<TemplateConfigValue>>
    /** 整段保存配置（host 半校验后走 ctx.settings.replace）。 */
    saveConfig: (value: TemplateConfigValue) => Promise<OpResult<null>>
  }
}

export type TemplateSectionProps = PropsRuntime<'plugins.bundle.config'> &
  PropsLocale<'template.panel'> &
  TemplateSectionInjected

/** Demo 配置页：问候语编辑（settings 写回示范）+ ping 往返。 */
export function TemplateSection(props: TemplateSectionProps) {
  const { t, api } = props

  // --- 配置编辑（0.1.7 settings 模型示范面） ---
  const [config, setConfig] = useState<TemplateConfigValue | null>(null)
  const [configError, setConfigError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)

  // 挂载拉一次配置（volatile 引用即时读，打开面板即最新；不做轮询——
  // 配置只由本面板与默认值写入，无外部变更源）。
  useEffect(() => {
    let cancelled = false
    void api.getConfig().then((result) => {
      if (cancelled) return
      if (result.ok) setConfig(result.value)
      else setConfigError(t('configLoadFailed', { message: result.detail ?? 'rpc failed' }))
    })
    return () => {
      cancelled = true
    }
  }, [api, t])

  const saveConfig = useCallback(async (): Promise<void> => {
    if (config === null) return
    setSaving(true)
    setSavedFlash(false)
    setConfigError(null)
    try {
      const result = await api.saveConfig(config)
      if (!result.ok) {
        setConfigError(t('configSaveFailed', { message: result.detail ?? 'rpc failed' }))
        return
      }
      setSavedFlash(true)
    } finally {
      setSaving(false)
    }
  }, [api, config, t])

  // --- ping 演示 ---
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string>('')
  const ping = async (): Promise<void> => {
    setBusy(true)
    try {
      const r = await api.ping('ping')
      if (r.ok) {
        setResult(t('pingResult', { pong: r.value.pong, at: new Date(r.value.at).toLocaleTimeString() }))
      } else {
        setResult(t('pingFailed', { message: r.detail ?? 'rpc failed' }))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={classes.section}>
      <h2 className={classes.title}>{t('panelTitle')}</h2>
      <p className={classes.intro}>{t('intro')}</p>
      {/* 配置编辑卡：volatile 读取即时回显，保存走 saveConfig → ctx.settings.replace
          整段写回（0.1.7 settings 模型示范面）。 */}
      <div className={classes.configCard}>
        <p className={classes.configTitle}>{t('configTitle')}</p>
        {config === null ? (
          <p className={classes.intro}>{configError ?? ''}</p>
        ) : (
          <div className={classes.form}>
            <label className={classes.formLabel}>
              {t('greetingLabel')}
              <input
                className={classes.input}
                value={config.greeting}
                onChange={(event) => setConfig({ ...config, greeting: event.target.value })}
              />
            </label>
            <label className={classes.formLabel}>
              {t('punctuationLabel')}
              <input
                className={classes.input}
                value={config.punctuation}
                onChange={(event) => setConfig({ ...config, punctuation: event.target.value })}
              />
            </label>
            <div className={classes.configActions}>
              <Button size="sm" disabled={saving} onClick={() => void saveConfig()}>
                {saving ? t('configSaving') : t('configSave')}
              </Button>
              {savedFlash && <span className={classes.savedOk}>{t('configSaved')}</span>}
              {configError !== null && <span className={classes.formError}>{configError}</span>}
            </div>
          </div>
        )}
      </div>
      <div className={classes.row}>
        <Button size="sm" disabled={busy} onClick={() => void ping()}>
          {busy ? t('pinging') : t('ping')}
        </Button>
        {result && <span className={classes.result}>{result}</span>}
      </div>
    </div>
  )
}
