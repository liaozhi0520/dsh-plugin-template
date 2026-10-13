/**
 * 插件内联图标：复制自 harness ui-primitives（c:/deepseek-harness/packages/client/ui-primitives/src/icons/index.tsx，
 * @ dsh-v0.2.0-rc.2）。仅收录本插件用到的 4 个 Regular 描边图标；
 * strokeWidth 固定 1（上游 ICON_REGULAR_STROKE），color 走 currentColor。
 * 上游演进追新时按文件名+图标名复核。官方规则：颜色只经 currentColor/token。
 */

/** Shared props for every product icon component. */
export interface IconProps {
  /** Square edge in px; defaults to the glyph's own drawn size. */
  size?: number | undefined
  /** Extra class for layout placement; color rides currentColor. */
  className?: string | undefined
}

/** IconCloseOutlineRegular（上游 artwork 默认 16，regular 1px）。 */
export const IconCloseOutlineRegular = ({ size = 16, className }: IconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" strokeWidth={1}>
    <path d="M2.5 2.5L13.5 13.5" stroke="currentColor" />
    <path d="M13.5 2.5L2.5 13.5" stroke="currentColor" />
  </svg>
)

/** IconChevronDownOutlineRegular（上游 artwork 默认 14，regular 1px）。 */
export const IconChevronDownOutlineRegular = ({ size = 14, className }: IconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" strokeWidth={1}>
    <path d="M4 6L7.29289 9.29289C7.68342 9.68342 8.31658 9.68342 8.70711 9.29289L12 6" stroke="currentColor" />
  </svg>
)

/** IconCheckOutlineRegular（上游 artwork 默认 16，regular 1px）。 */
export const IconCheckOutlineRegular = ({ size = 16, className }: IconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" strokeWidth={1}>
    <path d="M2.25 8.5L5.49732 11.7473C5.90519 12.1552 6.57263 12.1344 6.95426 11.7018L13.75 4" stroke="currentColor" />
  </svg>
)

/** IconDownloadOutlineRegular（上游 artwork 默认 16，regular 1px）。 */
export const IconDownloadOutlineRegular = ({ size = 16, className }: IconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" strokeWidth={1}>
    <path d="M8 1.95317V10.0469" stroke="currentColor" />
    <path d="M4.25 6.29688L8 10.0469L11.75 6.29688" stroke="currentColor" />
    <path d="M1.5 10.0469V13.158C1.5 13.3937 1.60536 13.6198 1.79289 13.7865C1.98043 13.9532 2.23478 14.0469 2.5 14.0469H13.5C13.7652 14.0469 14.0196 13.9532 14.2071 13.7865C14.3946 13.6198 14.5 13.3937 14.5 13.158V10.0469" stroke="currentColor" />
  </svg>
)
