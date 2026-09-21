/**
 * host 与 client 共享的插件自更新 RPC 契约（纯数据 / 类型 / 常量）。
 * 浏览器端经 `ctx.connection.rpc.call('/api', <endpoint>, { args })` 调用
 * host 半 `template` 服务的端点（描述符见 src/remote.ts 的 DESCRIPTORS 表，
 * 实现委托 src/update-state.ts 的状态机）。两端共用，只允许不依赖平台的
 * 类型与常量。
 *
 * 状态模型：**host 半的更新状态机是唯一权威源**（实现见 src/update-state.ts），
 * client 半不持有任何更新状态——check/update 端点只是"触发器"（host 同步落
 * 相位后立即返回触发后快照，安装/检查在 host 内异步跑完），UI 结论一律经
 * getUpdateState 轮询投影。由此浏览器刷新、client 半 HMR 热更、多标签页都
 * 天然收敛到同一份状态；harness 重启后 host 模块重求值，状态机归零重查，
 * 生命周期天然正确，无需落盘。
 */

/** 自更新 RPC 端点（`<namespace>/<method>`；namespace 与 Typert 服务同源）。 */
export const UPDATE_ENDPOINT = {
  /** 检查更新触发器：host 同步落 checking 后 fire-and-forget 查 registry。 */
  checkUpdate: 'template/checkUpdate',
  /** 立即更新触发器：host 同步落 updating 后走官方 dsh plugin add 通道安装最新版。 */
  updateSelf: 'template/updateSelf',
  /** 更新状态机快照（设置面板与更新通知气泡的唯一读通道，轮询用）。 */
  getUpdateState: 'template/getUpdateState',
} as const

// ---------------------------------------------------------------------------
// 状态机（getUpdateState 的返回主体；checkUpdate/updateSelf 也回带触发后快照）
// ---------------------------------------------------------------------------

/** 自更新状态机相位（host 半权威，client 纯投影）。 */
export type UpdatePhase =
  | 'idle' // 尚未检查（或启动检查静默失败，可手动重试）
  | 'checking' // 检查进行中（启动检查或手动检查）
  | 'available' // 有新版本，可点「立即更新」
  | 'up-to-date' // 已是最新
  | 'updating' // 官方通道安装进行中（dsh plugin add 子进程活着）
  | 'updated' // 安装完成（restartRequired = true），等待重启 DeepSeek Harness

/** host 半更新状态机的快照（纯 JSON，直接进 src-json codec）。 */
export interface UpdateMachineState {
  phase: UpdatePhase
  /** 当前运行副本的插件版本（检查成功后填；host 模块级缓存保证运行期口径一致）。 */
  currentVersion: string | null
  /** npm registry 上的最新发布版本（检查成功后填）。 */
  latestVersion: string | null
  /** 安装完成后磁盘上的版本（phase = 'updated' 时填）。 */
  updatedTo: string | null
  /** true = 需要重启 DeepSeek Harness，host 半才会加载新版本。 */
  restartRequired: boolean
  /** 最近一次失败的来源动作（errorMessage 非 null 时有值；启动静默检查不填）。 */
  errorSource: 'check' | 'update' | null
  /** 最近一次用户发起动作的失败消息（成功路径清空）。 */
  errorMessage: string | null
}

/** getUpdateState 返回主体（纯状态读取，不会失败）。 */
export type UpdateStateResult =
  | { ok: true; state: UpdateMachineState }
  | { ok: false; error: { code: string; message?: string } }

/**
 * checkUpdate / updateSelf 触发器的返回主体：触发成功即回带触发后快照
 * （相位已同步落下），结论仍走 getUpdateState 轮询；触发本身同步不会失败
 * （并发合并进进行中的同一次动作），异步失败经状态机的 errorMessage 透出。
 */
export type UpdateActionResult =
  | { ok: true; state: UpdateMachineState }
  | { ok: false; error: { code: string; message?: string } }

// ---------------------------------------------------------------------------
// self-update.ts 内部函数的返回类型（checkSelfUpdate / applySelfUpdate）
// ---------------------------------------------------------------------------

/** checkSelfUpdate 成功主体。 */
export interface TemplateUpdateCheck {
  /** 当前运行副本的插件版本。 */
  currentVersion: string
  /** npm registry 上的最新发布版本。 */
  latestVersion: string
  /** latest 是否比当前新（严格 semver 比较，含预发布规则）。 */
  updateAvailable: boolean
}

/** applySelfUpdate 成功主体。 */
export interface TemplateUpdateApply {
  /** 动作结束后磁盘上的版本（安装成功后回读）。 */
  updatedTo: string
  /** 本次是否真的执行了安装（false = 已经是最新，无需安装）。 */
  changed: boolean
  /** true = 需要重启 DeepSeek Harness，host 半才会加载新版本。 */
  restartRequired: boolean
}
