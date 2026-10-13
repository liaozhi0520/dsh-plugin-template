/**
 * plugins.bundle.config 槽位的注册 key：必须**逐字**等于本包 package.json 的
 * `name`（插件页以组合包名 `pkg.name` 作 entryKey 匹配，写错 = 配置区静默不
 * 出现，且无任何报错）。客户端 bundle 不便 import package.json（构建纯净性），
 * 故硬编码字符串，由 scripts/smoke-offline.mjs 的 0c 节守护：断言本常量与包
 * 清单一致。
 *
 * 独立成模块：client/index.ts（槽位注册）与升级提示（GlobalNotice / 面板更新
 * 条的「插件包名@最新版本」安装 spec 命令片）共用同一来源，避免第二处硬编码。
 */
export const BUNDLE_KEY = '@scoped/dsh-plugin-template'
