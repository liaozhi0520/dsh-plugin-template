/**
 * 离线冒烟（零费用、零真机，node scripts/smoke-offline.mjs）：
 * 0)  入口隔离（两段式入口回归护栏）+ exports 形状 + lib/main.js 产出；
 * 0b) 入口图白名单（静态遍历 lib/index.js 的相对 import 图，逐文件过审）；
 * 0c) 客户端配置页 key 守护：lib/client.js 的 plugins.bundle.config 注册 key
 *     与模块加载器 banner 的 bundle id 都必须逐字等于 package.json 的 name
 *     （写错 = 「插件」页配置区静默不出现，keyed 槽位不匹配无报错）；
 * 0d) 【已退役，编号留空】原「陈旧代码防护构建面守护」——0.2.1 起 StaleBanner +
 *     BUILD_VERSION 整体拆除（上游已修：卸载重装不重启由 harness 自行驱逐旧
 *     模块，2026-10-19 真机确认），不要再加回来；
 * 0g) 包显示元数据守护：locale/{zh,en}.json（gen-version.mjs 生成）的 title
 *     与 locales.ts 词典同源、description 非空且携带当前 [MIN,MAX] 兼容窗口，
 *     meta.detail 已声明且指向存在的 Markdown（0.2.2 插件页详情区）；
 * 6a) 版本门禁桌面单锚（临时目录树复现 desktop spawn 形态：argv[2] = runtimeDir
 *     → runtime 内 @deepseek-ai/dsh；锚点落空 / 包身份不符 → 抛错）；
 * 6f) 无更新状态机产物（0.2.2 起方案 A：update-state / registry-latest 与
 *     为「运行中代码版本」口径服务的 package-info 一并删除）；
 * 7)  无更新提示契约：两 RPC / 状态机 / updateSelf 在 host + client 双侧零残留、
 *     产物零出网、json-body 防御工具保留。
 */
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { register } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveHarnessVersion } from '../lib/version-gate.js'

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
    `entry exports: inject = [${(entry.inject ?? []).join(', ')}]（不含 pluginManager——0.8.0 起自更新通道已删，0.2.2 起连版本提示也不做）`,
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
//     【0.2.2 起】soft-disable 不再回显插件版本，package-info.js 退出入口图。
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
// 0d) 【已退役，编号留空】陈旧代码防护的构建面守护（package.json version /
//     src/client/build-version.ts / lib/client.js 内嵌 BUILD_VERSION 三处一致）。
//     0.2.1 起该防护（StaleBanner + BUILD_VERSION）随上游修复整体拆除——卸载
//     → 重装不重启由 harness 自行驱逐旧模块，2026-10-19 真机复核确认；取证见
//     docs/harness-defect-workarounds.md 的历史防护回退块。**不要再加回来**。
//     编号保留空位只为不打乱 0g 等既有引用。
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 0g) 包显示元数据守护：locale/{zh,en}.json 是「插件」页卡片静态读取的显示
//     文本（官方 host-plugin.md 契约）——title 必须与 src/client/locales.ts
//     词典同源、description 非空且携带当前 [MIN,MAX] 兼容窗口；0.2.2 插件页
//     详情区要求 meta.detail 已声明且指向存在的 Markdown（缺省会回退渲染包内
//     README，那是开发者文档）。
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
      const description = typeof meta?.meta?.description === 'string' ? meta.meta.description : ''
      check(
        `locale meta: locale/${lang}.json description 非空且携带兼容窗口 ${minMatch[1]} ~ ${maxMatch[1]}`,
        description !== '' && description.includes(minMatch[1]) && description.includes(maxMatch[1]),
      )
      // 0.2.2 插件页详情区：声明 meta.detail 时渲染我们自己的文档；不声明会
      // 回退渲染包内 README（开发者文档，不应出现在插件页）。
      const detail = typeof meta?.meta?.detail === 'string' ? meta.meta.detail : ''
      check(`locale meta: locale/${lang}.json 声明 meta.detail（${detail}）`, detail !== '')
      check(
        `locale meta: meta.detail 是包内相对子目录的 Markdown`,
        detail.endsWith('.md') && detail.includes('/') && !detail.startsWith('/') && !detail.includes('..'),
      )
      if (detail !== '' && detail.endsWith('.md')) {
        check(
          `locale meta: meta.detail 指向的文件存在（${detail}）`,
          existsSync(new URL(`../${detail}`, import.meta.url)),
        )
      }
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
    writeFileSync(manifestPath, JSON.stringify({ name: '@deepseek-ai/dsh', version: '0.2.2-rc.1' }))
    const resolved = resolveHarnessVersion(['node', 'lib/index.js', runtimeDir])
    check(
      `version anchor: argv[2]=runtimeDir → ${resolved.version}（anchor ${resolved.anchor}）`,
      resolved.version === '0.2.2-rc.1' && resolved.anchor === `desktop:${manifestPath}`,
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
// 6f) 无更新状态机产物。【0.2.2 起】方案 A 删除了 update-state 四相状态机、
//     registry-latest 查询与 update-contract 契约；`src/package-info.ts` 原为
//     「运行中代码版本 / 陈旧检测」口径服务，两者退役后已无调用方，一并删除
//     （tsconfig.build.json 只从 src/index.ts 入口图编译，无引用模块不产出 lib）。
//     旧「StaleBanner 严格不等」判定契约随 0d 一起退役（见 0d）。
//     注意：迁移时若不清空 lib/，tsc 不会删除已消失源文件的旧产物，会让这些
//     断言误报，也会把陈旧产物打进发布包（files 含 lib）——务必先清空 lib 再 build。
// ---------------------------------------------------------------------------
{
  check(
    'no update notices: lib/update-state.js 不存在（四相状态机已删）',
    !existsSync(new URL('../lib/update-state.js', import.meta.url)),
  )
  check(
    'no update notices: lib/shared/registry-latest.js 不存在（registry 查询已删）',
    !existsSync(new URL('../lib/shared/registry-latest.js', import.meta.url)),
  )
  check(
    'no update notices: lib/shared/update-contract.js 不存在（更新契约已删）',
    !existsSync(new URL('../lib/shared/update-contract.js', import.meta.url)),
  )
  check(
    'no update notices: lib/package-info.js 不存在（求值期缓存口径已退役）',
    !existsSync(new URL('../lib/package-info.js', import.meta.url)),
  )
}

// ---------------------------------------------------------------------------
// 7) 无更新提示契约（0.2.2 起方案 A）：插件不查 registry、不做任何更新提醒。
//    host 端点表只剩 ping / getConfig / saveConfig；client 无 overlay 条目、
//    无更新端点、无 updateSelf；产物零出网；json-body 防御工具保留。
// ---------------------------------------------------------------------------
{
  const remoteSource = readFileSync(new URL('../lib/remote.js', import.meta.url), 'utf8')
  const clientSource = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  const mainSource = readFileSync(new URL('../lib/main.js', import.meta.url), 'utf8')

  check(
    'no update notices: lib/remote.js 无 checkUpdate / getUpdateState / updateSelf',
    !/checkUpdate|getUpdateState|updateSelf/u.test(remoteSource),
  )
  check(
    'no update notices: lib/remote.js 描述符表只剩三个业务端点',
    ["['ping', ['request']]", "['getConfig', []]", "['saveConfig', ['request']]"]
      .every(literal => remoteSource.includes(literal)),
  )
  check('no update notices: lib/main.js 无 startUpdateCheck', !mainSource.includes('startUpdateCheck'))
  check(
    'no update notices: lib/client.js 无更新端点 / shell.overlay / updateSelf',
    !/checkUpdate|getUpdateState|updateSelf|shell\.overlay/u.test(clientSource),
  )
  check(
    'no update notices: lib/client.js 仍注册 plugins.bundle.config（正常 + 停用两路）',
    clientSource.includes('plugins.bundle.config'),
  )

  // 插件零出网：host 侧全部产物不得出现 fetch( 调用（client bundle 内含 React，
  // 不做全局 fetch( 扫描；其更新面已由上两条逐字守护）。
  const hostArtifacts = [
    'lib/index.js',
    'lib/main.js',
    'lib/remote.js',
    'lib/soft-disable.js',
    'lib/version-gate.js',
    'lib/shared/contract.js',
    'lib/shared/disabled-flag.js',
    'lib/shared/version-compare.js',
  ]
  const outbound = hostArtifacts.filter((rel) => {
    const url = new URL(`../${rel}`, import.meta.url)
    return existsSync(url) && readFileSync(url, 'utf8').includes('fetch(')
  })
  check(
    `no update notices: host 产物零出网（无 fetch(）${outbound.length > 0 ? `——命中：${outbound.join('、')}` : ''}`,
    outbound.length === 0,
  )

  // 缺陷① 的防御工具保留：将来 host 侧重新读网络 JSON 时必须走 readJsonBody。
  const jsonBodyUrl = new URL('../src/shared/json-body.ts', import.meta.url)
  check(
    'json-body 保留 readJsonBody（缺陷① 未修，保留作防御工具）',
    existsSync(jsonBodyUrl) && readFileSync(jsonBodyUrl, 'utf8').includes('export async function readJsonBody'),
  )
}

console.log(failed === 0 ? '\nALL PASSED' : `\n${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
