/**
 * 全局更新提示（shell.overlay 槽位条目，NoticeModal · neutral）。
 * 职责单一：新版本提示——available 且未被本次会话关闭时弹出；「我知道了」仅
 * 置内存态关闭本次窗口——零持久化，下次启动 DSH（重新挂载）若仍未更新则重新
 * 弹出（浏览器刷新同样重弹，in-memory 语义）。
 *
 * 【0.2.1 起】原「陈旧代码提醒」条目（StaleBanner.tsx，danger + 两次提醒）及
 * 其「stale 优先让位」逻辑已整体拆除：卸载 → 重装（不重启）由 harness 自己
 * 完成模块驱逐，不再出现「新 UI + 旧内核」（2026-10-19 真机复核确认，取证见
 * docs/harness-defect-workarounds.md 的历史防护回退块）。本组件因此不再读
 * 构建期基准，只按 available 相位弹窗。
 *
 * 误报防线：currentVersion 为 null（旧 host 检查未成功 / 包损坏）不影响本组件
 * （只用于正文回显）；轮询有界（2s × 10），不在后台无限重试。
 */
import { useEffect, useState } from 'react'
import { Button } from './ui/Button'
import { NoticeModal } from './ui/NoticeModal'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { OpResult, UpdateMachineState } from './api'
import { BUNDLE_KEY } from './bundle-key'
import { CommandChip } from './CommandChip'
import classes from './GlobalNotice.module.css'

/** 轮询间隔与上限（host 检查含一次 registry 往返，超时 15s；10 × 2s 覆盖之）。 */
const POLL_INTERVAL_MS = 2_000
const POLL_MAX_ATTEMPTS = 10

/** 槽位 inject face：host 代理数据面。 */
export interface GlobalNoticeInjected {
  api: {
    getUpdateState: () => Promise<OpResult<UpdateMachineState>>
  }
}

/** 组件的 props：shell.overlay 槽位面（t 由 locale seat 注入）+ host 代理数据面。 */
export type GlobalNoticeProps = PropsRuntime<'shell.overlay'> & PropsLocale<'template.panel'> & GlobalNoticeInjected

/** 全局更新提示条目。 */
export function GlobalNotice(props: GlobalNoticeProps) {
  const { t, api } = props
  const [snapshot, setSnapshot] = useState<UpdateMachineState | null>(null)
  /** 「我知道了」只关闭本次窗口（内存态；重挂/刷新即重置 → 下次启动重弹）。 */
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = (attempt: number): void => {
      if (attempt >= POLL_MAX_ATTEMPTS) return
      void api.getUpdateState().then((result) => {
        if (!alive) return
        if (!result.ok) {
          timer = setTimeout(() => poll(attempt + 1), POLL_INTERVAL_MS)
          return
        }
        setSnapshot(result.value)
        const settled = result.value.phase !== 'idle' && result.value.phase !== 'checking'
        if (!settled) {
          timer = setTimeout(() => poll(attempt + 1), POLL_INTERVAL_MS)
        }
      })
    }
    poll(0)
    return () => {
      alive = false
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [api])

  // 【0.2.1 起】不再有「stale 让位」判定：陈旧检测（StaleBanner + BUILD_VERSION）
  // 已随上游修复整体拆除，重装未重启不再出现「新 UI + 旧内核」，故本组件只按
  // available 相位弹窗（currentVersion 仅用于正文回显「当前/最新」）。
  const updateOpen = snapshot !== null
    && snapshot.phase === 'available'
    && snapshot.latestVersion !== null
    && !dismissed

  return (
    <NoticeModal
      open={updateOpen}
      onClose={() => setDismissed(true)}
      // 标题点名插件（正文与命令片各自成行、命令框内省略号截断）。
      title={t('updateModalTitle', { name: t('title') })}
      closeLabel={t('updateModalAck')}
      footer={
        <Button size="sm" onClick={() => setDismissed(true)}>{t('updateModalAck')}</Button>
      }
    >
      <div className={classes.modalBody}>
        <p className={classes.modalText}>
          {t('updateModalText', {
            latest: snapshot?.latestVersion ?? '',
            current: snapshot?.currentVersion ?? '',
          })}
        </p>
        {/* 安装 spec 命令片（插件包名@最新版本，可复制）：与「卸载旧版 → 安装
            新版」闭环配合，复制后粘进「插件」页安装输入框即可。 */}
        {snapshot !== null && snapshot.latestVersion !== null && (
          <CommandChip
            text={`${BUNDLE_KEY}@${snapshot.latestVersion}`}
            copyLabel={t('updateSpecCopy')}
            copiedLabel={t('updateSpecCopied')}
          />
        )}
      </div>
    </NoticeModal>
  )
}
