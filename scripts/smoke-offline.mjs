/**
 * 离线冒烟（零费用、零真机，node scripts/smoke-offline.mjs）：
 * 0)  入口隔离（两段式入口回归护栏）+ exports 形状 + lib/main.js 产出；
 * 0b) 入口图白名单（静态遍历 lib/index.js 的相对 import 图，逐文件过审）；
 * 0c) 客户端配置页 key 守护：lib/client.js 的 plugins.bundle.config 注册 key
 *     与模块加载器 banner 的 bundle id 都必须逐字等于 package.json 的 name
 *     （写错 = 「插件」页配置区静默不出现，keyed 槽位不匹配无报错）；
 * 0d) 陈旧代码防护构建面守护：src/client/build-version.ts（gen-version.mjs 生成）
 *     与 lib/client.js 内嵌串、package.json version 三者一致；
 * 0g) 包显示元数据守护：locale/{zh,en}.json（gen-version.mjs 生成）的 title
 *     与 locales.ts 词典同源、description 携带当前 [MIN,MAX] 兼容窗口；
 * 6a) 版本门禁桌面单锚（临时目录树复现 desktop spawn 形态：argv[2] = runtimeDir
 *     → runtime 内 @deepseek-ai/dsh；锚点落空 / 包身份不符 → 抛错）；
 * 6f) package-info 求值期缓存（陈旧代码防护的 host 半事实源）+ update-state
 *     四相状态机（stub registry：available / up-to-date / 启动静默失败 / 手动
 *     检查内联报错）+ StaleBanner/GlobalNotice 严格不等契约钉子（无豁免分支）；
 * 7)  自更新退役契约：checkUpdate/getUpdateState 在位，updateSelf 通道零残留
 *     （host 端点表与 client bundle 双侧钉死）。
 */
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { register } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveHarnessVersion } from '../lib/version-gate.js'
import { getUpdateMachineState, startUpdateCheck } from '../lib/update-state.js'
import { selfPackageInfo } from '../lib/package-info.js'

