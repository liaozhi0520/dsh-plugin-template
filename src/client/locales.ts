/**
 * 面板与版本提醒条目的文案词典。
 * 命名空间 `template.panel` 的键集合并进 LocaleNamespaceMap（声明在 client 入口），
 * 注册后组件通过框架注入的 `t` seat 取文案（lookup 链：当前语言 → en → common → key 本身）。
 * 规范：所有 UI 展示文案都必须有 locale key，禁止硬编码。
 */

/** English strings (the key-set source of truth for this pair). */
export const en = {
  /** Section heading (configuration page on the Plugins page). */
  title: 'DSH Plugin Template',
  // 详情页设置面板的标题（与卡片显示名区分：面板标题带 "Setting Panel of" 前缀）。
  panelTitle: 'Setting Panel of DSH Plugin Template',
  intro:
    'This text comes from the client half of dsh-plugin-template. ' +
    'The page is registered on the Plugins page via the plugins.bundle.config slot.',
  ping: 'Ping host',
  pinging: 'Pinging…',
  pingResult: 'Host answered "{pong}" at {at}',
  pingFailed: 'Ping failed: {message}',
  // --- 配置编辑（0.1.7 settings 模型示范面：volatile 读取 + saveConfig 整段写回） ---
  configTitle: 'Greeting settings',
  greetingLabel: 'Greeting prefix',
  punctuationLabel: 'Sentence punctuation',
  configSave: 'Save',
  configSaving: 'Saving…',
  configSaved: 'Saved — the greet tool uses the new value immediately.',
  configSaveFailed: 'Save failed: {message}',
  configLoadFailed: 'Failed to load config: {message}',
  // --- 版本不兼容停用面板 ---
  disabledTitle: 'This plugin has been disabled automatically.',
  disabledFallback: 'The host half did not start: the installed harness version is not supported.',
  disabledWindow: 'Supported harness versions: {min} ~ {max} (inclusive).',
  disabledRuntimeCurrent: 'Current DeepSeek Harness version: {runtime}.',
  disabledPluginCurrent: 'Installed plugin version: {installed}.',
  disabledPluginChecking: 'Latest plugin version: checking…',
  disabledPluginLatestUnknown: 'Latest plugin version: unknown (offline? refresh to retry).',
  disabledPluginOutdated: 'A newer plugin release is available (update it on the dsh plugins page or install it manually, then restart):',
  disabledPluginUpToDate: 'The installed plugin is the latest release.',
  disabledDesktopUpdate: 'Please update or downgrade the DeepSeek desktop app to {version} (its bundled harness is the same version), or install a plugin release compatible with it.',
  disabledCopy: 'Copy',
  disabledCopied: 'Copied!',
  // --- 插件版本提示（标题右侧紧凑更新条；无安装动作，只查只提示） ---
  updateVersion: 'v{version}',
  updateCheck: 'Check for updates',
  updateChecking: 'Checking…',
  updateUpToDate: 'Up to date',
  updateAvailable: 'New version {version}',
  updateAvailableHint: 'uninstall this plugin on the Plugins page and reinstall the latest release.',
  updateCheckFailed: 'Check failed',
  // --- 新版本提示弹窗（shell.overlay 槽位条目，NoticeModal；「我知道了」仅
  // 关闭本次窗口，下次启动 DSH 若仍未更新则重新弹出） ---
  updateModalTitle: 'New version of {name} is available',
  updateModalText: 'A new version of this plugin is available: {latest} (current {current}). Please uninstall this plugin on the Plugins page and reinstall the latest release.',
  updateModalAck: 'Got it',
  // 安装 spec 命令片（插件包名@最新版本，弹窗与配置页更新条共用）。
  updateSpecCopy: 'Copy',
  updateSpecCopied: 'Copied!',
  // --- 陈旧代码提醒（shell.overlay 槽位条目，非阻断）：运行中模块自报版本
  // ≠ 构建期 BUILD_VERSION 时弹出，共提醒两次——第一次说明 + 「我知道了」（5 秒
  // 后重弹），第二次升级文案 + 「当前我没有使用此插件，无需立即重启」（关闭后
  // 不再提醒）。不用全屏阻断——插件无权锁死宿主，防护误报须可挽回。 ---
  staleBannerTitle: '{name}: plugin code does not match the installed version',
  staleBannerText: 'Running code is v{running} but installed is v{installed}. Restart DeepSeek Harness to load the installed version.',
  staleBannerAck: 'Got it',
  staleBannerTextFinal: 'Please restart DeepSeek Harness now — continuing to use this plugin may cause unexpected behavior.',
  staleBannerAckFinal: 'I am not using this plugin right now; no need to restart yet.',
} as const

