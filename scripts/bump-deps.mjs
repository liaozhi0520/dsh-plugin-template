/**
 * 抬下限脚本：把 package.json 里所有 `@deepseek-ai/dsh-*`（`^0.x.y-rc.N` 形式）
 * 的 peer/dev 下限更新到当前 minor 线的最新 rc 版本，然后运行 pnpm install。
 *
 * 用法：pnpm bump:deps
 *
 * 设计说明（对应 README「依赖版本与追新」）：
 * - 只抬**当前 major.minor 线内**的最新版本；跨线（0.2.x）带破坏性变更，
 *   属手动决策，脚本不越线；
 * - peer 与 dev 同时更新，保持同一下限（every peer has a matching development range）；
 * - 下限超过 lockfile 时 pnpm install 会强制重解析，且 `^` 写法保留；
 * - 不跑 typecheck/build：上游破坏性变更时按报错人工修。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const PACKAGE_JSON = 'package.json'
const PACKAGE_RE = /^@deepseek-ai\/dsh-/
const RANGE_RE = /^\^(\d+)\.(\d+)\.(\d+)-rc\.(\d+)$/

/** 收集 (name, currentRange, section) 列表。 */
function collect() {
  const rows = []
  for (const section of ['peerDependencies', 'devDependencies']) {
    const deps = manifest[section] ?? {}
    for (const [name, range] of Object.entries(deps)) {
      if (PACKAGE_RE.test(name) && typeof range === 'string' && RANGE_RE.test(range)) {
        rows.push({ name, range, section })
      }
    }
  }
  return rows
}

/** 解析 0.1.1 / 0.1.1-rc.2（rc 缺省按 Infinity 视为稳定版）。 */
function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-rc\.(\d+))?$/.exec(value)
  if (!match) return null
  return { major: +match[1], minor: +match[2], patch: +match[3], rc: match[4] === undefined ? Infinity : +match[4] }
}

/** 版本大小比较（同结构逐段数值比较）。 */
function compareVersion(a, b) {
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] - b[key]
  }
  return a.rc - b.rc
}

/** 运行 pnpm：Windows 需经 shell 解析 .cmd，但 shell+args 会触发 DEP0190，
 *  正确姿势是把命令拼成单个字符串再传。 */
function runPnpm(args, inherit = false) {
  const stdio = inherit ? 'inherit' : 'pipe'
  if (process.platform === 'win32') {
    const line = ['pnpm', ...args].map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg)).join(' ')
    return spawnSync(line, { encoding: 'utf8', shell: true, stdio })
  }
  return spawnSync('pnpm', args, { encoding: 'utf8', stdio })
}

/** 查询一个包的全部版本（走 pnpm view，尊重配置的 registry 镜像）。 */
function queryVersions(name) {
  const result = runPnpm(['view', name, 'versions', '--json'])
  if (result.status !== 0) throw new Error(`pnpm view ${name} 失败: ${result.stderr}`)
  const versions = JSON.parse(result.stdout)
  if (!Array.isArray(versions)) throw new Error(`pnpm view ${name} 输出异常`)
  return versions.map(parseVersion).filter((value) => value !== null)
}

const manifest = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'))

function bump() {
  const rows = collect()
  if (rows.length === 0) {
    console.log('没有匹配的 @deepseek-ai/dsh-* 依赖（^0.x.y-rc.N 形式），无需处理。')
    return false
  }
  const byName = new Map()
  for (const row of rows) {
    if (!byName.has(row.name)) byName.set(row.name, { current: row.range, changed: false })
  }

  for (const [name, state] of byName) {
    const current = RANGE_RE.exec(state.current)
    const versions = queryVersions(name)
    // 只在本 minor 线内找最新
    const candidates = versions.filter((value) => value.major === +current[1] && value.minor === +current[2])
    if (candidates.length === 0) continue
    const best = candidates.reduce((a, b) => (compareVersion(b, a) > 0 ? b : a))
    const next = `^${best.major}.${best.minor}.${best.patch}${best.rc === Infinity ? '' : `-rc.${best.rc}`}`
    if (next !== state.current) {
      state.changed = true
      state.next = next
    }
  }

  if (!byName.values().next().value || ![...byName.values()].some((state) => state.changed)) {
    console.log('所有 @deepseek-ai/dsh-* 已是当前 minor 线最新，无需变更。')
    return false
  }

  for (const row of rows) {
    const state = byName.get(row.name)
    if (state.changed) manifest[row.section][row.name] = state.next
  }
  writeFileSync(PACKAGE_JSON, JSON.stringify(manifest, null, 2) + '\n')

  console.log('已更新 package.json（peer 与 dev 同一下限）：')
  for (const [name, state] of byName) {
    if (state.changed) console.log(`  ${name}: ${state.current} -> ${state.next}`)
  }
  return true
}

if (bump()) {
  console.log('\n运行 pnpm install 同步 lockfile…')
  const install = runPnpm(['install'], true)
  if (install.status !== 0) process.exit(install.status ?? 1)
  console.log('\n完成。下一步：pnpm typecheck && pnpm build（若红 = 上游破坏性变更，按报错修）。')
}
