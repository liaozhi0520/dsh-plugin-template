/**
 * 构建期生成脚本（build 链首步）：
 *
 * 生成两件包内静态产物（「插件」页在不激活插件的前提下读取）：
 *
 * 1. `locale/{zh,en}.json` —— 卡片显示元数据：`meta.title` + `meta.description`
 *    + `meta.detail`。
 *    - `meta.description` 是**产品介绍**，末尾用 `{{compat}}` 占位符烧入
 *      **带括号的兼容窗口**——窗口从 `src/version-gate.ts` 提取，抬窗口后跑
 *      一次 build 自动跟随。
 *    - 该字段**不能写空串**（经验上空串会让整份 locale 被判无效、卡片标题
 *      一起丢；源码核证见 docs/compat-plan-0.2.2-rc.1.md §2/§7）。
 * 2. `assets/detail/{zh,en}.md` —— 详情文档（0.2.2 插件页详情区渲染它），由
 *    `scripts/templates/detail.<lang>.md` 生成：只有标题与「如何使用」，
 *    产品介绍与兼容窗口都在 `meta.description` 里，不重复。
 *
 * 单一事实源（提取失败 = build 显式报错，不静默产出空值）：
 * - title ← src/client/locales.ts 的 `title: '…'`（zh/en 两本词典各一处，须同值）；
 * - 兼容窗口 ← src/version-gate.ts 的 MIN/MAX_HARNESS_VERSION；
 * - description ← 本脚本常量 DESCRIPTION（含 `{{compat}}` 占位符）；
 * - 详情正文 ← scripts/templates/detail.<lang>.md（改文案改模板，不要手改
 *   `assets/detail/*.md` 生成物——下次 build 会被覆盖）。
 *
 * 由 `pnpm run build` 显式链式调用（不依赖 npm pre/post 钩子语义，pnpm 对
 * enable-pre-post-scripts 的默认值不可靠）：产物内容与磁盘现状一致时不写盘，
 * 避免重复构建时空转。smoke-offline 0g 守护元数据与详情文档的一致性。
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

// 窗口常量只允许 major.minor.patch（与 version-gate.ts 的比较口径一致）：
// 写成 -rc.x / 两段式会让卡片窗口文案与门禁语义脱节，直接在 build 期拒绝。
for (const [name, value] of [['MIN_HARNESS_VERSION', min], ['MAX_HARNESS_VERSION', max]]) {
  if (!/^\d+\.\d+\.\d+$/.test(value)) {
    console.error(`[gen-version] ${name} 必须为 major.minor.patch 格式（当前为 "${value}"）`)
    process.exit(1)
  }
}

const localesSource = readFileSync(new URL('../src/client/locales.ts', import.meta.url), 'utf8')
// 卡片 title 取单一来源：zh/en 词典的 title 必须同值（模板既有纪律，smoke 0g 同源守护）。
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

/**
 * 兼容窗口的烧录占位符：出现在 description 模板里，替换为**带括号的窗口**
 * （中文全角、英文半角带前导空格）。模板缺占位符 = build 报错，避免窗口悄悄
 * 不更新。
 */
const COMPAT_MARKER = '{{compat}}'
const COMPAT_TEXT = {
  zh: `（兼容 DeepSeek Harness ${min} ~ ${max}）`,
  en: ` (compatible with DeepSeek Harness ${min} ~ ${max})`,
}

/**
 * 卡片描述：产品介绍（一句话说清插件做什么）+ 兼容窗口。
 * 末尾 `{{compat}}` 由本脚本替换；详情区只放「如何使用」，不重复这段。
 * 注意**不能写空串**（会让整份 locale 失效）。
 */
const DESCRIPTION = {
  zh: 'DeepSeek Harness 插件模板：host + client 双半、插件页配置页、版本门禁与停用面板骨架{{compat}}。',
  en: 'DeepSeek Harness plugin template: host + client halves, Plugins-page config, version gate and disabled panel{{compat}}.',
}

/**
 * 详情文档（`meta.detail`）：相对包根、位于子目录、`.md` 结尾，且顶层目录
 * （`assets`）已在 package.json 的 files 里——0.2.2 插件页详情区的官方契约。
 * **必须声明**：不声明时插件页回退渲染包内 README，而 README 是开发者文档。
 */
const DETAIL_PATHS = {
  zh: 'assets/detail/zh.md',
  en: 'assets/detail/en.md',
}

/** 详情正文模板（不入包；生成物在 assets/detail/）。 */
const DETAIL_TEMPLATES = {
  zh: 'scripts/templates/detail.zh.md',
  en: 'scripts/templates/detail.en.md',
}

/** 内容不同才写盘（重复构建不空转）。 */
function writeIfChanged(url, content, label) {
  if (existsSync(url) && readFileSync(url, 'utf8') === content) return false
  writeFileSync(url, content)
  console.log(`[gen-version] ${label} 已写入`)
  return true
}

// 1) 详情文档：模板原样落盘（只有标题与「如何使用」，无占位符）。
mkdirSync(new URL('../assets/detail/', import.meta.url), { recursive: true })
for (const lang of ['zh', 'en']) {
  const templatePath = new URL(`../${DETAIL_TEMPLATES[lang]}`, import.meta.url)
  if (!existsSync(templatePath)) {
    console.error(`[gen-version] 详情模板缺失：${DETAIL_TEMPLATES[lang]}`)
    process.exit(1)
  }
  const body = readFileSync(templatePath, 'utf8').replace(/\s+$/u, '')
  writeIfChanged(new URL(`../${DETAIL_PATHS[lang]}`, import.meta.url), `${body}\n`, `项目 ${DETAIL_PATHS[lang]}`)
}

// 2) locale 元数据：title + 产品介绍（含兼容窗口）+ detail 路径。
mkdirSync(new URL('../locale/', import.meta.url), { recursive: true })
for (const lang of ['zh', 'en']) {
  if (!DESCRIPTION[lang].includes(COMPAT_MARKER)) {
    console.error(`[gen-version] DESCRIPTION.${lang} 缺少 ${COMPAT_MARKER} 占位符——兼容窗口无处烧录`)
    process.exit(1)
  }
  const description = DESCRIPTION[lang].split(COMPAT_MARKER).join(COMPAT_TEXT[lang])
  const json = `${JSON.stringify({
    meta: { title, description, detail: DETAIL_PATHS[lang] },
  }, null, 2)}\n`
  writeIfChanged(
    new URL(`../locale/${lang}.json`, import.meta.url),
    json,
    `locale/${lang}.json（title「${title}」+ 描述烧入窗口 ${min} ~ ${max} + detail）`,
  )
}
