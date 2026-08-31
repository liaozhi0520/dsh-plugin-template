/**
 * 一键改名：把插件的身份标识从当前包名**全量**替换为新包名。
 *
 * 用法：
 *   pnpm rename <new-package-name>            # 实际执行
 *   pnpm rename <new-package-name> --dry-run  # 只预览将改哪些文件，不写入
 *   node scripts/rename.mjs <new-package-name>
 *
 * 为什么需要它：插件身份散布在 15+ 个位点（见 README「使用本模板」），且
 * 部分藏在运行路径里（cordis 插件名 / Typert package 字段 / 端点描述符 id /
 * invariant 伴随件名 / __ModuleLoader__ id）。纯手工局部改名极易漏改——而
 * 漏改**不报错**，只表现为"装上但功能不认"（cordis 插件名错位、Typert RPC
 * 关联失败），排查成本远高于跑一次脚本。
 *
 * 覆盖的身份位点：
 *   - 包名：package.json、cordis.patch.yml 的 id/name、tsdown banner 的
 *     __ModuleLoader__ id + CSS 虚拟模块前缀、host/client 入口的 export const
 *     name、Typert package 字段 + src/remote.ts 端点描述符 id、invariant 伴随件名
 *   - 前缀：version-gate.ts 错误前缀、DSH_<前缀>_STRICT 环境变量名、
 *     __DSH_<前缀>_DISABLED__ 全局标记名（src/shared/disabled-flag.ts）
 *   - cordis.dev.yml 的 root 绝对路径与顶部用法注释（按脚本自身位置写回，
 *     不假设"包名 == 目录名"）
 *
 * 基线：当前包名从 package.json 读取（脚本不含任何模板名常量），因此支持
 * 重复改名。环境前缀派生规则 = 包名去掉 @scope/ 后全大写、-/. 转 _。
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 身份位点文件（相对项目根）。新增位点请同步加入本列表。 */
const IDENTITY_FILES = [
  'AGENTS.md',
  'README.md',
  'package.json',
  'cordis.patch.yml',
  'cordis.dev.yml',
  'tsdown.config.ts',
  'src/index.ts',
  'src/invariant.ts',
  'src/remote.ts',
  'src/version-gate.ts',
  'src/shared/disabled-flag.ts',
  'src/client/index.ts',
  'src/client/locales.ts',
  'src/client/api.ts',
  'src/client/TemplateSection.tsx',
  'src/client/TemplateDisabledSection.tsx',
  'src/css-modules.d.ts',
]

const newName = process.argv[2]
const dryRun = process.argv.includes('--dry-run')

if (!newName) {
  console.error('用法：pnpm rename <new-package-name> [--dry-run]')
  console.error('（新包名示例：your-package / @you/dsh-foo；环境变量前缀与标记名由脚本自动推导）')
  process.exit(1)
}
if (!/^(@[a-z0-9][a-z0-9-]*\/)?[a-z0-9][a-z0-9.-]*$/.test(newName)) {
  console.error(`非法包名：${newName}。npm 包名仅允许小写字母、数字、-、.（可带 @scope/ 前缀）。`)
  process.exit(1)
}

/** 从包名派生环境前缀：去 @scope/，-/. 转 _，全大写。 */
function envPrefix(name) {
  return name.replace(/^@[^/]+\//, '').replace(/[-.]/g, '_').toUpperCase()
}

const manifestPath = resolve(ROOT, 'package.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const currentName = manifest.name
if (typeof currentName !== 'string' || currentName === '') {
  console.error('package.json 缺少 name 字段，无法确定当前包名。')
  process.exit(1)
}
const currentEnv = envPrefix(currentName)
const nextEnv = envPrefix(newName)

if (currentName === newName && currentEnv === nextEnv) {
  console.log(`包名未变化（当前 = 目标 = ${currentName}），无需改名。`)
  process.exit(0)
}

console.log(`当前：${currentName}（前缀 ${currentEnv}）`)
console.log(`目标：${newName}（前缀 ${nextEnv}）${dryRun ? '\n[dry-run] 仅预览，不写入文件。' : ''}\n`)

/** 项目根的 forward-slash 形式（cordis.dev.yml 的历史写法）。 */
const rootFwd = ROOT.replace(/\\/g, '/')
let total = 0

for (const rel of IDENTITY_FILES) {
  const p = resolve(ROOT, rel)
  if (!existsSync(p)) continue
  const before = readFileSync(p, 'utf8')
  let text = before
  // 先换环境前缀（覆盖 DSH_<前缀>_STRICT 与 __DSH_<前缀>_DISABLED__），再换包名。
  text = text.split(currentEnv).join(nextEnv)
  text = text.split(currentName).join(newName)
  if (rel === 'cordis.dev.yml') {
    // root 绝对路径与用法注释：按脚本自身位置（真实项目根）写回，与
    // "包名 == 目录名"无关。历史写法用 forward slash。
    text = text.replace(/(\s*- ')[^']*(')/g, (_m, a, q) => `${a}${rootFwd}/lib${q}`)
    text = text.replace(/(--patch )[^ \n]*(\/cordis\.dev\.yml)/g, (_m, a) => `${a}${rootFwd}/cordis.dev.yml`)
  }
  if (text !== before) {
    const n = before.split(currentEnv).length - 1 + before.split(currentName).length - 1
    total += n
    console.log(`  ${dryRun ? '[预览]' : '[已改]'} ${rel}（${n} 处）`)
    if (!dryRun) writeFileSync(p, text)
  }
}

if (total === 0 && !dryRun) {
  console.log('未发现需改写的身份位点（可能此前已改过，或位点清单需更新）。')
}

if (!dryRun) {
  /** 递归收集文本文件（排除 node_modules/lib/.git）。 */
  function* walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'lib' || entry.name === '.git') continue
      const p = resolve(dir, entry.name)
      if (entry.isDirectory()) yield* walk(p)
      else yield p
    }
  }
  // 脚本自身的帮助文本示例名不作残留判定。
  const SKIP_RESIDUAL = new Set(['scripts/rename.mjs'])
  const residuals = []
  for (const p of walk(ROOT)) {
    const rel = relative(ROOT, p)
    if (SKIP_RESIDUAL.has(rel)) continue
    let text
    try { text = readFileSync(p, 'utf8') } catch { continue }
    // 项目根路径（其目录名可能恰好等于包名，如 C:/.../dsh-meme-gen）是合法的
    // 运行路径，不是身份残留；先按 rootFwd 屏蔽再判定。
    const masked = text.split(rootFwd).join('\u0000ROOT\u0000')
    if (masked.includes(currentName) || masked.includes(currentEnv)) residuals.push(rel)
  }
  if (residuals.length) {
    console.error(`\n⚠️ 仍有 ${residuals.length} 个文件残留旧身份标识，请人工检查：`)
    for (const r of residuals) console.error(`  - ${r}`)
    process.exitCode = 1
  } else {
    console.log('\n✅ 残留检查通过：全仓库无旧身份标识。')
  }
  console.log(`
接下来（脚本无法替你做的）：
  - LICENSE 版权行：填你的名字
  - package.json 的 description / keywords：改成你的插件描述
  - UI 文案：src/client/locales.ts 的 nav / title（slot 的 label 来自这里）
  - 若该目录此前已安装进 profile：dsh plugin --profile web add <本目录绝对路径>
  - 验证：pnpm typecheck && pnpm build
`)
}
