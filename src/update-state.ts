/**
 * 插件自更新状态机（host 半模块级内存，**更新相关全部状态的唯一权威源**）。
 *
 * 设计动机：harness 的 client-hmr 对 client bundle 做 stat 轮询，自更新安装
 * 会改写磁盘上的 lib/client.js → 前端 client 半在安装完成后数秒内整体热更
 * 重挂，React 状态全部重置——若更新状态（尤其「安装完成、待重启」）留在
 * client 半，提示会随热更消失。host 半进程在 client 热更时不动，故状态机
 * 驻留于此：check/update 的 RPC 端点只是触发器（同步落相位后 fire-and-forget，
 * 浏览器刷新/RPC 断连不会中断安装），UI 一律经 `template/getUpdateState`
 * 轮询投影。浏览器刷新、HMR 重挂、多标签页由此天然收敛。
 *
 * 生命周期：harness 重启 → 模块重求值 → 状态机归零并重新走启动检查（重启
 * 后 host 加载新版本，"待重启"状态自然消失）。故**只用内存态、不落盘**。
 *
 * 相位迁移（相位定义见 shared/update-contract.ts）：
 * - apply 启动检查 / 面板手动检查：idle|available|up-to-date → checking →
 *   available|up-to-date；失败回原相位——启动检查（非用户发起）静默不填
 *   errorMessage（不打扰纪律），用户手动检查失败才填；
 * - 面板「立即更新」：→ updating → updated（restartRequired = true）；
 *   changed = false（点更新时 latest 已回到 <= 当前的竞态）→ up-to-date；
 *   失败回 updating 前的相位 + errorMessage；
 * - checking / updating 期间重复触发合并进同一次进行中的动作；
 * - updated（待重启）后不再接受检查/更新触发：currentVersion 仍是运行中的
 *   旧版本（self-update.ts 的模块级缓存口径），重启前再查只会得出自相矛盾
 *   的"有新版本"结论。
 *
 * 四个派生插件（qw-tool / meme-gen / post-gen / comfyui-based-tools /
 * send-to-feishu）的同名模块均以本文件为母版（只改 console 前缀的包名）。
 */
import { applySelfUpdate, checkSelfUpdate } from './self-update.js'
import type { UpdateMachineState } from './shared/update-contract.js'

/** 初始快照（idle、无版本信息、无错误）。 */
const INITIAL_STATE: UpdateMachineState = {
  phase: 'idle',
  currentVersion: null,
  latestVersion: null,
  updatedTo: null,
  restartRequired: false,
  errorSource: null,
  errorMessage: null,
}

/** 模块级状态（host 半进程生命周期 = harness 生命周期；client 热更不影响）。 */
let state: UpdateMachineState = INITIAL_STATE

/** 读当前快照（getUpdateState 端点的实现委托）。 */
export function getUpdateMachineState(): UpdateMachineState {
  return state
}

/** 错误消息归一化。 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 检查更新触发器（apply 启动静默检查 + 面板手动检查共用；幂等合并）。
 * 同步把相位落为 checking 后 fire-and-forget，registry 往返在后台完成。
 *
 * @param userInitiated - true = 面板手动点击（失败填 errorMessage 内联反馈）；
 *   false = apply 启动检查（失败静默回退，不打扰用户）。
 */
export function startUpdateCheck(userInitiated: boolean): void {
  if (state.phase === 'checking' || state.phase === 'updating' || state.phase === 'updated') return
  const previous = state
  state = { ...state, phase: 'checking', errorSource: null, errorMessage: null }
  void checkSelfUpdate()
    .then((check) => {
      state = {
        phase: check.updateAvailable ? 'available' : 'up-to-date',
        currentVersion: check.currentVersion,
        latestVersion: check.latestVersion,
        updatedTo: null,
        restartRequired: false,
        errorSource: null,
        errorMessage: null,
      }
      if (check.updateAvailable) {
        console.log(`[dsh-plugin-template] 发现新版本 ${check.latestVersion}（当前 ${check.currentVersion}）——前端将弹出更新通知`)
      }
    })
    .catch((error: unknown) => {
      state = {
        ...previous,
        errorSource: userInitiated ? 'check' : null,
        errorMessage: userInitiated ? messageOf(error) : null,
      }
      if (!userInitiated) {
        console.warn('[dsh-plugin-template] 启动更新检查失败（不影响使用，可在设置面板手动检查）:', messageOf(error))
      }
    })
}

/**
 * 立即更新触发器（幂等合并；applySelfUpdate 内部另有 in-flight 锁兜底）。
 * 同步把相位落为 updating 后 fire-and-forget：安装 Promise 留在 host 内跑完，
 * 浏览器刷新 / RPC 断连 / client 热更都不会中断它，前端经轮询看到后续迁移。
 */
export function startSelfUpdate(): void {
  if (state.phase === 'updating' || state.phase === 'updated') return
  const previous = state
  state = { ...state, phase: 'updating', errorSource: null, errorMessage: null }
  void applySelfUpdate()
    .then((result) => {
      if (!result.changed) {
        // 竞态兜底：点更新时 latest 已回到 <= 当前（或版本被撤）→ 归位「已是最新」。
        state = { ...INITIAL_STATE, phase: 'up-to-date', currentVersion: result.updatedTo, latestVersion: result.updatedTo }
        return
      }
      state = { ...state, phase: 'updated', updatedTo: result.updatedTo, restartRequired: true, errorSource: null, errorMessage: null }
    })
    .catch((error: unknown) => {
      state = { ...previous, errorSource: 'update', errorMessage: messageOf(error) }
    })
}
