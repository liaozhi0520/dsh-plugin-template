/**
 * 插件自更新（设置面板「检查更新 / 立即更新」的 host 半实现）。
 *
 * 安装/更新一律走 **官方 CLI 通道**：`dsh plugin --profile <name> add
 * <pkg>@<version>`。该命令在 harness 侧（apps/cli/src/plugin.ts）是
 * "profile 目录里的 pnpm add + `dsh.profile.bundles` 清单 reconcile" 的官方
 * 转发器——更新已装插件时 reconcile 是 no-op（包名不变、bundles 行已在），
 * 但与用户手动安装完全同构，未来 CLI 增加安装期校验/钩子也自动兼容。
 * 不要绕过它直接调 pnpm，也不要用 `pnpm update`（会剥 rc 包的 `^`）。
 *
 * - 当前版本：读自身包根的 package.json（lib/ 上一级；模块级缓存——更新只改
 *   磁盘不改本进程内存里的旧模块，缓存保证运行期口径一致）；
 * - 最新版本：npm registry `/<pkg>/latest` 端点（纯 fetch，不引 HTTP SDK；
 *   undici 不读 env 代理）。注意：**自更新要求插件已发布到 npm**；
 * - profile 定位（三级发现；profile name = 定位目录的 basename，因为
 *   resolveProfileDir 是 `<home>/profiles/<name>` 的双向映射，子进程 dsh 继承
 *   同一 env 会解析回同一目录，list 的 root.path 再交叉核对）：
 *   ① registry 实体安装：包根逐级上溯找声明了 `dsh.profile` 且认领本包
 *      （bundles/dependencies 列出包名）的目录；
 *   ② link 开发副本：Node 把链接 realpath 成源码仓库，上溯必然失败——反着
 *      找"谁在运行本副本"：扫描 `$DSH_HOME/profiles/*`（启动 argv 里的
 *      profile 名优先作候选，`dsh web` 是 `--profile web` 的硬编码别名），
 *      找 `node_modules/<pkg>` 的 realpath 指向本包根的 profile——**物理
 *      证据**，不是猜路径。多个 profile 同时 link 时，启动 argv 指明的那个
 *      权威裁决（harness 启动的就是它）；argv 也没指明才报错交人工裁决。
 *      更新会经官方 `dsh plugin add` 把开发链接替换为 registry 版本（add 对
 *      link 依赖本就是覆盖语义）；
 *   ③ 都失败才报错（profile 清单不认领本包时同样视为未安装）；
 * - 安装校验：`dsh plugin --profile <name> list --json`（pnpm list 转发）——
 *   确认子进程解析的 profile 目录与定位一致、本包在 profile 依赖里；
 * - dsh CLI 调用形态：优先 `node <process.argv[1]>`（argv[1] 即 harness 入口
 *   脚本，与 version-gate.ts 同一锚点假设；严格校验它确实是 @deepseek-ai/dsh
 *   包自己声明的 bin 才采用——npm 全局安装下与 `dsh` 完全等价，且免 shell
 *   引号问题），否则回落 PATH 上的 `dsh`（win32 经 shell 解析 .cmd shim）；
 * - 并发：模块级 in-flight 锁，重复点击合并进同一次安装。
 */
import { spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { compareVersions } from './version-gate.js'
import type { TemplateUpdateApply, TemplateUpdateCheck } from './shared/update-contract.js'

/** 插件包根目录（lib/self-update.js → 上一级）。 */
const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url))

/** 自身 package.json 的 name/version（首次读取后缓存）。 */
interface SelfManifest {
  name: string
  version: string
}

let cachedManifest: SelfManifest | null = null