/** The template.panel namespace key union. */
export type TemplatePanelKey = keyof typeof en

/** Chinese strings (same keys as {@link en}). */
export const zh: Record<TemplatePanelKey, string> = {
  // title 是「插件」页卡片的显示名（gen-version 构建期提取、zh/en 须同值——
  // 卡片 title 取单一来源；插件名按专名处理，不随语言变）。
  title: 'DSH Plugin Template',
  // 详情页设置面板的标题（与卡片显示名区分：面板标题带 "Setting Panel of" 前缀）。
  panelTitle: 'DSH Plugin Template 设置面板',
  intro: '这段文字来自 dsh-plugin-template 的 client half。页面经 plugins.bundle.config 槽位注册在「插件」页本插件详情页。',
  ping: '调用 host',
  pinging: '调用中…',
  pingResult: 'host 应答 "{pong}"（{at}）',
  pingFailed: '调用失败：{message}',
  configTitle: '问候语设置',
  greetingLabel: '问候语前缀',
  punctuationLabel: '句尾标点',
  configSave: '保存',
  configSaving: '保存中…',
  configSaved: '已保存——greet 工具立即使用新值。',
  configSaveFailed: '保存失败：{message}',
  configLoadFailed: '配置读取失败：{message}',
  disabledTitle: '本插件已被自动停用。',
  disabledFallback: 'host 半未启动：当前安装的 harness 版本不受支持。',
  disabledWindow: '支持的 harness 版本窗口：{min} ~ {max}（含）。',
  disabledRuntimeCurrent: '当前 DeepSeek Harness 版本：{runtime}。',
  disabledPluginCurrent: '插件当前安装版本：{installed}。',
  disabledPluginChecking: '最新版本：检查中…',
  disabledPluginLatestUnknown: '最新版本：未能确认（可能离线，可稍后刷新重试）。',
  disabledPluginOutdated: '插件有新版本（可在 DeepSeek 插件页更新或手动安装后重启）：',
  disabledPluginUpToDate: '插件已是最新版本。',
  disabledDesktopUpdate: '请将 DeepSeek 桌面版更新/降级至 {version}（其内置 harness 即该版本），或安装与该桌面版兼容的插件版本。',
  disabledCopy: '复制',
  disabledCopied: '已复制！',
  updateVersion: 'v{version}',
  updateCheck: '检查更新',
  updateChecking: '检查中…',
  updateUpToDate: '已是最新',
  updateAvailable: '新版本 {version}',
  updateAvailableHint: '请在「插件」页卸载本插件后重新安装最新版本。',
  updateCheckFailed: '检查失败',
  updateModalTitle: '发现插件新版本：{name}',
  updateModalText: '插件有新版本：{latest}（当前 {current}）。请在「插件」页卸载本插件后重新安装最新版本。',
  updateModalAck: '我知道了',
  updateSpecCopy: '复制',
  updateSpecCopied: '已复制！',
  staleBannerTitle: '{name}：插件代码与已安装版本不一致',
  staleBannerText: '运行中代码 v{running}，已安装 v{installed}。请重启 DeepSeek Harness 加载已安装版本。',
  staleBannerAck: '我知道了',
  staleBannerTextFinal: '请立即重启 DeepSeek Harness，如果再继续使用此插件有可能会造成异常。',
  staleBannerAckFinal: '当前我没有使用此插件，无需立即重启',
}

/** Locale namespace owned by this plugin. */
export const TEMPLATE_NS = 'template.panel'
