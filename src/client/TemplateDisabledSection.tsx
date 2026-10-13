/**
 * 版本不兼容时的说明面板（plugins.bundle.config 条目，挂「插件」页本组合包
 * 详情页）：host 半门禁软禁用后，业务能力全部不可用，本面板代替正常配置页
 * 向用户说明原因与处置。原因文本与推荐安装版本由 host 半经 index 注入的
 * 全局标记带来（../shared/disabled-flag.ts），经 inject props 传入，不在
 * 浏览器侧重复版本判断。
 *
 * 版式（两条处置路径各自成组，插件版本状态不夹在 harness 信息中间）：
 * 1. harness 组：原因 → 支持窗口 → 当前 harness 版本 → 桌面版更新指引
 *    （desktop-only：桌面版应用与内置 harness 锁步同版，处置 = 更新/降级
 *    桌面应用本身，无 CLI 安装命令）；
 * 2. 插件组：当前安装版本 → 最新版本状态（有新版本时给 package@version 药丸，
 *    一键复制进插件页/CLI 安装）；最新版本由本组件自查 registry（见
 *    fetchLatestPluginVersion 的头注释——桌面/静态注入是一次性快照，自查才
 *    对三种交付形态都正确）。
 */
import { useEffect, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { DisabledPluginStatus } from '../shared/disabled-flag'
import { compareVersions } from '../shared/version-compare'
import { fetchLatestPluginVersion } from './disabled-version-check'
import classes from './TemplateSection.module.css'

/** 组件的 inject face：host 半给出的停用原因、支持版本窗口与推荐安装版本。 */
export interface TemplateDisabledSectionInjected {
  reason: string
  min: string
  max: string
  /** 推荐安装目标版本（host 半给定，固定为支持上限 MAX）。 */
  installVersion: string
  /** 当前检测到的 harness 版本；null = host 半两锚点全失败，不渲染该行。 */
  runtimeVersion: string | null
  /**
   * 插件自身版本标识（host 半从自身 package.json 同步读出）；null = 载荷缺席
   * （旧 host / 包清单不可读），不渲染该段。「是否最新」由本组件自查（见
   * fetchLatestPluginVersion）。
   */
  plugin: DisabledPluginStatus | null
}

export type TemplateDisabledSectionProps = PropsRuntime<'plugins.bundle.config'> &
  PropsLocale<'template.panel'> &
  TemplateDisabledSectionInjected

/** 复制成功反馈的显示时长（ms）。 */
const COPIED_FEEDBACK_MS = 2000

/** 命令行：方框只包等宽文本，复制按钮在方框外（插件新版本药丸共用）。 */
function CommandPill(props: { text: string; copyLabel: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(props.text)
      setCopied(true)
      setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS)
    } catch (error) {
      console.warn('[dsh-plugin-template] copy command failed:', error)
    }
  }
  return (
    <span className={classes.commandRow}>
      <code className={classes.commandPill}>{props.text}</code>
      <button type="button" className={classes.button} onClick={() => void copy()}>
        {copied ? props.copiedLabel : props.copyLabel}
      </button>
    </span>
  )
}

/** 插件最新版本的自查状态：checking → done（latest 为 null = 检查失败）。 */
type PluginLatestCheck = { state: 'checking' } | { state: 'done'; latest: string | null }

/** 版本不兼容说明页（两条处置路径 + 安装命令与复制按钮）。 */
export function TemplateDisabledSection(props: TemplateDisabledSectionProps) {
  const { t, reason, min, max, installVersion, runtimeVersion, plugin } = props

  // 插件最新版本自查：挂载后查一次（web 刷新/桌面窗口重开都重新挂载 → 重新查）。
  // cancelled 守卫防卸载后 setState（重挂与 StrictMode 双执行安全）。
  const [latestCheck, setLatestCheck] = useState<PluginLatestCheck>({ state: 'checking' })
  const pluginName = plugin?.name ?? ''
  useEffect(() => {
    if (pluginName === '') return undefined
    let cancelled = false
    setLatestCheck({ state: 'checking' })
    fetchLatestPluginVersion(pluginName)
      .then((latest) => { if (!cancelled) setLatestCheck({ state: 'done', latest }) })
      .catch(() => { if (!cancelled) setLatestCheck({ state: 'done', latest: null }) })
    return () => { cancelled = true }
  }, [pluginName])

  const installed = plugin?.installed ?? ''
  const outdated = latestCheck.state === 'done'
    && latestCheck.latest !== null
    && compareVersions(latestCheck.latest, installed) > 0

  return (
    <div className={classes.disabledSection}>
      <h2 className={classes.title}>{t('title')}</h2>
      <p className={classes.intro}>{t('disabledTitle')}</p>
      <p className={classes.intro}>{reason !== '' ? reason : t('disabledFallback')}</p>
      {/* —— harness 组：支持窗口 + 当前版本 + 桌面版更新指引（desktop-only：
            桌面版应用与内置 harness 锁步同版，处置动作 = 更新/降级桌面应用本身）—— */}
      {min !== '' && max !== '' && <p className={classes.intro}>{t('disabledWindow', { min, max })}</p>}
      {runtimeVersion !== null && runtimeVersion !== '' && (
        <p className={classes.intro}>{t('disabledRuntimeCurrent', { runtime: runtimeVersion })}</p>
      )}
      {installVersion !== '' && <p className={classes.intro}>{t('disabledDesktopUpdate', { version: installVersion })}</p>}
      {/* —— 插件组（分隔线起）：当前版本 + 最新版本状态（有新版本给 package@version 药丸）—— */}
      {plugin !== null && installed !== '' && (
        <>
          <hr className={classes.groupDivider} />
          <p className={classes.intro}>{t('disabledPluginCurrent', { installed })}</p>
          {latestCheck.state === 'checking' ? (
            <p className={classes.intro}>{t('disabledPluginChecking')}</p>
          ) : latestCheck.latest === null ? (
            <p className={classes.intro}>{t('disabledPluginLatestUnknown')}</p>
          ) : outdated ? (
            <>
              {/* 标签与药丸拆成两个 flex item：面板列的 12px gap 天然隔开，药丸不贴标签行 */}
              <p className={classes.intro}>{t('disabledPluginOutdated')}</p>
              <CommandPill
                text={`${plugin.name}@${latestCheck.latest}`}
                copyLabel={t('disabledCopy')}
                copiedLabel={t('disabledCopied')}
              />
            </>
          ) : (
            <p className={classes.intro}>{t('disabledPluginUpToDate')}</p>
          )}
        </>
      )}
    </div>
  )
}
