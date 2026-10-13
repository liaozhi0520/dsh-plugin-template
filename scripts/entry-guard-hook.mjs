/**
 * 入口隔离检查的模块钩子（scripts/smoke-offline.mjs 第 0 节经
 * `module.register()` 挂载，不单独运行）。
 *
 * 薄门禁入口 lib/index.js（src/index.ts）的静态 import 图在 apply 之前求值，
 * 图内出现任何 @deepseek-ai/dsh* 运行时 import 都等于把软禁用想保护的路径
 * 重新暴露（见 src/index.ts 头注释）——此处在 resolve 阶段直接抛错，让
 * smoke-offline 对 lib/index.js 的 import 失败，从而把「有人往薄入口（或其
 * 静态依赖）里加了 dsh-* 运行时 import」变成冒烟失败。
 *
 * 放行面：schemastery（Config 导出的不可约运行时依赖）、node: 内建、相对路径。
 * cordis / cosmokit 在薄图中只允许 type-only（产物里不会出现，无需特意放行）。
 * 业务模块图（src/main.ts → lib/main.js）只允许经 apply 内的动态 import 拉起，
 * 本钩子对其不作断言（入口隔离检查 import lib/index.js 时不会触发 apply）。
 */
export async function resolve(specifier, context, nextResolve) {
  if (/^@deepseek-ai\/dsh(-|$)/.test(specifier)) {
    throw new Error(
      `entry-isolation: 薄门禁入口的 import 图出现 dsh-* 运行时依赖：${specifier}。`
      + 'src/index.ts 及其静态依赖不得 import 任何 @deepseek-ai/dsh*；'
      + '业务主体放 src/main.ts，由 apply 在门禁全过后动态 import。',
    )
  }
  return nextResolve(specifier, context)
}
