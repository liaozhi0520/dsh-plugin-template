/**
 * 插件自身包根的 package.json 读取（name/version）。
 *
 * 消费方：update-state.ts（版本提示的 available 判定 + getUpdateState 快照恒填
 * 的 currentVersion）与 soft-disable.ts（软禁用面板载荷的 `{name, installed}`）。
 * 独立成模块而非留在 update-state：薄门禁入口（index.ts）的静态 import 图只需要
 * 「读包版本」这一件事——本模块只用 node:fs/node:path/node:url。
 *
 * 缓存语义（**陈旧代码防护的基石**）：模块求值期（import 时）一次性读取并缓存。
 * 模块体执行的时刻 = 本进程加载这段代码的时刻，因此缓存值严格等于「正在运行的
 * 代码版本」。若推迟到首次调用才读，会掉进这个窗口：进程启动后、首次调用前，
 * 用户卸载并重装了插件（Node ESM 模块缓存让旧模块继续运行，磁盘却是新包）——
 * 那时读磁盘会把运行中的旧模块谎报成新版本，陈旧检测失明。读取失败缓存 null
 * （包损坏），`selfPackageInfo()` 调用时延迟抛错——不让入口 import 失败，保住
 * 软禁用路径（index.ts 的两道门禁依赖本模块）。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 插件包根目录（lib/package-info.js → 上一级）。 */
const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url))

/** 自身 package.json 的 name/version。 */
export interface SelfManifest {
  name: string
  version: string
}

/** 求值期一次读取：成功 = SelfManifest；失败 = null（包损坏，延迟报错）。 */
const cachedManifest: SelfManifest | null = ((): SelfManifest | null => {
  try {
    const path = join(PACKAGE_ROOT, 'package.json')
    const raw = JSON.parse(readFileSync(path, 'utf8')) as { name?: unknown; version?: unknown }
    if (typeof raw.name !== 'string' || raw.name === '' || typeof raw.version !== 'string' || raw.version === '') {
      throw new Error('缺少 name/version 字段')
    }
    return { name: raw.name, version: raw.version }
  } catch {
    return null
  }
})()

/** 缓存为 null（包损坏）时 `selfPackageInfo()` 抛出的延迟错误。 */
const cachedError = new Error(
  `dsh-plugin-template: 自身 package.json 不可读或缺少 name/version（${join(PACKAGE_ROOT, 'package.json')}）`,
)

/** 读自身包根的 package.json（模块求值期缓存；包不完整时抛错——调用方降级）。 */
export function selfPackageInfo(): SelfManifest {
  if (cachedManifest === null) throw cachedError
  return cachedManifest
}

/**
 * 运行中模块自报版本；包损坏时为 null（getUpdateState 快照的 currentVersion
 * 口径——快照读取不允许抛错，null 让 client 半陈旧检测静默不弹）。
 */
export function selfVersionOrNull(): string | null {
  return cachedManifest?.version ?? null
}
