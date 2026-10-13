/**
 * 严格 semver 比较（含预发布标识，忽略 build 元数据）——host/client 共用的
 * 纯函数（零依赖：client bundle 会内联本文件，不得引入任何 Node 依赖）。
 *
 * 使用方：version-gate.ts 的窗口判定、update-state.ts 比较运行中版本与
 * registry latest（available 判定）、client 停用面板比较插件当前版本与 registry latest。
 *
 * @returns a<b -> -1，a=b -> 0，a>b -> 1。
 */
export function compareVersions(a: string, b: string): number {
  const parse = (text: string): { core: number[]; pre: string[] } => {
    const withoutBuild = text.split('+')[0]!
    const [coreText = '', preText = ''] = withoutBuild.split('-')
    const core = coreText.split('.').map((part) => {
      const n = Number(part)
      return Number.isSafeInteger(n) && n >= 0 ? n : Number.NaN
    })
    const pre = preText === '' ? [] : preText.split('.')
    return { core, pre }
  }
  const aParsed = parse(a)
  const bParsed = parse(b)
  // 主/次/补丁号逐段数值比较，缺段按 0 处理。
  const coreLen = Math.max(aParsed.core.length, bParsed.core.length)
  for (let i = 0; i < coreLen; i += 1) {
    const x = aParsed.core[i] ?? 0
    const y = bParsed.core[i] ?? 0
    if (x !== y) return x < y ? -1 : 1
  }
  const preA = aParsed.pre
  const preB = bParsed.pre
  if (preA.length === 0 && preB.length === 0) return 0
  // semver 规则：正式版 > 预发布（0.1.1 > 0.1.1-rc.2）。
  if (preA.length === 0) return 1
  if (preB.length === 0) return -1
  const preLen = Math.max(preA.length, preB.length)
  for (let i = 0; i < preLen; i += 1) {
    const x = preA[i]
    const y = preB[i]
    // 前缀相同时，预发布标识更长者更大（rc.2 < rc.2.1）。
    if (x === undefined) return -1
    if (y === undefined) return 1
    if (x === y) continue
    const xNumeric = /^\d+$/.test(x)
    const yNumeric = /^\d+$/.test(y)
    if (xNumeric && yNumeric) {
      const nx = Number(x)
      const ny = Number(y)
      if (nx !== ny) return nx < ny ? -1 : 1
      continue
    }
    // 数字标识 < 字母标识（semver 规则：2 < alpha）。
    if (xNumeric) return -1
    if (yNumeric) return 1
    return x < y ? -1 : 1
  }
  return 0
}
