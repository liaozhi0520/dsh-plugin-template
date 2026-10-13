#!/usr/bin/env node
/**
 * 本地版本 bump 测试台（Verdaccio）——「版本提示」弹窗（available / stale）的端到端验证。
 *
 * 用法（`pnpm test-version-bump --help` 打印同一份说明）：
 *   pnpm test-version-bump                                    交互式：先选模式（缺省 bump）
 *   pnpm test-version-bump --mode bump                        bump 模式
 *   pnpm test-version-bump --mode commit --a <ref> --b <ref>   commit 模式（非交互指定两个 commit）
 *   node scripts/test-version-bump.mjs --help
 *   （若 pnpm 吞掉了参数，用 `pnpm test-version-bump -- --mode commit …`）
 *
 * 两种模式的差别只在「两个被测版本从哪来」：
 *
 * ① bump 模式（缺省，工作区）：版本 A = 工作区当前 package.json version，版本 B = A 的
 *    patch+1——同一个工作区构建两次（第二次构建把新版本烧进 client 的 BUILD_VERSION，
 *    这正是制造 mismatch 的手段）。适合「改完 UI 立刻验证」。
 * ② commit 模式（commit a = 旧版本，commit b = 新版本）：两个版本各自从**指定 commit 的
 *    代码树**在临时 git worktree 里构建（工作区完全不参与、也不被改动；未提交改动不会
 *    进入任何一版）。适合「验证某个已提交的 UI 改动」。
 *
 * commit 模式的「版本相同」陷阱（本仓库 chore(release) 与 feat 提交分离，提交 UI 改动时
 * 版本号往往还没抬；此时 a、b 的 version 相同，构不成版本 bump 对比）——处理规则：
 *   - **commit b 恰为当前最新提交（HEAD）** → 在 b 的 worktree 里把 version 临时
 *     patch+1 作为版本 B（只改工作文件、不提交，随临时 worktree 一起丢弃）；
 *   - **commit b 不是最新提交** → 不做任何改动，打出警告并**直接退出**（exit 2）：
 *     给一个非尖端提交凭空造版本号会与实际发布线脱节，没有可测语义。
 *   两版 version 本来就不同时直接用各自的 version；若版本 B 不大于版本 A 只警告
 *   （latest < running，available 弹窗不会出现，属降级场景）。
 *
 * 共同纪律：
 *   - dsh 内一律通过 Verdaccio npm 源安装被测包，**文件夹形式安装的副本不参与测试**；
 *   - 还原（revertAll）是默认行为：正常结束、出错、Ctrl+C 退出前都会执行——候选源回官方
 *     两源 + 版本号回滚（bump 模式）+ 临时 worktree 删除（commit 模式）+ 重建（bump 模式）
 *     + 停 Verdaccio；
 *   - 所有测试资产（verdaccio 配置 / htpasswd / 发布凭据 / tgz / 包数据 / 日志 / bump 状态 /
 *     临时 worktree）都集中在 git-ignored 的 .verdaccio-storage/——整删即净，仓库无残留。
 */
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { join } from 'node:path'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const ROOT_DISPLAY = ROOT.replace(/[\\/]+$/, '')
const STORAGE_DIR = join(ROOT, '.verdaccio-storage')
const CONFIG_PATH = join(STORAGE_DIR, 'verdaccio.config.yaml')
const HTPASSWD_PATH = join(STORAGE_DIR, 'htpasswd')
const PUBLISH_NPMRC_PATH = join(STORAGE_DIR, 'publish.npmrc')
const STATE_PATH = join(STORAGE_DIR, 'version-bump-state.json')
const VERDACCIO_LOG_PATH = join(STORAGE_DIR, 'verdaccio.log')
const REGISTRY_SOURCE_RELATIVE_PATH = join('src', 'shared', 'registry-latest.ts')
const REGISTRY_SOURCE_PATH = join(ROOT, REGISTRY_SOURCE_RELATIVE_PATH)
const REGISTRY_URL = 'http://127.0.0.1:4873'
/** 桌面 profile 的 node_modules 根（文件夹安装副本的所在地）。 */
const DESKTOP_NODE_MODULES = join(homedir(), '.dsh', 'profiles', 'desktop', 'node_modules')
/** commit 模式的临时 worktree 根（git-ignored，测试后随目录一起删）。 */
const WORKTREES_DIR = join(STORAGE_DIR, 'worktrees')

/** 官方两源候选（干净基线形态；注入/还原都以这一行为锚）。 */
const OFFICIAL_CANDIDATES = "['https://registry.npmjs.org', 'https://registry.npmmirror.com']"
/** 注入后的候选（Verdaccio 首位，失败自动降级官方两源）。 */
const INJECTED_CANDIDATES = "['http://127.0.0.1:4873', 'https://registry.npmjs.org', 'https://registry.npmmirror.com']"

/** 前置条件不成立（本次不可测、未做任何改动）时的退出码。 */
const EXIT_PRECONDITION = 2

const VERDACCIO_CONFIG = `# 由 scripts/test-version-bump.mjs 每次运行时生成（勿手改，测试后随文件夹一起删）。
storage: ./.verdaccio-storage
listen: 127.0.0.1:4873
web:
  title: dsh-plugin-template 本地版本 bump 验证源
auth:
  htpasswd:
    file: ./.verdaccio-storage/htpasswd
    max_users: -1
uplinks:
  npmjs:
    url: https://registry.npmjs.org/
packages:
  '@liaozhi/**':
    access: $all
    publish: $all
    unpublish: $all
  '**':
    access: $all
    publish: $authenticated
    proxy: npmjs
middlewares:
  audit:
    enabled: false
`

