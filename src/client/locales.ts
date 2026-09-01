/**
 * 演示面板的文案词典。
 * 命名空间 `template.demo` 的键集合并进 LocaleNamespaceMap（声明在 client 入口），
 * 注册后组件通过框架注入的 `t` seat 取文案（lookup 链：当前语言 → en → common → key 本身）。
 * 规范：所有 UI 展示文案都必须有 locale key，禁止硬编码。
 */

/** English strings (the key-set source of truth for this pair). */
export const en = {
  /** Settings nav label. */
  nav: 'HMR Demo',
  /** Section heading. */
  title: 'HMR Demo',
  // --- 版本不兼容停用面板 ---
  disabledTitle: 'This plugin has been disabled automatically.',
  disabledFallback: 'The host half did not start: the installed harness version is not supported.',
  disabledWindow: 'Supported harness versions: {min} ~ {max} (inclusive).',
  disabledInstallLabel: 'Install a supported harness version:',
  disabledCopy: 'Copy',
  disabledCopied: 'Copied!',
  disabledHint: 'Bring the harness into the supported window (upgrade or downgrade as noted above), or wait for a compatible plugin release, then restart. See the dsh startup log for details.',
  intro:
    'This text comes from the client half of dsh-plugin-template. ' +
    'Edit sources and save: tsdown --watch rewrites lib/client.js and the browser hot-swaps this section in place.',
  ping: 'Ping host',
  pinging: 'Pinging…',
  pingResult: 'Host answered "{pong}" at {at}',
  pingFailed: 'Ping failed: {message}',
} as const

/** The template.demo namespace key union. */
export type TemplateDemoKey = keyof typeof en

/** Chinese strings (same keys as {@link en}). */
export const zh: Record<TemplateDemoKey, string> = {
  nav: 'HMR 演示',
  title: 'HMR 演示',
  disabledTitle: '本插件已被自动停用。',
  disabledFallback: 'host 半未启动：当前安装的 harness 版本不受支持。',
  disabledWindow: '支持的 harness 版本窗口：{min} ~ {max}（含）。',
  disabledInstallLabel: '安装受支持的 harness 版本：',
  disabledCopy: '复制',
  disabledCopied: '已复制！',
  disabledHint: '请将 harness 调整到受支持的版本窗口（按上方原因升级或降级），或等待兼容的插件版本后重启。详见 dsh 启动日志。',
  intro: '这段文字来自 dsh-plugin-template 的 client half。编辑源码并保存：tsdown --watch 会重写 lib/client.js，浏览器不刷新页面就地把本节换成新内容。',
  ping: '调用 host',
  pinging: '调用中…',
  pingResult: 'host 应答 "{pong}"（{at}）',
  pingFailed: '调用失败：{message}',
}

/** Locale namespace owned by this plugin. */
export const DEMO_NS = 'template.demo'
