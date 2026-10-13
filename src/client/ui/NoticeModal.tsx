/**
 * NoticeModal：插件自有薄包装层（**非复制件**）——内部使用 1:1 复制的 Modal
 * （ui/Modal.tsx），叠加语义 tone（danger/success 观感）。官方 Modal 无变体
 * prop，语义色经 `--dsw-alias-state-*` token 由本层的 className 钩子实现；
 * 变体样式只允许出现在本层（NoticeModal.module.css），勿改 Modal 复制件本体。
 */
import type { ComponentProps } from 'react'
import clsx from 'clsx'
import { Modal } from './Modal'
import css from './NoticeModal.module.css'

/** 语义观感：neutral = Modal 本体默认观感；danger/success = 标题语义色。 */
export type NoticeModalTone = 'neutral' | 'danger' | 'success'

/**
 * 组件属性 = 复制 Modal 的非 headless 面（closeLabel 必填）+ tone。
 * headless 模式对通知类弹窗无意义，故从面上省去。
 */
export type NoticeModalProps = Omit<ComponentProps<typeof Modal>, 'headless' | 'closeLabel' | 'className'> & {
  /** 可访问的关闭按钮文案（Modal 复制件契约：非 headless 必填）。 */
  closeLabel: string
  /** 语义观感（默认 neutral = 本体观感）。 */
  tone?: NoticeModalTone
  /** 追加到对话框卡片的类（与 tone 类合并）。 */
  className?: string | undefined
}

/** 通知类弹窗：Modal 复制件 + tone。 */
export function NoticeModal({ tone = 'neutral', className, ...rest }: NoticeModalProps) {
  return <Modal {...rest} className={tone === 'neutral' ? className : clsx(css[tone], className)} />
}