/** 测试账号：verdaccio 只监听 127.0.0.1，凭据只落在 git-ignored 目录。 */
const TEST_USER = 'test'
const TEST_PASSWORD = 'test123'

// ---------------------------------------------------------------------------
// 运行时状态（跨阶段/还原出口共享；在函数求值前完成初始化）
// ---------------------------------------------------------------------------

/** 工作区是否被本脚本改过（注入候选源 / bump 版本）——只有改过才需要重建。 */
let workspaceDirty = false
/** 当前模式（决定还原路径）；在 main 选完模式后立即赋值。 */
let activeMode = 'bump'
/** 已创建、待还原时删除的临时 worktree（commit 模式）。 */
const activeWorktrees = []
/** 当前后台 Verdaccio 进程。 */
let activeVerdaccioChild
/** 还原守卫标记。 */
let reverted = false

const USAGE = `本地版本 bump 测试台（Verdaccio）——「版本提示」弹窗的端到端验证

用法：
  pnpm test-version-bump                                    交互式：先选模式（缺省 bump）
  pnpm test-version-bump --mode bump                        bump 模式（工作区当前版本 → patch+1）
  pnpm test-version-bump --mode commit --a <ref> --b <ref>  commit 模式（两个 commit 各构建一版）
  node scripts/test-version-bump.mjs --help

参数：
  --mode <bump|commit>   测试模式；缺省交互式询问（回车 = bump）
  --a, --commit-a <ref>  commit 模式：旧版本所在 commit（sha / 分支 / tag）
  --b, --commit-b <ref>  commit 模式：新版本所在 commit
  -h, --help             打印本说明

commit 模式规则：a、b 的 package.json version 不同 → 直接用各自版本；相同时只有 b 为当前
HEAD 才能测（脚本在 b 的临时 worktree 里把版本 patch+1 作为新版本，不提交），否则直接退出。`

function info(message) { console.log(`[test-version-bump] ${message}`) }

function warn(message) { console.warn(`[test-version-bump] 警告：${message}`) }

/**
 * 以异常结束当前流程；还原交给调用方的 finally（revertAll 是默认行为，
 * 不用 process.exit——那会跳过 finally，留下注入态）。
 */
function fail(message) {
  throw new Error(message)
}

/** 前置条件不成立：打印警告后以 exit 2 退出（此时尚未做任何改动，无需还原）。 */
class PreconditionError extends Error {}

function warnBlock(lines) {
  console.error('')
  console.error('='.repeat(78))
  for (const line of lines) console.error(`[test-version-bump] ${line}`)
  console.error('='.repeat(78))
  console.error('')
}

/**
 * 走 shell 执行（pnpm / npm / verdaccio / taskkill / cmd 混装 .cmd 与 .exe，shell 最省事）。
 * **stdin 一律 ignore**：npm publish 在 stdin 是「打开但不给数据」的管道时会一直等
 * （实测：脚本被驱动脚本/管道运行时 stdin 正是这种管道 → 发布卡死、0 CPU、无任何输出；
 * stdin 关掉后同一发布 0.9s 完成）。测试台不该因为没人按键而挂住。
 */
function runStep(command, args, cwd = ROOT) {
  // DEP0190 规避：shell:true 下把参数拼成单条命令（本项目各路径均无空格）。
  const result = spawnSync([command, ...args].join(' '), { cwd, stdio: ['ignore', 'inherit', 'inherit'], shell: true })
  if (result.status !== 0) {
    fail(`命令失败（exit ${String(result.status)}）：${command} ${args.join(' ')}${cwd === ROOT ? '' : `（cwd ${cwd}）`}`)
  }
}

// ---------------------------------------------------------------------------
// git 助手（commit 模式）
//
// git 命令一律**不走 shell**：cmd.exe 会把 `^{commit}` 里的 `^` 当转义符吃掉
// （实测：经 shell 后 `git rev-parse --verify --quiet <sha>^{commit}` 解析失败）。
// ---------------------------------------------------------------------------

function runGit(args) {
  const result = spawnSync('git', args, { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] })
  if (result.status !== 0) fail(`git ${args.join(' ')} 失败（exit ${String(result.status)}）`)
}

/** 捕获式 git 查询。失败返回 null——由调用方决定报错文案。 */
function captureGit(args) {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' })
  if (result.status !== 0) return null
  return (result.stdout ?? '').trim()
}

function resolveCommit(ref) {
  const sha = captureGit(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])
  return sha === null || sha === '' ? null : sha
}

function currentHeadSha() {
  const sha = captureGit(['rev-parse', 'HEAD'])
  if (sha === null || sha === '') fail('无法解析当前 HEAD（本仓库不是 git 仓库？）')
  return sha
}

function isWorkingTreeDirty() {
  const status = captureGit(['status', '--porcelain'])
  if (status === null) fail('git status 失败——请在仓库内运行本脚本')
  return status !== ''
}

function shortSha(sha) { return sha.slice(0, 8) }

/** 一行式 commit 描述（短 sha + 日期 + 标题），用于让用户确认选对了 commit。 */
function describeCommit(sha) {
  const line = captureGit(['show', '-s', '--format=%h %ad %s', '--date=short', sha])
  return line === null || line === '' ? shortSha(sha) : line
}