/** 读自身包根的 package.json（缺字段即抛错——包不完整时更新功能不可用）。 */
function selfManifest(): SelfManifest {
  if (cachedManifest !== null) return cachedManifest
  const path = join(PACKAGE_ROOT, 'package.json')
  const raw = JSON.parse(readFileSync(path, 'utf8')) as { name?: unknown; version?: unknown }
  if (typeof raw.name !== 'string' || raw.name === '' || typeof raw.version !== 'string' || raw.version === '') {
    throw new Error(`dsh-plugin-template: 自身 package.json 缺少 name/version（${path}）`)
  }
  cachedManifest = { name: raw.name, version: raw.version }
  return cachedManifest
}

/** 版本串合法字符集（semver 全集子集；进 CLI 参数前先过滤）。 */
const VERSION_SPEC = /^[\w.+-]+$/

/** profile 名的合法字符集（进 CLI 参数前过滤；resolveProfileDir 本就拒绝分隔符）。 */
const PROFILE_NAME_SPEC = /^[\w][\w.-]*$/

/** npm registry 请求超时。 */
const REGISTRY_TIMEOUT_MS = 15_000

/** npm registry 上本包 latest dist-tag 指向的版本（不可达/形态不对则抛错）。 */
async function fetchLatestVersion(packageName: string): Promise<string> {
  // scoped 包名的 registry 路径形如 /@scope%2Fname/latest（npm CLI 同款编码）。
  // 注意 accept 必须是 application/json：/latest 是完整 manifest 文档，
  // 报 abbreviated packument 头（application/vnd.npm.install-v1+json）会被
  // registry 以 406 拒绝（实测）。
  const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`npm registry 返回 HTTP ${response.status}（${url}）`)
  const body = (await response.json()) as { version?: unknown }
  if (typeof body.version !== 'string' || !VERSION_SPEC.test(body.version)) {
    throw new Error('npm registry 响应缺少合法的 version 字段')
  }
  return body.version
}

// ---------------------------------------------------------------------------
// 检查更新（只读：registry 一次往返）
// ---------------------------------------------------------------------------

/** 检查更新：当前版本 vs registry latest。 */
export async function checkSelfUpdate(): Promise<TemplateUpdateCheck> {
  const manifest = selfManifest()
  const latestVersion = await fetchLatestVersion(manifest.name)
  return {
    currentVersion: manifest.version,
    latestVersion,
    updateAvailable: compareVersions(latestVersion, manifest.version) > 0,
  }
}

// ---------------------------------------------------------------------------
// profile 定位（三级发现；profile name = 目录 basename）
// ---------------------------------------------------------------------------

/** 读一个目录下 package.json 的 JSON（不存在/坏 JSON 返回 null）。 */
function readManifest(dir: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

/** profile 清单是否认领本包：声明 `dsh.profile` 且 bundles/dependencies 列出包名。 */
function manifestListsPackage(manifest: Record<string, unknown>, packageName: string): boolean {
  const dsh = manifest.dsh as { profile?: { bundles?: unknown } } | undefined
  const bundles = dsh?.profile?.bundles
  const dependencies = manifest.dependencies as Record<string, unknown> | undefined
  return dsh?.profile !== undefined
    && ((Array.isArray(bundles) && bundles.includes(packageName))
      || (dependencies !== undefined && packageName in dependencies))
}

/** Windows 目录比较忽略大小写，其余平台精确比较（先 resolve 归一化分隔符）。 */
function sameDir(a: string, b: string): boolean {
  const na = resolve(a)
  const nb = resolve(b)
  return process.platform === 'win32' ? na.toLowerCase() === nb.toLowerCase() : na === nb
}

/** ① registry 实体安装：包根逐级上溯找认领本包的 `dsh.profile` 清单目录。 */
function walkUpToProfile(fromDir: string, packageName: string): string | undefined {
  for (let dir = dirname(fromDir); ; dir = dirname(dir)) {
    const manifest = readManifest(dir)
    if (manifest !== null && manifestListsPackage(manifest, packageName)) return dir
    if (dirname(dir) === dir) return undefined // 到达文件系统根
  }
}

/**
 * dsh home 解析（dsh-home-paths 的子集语义）：$DSH_HOME（空/空白视为未设，
 * 支持 ~ 前缀）→ `~/.dsh`。
 */
function dshHome(): string {
  const raw = process.env.DSH_HOME?.trim()
  if (raw === undefined || raw === '') return join(homedir(), '.dsh')
  return resolve(raw.startsWith('~') ? join(homedir(), raw.slice(1)) : raw)
}

/**
 * 启动 argv 里的 profile 名候选（与 apps/cli/src/args.ts 的启动面语义一致）：
 * `dsh web …` 是 `--profile web` 的硬编码别名；`--profile <name>`（含
 * `--profile=<name>` 等号形式）只在启动面生效——首个 launcher 不认识的 token
 * 之后全是 app 内参，不再扫描。plugin 管理模式不是启动面。
 */
function launcherProfileName(): string | undefined {
  const tokens = process.argv.slice(2)
  if (tokens[0] === 'web') return 'web'
  if (tokens[0] === 'plugin') return undefined
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!
    if (token === '--profile') return tokens[i + 1]
    if (token.startsWith('--profile=')) return token.slice('--profile='.length) || undefined
    if (token === '--patch') { i += 1; continue }
    if (token.startsWith('--patch=')) continue
    if (token === '--dump-config' || token === '--dump-default-config') continue
    return undefined
  }
  return undefined
}

