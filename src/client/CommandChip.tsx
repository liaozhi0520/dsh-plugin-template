/**
 * 可复制命令片（command spill）：等宽 code 文本 + 复制按钮。
 *
 * 升级提示用它在弹窗（GlobalNotice）与配置页更新条（TemplateSection）里展示
 * 「插件包名@最新版本」安装 spec——用户复制后粘进「插件」页安装输入框
 * （或 `dsh plugin add` 命令行），与「卸载旧版 → 安装新版」的更新闭环配合。
 *
 * 复制走 navigator.clipboard；非安全上下文（localhost 之外）兜底
 * execCommand——与停用面板命令药丸（TemplateDisabledSection）的复制同款。
 * 「已复制」反馈短暂显示后自动回到复制态（2s）。
 */
import { useEffect, useRef, useState } from 'react'
import { Button } from './ui/Button'
import classes from './CommandChip.module.css'

/** 命令片的 props：文本与复制/已复制文案（全部来自 locale 词典）。 */
export interface CommandChipProps {
  /** 片内等宽文本（如安装 spec：`@scope/pkg@1.2.3`）。 */
  text: string
  /** 复制按钮文案。 */
  copyLabel: string
  /** 已复制反馈文案（短暂显示后回到复制态）。 */
  copiedLabel: string
}

/** 可复制命令片。 */
export function CommandChip(props: CommandChipProps) {
  const { text, copyLabel, copiedLabel } = props
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // 卸载时清掉未触发的反馈回退定时器（重挂频繁，避免悬挂计时器）。
  useEffect(() => () => clearTimeout(timerRef.current), [])

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const area = document.createElement('textarea')
      area.value = text
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      area.remove()
    }
    setCopied(true)
    timerRef.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <span className={classes.chip}>
      {/* user-select: all：手动点选 code 时整段选中，与按钮复制等效。 */}
      <code className={classes.code}>{text}</code>
      <Button variant="outline" size="sm" onClick={() => void copy()}>
        {copied ? copiedLabel : copyLabel}
      </Button>
    </span>
  )
}
