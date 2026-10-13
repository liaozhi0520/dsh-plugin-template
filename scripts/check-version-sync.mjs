#!/usr/bin/env node
/**
 * 版本一致性快检（无构建、纯比对，~50ms）——专治「bump 了 package.json 的
 * version，却忘了跑构建」这一类提交（0.8.6 真实踩坑：version 已是 0.8.6，
 * `src/client/build-version.ts` 还停在 0.8.5 就提交并推送了）。
 *
 * 为什么必须一致（三处事实源）：
 * ① `src/client/build-version.ts` 的 BUILD_VERSION 由 `scripts/gen-version.mjs`
 *    在 build 链首步按 package.json 的 version 烧录；
 * ② host 半的 currentVersion 是**运行中模块自报的 package.json 版本**
 *    （`src/package-info.ts` 模块求值期缓存）；
 * ③ 二者**严格不等** → StaleBanner 向用户弹「请立即重启 DeepSeek Harness」
 *    危险对话框。若发布包里烧的是旧版本，**每个用户每次启动都被误报陈旧**——
 *    这是本插件最刺眼的事故形态（比源码脏更严重的是 bundle 脏）。
 *
 * 与 smoke-offline 0d 节的分工：0d 守护同一组事实，但那个脚本更重、且依赖
 * git-ignored 的 `extracted-workflows/` 取证缓存（新克隆跑不全），不适合每次
 * 提交前跑。本脚本是它的**快速前置闸门**（提交期 + bump 期），0d 仍是发版前的
 * 完整守护。
 *
 * 用法：
 *   node scripts/check-version-sync.mjs            # 人读输出
 *   node scripts/check-version-sync.mjs --quiet    # 仅失败时输出（.githooks/pre-commit 用）
 * 退出码：0 = 一致；1 = 不一致（附修复命令）。
 */
import { existsSync, readFileSync } from 'node:fs'

const QUIET = process.argv.includes('--quiet')
const pkgUrl = new URL('../package.json', import.meta.url)
const buildVersionUrl = new URL('../src/client/build-version.ts', import.meta.url)
// lib/ 是 git-ignored 的构建产物：本地构建过才在。不存在不算失败（新克隆天然
// 没有），存在就必须与源码一致——它才是真正被 dsh 加载、被发布打包的那份。
const bundleUrl = new URL('../lib/client.js', import.meta.url)

const manifest = JSON.parse(readFileSync(pkgUrl, 'utf8'))
const version = manifest.version
const problems = []

if (typeof version !== 'string' || version === '') {
  problems.push('package.json 缺少 version 字段')
}

let baked = null
if (!existsSync(buildVersionUrl)) {
  problems.push('src/client/build-version.ts 不存在（应由构建链生成）')
} else {
  // 按常量取值比对（而非字面子串匹配）：手改过引号/空格也能被识别出来。
  const match = readFileSync(buildVersionUrl, 'utf8').match(/export const BUILD_VERSION = (["'])(.*?)\1/)
  if (match === null) {
    problems.push('src/client/build-version.ts 里找不到 BUILD_VERSION 常量（文件被手改或模板变了？）')
  } else {
    baked = match[2]
    if (typeof version === 'string' && baked !== version) {
      problems.push(`src/client/build-version.ts 烧的是 ${baked}，package.json 是 ${version}（漏跑 build）`)
    }
  }
}

let bundleChecked = false
if (existsSync(bundleUrl) && typeof version === 'string') {
  // 与 smoke-offline 0d 同一判据（bundle 内嵌串存在性），保持一致。
  if (readFileSync(bundleUrl, 'utf8').includes(JSON.stringify(version))) {
    bundleChecked = true
  } else {
    problems.push(`lib/client.js 内嵌的不是 ${version}（bundle 未重建）`)
  }
}

if (problems.length === 0) {
  if (!QUIET) {
    const parts = ['package.json', 'src/client/build-version.ts']
    if (bundleChecked) parts.push('lib/client.js')
    console.log(`[check-version] OK：${parts.join(' / ')} 一致（${version}）`)
  }
  process.exit(0)
}

console.error('[check-version] 版本没有烧到构建面——这样提交/打包会让产物与包清单不一致：')
for (const problem of problems) console.error(`  ✗ ${problem}`)
console.error('')
console.error('  修复：pnpm run build')
console.error('        （gen-version 会把 package.json 的 version 重新烧进')
console.error('          src/client/build-version.ts，并重建 lib/client.js）')
console.error('  以后 bump 版本走生命周期（自动烧录 + 自动 git add，与 bump 同一次提交）：')
console.error('        pnpm version <patch|minor|major>')
process.exit(1)
