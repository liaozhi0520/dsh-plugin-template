/**
 * 构建期生成脚本（build 链首步）：
 *
 * 生成 locale/{zh,en}.json 的**包显示元数据**（meta.title/meta.description）。
 * 「插件」页卡片在不激活插件的前提下静态读取安装包内的这两个文件（官方
 * host-plugin.md「Display metadata and icon」），故卡片文案不能走运行时
 * locale 词典，须以包内静态 JSON 发布。
 *
 * 单一事实源（构建期正则提取；提取失败 = build 显式报错，不静默产出空值）：
 * - title ← src/client/locales.ts 的 `title: '…'`（zh/en 两本词典各一处，须同值）；
 * - 兼容窗口 ← src/version-gate.ts 的 MIN/MAX_HARNESS_VERSION——抬窗口后跑一次
 *   build，卡片描述自动跟随，无需手改；
 * - description 基底文案 = 本脚本常量（改文案改这里）。
 *
 * 由 `pnpm run build` 显式链式调用（不依赖 npm pre/post 钩子语义，pnpm 对
 * enable-pre-post-scripts 的默认值不可靠）：产物内容与磁盘现状一致时不写盘，
 * 避免重复构建时空转。smoke-offline 0g 守护 locale 元数据一致性。
 *
 * 【0.2.1 起】原先还在这里烧录 `src/client/build-version.ts` 的 BUILD_VERSION
 * （陈旧代码检测的 client 半基准）。该检测已随上游修复整体拆除（卸载重装不重启
 * 由 harness 自行驱逐旧模块，2026-10-19 真机确认），本步骤一并删除——不要再
 * 加回来，取证见 docs/harness-defect-workarounds.md 的历史防护回退块。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
if (typeof pkg.version !== 'string' || pkg.version === '') {
  console.error('[gen-version] package.json 缺少 version')
  process.exit(1)
}

/** 卡片描述基底文案（改文案改这里；兼容窗口由 version-gate.ts 构建期注入）。 */
const BASE_DESCRIPTION = {
  zh: 'DeepSeek Harness 插件模板：host + client 双半、插件页配置页、版本提示与停用面板骨架。',
  en: 'DeepSeek Harness plugin template: host + client halves, Plugins-page config, version notice and disabled-panel skeleton.',
}

/** 从源码提取单引号字符串常量；提取失败 = build 报错（不静默）。 */
function extractQuotedConstant(source, name) {
  const match = source.match(new RegExp(`export const ${name} = '([^']+)'`))
  if (match === null) {
    console.error(`[gen-version] 无法从 src/version-gate.ts 提取 ${name}（正则未命中）`)
    process.exit(1)
  }
  return match[1]
}

const versionGateSource = readFileSync(new URL('../src/version-gate.ts', import.meta.url), 'utf8')
const min = extractQuotedConstant(versionGateSource, 'MIN_HARNESS_VERSION')
const max = extractQuotedConstant(versionGateSource, 'MAX_HARNESS_VERSION')

const localesSource = readFileSync(new URL('../src/client/locales.ts', import.meta.url), 'utf8')
const titles = [...localesSource.matchAll(/(?:^|\n)\s*title: '([^']+)'/g)].map(match => match[1])
if (titles.length === 0) {
  console.error('[gen-version] 无法从 src/client/locales.ts 提取 title（正则未命中）')
  process.exit(1)
}
if (new Set(titles).size !== 1) {
  console.error(`[gen-version] locales.ts 的 zh/en title 不一致：${JSON.stringify(titles)}——卡片 title 取单一来源，请先统一词典。`)
  process.exit(1)
}
const title = titles[0]

const descriptions = {
  zh: `${BASE_DESCRIPTION.zh}（兼容 DeepSeek Harness ${min} ~ ${max}）`,
  en: `${BASE_DESCRIPTION.en} (compatible with DeepSeek Harness ${min} ~ ${max})`,
}

mkdirSync(new URL('../locale/', import.meta.url), { recursive: true })
for (const lang of ['zh', 'en']) {
  const json = `${JSON.stringify({ meta: { title, description: descriptions[lang] } }, null, 2)}\n`
  const target = new URL(`../locale/${lang}.json`, import.meta.url)
  if (existsSync(target) && readFileSync(target, 'utf8') === json) continue
  writeFileSync(target, json)
  console.log(`[gen-version] locale/${lang}.json 已写入（title + 兼容窗口 ${min} ~ ${max}）`)
}
