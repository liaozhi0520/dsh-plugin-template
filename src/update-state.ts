/**
 * 插件版本提示状态机（host 半模块级内存，**版本相关全部状态的唯一权威源**）。
 *
 * 设计动机：卸载重装后 client bundle 随之换新、client 半整体重挂（harness
 * 内建机制），React 状态全部重置——若状态留在 client 半，提示会随重挂消失。
 * host 半进程不受重装影响，故状态机驻留于此：
 * check RPC 只是触发器（同步落相位后 fire-and-forget，浏览器刷新/RPC 断连
 * 不会中断检查），UI 一律经 `template/getUpdateState` 轮询投影。浏览器
 * 刷新、重挂、多标签页由此天然收敛。生命周期：harness 重启 → 模块重求值
 * → 状态机归零并重新走启动检查。故**只用内存态、不落盘**。
 *
 * 更新策略（0.8.0 起）：**插件不再自更新**——原官方 pluginManager 安装通道
 * （installBundle/cancelInstall/流式日志/junction 清理）整段删除。发现新版本
 * 仅提示用户「到插件页卸载本插件后重新安装」。原因：重装后 harness 进程内的
 * 旧模块实例不会被替换（Node ESM 模块缓存缺陷，取证与追新复核见 AGENTS.md
 * 「待复核的 harness 缺陷规避」第二条），自更新只会制造「已装待重启」的中间态
 * 与「新 UI + 旧内核」的错配；卸载重装 + 本插件的陈旧提醒对话框才是完整闭环。
 *
 * 快照钉子：`currentVersion` **恒填「运行中模块自报版本」**（package-info.ts
 * 模块求值期缓存，`selfVersionOrNull()`；不依赖检查成功）。client 半用它与
 * 构建期 BUILD_VERSION 做陈旧检测（严格不等 → 陈旧提醒对话框要求重启）。
 */
import { selfPackageInfo, selfVersionOrNull } from './package-info.js'
import { FALLBACK_REGISTRY_CANDIDATES, fetchLatestVersion } from './shared/registry-latest.js'
import { compareVersions } from './shared/version-compare.js'
import type { UpdateMachineState, UpdatePhase } from './shared/update-contract.js'

/** npm registry 请求超时（host 半；15s 覆盖慢源，client 半走 registry-latest 缺省）。 */
const REGISTRY_TIMEOUT_MS = 15_000

/** 模块级状态（host 半进程生命周期 = harness 生命周期；client 半重挂不影响）。
 * currentVersion 不入状态——快照出口从 package-info 求值期缓存现取。 */
let state: { phase: UpdatePhase; latestVersion: string | null; errorMessage: string | null } = {
  phase: 'idle',
  latestVersion: null,
  errorMessage: null,
}

/** 读当前快照（getUpdateState 端点的实现委托）。 */
export function getUpdateMachineState(): UpdateMachineState {
  return {
    phase: state.phase,
    currentVersion: selfVersionOrNull(),
    latestVersion: state.latestVersion,
    errorMessage: state.errorMessage,
  }
}

/** 错误消息归一化。 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 检查更新触发器（apply 启动静默检查 + 面板手动检查共用；幂等合并）。
 * 同步把相位落为 checking 后 fire-and-forget，registry 往返在后台完成。
 * 候选源固定官方兜底计划（npm → npmmirror）——自更新通道删除后不再取
 * pluginManager 服务的 registries() 计划；版本提示面对公开 npm 包，语义足够。
 *
 * @param userInitiated - true = 面板手动点击（失败填 errorMessage 内联反馈）；
 *   false = apply 启动检查（失败静默回退，不打扰用户）。
 */
export function startUpdateCheck(userInitiated: boolean): void {
  if (state.phase === 'checking') return
  const previous = state
  state = { ...state, phase: 'checking', errorMessage: null }
  void (async (): Promise<{ phase: UpdatePhase; latestVersion: string }> => {
    const manifest = selfPackageInfo()
    const latestVersion = await fetchLatestVersion(manifest.name, {
      candidates: FALLBACK_REGISTRY_CANDIDATES,
      timeoutMs: REGISTRY_TIMEOUT_MS,
      // 宿主侧加 cache-control/pragma：中间层（本地代理/CDN）若缓存了坏报文，
      // 强制它回源重取——浏览器端不能加（会触发 CORS 预检，见 registry-latest 头注释）。
      noCache: true,
      onCandidateError: (base, error) => {
        console.warn(`[dsh-plugin-template] registry 候选不可用，转问下一个：${base} → ${error instanceof Error ? error.message : String(error)}`)
      },
    })
    const updateAvailable = compareVersions(latestVersion, manifest.version) > 0
    return { phase: updateAvailable ? 'available' : 'up-to-date', latestVersion }
  })()
    .then((check) => {
      state = { phase: check.phase, latestVersion: check.latestVersion, errorMessage: null }
      if (check.phase === 'available') {
        console.log(
          `[dsh-plugin-template] 发现新版本 ${check.latestVersion}（运行中 ${selfVersionOrNull() ?? '?'}）——前端将弹窗提示卸载后重装`,
        )
      }
    })
    .catch((error: unknown) => {
      state = { ...previous, errorMessage: userInitiated ? messageOf(error) : null }
      if (!userInitiated) {
        console.warn('[dsh-plugin-template] 启动更新检查失败（不影响使用，可在插件页配置页手动检查）:', messageOf(error))
      }
    })
}