/** 读 commit 的 package.json（name + version）。 */
function commitManifest(sha, label) {
  const raw = captureGit(['show', `${sha}:package.json`])
  if (raw === null || raw === '') fail(`无法读取 commit ${label}（${shortSha(sha)}）的 package.json`)
  let manifest
  try {
    manifest = JSON.parse(raw)
  } catch (error) {
    fail(`commit ${label}（${shortSha(sha)}）的 package.json 不是合法 JSON：${error instanceof Error ? error.message : String(error)}`)
  }
  if (typeof manifest.version !== 'string' || manifest.version === '') fail(`commit ${label}（${shortSha(sha)}）的 package.json 缺少 version`)
  if (typeof manifest.name !== 'string' || manifest.name === '') fail(`commit ${label}（${shortSha(sha)}）的 package.json 缺少 name`)
  return manifest
}

/** 交互式输入 commit ref，直到能解析（最多 5 次）。 */
async function askCommitRef(rl, label) {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const answer = (await rl.question(`   请输入 ${label} 的 commit（sha / 分支 / tag 均可）：`)).trim()
    if (answer === '') { info('   输入为空，请重试。'); continue }
    const sha = resolveCommit(answer)
    if (sha !== null) { info(`   ${label} → ${describeCommit(sha)}`); return sha }
    warn(`无法解析为 commit："${answer}"`)
  }
  fail(`${label} 连续 5 次无法解析为 commit，退出`)
}

/** 版本号三元组比较（仅用于提示/排序判断，不参与 semver 预发布语义）。 */
function compareVersions(left, right) {
  const toParts = value => String(value).split('.').map(part => Number.parseInt(part, 10) || 0)
  const leftParts = toParts(left)
  const rightParts = toParts(right)
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (diff !== 0) return diff > 0 ? 1 : -1
  }
  return 0
}

// ---------------------------------------------------------------------------
// 命令行参数与模式选择
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const options = { mode: null, commitA: null, commitB: null, help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const eq = arg.indexOf('=')
    const name = eq === -1 ? arg : arg.slice(0, eq)
    const inlineValue = eq === -1 ? null : arg.slice(eq + 1)
    /** 取值：`--x=v` 用等号后的部分，否则消费下一个 argv（index 前移）。 */
    const value = () => {
      if (inlineValue !== null) return inlineValue
      const next = argv[index + 1]
      if (next === undefined || next.startsWith('--')) fail(`参数 ${name} 缺少取值`)
      index += 1
      return next
    }
    if (name === '--help' || name === '-h') options.help = true
    else if (name === '--mode') options.mode = value()
    else if (name === '--a' || name === '--commit-a') options.commitA = value()
    else if (name === '--b' || name === '--commit-b') options.commitB = value()
    else fail(`未知参数 ${arg}（--help 看用法）`)
  }
  if (options.mode !== null && options.mode !== 'bump' && options.mode !== 'commit') {
    fail(`--mode 只接受 bump / commit（收到 "${options.mode}"）`)
  }
  return options
}

/** 交互式选模式：回车 = bump（缺省，最常用）。 */
async function resolveMode(rl, options) {
  if (options.mode !== null) return options.mode
  info('请选择测试模式：')
  info('  [1] bump   —— 工作区当前版本 → patch+1（缺省，改完 UI 立刻验证）')
  info('  [2] commit —— 指定 commit a（旧版本）/ commit b（新版本），各自构建一版')
  const answer = (await rl.question('   输入 1 / 2 后回车（直接回车 = 1）：')).trim()
  if (answer === '' || answer === '1' || answer.toLowerCase() === 'bump') return 'bump'
  if (answer === '2' || answer.toLowerCase() === 'commit') return 'commit'
  fail(`无法识别的模式选择："${answer}"（只接受 1 / 2）`)
}

// ---------------------------------------------------------------------------
// 版本号助手
// ---------------------------------------------------------------------------

