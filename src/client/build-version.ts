/**
 * 构建期烧录的插件版本——由 scripts/gen-version.mjs 生成（build 链自动重生成，勿手改）。
 *
 * 陈旧代码检测的 client 半基准：StaleBanner 把 getUpdateState 快照的
 * currentVersion（运行中 host 模块自报版本，package-info.ts 模块求值期缓存）
 * 与本常量做**严格不等**比较——不一致 = 进程内跑的不是磁盘上这份代码（卸载
 * 重装未重启，Node ESM 模块缓存缺陷），弹出陈旧提醒对话框要求重启 DeepSeek
 * Harness。改动本文件请改 gen-version.mjs 的模板。
 */
export const BUILD_VERSION = "0.1.0"