/**
 * ② link 开发副本的 profile 发现：候选（argv 里的 profile 名优先，其次
 * `$DSH_HOME/profiles` 下全部目录）逐一检查——profile 清单认领本包，且
 * `node_modules/<pkg>` 的 realpath 指向本包根（**物理证据**：就是这条链接在
 * 运行本副本）。多个 profile 同时 link 时抛错交人工裁决。
 */
function findLinkingProfile(packageName: string): string | undefined {
  const selfReal = realpathSync(PACKAGE_ROOT)
  const home = dshHome()
  const candidates: string[] = []
  const argvName = launcherProfileName()
  if (argvName !== undefined && PROFILE_NAME_SPEC.test(argvName)) {
    candidates.push(join(home, 'profiles', argvName))
  }
  try {
    for (const entry of readdirSync(join(home, 'profiles'), { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'node_modules') continue // 模块兜底目录不是 profile
      const dir = join(home, 'profiles', entry.name)
      if (!candidates.some((candidate) => sameDir(candidate, dir))) candidates.push(dir)
    }
  } catch {
    // home/profiles 不存在等：候选只剩 argv 推导的那一个。
  }
  const matches = candidates.filter((dir) => {
    const manifest = readManifest(dir)
    if (manifest === null || !manifestListsPackage(manifest, packageName)) return false
    try {
      return sameDir(realpathSync(join(dir, 'node_modules', ...packageName.split('/'))), selfReal)
    } catch {
      return false // 不是链接，或链接悬空
    }
  })
  if (matches.length === 0) return undefined
  // 启动 argv 指明的 profile 是权威裁决：正在运行本副本的就是 harness 启动的
  // 那个 profile——即便别的 profile 也 link 了同一源码目录（并行开发的常见态）。
  if (argvName !== undefined) {
    const byArgv = matches.find((dir) => sameDir(dir, join(home, 'profiles', argvName)))
    if (byArgv !== undefined) {
      console.log(`[dsh-plugin-template] dev link detected: profile "${basename(byArgv)}"（启动 argv 指定）links to this source copy；更新将经 dsh plugin add 用 registry 版本替换该链接`)
      return byArgv
    }
  }
  if (matches.length === 1) {
    console.log(`[dsh-plugin-template] dev link detected: profile "${basename(matches[0]!)}" links to this source copy；更新将经 dsh plugin add 用 registry 版本替换该链接`)
    return matches[0]!
  }
  throw new Error(`多个 profile 同时 link 了本插件源码目录（${matches.map((dir) => basename(dir)).join('、')}）且启动 argv 未指明 profile——请手动执行 dsh plugin --profile <name> add 更新目标 profile`)
}

/**
 * profile 定位（三级）：① 包根上溯（registry 实体安装）→ ② link 开发副本
 * 反查（realpath 物理证据）→ ③ 都找不到返回 undefined（调用方给出明确报错）。
 */
export function locateProfileDir(fromDir: string = PACKAGE_ROOT): string | undefined {
  const packageName = selfManifest().name
  return walkUpToProfile(fromDir, packageName) ?? findLinkingProfile(packageName)
}

/** readInstalledVersion：回读 profile node_modules 里已落盘的版本（失败不阻塞）。 */
function readInstalledVersion(profileDir: string, packageName: string): string | undefined {
  const manifest = readManifest(join(profileDir, 'node_modules', ...packageName.split('/')))
  const version = manifest?.version
  return typeof version === 'string' && version !== '' ? version : undefined
}

/** child 是否落在 parent 目录之内（含相等）。 */
function isInside(child: string, parent: string): boolean {
  const rel = relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/**
 * 清理 node_modules 里残留的开发链接：`pnpm remove` 在 hoisted 模式下不删
 * 顶层 junction，而 `pnpm add` 用 registry 版本覆盖现存 junction 会报
 * ERR_PNPM_ENOENT（importPackage 对链接的 _tmp_ 重命名缺陷，pnpm 11.7 实测）。
 * 只删"指向 profile 之外"的链接（= 开发链接；rm 仅移除链接本体，绝不触及
 * 链接目标——即源码仓库），registry 实体副本（realpath 在 profile 内）交给
 * pnpm add 自己覆盖。
 */
function removeResidualDevLink(profileDir: string, packageName: string): void {
  const linkPath = join(profileDir, 'node_modules', ...packageName.split('/'))
  let real: string
  try {
    real = realpathSync(linkPath)
  } catch {
    return // 不存在或链接悬空：没有残留物要清
  }
  if (isInside(real, profileDir)) return // registry 实体副本，pnpm add 可直接覆盖
  rmSync(linkPath, { recursive: true, force: true })
  console.log(`[dsh-plugin-template] removed residual dev link ${linkPath}（链接本体，源码目录不受影响）`)
}

// ---------------------------------------------------------------------------
// dsh CLI 调用（官方通道的执行面）
// ---------------------------------------------------------------------------

/** 一次 dsh CLI 子进程的运行结果。 */
interface CliRun {
  code: number
  /** 完整 stdout+stderr（只留尾部 512KB，防 pnpm 进度刷爆内存）。 */
  output: string
}

/** 输出尾部（报错定位只需要最后几十行）。 */
function tailOf(output: string, lines = 15): string {
  return output.trimEnd().split('\n').slice(-lines).join('\n')
}

const OUTPUT_CAP = 512 * 1024

/** spawn 并捕获输出；超时 kill（win32 shell 场景下 cmd 可能留下 pnpm 孤儿，可接受）。 */
function spawnCaptured(command: string, args: readonly string[], shell: boolean, timeoutMs: number): Promise<CliRun> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, [...args], { stdio: ['ignore', 'pipe', 'pipe'], shell, windowsHide: true })
    const output: string[] = []
    let size = 0
    const collect = (chunk: Buffer): void => {
      size += chunk.length
      output.push(chunk.toString('utf8'))
      while (size > OUTPUT_CAP && output.length > 1) {
        size -= Buffer.byteLength(output[0]!)
        output.shift()
      }
    }
    child.stdout?.on('data', collect)
    child.stderr?.on('data', collect)
    const timer = setTimeout(() => {
      child.kill()
      rejectPromise(new Error(`命令超时（${Math.round(timeoutMs / 1000)} 秒），已终止`))
    }, timeoutMs)
    child.once('error', (error) => {
      clearTimeout(timer)
      rejectPromise(error)
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      resolvePromise({ code: code ?? -1, output: output.join('') })
    })
  })
}

