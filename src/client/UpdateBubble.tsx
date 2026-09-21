/**
 * 更新通知气泡（shell.overlay 槽位条目）。
 *
 * 数据流：host 半的更新状态机是唯一权威源（src/update-state.ts；apply 时已
 * 启动一次静默检查）。本组件挂载后轮询 `template/getUpdateState` 取快照：
 * idle/checking（检查含一次 npm registry 往返，最长 15s）→ 2s × 10 次覆盖
 * 轮询；available 且该 latest 版本未被「知道了」确认 → 弹出气泡；
 * up-to-date / updated（已装待重启，重启提示由设置面板 overlay 承担）→
 * 闭嘴；RPC 失败或轮询耗尽 → 静默放弃，不打扰用户。
 *
 * client 半会被 client-hmr 热更重挂（自更新安装会改写 client bundle）：
 * 重挂后重新轮询拿到的仍是 host 权威相位，故安装完成后气泡不会拿着过期
 * 结论再次弹出。
 *
 * 确认状态存浏览器 localStorage（键 {@link ACK_STORAGE_KEY}，值为已确认的
 * latest 版本号）：未确认 → 每次打开 DSH 都会弹出；确认 → 该版本不再弹；
 * 出现更新的新版本（latest 变化）→ 再次弹出。读写均 try/catch 兜底隐私模式。
 *
 * 多插件同屏堆叠：气泡根元素带 data-dsh-update-bubble 标记，可见后触发
 * 全量重排（restackAll：首个贴顶，后续按 96px 依次向下），避免相互遮挡。
 * 派生插件（qw-tool / meme-gen / post-gen / comfyui-based-tools /
 * send-to-feishu）的同名组件均以本文件为母版（改 ACK 键与 locale 命名空间）。
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { OpResult, UpdateMachineState } from './api'
import classes from './UpdateBubble.module.css'

/** 「知道了」确认状态的 localStorage 键（值 = 已确认的 latest 版本号）。 */
export const ACK_STORAGE_KEY = 'dsh-update-ack:dsh-plugin-template'

/** 轮询间隔与上限（host 检查含一次 registry 往返，超时 15s；10 × 2s 覆盖之）。 */
const POLL_INTERVAL_MS = 2_000
const POLL_MAX_ATTEMPTS = 10

/** 气泡堆叠：顶部基准与每个既有气泡的垂直步进（内联 top 直接覆写，见 restackAll）。 */
const STACK_TOP_PX = 16
const STACK_STEP_PX = 96

/**
 * 把当前 DOM 里全部更新气泡按文档顺序统一重排（top = 基准 + 序号 × 步进）。
 * 每个气泡变为可见后都调用一次：最后执行的那个看到的集合就是完整的，
 * 天然消除"先挂载者看不到后挂载者"的次序竞争，也不依赖 CSS 变量回写。
 */
function restackAll(): void {
  const all = document.querySelectorAll<HTMLElement>('[data-dsh-update-bubble]')
  all.forEach((el, index) => {
    el.style.top = `${String(STACK_TOP_PX + index * STACK_STEP_PX)}px`
  })
}

/** 组件的 inject face：host 代理的数据面（插件名走 locale 词典，不硬编码）。 */
export interface UpdateBubbleInjected {
  api: {
    getUpdateState: () => Promise<OpResult<UpdateMachineState>>
  }
}

export type UpdateBubbleProps = PropsRuntime<'shell.overlay'> & PropsLocale<'template.demo'> & UpdateBubbleInjected

/** 读已确认的版本号（localStorage 不可用时视为从未确认）。 */
function readAck(): string | null {
  try {
    return localStorage.getItem(ACK_STORAGE_KEY)
  } catch {
    return null
  }
}

/** 更新通知气泡。 */
export function UpdateBubble(props: UpdateBubbleProps) {
  const { t, api } = props
  const [snapshot, setSnapshot] = useState<UpdateMachineState | null>(null)
  const [acked, setAcked] = useState<string | null>(readAck)
  const bubbleRef = useRef<HTMLDivElement | null>(null)

  // 轮询 host 状态机：idle/checking/RPC 失败 → 定时重试（封顶）；其余相位
  // 为终态——available 留下结论，up-to-date/updated 直接闭嘴。
  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = (attempt: number): void => {
      if (attempt >= POLL_MAX_ATTEMPTS) return
      void api.getUpdateState().then((result) => {
        if (!alive) return
        if (!result.ok || result.value.phase === 'idle' || result.value.phase === 'checking') {
          timer = setTimeout(() => poll(attempt + 1), POLL_INTERVAL_MS)
          return
        }
        setSnapshot(result.value)
      })
    }
    poll(0)
    return () => {
      alive = false
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [api])

  const visible = snapshot !== null
    && snapshot.phase === 'available'
    && snapshot.latestVersion !== null
    && acked !== snapshot.latestVersion

  // 同屏多插件堆叠：本气泡可见后触发一次全量重排（含自身与其余气泡）。
  useLayoutEffect(() => {
    if (!visible) return
    restackAll()
  }, [visible])

  if (!visible || snapshot === null || snapshot.latestVersion === null) return null

  const onAck = (): void => {
    try {
      localStorage.setItem(ACK_STORAGE_KEY, snapshot.latestVersion!)
    } catch {
      // 隐私模式等存储失败：忽略，本次会话内也不再弹（state 已置）。
    }
    setAcked(snapshot.latestVersion)
  }

  return (
    <div ref={bubbleRef} className={classes.bubble} data-dsh-update-bubble role="status">
      <p className={classes.text}>
        {t('updateBubbleTextHead')}{' '}
        <strong className={classes.pluginName}>{t('title')}</strong>{' '}
        {t('updateBubbleTextTail', { latest: snapshot.latestVersion, current: snapshot.currentVersion ?? '' })}
      </p>
      <span className={classes.actions}>
        <Button size="sm" onClick={onAck}>{t('updateBubbleAck')}</Button>
      </span>
    </div>
  )
}