/** 读工作区 package.json（name + version；version 是 bump 模式的基准）。 */
function readManifest() {
  const manifestPath = join(ROOT, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (typeof manifest.version !== 'string' || manifest.version === '') fail('package.json 缺少 version')
  return manifest
}

/** patch +1 的下一版本号。 */
function nextVersion(version) {
  const parts = version.split('.')
  const patch = Number.parseInt(parts.at(-1), 10)
  if (!Number.isInteger(patch)) fail(`无法从 version "${version}" 解析 patch 段`)
  parts[parts.length - 1] = String(patch + 1)
  return parts.join('.')
}

/** 写 baseDir 的 package.json version（bump 模式 = 工作区；commit 模式 = b 的临时 worktree）。 */
function bumpVersion(next, baseDir = ROOT) {
  const manifestPath = join(baseDir, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.version = next
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  info(`${baseDir === ROOT ? 'package.json' : `${baseDir}/package.json`} version → ${next}`)
}

/** bump 时落状态文件（还原时据此把版本号滚回 bump 前值）。 */
function recordBumpState(originalVersion, bumpedVersion) {
  writeFileSync(STATE_PATH, `${JSON.stringify({ originalVersion, bumpedVersion }, null, 2)}\n`)
  info(`bump 状态已记录（version-bump-state.json：${originalVersion} → ${bumpedVersion}）`)
}

/** 版本号回滚：存在 bump 状态文件才动作；幂等（已一致则只清状态文件）。 */
function restoreVersionIfBumped() {
  if (!existsSync(STATE_PATH)) { info('无 bump 状态文件——版本号无需回滚'); return }
  const state = JSON.parse(readFileSync(STATE_PATH, 'utf8'))
  const manifestPath = join(ROOT, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (manifest.version === state.originalVersion) {
    info(`package.json version 已是 ${state.originalVersion}，无需回滚`)
  } else {
    manifest.version = state.originalVersion
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    info(`package.json version 已回滚：${state.bumpedVersion} → ${state.originalVersion}`)
  }
  rmSync(STATE_PATH)
  info('bump 状态文件已清除')
}

// ---------------------------------------------------------------------------
// 临时 git worktree（commit 模式：工作区之外的独立构建沙盒）
// ---------------------------------------------------------------------------

/**
 * 删除 worktree 目录。**刻意不用 `git worktree remove`**：它在 Windows 上会**穿过**
 * node_modules 里的 junction 森林递归删除（实测：junction 目标内的文件会被一并删掉；
 * pnpm 的 junction 都指向 worktree 内部，故当前无实际损害，但这是「只差一次链接目标
 * 变化」的数据丢失风险，不赌）。Node 的 rmSync 对 reparse point 是 unlink 语义
 * （实测 canary 文件存活），删完用 `git worktree prune` 清注册项。
 */
function deleteWorktreeDir(dir) {
  rmSync(dir, { recursive: true, force: true })
  if (existsSync(dir)) fail(`临时 worktree 删除失败：${dir}（请手动删除后重试）`)
}

function removeWorktrees() {
  if (activeWorktrees.length === 0) return
  for (const worktree of activeWorktrees) {
    info(`删除临时 worktree ${worktree.dir}`)
    deleteWorktreeDir(worktree.dir)
  }
  activeWorktrees.length = 0
  runGit(['worktree', 'prune'])
  info('临时 worktree 已删除（git worktree prune 已清理注册项）')
}

function createWorktree(sha, label) {
  mkdirSync(WORKTREES_DIR, { recursive: true })
  const dir = join(WORKTREES_DIR, `${label}-${shortSha(sha)}`)
  if (existsSync(dir)) {
    warn(`发现同名 worktree 残留（上次运行中断？）：${dir} —— 先安全删除再重建`)
    deleteWorktreeDir(dir)
    runGit(['worktree', 'prune'])
  }
  runGit(['worktree', 'add', '--detach', dir, sha])
  activeWorktrees.push({ dir, sha, label })
  info(`临时 worktree 已就绪：${dir}（detached at ${shortSha(sha)}）`)
  return dir
}

/**
 * worktree 内安装依赖 + 构建。
 * - `--frozen-lockfile`：用 commit 自带的 lockfile（被测代码的依赖原样）；
 * - `--prefer-offline`：优先用本机 pnpm store（同仓依赖通常已全在 store 里，实测十余秒）；
 * - 装完再显式 build 一次：老 commit 的 package.json 未必有 prepare 钩子，不赌它
 *   （有 prepare 的话这次只是幂等重跑）。
 */
function buildInWorktree(dir) {
  info('   在临时 worktree 安装依赖并构建（pnpm install --frozen-lockfile --prefer-offline → pnpm run build）……')
  runStep('pnpm', ['install', '--frozen-lockfile', '--prefer-offline'], dir)
  runStep('pnpm', ['run', 'build'], dir)
}

// ---------------------------------------------------------------------------
// registry 候选源注入（工作区 or worktree：同一份源码形态）
// ---------------------------------------------------------------------------

/** 注入/还原候选源首位（精确锚点替换；两态均可重入）。baseDir = 承载源码的目录根。 */
function patchRegistrySource(inject, baseDir = ROOT) {
  const sourcePath = join(baseDir, REGISTRY_SOURCE_RELATIVE_PATH)
  const where = baseDir === ROOT ? '工作区' : baseDir
  if (!existsSync(sourcePath)) {
    fail(`${baseDir} 下没有 ${REGISTRY_SOURCE_RELATIVE_PATH}——该代码树早于本地候选源机制，无法注入 Verdaccio 候选源`)
  }
  const source = readFileSync(sourcePath, 'utf8')
  const injected = source.includes('http://127.0.0.1:4873')
  if (inject && injected) { info(`registry-latest.ts 候选源已注入（${where}），跳过`); return }
  if (!inject && !injected) { info(`registry-latest.ts 候选源已是干净两源（${where}），跳过`); return }
  const next = inject
    ? source.replace(OFFICIAL_CANDIDATES, INJECTED_CANDIDATES)
    : source.replace(INJECTED_CANDIDATES, OFFICIAL_CANDIDATES)
  if (next === source) fail(`候选源锚点未命中——${sourcePath} 的 FALLBACK_REGISTRY_CANDIDATES 形态与预期不符，请人工检查`)
  writeFileSync(sourcePath, next)
  if (inject && baseDir === ROOT) workspaceDirty = true
  info(inject ? `已注入本地 Verdaccio 候选源（${where}）` : `已还原候选源为官方两源（${where}）`)
}

// ---------------------------------------------------------------------------
// Verdaccio 测试源
// ---------------------------------------------------------------------------

/**
 * 生成 htpasswd（test 用户）与发布用 npmrc。bcrypt 复用 verdaccio 依赖树里的
 * bcryptjs（verdaccio-htpasswd 的校验实现），不在 package.json 增加依赖。
 *
 * 两个资产**各自独立判断**：npmrc 无条件重写（确定性生成、极小）——曾因
 * 「htpasswd 已存在 → 早退」把 npmrc 生成一起跳过，导致 --userconfig 指向
 * 不存在的文件、npm 静默视为无凭据（ENEEDAUTH）。
 */
function ensureAuthAssets() {
  if (existsSync(HTPASSWD_PATH) && readFileSync(HTPASSWD_PATH, 'utf8').startsWith(`${TEST_USER}:`)) {
    info('htpasswd 已存在（test 用户），跳过 seed')
  } else {
    const pnpmDir = join(ROOT, 'node_modules', '.pnpm')
    const bcryptDirEntry = readdirSync(pnpmDir).find(entry => entry.startsWith('bcryptjs@'))
    if (bcryptDirEntry === undefined) fail('node_modules/.pnpm 下找不到 bcryptjs——请先 pnpm install（verdaccio 依赖树自带）')
    const bcryptModulePath = join(pnpmDir, bcryptDirEntry, 'node_modules', 'bcryptjs')
    const require = createRequire(import.meta.url)
    const bcrypt = require(bcryptModulePath)
    const hash = bcrypt.hashSync(TEST_PASSWORD, 10)
    writeFileSync(HTPASSWD_PATH, `${TEST_USER}:${hash}\n`)
    info('htpasswd 已 seed（test 用户）')
  }

  const passwordBase64 = Buffer.from(TEST_PASSWORD, 'utf8').toString('base64')
  const registryHost = new URL(REGISTRY_URL).host
  writeFileSync(PUBLISH_NPMRC_PATH, [
    `registry=${REGISTRY_URL}/`,
    `//${registryHost}/:username = ${TEST_USER}`,
    `//${registryHost}/:_password = ${passwordBase64}`,
    '',
  ].join('\n'))
  info('发布用 npmrc 已就绪（.verdaccio-storage/publish.npmrc，git-ignored）')
}

function startVerdaccio() {
  const log = openSync(VERDACCIO_LOG_PATH, 'w')
  // DEP0190 规避：单条命令串（CONFIG_PATH 无空格）。
  const child = spawn(`verdaccio --config ${CONFIG_PATH}`, { cwd: ROOT, detached: true, stdio: ['ignore', log, log], shell: true })
  child.unref()
  info(`verdaccio 已后台启动（pid ${String(child.pid)}，日志 .verdaccio-storage/verdaccio.log）`)
  return child
}

function stopVerdaccio(child) {
  if (child === undefined || child.pid === undefined) return
  spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', shell: true })
  info('verdaccio 已停止')
}

async function waitForRegistry() {
  for (let attempt = 1; attempt <= 25; attempt += 1) {
    try {
      const response = await fetch(`${REGISTRY_URL}/`, { signal: AbortSignal.timeout(2_000) })
      if (response.ok) { info(`verdaccio 就绪（第 ${String(attempt)} 次探测）`); return }
    } catch { /* 未就绪，继续轮询 */ }
    await new Promise(resolve => setTimeout(resolve, 600))
  }
  fail('verdaccio 30s 内未就绪——查看 .verdaccio-storage/verdaccio.log')
}

// ---------------------------------------------------------------------------
// 打包 / 发布
// ---------------------------------------------------------------------------

/**
 * 在 cwd（工作区 or 临时 worktree）执行 npm pack --ignore-scripts（不触发 prepack
 * 构建；构建时机由流程显式控制）。--json 向 stdout 打印一个 JSON 数组（notice 走
 * stderr）；截取首个 '[' 到最后一个 ']'，容忍前后杂散行——不能只取最后一行
 * （pretty JSON 的末行恰是 ']'）。产物文件名须带期望版本（防止构建/版本号没生效）。
 */
function packTarball(cwd, expectedVersion) {
  const result = spawnSync(`npm pack --ignore-scripts --json --pack-destination ${STORAGE_DIR}`, { cwd, shell: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  if (result.status !== 0) fail(`npm pack 失败（exit ${String(result.status)}，cwd ${cwd}）：${result.stderr}`)
  const stdout = result.stdout
  const start = stdout.indexOf('[')
  const end = stdout.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) fail(`npm pack --json 输出不含 JSON 数组：${stdout.slice(0, 200)}`)
  const packed = JSON.parse(stdout.slice(start, end + 1))
  const filename = packed[0].filename
  if (!filename.endsWith(`-${expectedVersion}.tgz`)) {
    fail(`打包产物 ${filename} 与期望版本 ${expectedVersion} 不符——构建或版本号没有生效？`)
  }
  info(`已打包 ${filename}`)
  return { tarballPath: join(STORAGE_DIR, filename), filename }
}

/** 反发布整个包（容忍失败——首次发布时 404 属预期）。整包清空让 latest dist-tag
 * 跟随本阶段发布的版本：verdaccio storage 跨运行保留旧的高版本时，隐式下调
 * latest 会被 npm 拒绝（实测报「Cannot implicitly apply the "latest" tag」）。 */
function resetPackageOnRegistry(pkgName) {
  spawnSync(`npm unpublish ${pkgName} --registry ${REGISTRY_URL} --userconfig ${PUBLISH_NPMRC_PATH} --force`, { cwd: ROOT, stdio: ['ignore', 'ignore', 'ignore'], shell: true })
}

function publishTarball(pkgName, tarballPath) {
  resetPackageOnRegistry(pkgName)
  // --tag latest 显式声明（错误信息给的正解）：整包清空后 latest 落在本版本。
  runStep('npm', ['publish', tarballPath, '--tag', 'latest', '--registry', REGISTRY_URL, '--userconfig', PUBLISH_NPMRC_PATH])
}

async function verifyLatest(pkgName, version) {
  const latest = await (await fetch(`${REGISTRY_URL}/${encodeURIComponent(pkgName)}/latest`, { signal: AbortSignal.timeout(5_000) })).json()
  if (latest.version !== version) fail(`发布后 /latest = ${String(latest.version)}，期望 ${version}`)
  info(`Verdaccio /latest = ${version} ✓`)
}

/** 启动 Verdaccio → 发布 → 校验 /latest（两模式共用的一段）。 */
async function publishAndVerify(pkgName, tarballPath, version, stepLabel) {
  info(`${stepLabel} 启动 Verdaccio 并发布 ${version}……`)
  activeVerdaccioChild = startVerdaccio()
  await waitForRegistry()
  publishTarball(pkgName, tarballPath)
  await verifyLatest(pkgName, version)
}

/** 停掉当前 Verdaccio 并清空句柄（下一阶段会重新启动再发布）。 */
function stopVerdaccioForNextPhase() {
  stopVerdaccio(activeVerdaccioChild)
  activeVerdaccioChild = undefined
}

// ---------------------------------------------------------------------------
// 桌面 profile 残留清理
// ---------------------------------------------------------------------------

/**
 * 清理桌面 profile 里文件夹形式安装的残留副本——npm 源安装要求目标不存在或
 * 版本可覆盖，链接残留会让安装失败。
 * - 链接安装（dsh plugin add <dir>）留下 junction/symlink：只删链接本身，绝不
 *   递归进目标（目标是工作区源码）；
 * - 实体目录（复制安装）：递归删除。
 * 硬校验：只允许操作 desktop profile node_modules 下、以包名结尾的目录。
 */
function removeLegacyInstallDir(pkgName) {
  const allowedRoot = join(DESKTOP_NODE_MODULES)
  const legacyDir = join(DESKTOP_NODE_MODULES, pkgName)
  if (!existsSync(legacyDir)) { info(`残留检查：${legacyDir} 不存在，跳过清理`); return }
  if (!legacyDir.toLowerCase().startsWith(allowedRoot.toLowerCase() + '\\')) {
    fail(`安全校验失败：待清理路径 ${legacyDir} 不在 ${allowedRoot} 之下，拒绝删除`)
  }
  const stats = lstatSync(legacyDir)
  if (stats.isSymbolicLink()) {
    // 链接安装残留：cmd rmdir 不带 /s 删除链接本身，不进目标。
    spawnSync('cmd', ['/c', 'rmdir', legacyDir], { stdio: 'ignore' })
    info(`已删除链接安装残留（仅删链接，工作区目标不受影响）：${legacyDir}`)
    return
  }
  rmSync(legacyDir, { recursive: true, force: true })
  info(`已删除实体安装残留：${legacyDir}`)
}

// ---------------------------------------------------------------------------
// 还原（默认行为：正常/出错/Ctrl+C 都执行）
// ---------------------------------------------------------------------------

/** 统一还原出口：模式感知。
 * - bump 模式：候选源回官方两源 + 版本号回滚（如有状态）+ 重建（工作区被改过才做）+ 停 Verdaccio；
 * - commit 模式：删临时 worktree（工作区自始至终未被改动，故不还原、不重建）+ 停 Verdaccio。 */
function revertAll() {
  if (activeMode === 'commit') {
    removeWorktrees()
  } else {
    patchRegistrySource(false)
    restoreVersionIfBumped()
    if (workspaceDirty) runStep('pnpm', ['run', 'build'])
  }
  stopVerdaccio(activeVerdaccioChild)
}

/** 还原守卫：任何退出路径（正常/出错/中断）只执行一次。 */
function revertOnce() {
  if (reverted) return
  reverted = true
  revertAll()
}

process.on('SIGINT', () => {
  console.error('[test-version-bump] 收到 Ctrl+C——自动执行还原后退出。')
  revertOnce()
  process.exit(130)
})
process.on('SIGTERM', () => {
  console.error('[test-version-bump] 收到 SIGTERM——自动执行还原后退出。')
  revertOnce()
  process.exit(130)
})

// ---------------------------------------------------------------------------
// 测试计划（前置条件校验 + 版本判定；此阶段**零副作用**，不成立就直接退出）
// ---------------------------------------------------------------------------

/** 解析命令行给的 commit ref，解析不了就报错（含修复建议）。 */
function requireCommit(ref, label) {
  const sha = resolveCommit(ref)
  if (sha === null) fail(`${label} 无法解析为 commit："${ref}"——请检查 sha/分支名，或用 git log 确认`)
  info(`${label} = ${describeCommit(sha)}`)
  return sha
}

/** bump 模式：版本 A = 工作区当前版本，版本 B = A 的 patch+1。 */
function planBumpMode() {
  const manifest = readManifest()
  const versionA = manifest.version
  const versionB = nextVersion(versionA)
  info(`当前版本 ${versionA}；测试流程：Verdaccio 发布 ${versionA} → 你安装（新装插件，不用重启）→ bump 到 ${versionB} 构建并发布 → 卸载后安装新版本（不重启）验证 stale → 还原`)
  return { mode: 'bump', pkgName: manifest.name, versionA, versionB }
}

/** commit 模式：版本 A/B 各自取自 commit a/b；version 相同时按规则临时 bump 版本 B。 */
async function planCommitMode(rl, options) {
  if (isWorkingTreeDirty()) {
    warn('工作区有未提交改动——commit 模式的两个版本都只取 commit 内容，未提交改动不会进入构建。')
  }

  const shaA = options.commitA !== null ? requireCommit(options.commitA, 'commit a') : await askCommitRef(rl, 'commit a（旧版本）')
  const shaB = options.commitB !== null ? requireCommit(options.commitB, 'commit b') : await askCommitRef(rl, 'commit b（新版本）')

  const manifestA = commitManifest(shaA, 'a')
  const manifestB = commitManifest(shaB, 'b')
  if (manifestA.name !== manifestB.name) {
    fail(`两个 commit 是不同包的代码（a: ${manifestA.name}，b: ${manifestB.name}）——commit 模式要求同包的两个版本`)
  }
  const pkgName = manifestA.name
  let versionB = manifestB.version
  let bumped = false

  if (manifestA.version === manifestB.version) {
    const headSha = currentHeadSha()
    if (shaB !== headSha) {
      throw new PreconditionError([
        `commit a = ${describeCommit(shaA)}｜version ${manifestA.version}`,
        `commit b = ${describeCommit(shaB)}｜version ${manifestB.version}`,
        `当前 HEAD = ${describeCommit(headSha)}`,
      ].join('\n'))
    }
    versionB = nextVersion(manifestA.version)
    bumped = true
  }

  info(`版本 A = ${manifestA.version}（commit a：${describeCommit(shaA)}）`)
  info(`版本 B = ${versionB}（commit b：${describeCommit(shaB)}）${bumped ? `——b 与 a 版本相同（${manifestA.version}），且 b 是当前最新提交，故在 b 的临时 worktree 里把版本 patch+1 作为新版本（不提交，随 worktree 丢弃）` : ''}`)
  info(`包名 ${pkgName}；两个版本都在 .verdaccio-storage/worktrees/ 下的临时 worktree 里构建，工作区不被触碰。`)
  if (compareVersions(versionB, manifestA.version) <= 0) {
    warn(`版本 B（${versionB}）不大于版本 A（${manifestA.version}）——latest ≤ running，available 更新弹窗不会出现（可用于降级场景验证）。`)
  }
  return { mode: 'commit', pkgName, versionA: manifestA.version, versionB, shaA, shaB, bumped }
}

// ---------------------------------------------------------------------------
// 两种模式的执行流程（① 准备 → … → ⑩ 还原提示）
// ---------------------------------------------------------------------------

/** ①② 共用：卸载 → 重启 dsh → 清理文件夹安装残留（文件夹副本不参与本测试）。 */
async function phasePrepare(rl, pkgName) {
  info('① 测试准备：请先在 dsh 插件页卸载本插件（文件夹形式安装/仍在运行的话）→ **重启 dsh**；')
  await rl.question('   重启完成后按回车，脚本将清理桌面 profile 里的文件夹安装残留……')
  removeLegacyInstallDir(pkgName)
}

async function runBumpMode(rl, plan) {
  const { pkgName, versionA, versionB } = plan

  await phasePrepare(rl, pkgName)

  // ---- Phase 1：当前版本 → 构建并发布到 Verdaccio → 用户经 npm 源安装 ----
  info('② 注入本地候选源并构建（烧录进 host 半）……')
  patchRegistrySource(true)
  runStep('pnpm', ['run', 'build'])
  const pack1 = packTarball(ROOT, versionA)

  await publishAndVerify(pkgName, pack1.tarballPath, versionA, '③')

  info(`④ 请到 dsh 插件添加页：选择自定义 npm 源并填入 ${REGISTRY_URL}/ → 安装 ${pkgName}@${versionA} → **新装插件，不用重启 dsh**（装完 host 半即加载这份带本地候选源的构建）……`)
  await rl.question('   安装完成后按回车，脚本将停止 Verdaccio 并进入 bump 阶段……')
  // 用户明确要求：安装完毕后结束当前 Verdaccio（下一阶段重新启动再发布）。
  stopVerdaccioForNextPhase()

  // ---- Phase 2：bump + build + 发布新版本 → 用户安装（不重启）→ stale ----
  info(`⑤ bump version ${versionA} → ${versionB}，并重新构建（client 烧录 BUILD_VERSION=${versionB}；dsh 内副本是 verdaccio 安装的复制品，不受 workspace 构建影响，无 client-hmr 干扰）……`)
  bumpVersion(versionB)
  recordBumpState(versionA, versionB)
  workspaceDirty = true
  runStep('pnpm', ['run', 'build'])
  const pack2 = packTarball(ROOT, versionB)

  await publishAndVerify(pkgName, pack2.tarballPath, versionB, '⑥')

  info(`⑦ 现在可去 dsh 测试 available：到「插件」页把本插件的启动/关闭开关点一次（该操作会跑一次检查更新）→ latest ${versionB} > running ${versionA} → available 更新弹窗（此刻 client 仍 ${versionA}、无 mismatch，陈旧对话框不触发，只有这一个弹窗）。`)
  await rl.question('⑧ available 验证完成后按回车：先卸载本插件、再安装新版本以验证 stale（**不重启**）……')

  info(`⑨ 请到「插件」页本插件的详情页：先**卸载**本插件，再经自定义 npm 源**安装** ${pkgName}@${versionB} → **不重启 dsh** →`)
  info(`   预期：danger 陈旧对话框弹出（running ${versionA} ≠ client BUILD_VERSION ${versionB}），`)
  info('   且 available 更新弹窗被 stale 优先抑制（只弹陈旧一个）→ 两次提醒语义可验；')
  info('   重启 dsh → 版本一致 → 对话框消失。')
  await rl.question('⑩ stale 验证完成后按回车，脚本将自动还原（候选源回官方两源 + 版本号回滚 + 重建 + 停 Verdaccio）……')
}

async function runCommitMode(rl, plan) {
  const { pkgName, versionA, versionB, shaA, shaB, bumped } = plan

  await phasePrepare(rl, pkgName)

  // ---- Phase 1：commit a 的代码 → 版本 A → 发布 → 用户安装（新装，不必重启） ----
  info('② 构建版本 A：临时 worktree（工作区不被触碰）→ 注入本地候选源 → 安装依赖并构建 → 打包……')
  const worktreeA = createWorktree(shaA, 'a')
  patchRegistrySource(true, worktreeA)
  buildInWorktree(worktreeA)
  const pack1 = packTarball(worktreeA, versionA)

  await publishAndVerify(pkgName, pack1.tarballPath, versionA, '③')

  info(`④ 请到 dsh 插件添加页：选择自定义 npm 源并填入 ${REGISTRY_URL}/ → 安装 ${pkgName}@${versionA} → **新装插件，不用重启 dsh**（装完 host 半即加载这份带本地候选源的构建）……`)
  await rl.question('   安装完成后按回车，脚本将停止 Verdaccio 并进入版本 B 阶段……')
  stopVerdaccioForNextPhase()

  // ---- Phase 2：commit b 的代码（必要时临时 bump 版本）→ 版本 B → 发布 → 不重启安装 → stale ----
  info(`⑤ 构建版本 B${bumped ? `：b 与 a 的版本相同（${versionA}），在 b 的 worktree 里把版本临时 bump 到 ${versionB}（只改工作文件、不提交，随 worktree 一起丢弃）` : `（commit b 自带版本 ${versionB}）`}……`)
  const worktreeB = createWorktree(shaB, 'b')
  patchRegistrySource(true, worktreeB)
  if (bumped) bumpVersion(versionB, worktreeB)
  buildInWorktree(worktreeB)
  const pack2 = packTarball(worktreeB, versionB)

  await publishAndVerify(pkgName, pack2.tarballPath, versionB, '⑥')

  info(`⑦ 现在可去 dsh 测试 available：到「插件」页把本插件的启动/关闭开关点一次（该操作会跑一次检查更新）→ latest ${versionB} > running ${versionA} → available 更新弹窗（此刻 client 仍 ${versionA}、无 mismatch，陈旧对话框不触发，只有这一个弹窗）。`)
  await rl.question('⑧ available 验证完成后按回车：先卸载本插件、再安装版本 B 以验证 stale（**不重启**）……')

  info(`⑨ 请到「插件」页本插件的详情页：先**卸载**本插件，再经自定义 npm 源**安装** ${pkgName}@${versionB} → **不重启 dsh** →`)
  info(`   预期：danger 陈旧对话框弹出（running ${versionA} ≠ client BUILD_VERSION ${versionB}），`)
  info('   且 available 更新弹窗被 stale 优先抑制（只弹陈旧一个）→ 两次提醒语义可验；')
  info('   重启 dsh → 版本一致 → 对话框消失。')
  await rl.question('⑩ stale 验证完成后按回车，脚本将自动还原（删除临时 worktree + 停 Verdaccio；工作区自始至终未被改动）……')
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) { console.log(USAGE); return }

  const rl = readline.createInterface({ input, output })
  try {
    activeMode = await resolveMode(rl, options)
    // 计划阶段零副作用：前置条件不成立（commit 模式的「版本相同且 b 非最新提交」）在此直接退出。
    const plan = activeMode === 'commit' ? await planCommitMode(rl, options) : planBumpMode()

    mkdirSync(STORAGE_DIR, { recursive: true })
    writeFileSync(CONFIG_PATH, VERDACCIO_CONFIG)
    ensureAuthAssets()

    if (plan.mode === 'commit') await runCommitMode(rl, plan)
    else await runBumpMode(rl, plan)
  } finally {
    // 还原是默认行为：正常结束、出错、Ctrl+C（SIGINT 走上方 handler）一律执行。
    revertOnce()
    rl.close()
  }

  if (activeMode === 'commit') {
    info(`收尾：到 dsh 卸载测试版本 → 重装当前版本（${ROOT_DISPLAY}）→ 重启。工作区与版本号均未被本脚本改动。`)
  } else {
    info(`收尾：到 dsh 卸载测试版本 → 重装当前版本（${ROOT_DISPLAY}）→ 重启（还原后的构建就是当前版本）。`)
  }
}

main().catch((error) => {
  if (error instanceof PreconditionError) {
    const detail = error.message.split('\n').filter(line => line !== '')
    warnBlock([
      '警告：commit 模式的前置条件不成立，脚本已直接退出（未做任何改动）。',
      '',
      ...detail,
      '',
      'a 与 b 的 package.json version 相同 → 构不成「版本 bump」对比；而 b 又不是当前最新',
      '提交（HEAD）→ 给一个非尖端提交凭空造版本号会与实际发布线脱节，没有可测语义。',
      '只有 b 恰为最新提交时，脚本才会把 b 的版本临时 patch+1 作为新版本（只改 worktree',
      '里的工作文件、不提交，随临时 worktree 一起丢弃）。',
      '',
      '请任选其一后重试：',
      '  ① 让 commit b 成为最新提交：git checkout <commit b>（或把 b 合并/rebase 到当前分支）；',
      '  ② 改用 bump 模式：pnpm test-version-bump --mode bump（工作区当前版本 → patch+1）。',
    ])
    process.exit(EXIT_PRECONDITION)
  }
  console.error('[test-version-bump] 异常终止：', error instanceof Error ? error.message : String(error))
  console.error('[test-version-bump] 退出前已自动执行还原；若还原中的构建失败，请手动 `pnpm run build`，commit 模式另需 `git worktree list` 确认临时 worktree 已清理。')
  process.exit(1)
})