/**
 * harness CLI 入口脚本（= 正在运行本插件的 dsh 进程入口，version-gate.ts 同一
 * 锚点假设）。严格校验：argv[1] 是已存在的 JS 文件，且其上两级的 package.json
 * 名为 @deepseek-ai/dsh、bin.dsh 声明正是该文件——防止把无关脚本当 CLI 执行。
 */
function harnessEntry(): string | undefined {
  const raw = process.argv[1]
  if (raw === undefined) return undefined
  const entry = isAbsolute(raw) ? raw : resolve(process.cwd(), raw)
  if (!/\.(m|c)?js$/i.test(entry) || !existsSync(entry)) return undefined
  const pkgRoot = dirname(dirname(entry))
  try {
    const manifest = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')) as {
      name?: unknown
      bin?: unknown
    }
    if (manifest.name !== '@deepseek-ai/dsh') return undefined
    const declared = typeof manifest.bin === 'string'
      ? resolve(pkgRoot, manifest.bin)
      : manifest.bin !== null && typeof manifest.bin === 'object' && typeof (manifest.bin as Record<string, unknown>).dsh === 'string'
        ? resolve(pkgRoot, (manifest.bin as Record<string, string>).dsh!)
        : undefined
    return declared === entry ? entry : undefined
  } catch {
    return undefined
  }
}

