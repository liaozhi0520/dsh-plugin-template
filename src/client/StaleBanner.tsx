/**
 * 陈旧代码提醒（shell.overlay 槽位条目，可关闭对话框 NoticeModal · danger）。
 *
 * 设计决策（用户裁定，随 NoticeModal 迁移修订）：不做不可挽回的全屏锁死——
 * 小插件无权锁死整个 DSH，一旦陈旧判定误报（或本组件自身有 bug），宿主须有
 * 挽回入口。改为**可关闭对话框**，共提醒两次：
 * - 第一次：版本不一致说明 + 「我知道了」——关闭后 5 秒重弹（确保用户注意到）；
 * - 第二次（升级文案）：「请立即重启 DeepSeek Harness，如果再继续使用此插件
 *   有可能会造成异常」+「当前我没有使用此插件，无需立即重启」——关闭后
 *   **不再提醒**（尊重用户判断，避免打扰循环）。
 * 重启 DeepSeek Harness 后模块重求值、版本一致，条件自然消失。无任何持久化
 * （重启即归零；浏览器刷新重置提醒次数）。
 *
 * 数据流：轮询 `template/getUpdateState`（2s × 10 有界，currentVersion
 * 缺席时继续等——兼容旧 host「检查成功才填」）；`currentVersion`（运行中模块
 * 自报版本，package-info.ts 求值期缓存）与构建期 `BUILD_VERSION` **严格不等**
 * （升级重装 / 降级重装都命中）→ 触发对话框。
 */
import { useEffect, useState } from 'react'
import { Button } from './ui/Button'
import { NoticeModal } from './ui/NoticeModal'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { OpResult, UpdateMachineState } from './api'
import { BUILD_VERSION } from './build-version'

/** 轮询间隔与上限（host 检查含一次 registry 往返，超时 15s；10 × 2s 覆盖之）。 */
const POLL_INTERVAL_MS = 2_000
const POLL_MAX_ATTEMPTS = 10

/** 第一次「我知道了」后的静默时长：5 秒后以第二次（升级）文案重弹。 */
const RESHOW_DELAY_MS = 5_000

/** 槽位 inject face：host 代理数据面（插件名走 locale 词典）。 */
export interface StaleBannerInjected {
  api: {
    getUpdateState: () => Promise<OpResult<UpdateMachineState>>
  }
}

export type StaleBannerProps = PropsRuntime<'shell.overlay'> & PropsLocale<'template.panel'> & StaleBannerInjected

/** 陈旧代码提醒条目（danger 观感；共提醒两次）。 */
export function StaleBanner(props: StaleBannerProps) {
  const { t, api } = props
  const [snapshot, setSnapshot] = useState<UpdateMachineState | null>(null)
  /** 已关闭次数：0 = 第一次展示中；1 = 第二次（升级文案）展示中；2 = 不再提醒。 */
  const [dismissals, setDismissals] = useState(0)
  /** 第一次关闭后的 5 秒静默窗口（到点以第二次文案重弹）。 */
  const [suppressed, setSuppressed] = useState(false)

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
        // currentVersion 缺席（旧 host 检查未成功 / 包损坏）继续等——陈旧判定靠它。
        if (!settled || result.value.currentVersion === null) {
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

  // 第一次关闭 → 静默 RESHOW_DELAY_MS 后以第二次（升级）文案重弹；单次定时器。
  useEffect(() => {
    if (!suppressed) return
    const timer = setTimeout(() => setSuppressed(false), RESHOW_DELAY_MS)
    return () => clearTimeout(timer)
  }, [suppressed])

  const runningVersion = snapshot?.currentVersion ?? null
  // 陈旧判定：严格不等（升级重装 / 降级重装都命中），null 不弹（误报防线）。
  const stale = runningVersion !== null && runningVersion !== BUILD_VERSION
  const second = dismissals >= 1
  if (!stale || suppressed || dismissals >= 2 || runningVersion === null) return null

  const onAck = (): void => {
    if (dismissals === 0) {
      // 第一次关闭：5 秒后以升级文案重弹第二次。
      setDismissals(1)
      setSuppressed(true)
      return
    }
    // 第二次关闭：用户已明确表态，不再提醒（本挂载周期内）。
    setDismissals(2)
  }

  return (
    <NoticeModal
      tone="danger"
      open
      onClose={onAck}
      title={t('staleBannerTitle', { name: t('title') })}
      closeLabel={second ? t('staleBannerAckFinal') : t('staleBannerAck')}
      description={second
        ? t('staleBannerTextFinal')
        : t('staleBannerText', { running: runningVersion, installed: BUILD_VERSION })}
      footer={
        <Button size="sm" onClick={onAck}>
          {second ? t('staleBannerAckFinal') : t('staleBannerAck')}
        </Button>
      }
    />
  )
}
