/**
 * 演示面板组件（settings.section 条目）：纯渲染层。
 * 文案经 locale `t` seat，样式经 CSS Modules（./TemplateSection.module.css），
 * 数据/动作经 inject 面（api）——组件不碰 ctx。
 * 布局：标题行（左：标题；右：插件更新条——版本徽标 + 状态词 + 动作按钮，
 * 检查/更新的长文案走标题行下详情行）+ intro + ping 演示行。
 * 自更新状态机与 dsh-meme-gen 的 MemeSection 更新段同构。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { OpResult, TemplateUpdateApply, TemplateUpdateCheck } from './api'
import type { TemplateDemoKey } from './locales'
import classes from './TemplateSection.module.css'

/** 组件的 inject face：host 数据面（ping 演示 + 插件自更新）。 */
export interface TemplateSectionInjected {
  api: {
    /** 调用 host 半的 template/ping 端点，返回应答文本与时间戳。 */
    ping: (text: string) => Promise<OpResult<{ pong: string; at: number }>>
    /** 检查插件更新（host 半查 npm registry latest 并与运行版本比较）。 */
    checkUpdate: () => Promise<OpResult<TemplateUpdateCheck>>
    /** 立即更新（host 半走官方 dsh plugin add 通道；需重启 harness 生效）。 */
    updateSelf: () => Promise<OpResult<TemplateUpdateApply>>
  }
}

export type TemplateSectionProps = PropsRuntime<'settings.section'> &
  PropsLocale<'template.demo'> &
  TemplateSectionInjected

// --- 插件自更新的状态机（与 dsh-meme-gen 的 MemeSection 更新段同构） ---

/** 插件自更新的状态机阶段。 */
type UpdatePhase =
  | 'idle' // 尚未检查（或检查失败，可重试）
  | 'checking' // 检查中
  | 'up-to-date' // 已是最新
  | 'available' // 有新版本，可点「立即更新」
  | 'updating' // 官方通道安装进行中
  | 'updated' // 安装完成，等待重启

/** 更新区块的状态（渲染在标题行右侧更新条 + 标题行下详情行）。 */
interface UpdateState {
  phase: UpdatePhase
  /** 当前运行副本的插件版本（check 成功后填充；null = 尚未拿到）。 */
  currentVersion: string | null
  /** registry 上的最新版本。 */
  latestVersion: string | null
  /** 「已更新到 X」里展示的磁盘版本（apply 成功后填充）。 */
  updatedTo: string | null
  /** 失败反馈：文案键 + 错误详情（自动检查失败两者皆空，不打扰用户）。 */
  errorKey: TemplateDemoKey | null
  errorMessage: string
}

/** Demo settings page：HMR 文案 + 插件更新条 + 一次 host 往返调用。 */
export function TemplateSection(props: TemplateSectionProps) {
  const { t, api } = props
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string>('')

  // --- 插件自更新 --------------------------------------------------------
  const [update, setUpdate] = useState<UpdateState>({
    phase: 'idle',
    currentVersion: null,
    latestVersion: null,
    updatedTo: null,
    errorKey: null,
    errorMessage: '',
  })
  /** 检查/安装互斥锁：进行中忽略重复触发（host 半的 applySelfUpdate 自身还会合并）。 */
  const updateBusyRef = useRef(false)
  /** 卸载守卫：更新检查/安装的异步回填在卸载后丢弃。 */
  const aliveRef = useRef(true)
  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  /**
   * 检查更新。silent = 自动检查（失败静默，不打扰）；手动检查失败在详情行
   * 内联报错。
   */
  const runUpdateCheck = useCallback(async (silent: boolean): Promise<void> => {
    if (updateBusyRef.current) return
    updateBusyRef.current = true
    try {
      setUpdate((prev) => ({ ...prev, phase: 'checking', errorKey: null, errorMessage: '' }))
      const result = await api.checkUpdate()
      if (!aliveRef.current) return
      if (result.ok) {
        const { currentVersion, latestVersion, updateAvailable } = result.value
        setUpdate({
          phase: updateAvailable ? 'available' : 'up-to-date',
          currentVersion,
          latestVersion,
          updatedTo: null,
          errorKey: null,
          errorMessage: '',
        })
        return
      }
      setUpdate((prev) => ({
        ...prev,
        phase: 'idle',
        errorKey: silent ? null : 'updateCheckFailed',
        errorMessage: silent ? '' : result.detail ?? '',
      }))
    } finally {
      updateBusyRef.current = false
    }
  }, [api])

  /** 立即更新：host 半走官方 dsh plugin add 通道安装最新版；成功后等待重启。 */
  const runApplyUpdate = useCallback(async (): Promise<void> => {
    if (updateBusyRef.current) return
    updateBusyRef.current = true
    try {
      setUpdate((prev) => ({ ...prev, phase: 'updating', errorKey: null, errorMessage: '' }))
      const result = await api.updateSelf()
      if (!aliveRef.current) return
      if (result.ok) {
        const { updatedTo, changed } = result.value
        setUpdate((prev) => ({
          ...prev,
          // 竞态兜底：点更新时 latest 已回到 <= 当前 → 归位「已是最新」。
          phase: changed ? 'updated' : 'up-to-date',
          currentVersion: changed ? prev.currentVersion : updatedTo,
          latestVersion: changed ? prev.latestVersion : updatedTo,
          updatedTo: changed ? updatedTo : null,
          errorKey: null,
          errorMessage: '',
        }))
        return
      }
      setUpdate((prev) => ({
        ...prev,
        phase: prev.latestVersion !== null ? 'available' : 'idle',
        errorKey: 'updateFailed',
        errorMessage: result.detail ?? '',
      }))
    } finally {
      updateBusyRef.current = false
    }
  }, [api])

  /** 手动检查（按钮入口；失败在详情行内联报错）。 */
  const checkUpdate = useCallback((): void => {
    void runUpdateCheck(false)
  }, [runUpdateCheck])

  /** 立即更新（按钮入口）。 */
  const applyUpdate = useCallback((): void => {
    void runApplyUpdate()
  }, [runApplyUpdate])

  // mount 静默检查一次（离线/registry 不可达不打扰用户，手动可重试）。
  useEffect(() => {
    void runUpdateCheck(true)
  }, [runUpdateCheck])

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
        <h2 className={classes.title}>{t('title')}</h2>
        {/* 插件更新条（右对齐）：版本徽标 + 状态词 + 动作按钮，保持一行紧凑。
            检查/更新的长文案（错误输出、重启提示）不挤在这里，走下方详情行。 */}
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
          {update.phase === 'updated' && (
            <span className={`${classes.updateStatus} ${classes.updateStatusOk}`}>
              {t('updateDoneShort', { version: update.updatedTo ?? '' })}
            </span>
          )}
          {update.errorKey !== null && (
            <span
              className={`${classes.updateStatus} ${classes.updateStatusError}`}
              title={update.errorMessage}
            >
              {t(update.errorKey)}
            </span>
          )}
        </div>
      </div>
      {/* 更新详情行：完整错误输出（pre-wrap + 超长滚动 + 可选中复制）/ 更新成功
          的重启提示；只在有长文案时渲染，不挤占标题行。 */}
      {(update.errorKey !== null || update.phase === 'updated') && (
        <div
          className={`${classes.updateDetail} ${update.errorKey !== null ? classes.updateDetailError : classes.updateDetailOk}`}
        >
          {update.errorKey !== null ? update.errorMessage : t('updateDoneHint')}
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