/**
 * 运行 `dsh plugin --profile <name> <args...>`：优先 node + harness 入口脚本
 * （无 shell、参数数组直传，免引号问题；npm 全局安装下与 `dsh` 完全等价），
 * 入口不可用时回落 PATH 上的 `dsh`（win32 经 shell 解析 .cmd shim，与 harness
 * 自家 plugin.ts 转发 pnpm 的做法一致）。
 *
 * win32 shell 通道按 DEP0190 的要求自拼单条命令串（args 数组 + shell 会告警）：
 * 所有参数都先过白名单正则（profile 名 / 版本串不含空格、引号与元字符），
 * 拼接是安全的。
 */
async function runDshCli(profileName: string, dshArgs: readonly string[], timeoutMs: number): Promise<CliRun> {
  const prefix = ['plugin', '--profile', profileName, ...dshArgs]
  const entry = harnessEntry()
  if (entry !== undefined) {
    return spawnCaptured(process.execPath, [entry, ...prefix], false, timeoutMs)
  }
  if (process.platform !== 'win32') {
    return spawnCaptured('dsh', prefix, false, timeoutMs)
  }
  const line = ['dsh', ...prefix].map(quoteWin).join(' ')
  return spawnCaptured(line, [], true, timeoutMs)
}

/** shell 命令串的单参数引装：白名单字符直接裸奔，其余剥引号后加双引号兜底。 */
function quoteWin(value: string): string {
  return /^[\w@/.+-]+$/.test(value) ? value : `"${value.replace(/"/g, '')}"`
}

/** `dsh plugin list --json` 的根条目（pnpm 对 profile 工作区的报告）。 */
interface PnpmListRoot {
  path?: unknown
  dependencies?: Record<string, { version?: unknown }>
}

/** list --json 超时（pnpm 启动 + 读依赖图）。 */
const LIST_TIMEOUT_MS = 60_000

/** dsh plugin add 超时（网络安装留足余量）。 */
const ADD_TIMEOUT_MS = 10 * 60_000

/**
 * 官方通道安装校验：从 profile 目录推导 profile name（basename），再以
 * `dsh plugin --profile <name> list --json` 确认——① 子进程解析到的 profile
 * 目录与我们定位的一致（排除同名异 home）；② 本包在 profile 依赖里。
 * @returns profile name 与 list 报告的已装版本（可能滞后，仅日志用）。
 */
