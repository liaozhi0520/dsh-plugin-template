/**
 * 启动更新检查（apply → 前端更新通知气泡的 host 半状态机）。
 *
 * 插件加载（apply）时 fire-and-forget 调一次 self-update.ts 的
 * {@link checkSelfUpdate}（与设置面板「检查更新」同一实现、同一官方通道），
 * 结论缓存在模块级状态里；浏览器端经 `template/getUpdateNotice` 端点（见
 * ./remote.ts 描述符与 TemplateRemote 的同名方法）轮询该状态，发现有新版本
 * 时在 `shell.overlay` 弹出更新通知气泡（client/UpdateBubble.tsx）。本模块
 * 只做"启动期一次性检查 + 状态缓存"，不触发安装——安装仍由面板的 updateSelf
 * 端点（applySelfUpdate）负责。四个派生插件（qw-tool / meme-gen / post-gen /
 * comfyui-based-tools / send-to-feishu）的同名模块均以本文件为母版。
 *
 * 检查失败（离线、registry 不可达等）折叠为 phase = 'failed'，前端静默放弃
 * （不打扰用户，面板手动检查仍可用），apply 本身绝不因网络问题失败。
 */
import { checkSelfUpdate } from './self-update.js'
import type { TemplateUpdateCheck } from './shared/update-contract.js'

/** 检查状态：pending = 检查进行中；ready = 已有结论（check 必在）；failed = 检查失败。 */
export type UpdateNoticePhase = 'pending' | 'ready' | 'failed'

/** getUpdateNotice 端点的返回主体（纯 JSON，直接进 src-json codec）。 */
export interface UpdateNoticeState {
  phase: UpdateNoticePhase
  /** phase = 'ready' 时携带：apply 时 {@link checkSelfUpdate} 的结论。 */
  check?: TemplateUpdateCheck
}

/** 模块级状态（插件 HMR 重载会重新求值本模块，状态随之复位重查）。 */
let state: UpdateNoticeState = { phase: 'pending' }

/** 幂等闸（apply 内单次调用，防御未来多处调用）。 */
let started = false

/**
 * 启动检查（fire-and-forget，apply 在版本门禁通过后调用一次）。
 * 幂等；本函数同步返回，registry 往返在后台完成。
 */
export function startUpdateNoticeCheck(): void {
  if (started) return
  started = true
  void checkSelfUpdate()
    .then((check) => {
      state = { phase: 'ready', check }
      if (check.updateAvailable) {
        console.log(`[dsh-plugin-template] 发现新版本 ${check.latestVersion}（当前 ${check.currentVersion}）——前端将弹出更新通知`)
      }
    })
    .catch((error) => {
      state = { phase: 'failed' }
      console.warn('[dsh-plugin-template] 启动更新检查失败（不影响使用，可在设置面板手动检查）:', error instanceof Error ? error.message : error)
    })
}

/** 读当前检查状态（getUpdateNotice 端点的实现委托）。 */
export function getUpdateNoticeState(): UpdateNoticeState {
  return state
}
