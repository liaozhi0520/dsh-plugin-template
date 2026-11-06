/**
 * 面板与停用说明的文案词典。
 * 命名空间 `template.panel` 的键集合并进 LocaleNamespaceMap（声明在 client 入口），
 * 注册后组件通过框架注入的 `t` seat 取文案（lookup 链：当前语言 → en → common → key 本身）。
 * 规范：所有 UI 展示文案都必须有 locale key，禁止硬编码。
 *
 * 【0.2.2 起】方案 A 删除了版本提示（更新条 / 弹窗 / 安装 spec 命令片）与
 * 停用面板的「插件最新版本自查」段，对应 locale 键一并删除。
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
  // --- 版本不兼容停用面板（只呈现 harness 侧信息，断网可用） ---
  disabledTitle: 'This plugin has been disabled automatically.',
  disabledFallback: 'The host half did not start: the installed harness version is not supported.',
  disabledWindow: 'Supported harness versions: {min} ~ {max} (inclusive).',
  disabledRuntimeCurrent: 'Current DeepSeek Harness version: {runtime}.',
  disabledDesktopUpdate: 'Please update or downgrade the DeepSeek desktop app to {version} (its bundled harness is the same version), or install a plugin release compatible with it.',
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
  disabledDesktopUpdate: '请将 DeepSeek 桌面版更新/降级至 {version}（其内置 harness 即该版本），或安装与该桌面版兼容的插件版本。',
}

/** Locale namespace owned by this plugin. */
export const TEMPLATE_NS = 'template.panel'
