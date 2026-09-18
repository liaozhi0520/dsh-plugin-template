/**
 * host 与 client 共享的插件自更新 RPC 契约（纯数据 / 类型 / 常量）。
 * 浏览器端经 `ctx.connection.rpc.call('/api', <endpoint>, { args })` 调用
 * host 半 `template` 服务的 checkUpdate / updateSelf 端点（描述符见
 * src/remote.ts 的 DESCRIPTORS 表，实现委托 src/self-update.ts）。
 * 两端共用，只允许不依赖平台的类型与常量。
 */

/** 自更新 RPC 端点（`<namespace>/<method>`；namespace 与 Typert 服务同源）。 */
export const UPDATE_ENDPOINT = {
  /** 检查更新：host 半查 npm registry latest 并与运行版本比较。 */
  checkUpdate: 'template/checkUpdate',
  /** 立即更新：host 半走官方 dsh plugin add 通道安装最新版。 */
  updateSelf: 'template/updateSelf',
  /** 启动更新检查的状态快照（apply 时检查一次；前端更新通知气泡据此轮询）。 */
  getUpdateNotice: 'template/getUpdateNotice',
} as const

/** checkUpdate 成功主体。 */
export interface TemplateUpdateCheck {
  /** 当前运行副本的插件版本。 */
  currentVersion: string
  /** npm registry 上的最新发布版本。 */
  latestVersion: string
  /** latest 是否比当前新（严格 semver 比较，含预发布规则）。 */
  updateAvailable: boolean
}

/** 插件自更新检查结果（checkUpdate 返回主体）。 */
export type TemplateUpdateCheckResult =
  | ({ ok: true } & TemplateUpdateCheck)
  | { ok: false; error: { code: string; message?: string } }

/** updateSelf 成功主体。 */
export interface TemplateUpdateApply {
  /** 动作结束后磁盘上的版本（安装成功后回读）。 */
  updatedTo: string
  /** 本次是否真的执行了安装（false = 已经是最新，无需安装）。 */
  changed: boolean
  /** true = 需要重启 DeepSeek Harness，host 半才会加载新版本。 */
  restartRequired: boolean
}

/** 插件自更新执行结果（updateSelf 返回主体）。 */
export type TemplateUpdateApplyResult =
  | ({ ok: true } & TemplateUpdateApply)
  | { ok: false; error: { code: string; message?: string } }

/** 启动更新检查的结论（apply 时 checkSelfUpdate 的结果快照，见 update-notice.ts）。 */
export interface TemplateUpdateNoticeCheck {
  /** 当前运行副本的插件版本。 */
  currentVersion: string
  /** npm registry 上的最新发布版本（测试桩下为固定假版本）。 */
  latestVersion: string
  /** latest 是否比当前新。 */
  updateAvailable: boolean
}

/** 启动更新检查状态（getUpdateNotice 返回主体；检查在 apply 时执行一次）。 */
export type TemplateUpdateNoticePhase = 'pending' | 'ready' | 'failed'
export type TemplateUpdateNoticeResult =
  | ({ ok: true; phase: TemplateUpdateNoticePhase; check?: TemplateUpdateNoticeCheck })
  | { ok: false; error: { code: string; message?: string } }
