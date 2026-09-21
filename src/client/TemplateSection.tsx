/**
 * 演示面板组件（settings.section 条目）：纯渲染层 + 内联数据流（本插件无独立
 * hook，更新逻辑内联在本组件里）。
 * 文案经 locale `t` seat，样式经 CSS Modules（./TemplateSection.module.css），
 * 数据/动作经 inject 面（api）——组件不碰 ctx。
 * 布局：标题行（左：标题；右：插件更新条——版本徽标 + 状态词 + 动作按钮，
 * 错误长文案走标题行下详情行）+ intro + ping 演示行。
 * 插件自更新：**host 半状态机是唯一权威源**（见 src/update-state.ts），组件
 * 不持有更新结论——挂载起 2s 轮询 getUpdateState 投影快照，手动检查/更新只是
 * 触发器（host 同步落相位后返回快照，结论仍走轮询）。由此 client 半 HMR 热更
 * （自更新安装会改写 client bundle 触发重挂）、浏览器刷新、多标签页都天然
 * 收敛到同一份状态。updated（已装待重启）相位整段替换为重启 overlay。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { OpResult, UpdateMachineState } from './api'
import classes from './TemplateSection.module.css'

/** 组件的 inject face：host 数据面（ping 演示 + 插件自更新）。 */
export interface TemplateSectionInjected {
  api: {
    /** 调用 host 半的 template/ping 端点，返回应答文本与时间戳。 */
    ping: (text: string) => Promise<OpResult<{ pong: string; at: number }>>
    /** 读 host 更新状态机快照（轮询用）。 */
    getUpdateState: () => Promise<OpResult<UpdateMachineState>>
    /** 触发检查更新（host 同步落 checking 后返回触发后快照）。 */
    checkUpdate: () => Promise<OpResult<UpdateMachineState>>
    /** 触发立即更新（host 同步落 updating 后 fire-and-forget 安装）。 */
    updateSelf: () => Promise<OpResult<UpdateMachineState>>
  }
}

export type TemplateSectionProps = PropsRuntime<'settings.section'> &
  PropsLocale<'template.demo'> &
  TemplateSectionInjected

/** 面板打开期间轮询 host 更新状态机的间隔。 */
const UPDATE_POLL_INTERVAL_MS = 2_000

/** 更新状态机的本地初值（首轮快照回来前的空白态；权威永远在 host）。 */
const INITIAL_UPDATE_STATE: UpdateMachineState = {
  phase: 'idle',
  currentVersion: null,
  latestVersion: null,
  updatedTo: null,
  restartRequired: false,
  errorSource: null,
  errorMessage: null,
}

/** Demo settings page：HMR 文案 + 插件更新条 + 一次 host 往返调用。 */
export function TemplateSection(props: TemplateSectionProps) {
  const { t, api } = props
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string>('')

  // --- 插件自更新（host 状态机为唯一权威源，本组件只是轮询投影 + 触发器） ---
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

  // 挂载即取首轮快照（HMR 重挂 / 浏览器刷新后的 UI 态由它重建），其后 2s 轮询。
  useEffect(() => {
    void pollUpdateState()
    const timer = setInterval(() => void pollUpdateState(), UPDATE_POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [pollUpdateState])

  /** 手动「检查更新」：触发 host（同步落 checking），用回带快照即时反馈。 */
  const checkUpdate = useCallback((): void => {
    void api.checkUpdate().then((result) => {
      if (aliveRef.current && result.ok) setUpdate(result.value)
    })
  }, [api])

  /** 「立即更新」：触发 host（同步落 updating，安装 fire-and-forget 跑完）。 */
  const applyUpdate = useCallback((): void => {
    void api.updateSelf().then((result) => {
      if (aliveRef.current && result.ok) setUpdate(result.value)
    })
  }, [api])

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

  // 安装完成待重启：整段替换为重启 overlay，更新条/ping 演示等一律不渲染
  // （状态机的 updated 相位是 host 权威结论，见 src/update-state.ts）。
  if (update.phase === 'updated' && update.restartRequired) {
    return (
      <div className={classes.section}>
        <div className={classes.headerRow}>
          <h2 className={classes.title}>{t('title')}</h2>
        </div>
        <div className={classes.restartOverlay}>
          <p className={classes.restartOverlayTitle}>
            {t('updateOverlayTitle', { version: update.updatedTo ?? '' })}
          </p>
          <p className={classes.restartOverlayText}>{t('updateOverlayHint')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={classes.section}>
      <div className={classes.headerRow}>
        <h2 className={classes.title}>{t('title')}</h2>
        {/* 插件更新条（右对齐）：版本徽标 + 状态词 + 动作按钮，保持一行紧凑。
            检查/更新的长文案（错误输出）不挤在这里，走下方详情行。 */}
        <div className={classes.updateBar}>
          {update.currentVersion !== null && (
            <span className={classes.updateVersion}>{t('updateVersion', { version: update.currentVersion })}</span>
          )}
          {update.phase === 'idle' && (
            <button type="button" className={classes.updateButton} onClick={checkUpdate}>{t('updateCheck')}</button>
          )}
          {update.phase === 'checking' && <span className={classes.updateStatus}>{t('updateChecking')}</span>}
          {update.phase === 'up-to-date' && (
            <span className={`${classes.updateStatus} ${classes.updateStatusOk}`}>{t('updateUpToDate')}</span>
          )}
          {update.phase === 'available' && (
            <>
              <span className={`${classes.updateStatus} ${classes.updateStatusOk}`}>
                {t('updateAvailable', { version: update.latestVersion ?? '' })}
              </span>
              <button type="button" className={classes.updateButton} onClick={applyUpdate}>{t('updateApply')}</button>
            </>
          )}
          {update.phase === 'updating' && <span className={classes.updateStatus}>{t('updateApplying')}</span>}
          {update.errorMessage !== null && (
            <span className={`${classes.updateStatus} ${classes.updateStatusError}`} title={update.errorMessage}>
              {update.errorSource === 'update' ? t('updateFailed') : t('updateCheckFailed')}
            </span>
          )}
        </div>
      </div>
      {/* 更新详情行：完整错误输出（pre-wrap + 超长滚动 + 可选中复制）；
          只在有错误时渲染，不挤占标题行。 */}
      {update.errorMessage !== null && (
        <div className={`${classes.updateDetail} ${classes.updateDetailError}`}>
          {update.errorMessage}
        </div>
      )}
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
