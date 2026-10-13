/**
 * host 与 client 共享的插件版本提示 RPC 契约（纯数据 / 类型）。
 * 浏览器端经 `ctx.connection.rpc.call('/api', <endpoint>, { args })` 调用
 * host 半 `template` 服务的端点（描述符见 src/remote.ts 的 DESCRIPTORS 表）。
 * 两端共用，只允许不依赖平台的类型与常量。
 *
 * 状态模型：**host 半的版本提示状态机是唯一权威源**（实现见 src/update-state.ts），
 * client 半不持有任何状态——checkUpdate 端点只是"触发器"（host 同步落相位后
 * 立即返回触发后快照，registry 往返在 host 内异步跑完），UI 结论一律经
 * getUpdateState 轮询投影。由此浏览器刷新、client 半重挂、多标签页都
 * 天然收敛到同一份状态；harness 重启后 host 模块重求值，状态机归零重查，
 * 生命周期天然正确，无需落盘。
 *
 * 插件更新策略（**自更新安装通道已删除**）：发现新版本只弹窗提示
 * 用户到「插件」页**卸载本插件后重新安装**；不提供任何进程内安装动作。
 *
 * 陈旧代码防护契约钉子：getUpdateState 快照的 `currentVersion` **恒填「运行中
 * 模块自报版本」**（package-info.ts 模块求值期缓存，不依赖检查成功）。client
 * 半将其与构建期烧录的 BUILD_VERSION 严格比较，不一致即渲染陈旧提醒对话框
 * 要求重启 harness（见 client StaleBanner 与 AGENTS.md「待复核的 harness
 * 缺陷规避」第二条）。改本契约占位必须两处同步。
 */

/** 版本提示 RPC 端点（`<namespace>/<method>`；namespace 与 Typert 服务同源）。 */
export const UPDATE_ENDPOINT = {
  /** 检查更新触发器：host 同步落 checking 后 fire-and-forget 查 registry。 */
  checkUpdate: 'template/checkUpdate',
  /** 更新状态机快照（配置页更新条与全局提示弹窗的唯一读通道，轮询用）。 */
  getUpdateState: 'template/getUpdateState',
} as const

// ---------------------------------------------------------------------------
// 状态机（getUpdateState 的返回主体；checkUpdate 也回带触发后快照）
// ---------------------------------------------------------------------------

/** 版本提示状态机相位（host 半权威，client 纯投影）。 */
export type UpdatePhase =
  | 'idle' // 尚未检查（或启动检查静默失败，可手动重试）
  | 'checking' // 检查进行中（启动检查或手动检查）
  | 'available' // 有新版本：弹窗提示卸载后重装
  | 'up-to-date' // 已是最新

/** host 半版本提示状态机的快照（纯 JSON，直接进 src-json codec）。 */
export interface UpdateMachineState {
  phase: UpdatePhase
  /** 当前**运行中**副本的插件版本（自报口径，恒填；包损坏时 null）。 */
  currentVersion: string | null
  /** npm registry 上的最新发布版本（检查成功后填）。 */
  latestVersion: string | null
  /** 最近一次用户手动检查的失败消息（启动静默检查不填；成功路径清空）。 */
  errorMessage: string | null
}

/** getUpdateState 返回主体（纯状态读取，不会失败）。 */
export type UpdateStateResult =
  | { ok: true; state: UpdateMachineState }
  | { ok: false; error: { code: string; message?: string } }

/**
 * checkUpdate 触发器的返回主体：触发成功即回带触发后快照（相位已同步落下），
 * 结论仍走 getUpdateState 轮询；触发本身同步不会失败（并发合并进进行中的
 * 同一次检查），异步失败经状态机的 errorMessage 透出（仅手动检查）。
 */
export type UpdateActionResult =
  | { ok: true; state: UpdateMachineState }
  | { ok: false; error: { code: string; message?: string } }