export async function verifyInstallChannel(profileDir: string): Promise<{ profileName: string; listedVersion: string }> {
  const packageName = selfManifest().name
  const profileName = basename(profileDir)
  if (!PROFILE_NAME_SPEC.test(profileName)) {
    throw new Error(`profile 目录名 "${profileName}" 含非常规字符，无法安全传给 dsh CLI——请手动更新`)
  }
  const run = await runDshCli(profileName, ['list', '--json'], LIST_TIMEOUT_MS)
  if (run.code !== 0) {
    throw new Error(`dsh plugin list 失败（退出码 ${run.code}）：\n${tailOf(run.output)}`)
  }
  let roots: PnpmListRoot[]
  try {
    const parsed = JSON.parse(run.output) as PnpmListRoot[] | PnpmListRoot
    roots = Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    throw new Error(`dsh plugin list 输出不是合法 JSON：\n${tailOf(run.output)}`)
  }
  const root = roots.find((entry) => typeof entry.path === 'string' && sameDir(entry.path as string, profileDir))
  if (root === undefined) {
    throw new Error(`dsh 把 profile "${profileName}" 解析到了别处（与插件实际安装目录 ${profileDir} 不一致）——请检查 DSH_HOME 配置`)
  }
  const dep = root.dependencies?.[packageName]
  if (dep === undefined) {
    throw new Error(`官方通道在 profile "${profileName}" 的依赖里找不到 ${packageName}——请先通过 dsh plugin add 正常安装`)
  }
  const listedVersion = typeof dep.version === 'string' ? dep.version : ''
  return { profileName, listedVersion }
}

// ---------------------------------------------------------------------------
// 应用更新（动作面：in-flight 锁 + 官方 CLI 安装 + 回读）
// ---------------------------------------------------------------------------

let inFlight: Promise<TemplateUpdateApply> | null = null

/** 应用更新；已在进行中时并入同一次安装（面板重复点击安全）。 */
export function applySelfUpdate(): Promise<TemplateUpdateApply> {
  if (inFlight !== null) return inFlight
  inFlight = runUpdate().finally(() => {
    inFlight = null
  })
  return inFlight
}

async function runUpdate(): Promise<TemplateUpdateApply> {
  const manifest = selfManifest()
  const profileDir = locateProfileDir()
  if (profileDir === undefined) {
    throw new Error('未能定位运行本副本的 profile：既不是 registry 实体安装，也没有任何 profile 以 link 方式链接本目录'
      + `（或 profile 清单未认领本包）——请手动执行 dsh plugin --profile <name> add ${manifest.name}@<版本>`)
  }
  const target = await fetchLatestVersion(manifest.name)
  // 竞态兜底：检查说要更新，点更新时 latest 又回到 <= 当前（或版本被撤）。
  if (compareVersions(target, manifest.version) <= 0) {
    return { updatedTo: manifest.version, changed: false, restartRequired: false }
  }
  if (!VERSION_SPEC.test(target)) throw new Error(`目标版本串不合法：${target}`)
  // 官方通道校验通过才安装（profile name 推导 + list 交叉核对都在这一步）。
  const { profileName, listedVersion } = await verifyInstallChannel(profileDir)
  console.log(`[dsh-plugin-template] self-update: profile "${profileName}"（list 报告 ${listedVersion || '未知'}）→ via dsh plugin add ${manifest.name}@${target}`)
  // link 开发副本：先清掉 pnpm remove/add 都处理不了的残留 junction（见
  // removeResidualDevLink），再走官方 add 全新安装为 registry 版本。
  if (listedVersion.startsWith('link:')) removeResidualDevLink(profileDir, manifest.name)
  const run = await runDshCli(profileName, ['add', `${manifest.name}@${target}`], ADD_TIMEOUT_MS)
  if (run.code !== 0) {
    throw new Error(`dsh plugin add 失败（退出码 ${run.code}）：\n${tailOf(run.output)}\n`
      + `可手动执行：dsh plugin --profile ${profileName} add ${manifest.name}@${target}`)
  }
  const installed = readInstalledVersion(profileDir, manifest.name) ?? target
  console.log(`[dsh-plugin-template] self-updated ${manifest.version} → ${installed}（profile "${profileName}"）；host 半需重启 DeepSeek Harness 生效`)
  return { updatedTo: installed, changed: true, restartRequired: true }
}
