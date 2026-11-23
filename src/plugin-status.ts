/**
 * Host 半软禁用状态报告器：注册只读状态路由，并在门禁失败时切换为 disabled。
 *
 * 这是页面级 `DISABLED_GLOBAL` 的替代方案：
 * - 路由在 `index.ts` 的 apply 最开始时注册，独立于 `./main.ts` 重模块图；
 * - 插件升级/停止时路由随 fiber 自动撤销，重新启用时新 host 重新注册；
 * - client 每次加载查询当前 host，不会读到上一次页面加载遗留的状态。
 *
 * 依赖面约束：本模块属于薄门禁入口的静态 import 图。`@deepseek-ai/dsh-host-webserver`
 * 只做 type-only 引入（擦除后无运行时依赖）；路由通过 `ctx.inject(['webServer'])`
 * 延迟到 Web 服务可用时注册，不把 webServer 提升为入口硬依赖。
 */
import type { Context } from '@deepseek-ai/cordis'
// Type-only: Context.webServer 服务声明 + WebRoute 形状（运行时擦除）。
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { MAX_HARNESS_VERSION, MIN_HARNESS_VERSION, resolveHarnessVersion } from './version-gate.js'
import { PLUGIN_STATUS_PATH, type PluginStatus, type PluginStatusDisabled } from './shared/plugin-status.js'

/** 软禁用状态报告器：门禁失败时由 soft-disable 调用。 */
export interface PluginStatusReporter {
  /** 把当前插件状态切换为 disabled，并记录原因。 */
  disable(reason: string): void
}

/** 生成 disabled 状态（运行时版本尽力解析，锚点失败时省略该字段）。 */
function disabledStatus(reason: string): PluginStatusDisabled {
  let runtimeVersion: string | undefined
  try {
    runtimeVersion = resolveHarnessVersion().version
  } catch {
    runtimeVersion = undefined
  }
  return {
    state: 'disabled',
    reason,
    min: MIN_HARNESS_VERSION,
    max: MAX_HARNESS_VERSION,
    installVersion: MAX_HARNESS_VERSION,
    ...(runtimeVersion === undefined ? {} : { runtimeVersion }),
  }
}

/** 返回 JSON 状态；只接受 GET/HEAD，其他方法由本路由自行拒绝。 */
function writeStatus(req: IncomingMessage, res: ServerResponse, status: PluginStatus): void {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405
    res.setHeader('allow', 'GET, HEAD')
    res.end()
    return
  }
  const body = JSON.stringify(status)
  res.statusCode = 200
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  if (req.method === 'HEAD') res.end()
  else res.end(body)
}

/**
 * 注册插件状态路由并返回报告器。路由注册失败只记录日志，不影响业务主体。
 *
 * @param ctx - 入口插件的上下文（thin entry 的 apply 最早调用）。
 * @returns 供 soft-disable 使用的状态报告器。
 */
export function registerPluginStatus(ctx: Context): PluginStatusReporter {
  let status: PluginStatus = { state: 'active' }

  try {
    ctx.inject(['webServer'], (webCtx) => {
      try {
        // 模板的 devDependency 仍是 0.2.2-rc.1，其 WebRoute 类型没有 auth；
        // 0.2.3 运行时支持 auth:'anonymous'。用结构兼容对象 + 窄化 cast 同时
        // 保证旧类型可编译、新运行时按匿名只读路由处理。
        const route = {
          kind: 'exact' as const,
          path: PLUGIN_STATUS_PATH,
          auth: 'anonymous' as const,
          handler: (req: IncomingMessage, res: ServerResponse) => writeStatus(req, res, status),
        }
        webCtx.effect(
          () => webCtx.webServer.register(route as Parameters<typeof webCtx.webServer.register>[0]),
          'dsh-plugin-template: plugin-status route',
        )
      } catch (error) {
        console.error('[dsh-plugin-template] 插件状态路由注册失败:', error)
      }
    })
  } catch (error) {
    console.error('[dsh-plugin-template] 插件状态报告器初始化失败:', error)
  }

  return {
    disable(reason: string): void {
      status = disabledStatus(reason)
    },
  }
}
