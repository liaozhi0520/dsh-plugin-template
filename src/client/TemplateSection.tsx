/**
 * 演示配置页组件（plugins.bundle.config 条目，挂「插件」页本组合包详情页）：
 * 纯渲染层 + 内联数据流。文案经 locale `t` seat，样式经 CSS Modules
 * （./TemplateSection.module.css，构建期物化自注入），数据/动作经 inject 面
 * （api）——组件不碰 ctx。
 * 布局：标题行（左：标题；右：插件更新条）→ 更新提示条（available 时：
 * 指引句 + 可复制安装 spec 命令片）→ 配置编辑卡（0.1.7 settings 模型示范面：
 * volatile 读取 + saveConfig 整段写回）→ ping 演示行。
 * 插件版本提示：**host 半状态机是唯一权威源**（见 src/update-state.ts），组件
 * 不持有更新结论——挂载起有界轮询 getUpdateState 投影快照，手动检查只是
 * 触发器（host 同步落相位后返回快照，结论仍走轮询）。浏览器刷新、重挂、
 * 多标签页都天然收敛到同一份状态。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { OpResult, PingValue, UpdateMachineState } from './api'
import type { TemplateConfigValue } from '../shared/contract'
import { BUNDLE_KEY } from './bundle-key'
import { Button } from './ui/Button'
import { CommandChip } from './CommandChip'
import classes from './TemplateSection.module.css'

/** 组件的 inject face：host 数据面（ping 演示 + 配置读写 + 插件版本提示）。 */
export interface TemplateSectionInjected {
  api: {
    /** 调用 host 半的 template/ping 端点，返回应答文本与时间戳。 */
    ping: (text: string) => Promise<OpResult<PingValue>>
    /** 读 host 端当前配置。 */
    getConfig: () => Promise<OpResult<TemplateConfigValue>>
    /** 整段保存配置（host 半校验后走 ctx.settings.replace）。 */
    saveConfig: (value: TemplateConfigValue) => Promise<OpResult<null>>
    /** 读 host 更新状态机快照（轮询用）。 */
    getUpdateState: () => Promise<OpResult<UpdateMachineState>>
    /** 触发检查更新（host 同步落 checking 后返回触发后快照）。 */
    checkUpdate: () => Promise<OpResult<UpdateMachineState>>
  }
}

export type TemplateSectionProps = PropsRuntime<'plugins.bundle.config'> &
  PropsLocale<'template.panel'> &
  TemplateSectionInjected

/** 面板打开期间轮询 host 更新状态机的间隔与上限（host 检查含一次 registry
 * 往返，超时 15s；10 × 2s 覆盖之；settled 即停，不无限轮询）。 */
const UPDATE_POLL_INTERVAL_MS = 2_000
const UPDATE_POLL_MAX_ATTEMPTS = 10

/** 更新状态机的本地初值（首轮快照回来前的空白态；权威永远在 host）。 */
const INITIAL_UPDATE_STATE: UpdateMachineState = {
  phase: 'idle',
  currentVersion: null,
  latestVersion: null,
  errorMessage: null,
}

/** Demo 配置页：问候语编辑（settings 写回示范）+ 插件更新条 + ping 往返。 */
export function TemplateSection(props: TemplateSectionProps) {
  const { t, api } = props

  // --- 插件版本提示（host 状态机为唯一权威源，本组件只是轮询投影 + 触发器） ---
  const [update, setUpdate] = useState<UpdateMachineState>(INITIAL_UPDATE_STATE)
  /** 卸载守卫：轮询/触发的异步回填在卸载后丢弃。 */
  const aliveRef = useRef(true)
  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  /** 拉一次快照落地；失败静默保持现状（含旧版 host 无端点的自举窗口）。 */
  const pollUpdateState = useCallback(async (): Promise<void> => {
    const result = await api.getUpdateState()
    if (aliveRef.current && result.ok) setUpdate(result.value)
  }, [api])

  // 挂载即取首轮快照，其后有界轮询（settled 提前停）；手动检查随时可再触发。
  useEffect(() => {
    let attempt = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = (): void => {
      attempt += 1
      void pollUpdateState().then(() => {
        if (!aliveRef.current || attempt >= UPDATE_POLL_MAX_ATTEMPTS) return
        const settled = update.phase !== 'idle' && update.phase !== 'checking'
        // settled 判定读闭包外的 state 不精确，这里简化为轮满 10 次或组件卸载；
        // settled 后快照不变，多轮空轮询无副作用。
        if (!settled) timer = setTimeout(tick, UPDATE_POLL_INTERVAL_MS)
      })
    }
    tick()
    return () => {
      if (timer !== undefined) clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollUpdateState])

  /** 手动「检查更新」：触发 host（同步落 checking），用回带快照即时反馈。 */
  const checkUpdate = useCallback((): void => {
    void api.checkUpdate().then((result) => {
      if (aliveRef.current && result.ok) setUpdate(result.value)
    })
  }, [api])

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
      <div className={classes.headerRow}>
        <h2 className={classes.title}>{t('panelTitle')}</h2>
        {/* 插件更新条（右对齐）：版本徽标 + 状态词 + 动作按钮，保持一行紧凑。 */}
        <div className={classes.updateBar}>
          {update.currentVersion !== null && (
            <span className={classes.updateVersion}>{t('updateVersion', { version: update.currentVersion })}</span>
          )}
          {update.phase === 'idle' && (
            <button type="button" className={classes.button} onClick={checkUpdate}>{t('updateCheck')}</button>
          )}
          {update.phase === 'checking' && <span className={classes.updateStatus}>{t('updateChecking')}</span>}
          {update.phase === 'up-to-date' && (
            <span className={`${classes.updateStatus} ${classes.updateStatusOk}`}>{t('updateUpToDate')}</span>
          )}
          {update.phase === 'available' && (
            <span className={`${classes.updateStatus} ${classes.updateStatusOk}`}>
              {t('updateAvailable', { version: update.latestVersion ?? '' })}
            </span>
          )}
          {update.errorMessage !== null && (
            <span className={`${classes.updateStatus} ${classes.updateStatusError}`} title={update.errorMessage}>
              {t('updateCheckFailed')}
            </span>
          )}
        </div>
      </div>
      {/* 更新提示条（available 独占一行）：指引句 + 安装 spec 命令片。
          长错误文案走详情行，不挤占这里。 */}
      {update.phase === 'available' && update.latestVersion !== null && (
        <div className={classes.updateNotice}>
          <p className={classes.updateNoticeText}>{t('updateAvailableHint')}</p>
          <CommandChip
            text={`${BUNDLE_KEY}@${update.latestVersion}`}
            copyLabel={t('updateSpecCopy')}
            copiedLabel={t('updateSpecCopied')}
          />
        </div>
      )}
      {update.errorMessage !== null && (
        <div className={`${classes.updateDetail} ${classes.updateDetailError}`}>{update.errorMessage}</div>
      )}
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
              {savedFlash && <span className={classes.updateStatusOk}>{t('configSaved')}</span>}
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