let failed = 0
function check(label, ok) {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}`)
  if (!ok) failed += 1
}

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

// ---------------------------------------------------------------------------
// 0) 入口隔离（两段式入口的回归护栏）：挂 resolve 钩子拦截 @deepseek-ai/dsh* 的
//    运行时解析，再 import 薄门禁入口——钩子抛错即 FAIL，import 全绿即 PASS。
//    顺带断言入口 exports 形状与 lib/main.js 产出（tsc 须跟随动态 import）。
// ---------------------------------------------------------------------------
try {
  await register('./entry-guard-hook.mjs', import.meta.url)
  const entry = await import('../lib/index.js')
  check('entry isolation: lib/index.js 静态图无 @deepseek-ai/dsh* 运行时依赖', true)
  // 期望的 cordis 插件名（短 id）从 cordis.patch.yml 的 id 字段取（改名表 ② 的
  // 唯一来源）——衍生插件改名后本守护不破，反而变成「cordis id ↔ 构建产物」
  // 的交叉校验（patch 里 id 写错 / lib 没重建都会在这里现形）。
  const patchSource = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  const patchId = patchSource.match(/^\s*-\s*id:\s*(\S+)\s*$/m)?.[1] ?? ''
  check(`rename: cordis.patch.yml 的 id 字段可提取（${patchId}）`, patchId !== '')
  check(`entry exports: name = ${entry.name}（= cordis.patch.yml id）`, entry.name === patchId)
  // schemastery v3 的 schema 实例是可调用函数（schema(data) 即校验），不是 object。
  check('entry exports: Config schema（schemastery 可调用 schema）', typeof entry.Config === 'function')
  check(
    `entry exports: inject = [${(entry.inject ?? []).join(', ')}]（不含 pluginManager——0.8.0 范式起自更新通道已删）`,
    Array.isArray(entry.inject) && entry.inject.length === 3 && !entry.inject.includes('pluginManager'),
  )
  check('entry exports: apply 为函数', typeof entry.apply === 'function')
  check('lib/main.js 已产出（tsc 跟随动态 import）', existsSync(new URL('../lib/main.js', import.meta.url)))
} catch (error) {
  check(
    `entry isolation: lib/index.js 静态图无 @deepseek-ai/dsh* 运行时依赖`
    + `（${error instanceof Error ? error.message : String(error)}）`,
    false,
  )
}

// ---------------------------------------------------------------------------
// 0b) 入口图白名单：薄门禁入口的「最小依赖面」不只是「无 dsh-*」，而是**逐文件
//     过审**——图内每个模块与每个裸依赖都必须在白名单里，往入口图加任何 import
//     都会显式破冒烟。（运行时拦截见上面钩子；本节是结构守护，两者互补。）
// ---------------------------------------------------------------------------
{
  const { fileURLToPath } = await import('node:url')
  const { relative: pathRelative, sep: pathSep } = await import('node:path')
  const libDir = fileURLToPath(new URL('../lib/', import.meta.url))
  // 允许进薄入口图的全部模块（相对 lib 根；改动本集合 = 显式的依赖面变更）。
  const ALLOWED_MODULES = new Set([
    'index.js',
    'spec.js', // Config 导出（schemastery 不可约，见 src/index.ts 头注释）
    'profile-gate.js',
    'soft-disable.js',
    'version-gate.js',
    'package-info.js',
    'shared/disabled-flag.js',
    'shared/version-compare.js',
  ])
  // 允许的裸依赖（node: 内建不受限）。
  const ALLOWED_BARE = new Set(['@deepseek-ai/schemastery'])
  const seenModules = new Set()
  const seenBare = new Set()
  const queue = ['index.js']
  while (queue.length > 0) {
    const rel = queue.pop()
    if (seenModules.has(rel)) continue
    seenModules.add(rel)
    const source = readFileSync(new URL(rel, new URL('../lib/', import.meta.url)), 'utf8')
    for (const match of source.matchAll(/(?:^|[\s;}])(?:from|import)\s*['"]([^'"]+)['"]/g)) {
      const specifier = match[1]
      if (specifier.startsWith('.')) {
        const resolved = pathRelative(libDir, fileURLToPath(new URL(specifier, new URL(rel, new URL('../lib/', import.meta.url)))))
        queue.push(resolved.split(pathSep).join('/'))
      } else if (!specifier.startsWith('node:')) {
        seenBare.add(specifier)
      }
    }
  }
  const modulesOff = [...seenModules].filter((mod) => !ALLOWED_MODULES.has(mod))
  check(
    `entry graph: 相对模块全部在白名单（共 ${String(seenModules.size)} 个）${modulesOff.length > 0 ? `——越界：${modulesOff.join('、')}` : ''}`,
    modulesOff.length === 0,
  )
  const bareOff = [...seenBare].filter((dep) => !ALLOWED_BARE.has(dep))
  check(
    `entry graph: 裸依赖 ⊆ {schemastery}${bareOff.length > 0 ? `——越界：${bareOff.join('、')}` : ''}`,
    bareOff.length === 0,
  )
}

// ---------------------------------------------------------------------------
// 0c) 客户端配置页 key 守护（keyed 槽位按 pkg.name 匹配，不匹配既不渲染也不
//     报错）：lib/client.js 内的 BUNDLE_KEY 硬编码与 banner bundle id 都与包
//     清单钉在一起（常量来源 src/client/bundle-key.ts）。
// ---------------------------------------------------------------------------
{
  const clientSource = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  const idBanner = new RegExp(`window\\.__ModuleLoader__\\.load\\(\\{\\s*id:\\s*"${manifest.name}"`)
  check(
    `client config page: bundle id = ${manifest.name}（tsdown banner 的 __ModuleLoader__ id）`,
    idBanner.test(clientSource),
  )
  // rolldown 打包会对跨模块常量做去重改名（BUNDLE_KEY$1），守护钉「常量声明 =
  // 包名」的语义而非字面声明形态。
  check(
    `client config page: plugins.bundle.config key = ${manifest.name}（BUNDLE_KEY 常量，容忍 rolldown 改名）`,
    new RegExp(`const\\s+BUNDLE_KEY[\\w$]*\\s*=\\s*"${manifest.name}"`).test(clientSource),
  )
}

// ---------------------------------------------------------------------------
// 0d) 陈旧代码防护的构建面守护：package.json version / src/client/build-version.ts
//     / lib/client.js 内嵌串三者一致。发版 bump version 后跑一次 build 即全量
//     重生成；漏跑 = 本节 FAIL（0.8.6 真实踩坑形态，pre-commit 是其快速闸门）。
// ---------------------------------------------------------------------------
{
  const buildVersionSource = readFileSync(new URL('../src/client/build-version.ts', import.meta.url), 'utf8')
  check(
    `build-version: src/client/build-version.ts 与包清单一致（${manifest.version}）`,
    buildVersionSource.includes(`export const BUILD_VERSION = ${JSON.stringify(manifest.version)}`),
  )
  const clientSource = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  check(
    'build-version: lib/client.js 内嵌 BUILD_VERSION（StaleBanner 陈旧判定基准）',
    clientSource.includes(JSON.stringify(manifest.version)),
  )
}

// ---------------------------------------------------------------------------
// 0g) 包显示元数据守护：locale/{zh,en}.json 是「插件」页卡片静态读取的显示
//     文本（官方 host-plugin.md 契约）——title 必须与 src/client/locales.ts
//     词典同源、description 必须携带当前 [MIN,MAX] 兼容窗口。
// ---------------------------------------------------------------------------
{
  const localeGateSource = readFileSync(new URL('../src/version-gate.ts', import.meta.url), 'utf8')
  const minMatch = localeGateSource.match(/export const MIN_HARNESS_VERSION = '([^']+)'/)
  const maxMatch = localeGateSource.match(/export const MAX_HARNESS_VERSION = '([^']+)'/)
  check('locale meta: version-gate 的 [MIN,MAX] 窗口常量可提取', minMatch !== null && maxMatch !== null)
  const localesSource = readFileSync(new URL('../src/client/locales.ts', import.meta.url), 'utf8')
  const titles = [...localesSource.matchAll(/(?:^|\n)\s*title: '([^']+)'/g)].map(match => match[1])
  check('locale meta: locales.ts 的 title 可提取且 zh/en 同值', titles.length > 0 && new Set(titles).size === 1)
  if (minMatch !== null && maxMatch !== null && titles.length > 0 && new Set(titles).size === 1) {
    for (const lang of ['zh', 'en']) {
      const localePath = new URL(`../locale/${lang}.json`, import.meta.url)
      const exists = existsSync(localePath)
      check(`locale meta: locale/${lang}.json 存在（gen-version 已跑）`, exists)
      if (!exists) continue
      const meta = JSON.parse(readFileSync(localePath, 'utf8'))
      check(
        `locale meta: locale/${lang}.json title 与词典同源（${titles[0]}）`,
        meta?.meta?.title === titles[0],
      )
      check(
        `locale meta: locale/${lang}.json description 携带兼容窗口 ${minMatch[1]} ~ ${maxMatch[1]}`,
        typeof meta?.meta?.description === 'string'
          && meta.meta.description.includes(minMatch[1])
          && meta.meta.description.includes(maxMatch[1]),
      )
    }
  }
}

// ---------------------------------------------------------------------------
// 6a) 版本门禁桌面单锚：临时目录树复现 desktop spawn 形态
//     （argv = [node, entry, runtimeDir] → <runtimeDir>/node_modules/@deepseek-ai/dsh）。
//     锚点落空 / 非 harness 包 / 缺 version 都必须抛错（软禁用文案可直出）。
// ---------------------------------------------------------------------------
{
  const tmp = mkdtempSync(join(tmpdir(), 'dsh-template-smoke-'))
  try {
    const runtimeDir = join(tmp, 'runtime')
    const dshDir = join(runtimeDir, 'node_modules', '@deepseek-ai', 'dsh')
    mkdirSync(dshDir, { recursive: true })
    const manifestPath = join(dshDir, 'package.json')
    writeFileSync(manifestPath, JSON.stringify({ name: '@deepseek-ai/dsh', version: '0.2.0-rc.2' }))
    const resolved = resolveHarnessVersion(['node', 'lib/index.js', runtimeDir])
    check(
      `version anchor: argv[2]=runtimeDir → ${resolved.version}（anchor ${resolved.anchor}）`,
      resolved.version === '0.2.0-rc.2' && resolved.anchor === `desktop:${manifestPath}`,
    )
    // 非 harness 包身份：name 校验兜底拒绝（防误读插件自身依赖副本）。
    writeFileSync(manifestPath, JSON.stringify({ name: '@evil/lookalike', version: '9.9.9' }))
    let identityError = ''
    try {
      resolveHarnessVersion(['node', 'lib/index.js', runtimeDir])
    } catch (error) {
      identityError = error instanceof Error ? error.message : String(error)
    }
    check('version anchor: 非 @deepseek-ai/dsh 包 → 抛错', identityError.includes('@deepseek-ai/dsh'))
    // 锚点落空：argv[2] 缺席 / 目录不存在 → 抛错。
    let missingError = ''
    try {
      resolveHarnessVersion(['node', 'lib/index.js', join(tmp, 'absent')])
    } catch (error) {
      missingError = error instanceof Error ? error.message : String(error)
    }
    check('version anchor: runtimeDir 不存在 → 抛错（文案指明仅支持桌面版）', missingError.includes('桌面版'))
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------------------
// 6f) package-info 求值期缓存 + update-state 四相状态机（stub registry）+
//     StaleBanner/GlobalNotice 严格不等契约钉子。
// ---------------------------------------------------------------------------
{
  // package-info：模块求值期一次性读自身包清单并缓存（= 正在运行的代码版本；
  // 推迟到首调才读会把重装后的磁盘新包谎报成运行版本，陈旧检测失明）。
  const info = selfPackageInfo()
  check(
    `package-info: selfPackageInfo = ${info.name}@${info.version}（求值期缓存 = 运行中自报版本）`,
    info.name === manifest.name && info.version === manifest.version,
  )

  // update-state：stub 全局 fetch 冒充 registry /latest，走完四相迁移。
  // （registry-latest 同构共享，client 停用面板自查走同一实现——这里一并覆盖
  // scoped 编码与 accept 头契约。）
  const seenRequests = []
  const realFetch = globalThis.fetch
  const stubManifest = (version) => new Response(JSON.stringify({ name: manifest.name, version, dist: { tarball: 'stub' } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
  const settle = async () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const snapshot = getUpdateMachineState()
      if (snapshot.phase !== 'checking') return snapshot
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    return getUpdateMachineState()
  }

  // ① available：latest > current → 弹窗提示卸载重装（无任何安装相位）。
  globalThis.fetch = async (url, init) => {
    seenRequests.push({ url: String(url), headers: new Headers(init?.headers) })
    return stubManifest('9.9.9')
  }
  startUpdateCheck(false)
  let snapshot = await settle()
  check(
    'update-state: latest 9.9.9 → available（currentVersion 恒自报口径）',
    snapshot.phase === 'available'
      && snapshot.latestVersion === '9.9.9'
      && snapshot.currentVersion === manifest.version
      && snapshot.errorMessage === null,
  )
  check(
    'registry-latest: scoped 包名 %2F 编码 + accept application/json + accept-encoding identity',
    seenRequests[0].url.includes(`${encodeURIComponent(manifest.name)}/latest`)
      && seenRequests[0].headers.get('accept') === 'application/json'
      && seenRequests[0].headers.get('accept-encoding') === 'identity',
  )

  // ② up-to-date：latest = current → 不弹窗。
  globalThis.fetch = async () => stubManifest(manifest.version)
  startUpdateCheck(true)
  snapshot = await settle()
  check('update-state: latest = current → up-to-date', snapshot.phase === 'up-to-date' && snapshot.errorMessage === null)

  // ③ 启动静默失败：回原相位、不填 errorMessage（不打扰纪律）；手动检查失败才内联。
  globalThis.fetch = async () => {
    throw new Error('network unreachable (stub)')
  }
  startUpdateCheck(false)
  snapshot = await settle()
  check(
    'update-state: 启动检查失败静默（回 up-to-date、errorMessage = null）',
    snapshot.phase === 'up-to-date' && snapshot.errorMessage === null,
  )
  startUpdateCheck(true)
  snapshot = await settle()
  check(
    'update-state: 手动检查失败内联报错（errorMessage 非 null）',
    snapshot.errorMessage !== null && snapshot.errorMessage.includes('network unreachable'),
  )
  globalThis.fetch = realFetch

  // ④ client 半契约钉子（源码级）：StaleBanner 严格不等、无豁免分支；
  //    GlobalNotice 在 stale 时让位（stale 优先）。
  const staleSource = readFileSync(new URL('../src/client/StaleBanner.tsx', import.meta.url), 'utf8')
  const noticeSource = readFileSync(new URL('../src/client/GlobalNotice.tsx', import.meta.url), 'utf8')
  check(
    'stale contract: StaleBanner 用严格不等比较 running ≠ BUILD_VERSION（无豁免分支）',
    staleSource.includes('runningVersion !== BUILD_VERSION') && !staleSource.includes('=== BUILD_VERSION'),
  )
  check(
    'stale contract: GlobalNotice stale 让位（available 弹窗被 stale 压制）',
    noticeSource.includes('&& !stale'),
  )
}

// ---------------------------------------------------------------------------
// 7) 自更新退役契约：host 端点表只剩 checkUpdate/getUpdateState（端点名保持，
//    兼容过渡窗口的旧 client），updateSelf 通道在 host 与 client 双侧零残留。
// ---------------------------------------------------------------------------
{
  const remoteSource = readFileSync(new URL('../lib/remote.js', import.meta.url), 'utf8')
  check(
    'retired channel: lib/remote.js 描述符表保留 checkUpdate/getUpdateState（id 由模板串拼接，钉方法名字面量）',
    remoteSource.includes("['checkUpdate', []]") && remoteSource.includes("['getUpdateState', []]"),
  )
  check('retired channel: lib/remote.js 无 updateSelf', !remoteSource.includes('updateSelf'))
  const clientSource = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  check('retired channel: lib/client.js 无 updateSelf', !clientSource.includes('updateSelf'))
}

console.log(failed === 0 ? '\nALL PASSED' : `\n${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
