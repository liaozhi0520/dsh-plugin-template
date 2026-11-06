/**
 * plugins.bundle.config 槽位的注册 key：必须**逐字**等于本包 package.json 的
 * `name`（插件页以组合包名 `pkg.name` 作 entryKey 匹配，写错 = 配置区静默不
 * 出现，且无任何报错）。客户端 bundle 不便 import package.json（构建纯净性），
 * 故硬编码字符串，由 scripts/smoke-offline.mjs 的 0c 节守护：断言本常量与包
 * 清单一致。
 *
 * 独立成模块：client/index.ts 的正常/停用两条 plugins.bundle.config 注册路径
 * 共用同一来源，避免第二处硬编码（0.2.2 起更新提示命令片已随方案 A 删除）。
 */
export const BUNDLE_KEY = '@scoped/dsh-plugin-template'
