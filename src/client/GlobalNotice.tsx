/**
 * 全局更新提示（shell.overlay 槽位条目，NoticeModal · neutral）。
 * 职责单一：新版本提示——available 且未被本次会话关闭时弹出；「我知道了」仅
 * 置内存态关闭本次窗口——零持久化，下次启动 DSH（重新挂载）若仍未更新则重新
 * 弹出（浏览器刷新同样重弹，in-memory 语义）。
 *
 * 陈旧代码提醒是**另一条独立槽位条目**（StaleBanner.tsx，danger 观感 + 两次
 * 提醒语义），数据源相同（template/getUpdateState）但生命周期各自独立。
 * **stale 优先**：running ≠ BUILD_VERSION（重装未重启）时本条目让位——此刻
 * 用户已装新版、只差重启，「安装新版本」的更新文案是误导，danger 陈旧对话
 * 框先出；stale 消失（重启后版本一致）而 available 仍成立时，本条目正常弹出。
 * 让位是本组件自检（轮询数据里就有 currentVersion，与构建期 BUILD_VERSION
 * 比较），无需两组件互相耦合。
 *
 * 误报防线：currentVersion 为 null（旧 host 检查未成功 / 包损坏）不弹；轮询
 * 有界（2s × 10），不在后台无限重试。
 */
import { useEffect, useState } from 'react'
import { Button } from './ui/Button'
import { NoticeModal } from './ui/NoticeModal'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { OpResult, UpdateMachineState } from './api'
import { BUNDLE_KEY } from './bundle-key'
import { BUILD_VERSION } from './build-version'
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

  const runningVersion = snapshot?.currentVersion ?? null
  // stale 优先（用户裁定，恢复 v7 语义）：重装未重启时 running ≠ BUILD_VERSION，
  // 此刻「安装新版本」的更新文案是误导（用户已装，只差重启）→ 本条目让位，
  // 由 StaleBanner 的 danger 对话框接管。runningVersion 为 null（旧 host /
  // 包损坏）不算 stale、不让位（保守：available 提示照常）。
  const stale = runningVersion !== null && runningVersion !== BUILD_VERSION
  const updateOpen = snapshot !== null
    && snapshot.phase === 'available'
    && snapshot.latestVersion !== null
    && !dismissed
    && !stale

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
