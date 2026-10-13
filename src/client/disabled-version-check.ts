/**
 * 停用面板的插件最新版本检查（client 半自查）。
 *
 * 为什么放 client：注入的 DISABLED_GLOBAL 在不同交付形态下生命周期不同——
 * `dsh web` 每次页面响应重收注入表，但桌面壳（apps/desktop 的
 * `__DSH_BOOT_READY__` 流程）与静态部署是**一次性快照**，host 半异步补齐
 * 的载荷这些形态拿不到。面板组件是活的 JS，组件挂载后自查 registry 对三种
 * 形态都正确，且能区分「检查中/失败」。
 *
 * 查询实现是 host/client 同构共享的 ../shared/registry-latest.ts（本封装只
 * 走缺省面：官方 → npmmirror 兜底候选 + 10s 每源超时 + 静默——浏览器拿不到
 * 服务 registries() 配置与覆盖 env，硬编码兜底是刻意的降级）。npm 公共源对
 * GET manifest 带 CORS 头，浏览器可直接 fetch；企业内网全被拦时本封装抛错
 * （面板落「未能确认」）。
 */
import { fetchLatestVersion } from '../shared/registry-latest'

/**
 * 查询包的 latest dist-tag；registry 类失败逐源降级后仍全部失败才抛
 * （面板显示「未能确认」）。
 */
export async function fetchLatestPluginVersion(packageName: string): Promise<string> {
  return fetchLatestVersion(packageName)
}
