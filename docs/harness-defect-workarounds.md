# 待复核的 harness 缺陷规避（追新适配时逐条复核）

> 性质：下表不是产品设计，而是宿主缺陷留下的防御。抬 MAX 追新适配时**必须先
> 复核新版本是否已修**，修好了就按「回退动作」改回正常代码（历史规避不清会
> 沉淀成永久复杂度）。范式侧已完成 0.2.0-rc.1 / rc.2 / 0.2.1-rc.2 三轮复核；
> 本模板随 0.2.1-rc.2 迁移继承同一结论（② 已按回退清单拆除）；**0.2.2-rc.1
> 第四轮复核结论见 §0，四条全部保持**。

## 0. 0.2.2-rc.1 复核结论（本轮，`dsh-v0.2.2-rc.1` / `66491b05`）

| 项 | 结论 | 取证行号 |
| --- | --- | --- |
| ① 宿主全局 fetch 不解压 | **不回退**：`readJsonBody` 与 `accept-encoding: identity` 守护保留 | undici 仍固定 `8.11.2`：`packages/web/web-fetch-http/package.json:38`、`packages/util/http-proxy/package.json:33` |
| ② 卸载重装不重启跑旧码 | **陈旧检测保持拆除、不要加回** | `already-installed` 拒绝 `packages/boot/plugin-manager/src/index.ts:634/639/888`；`reconcileProfile()` / `evictDropped` `packages/boot/hmr/src/index.ts:930,977-989` 仍在 |
| ③ `engines.dsh` | **继续不采纳**（仍单独决定并忽略 peers、执行点全在 import 前） | `packages/boot/app-boot/src/plugin-compatibility.ts:52,57-61` 零 diff |
| ④ 宿主侧 `updateBundle()` | **可选能力，不封禁插件自身提醒**；本轮删提醒是产品决定（方案 A），非 harness 强制 | `packages/boot/plugin-manager/src/index.ts:714`（`:490` `updatable`、`types.ts` 的 `PluginUpdateStep`） |

> 与方案 A 的关系：④ 说明「保留版本提醒的插件升到 0.2.2-rc.1 不会被 harness
> 强制破坏」——槽位 / `inject` 冻结表 / ui-layout 包 / 四个 host API / 桌面
> argv[2] / peer 预检语义全部保留且未变。删除更新提醒是**产品决定**，证据见
> `docs/compat-plan-0.2.2-rc.1.md` §2 特别判定 / §3 / §11。

## ① 宿主全局 fetch 可能不解压压缩响应（防御性规避，真因未坐实）

| 项 | 内容 |
| --- | --- |
| 缺陷描述 | 宿主进程的全局 `fetch` 在某些运行时上响应头全 null、压缩体不解压，`response.json()` 只报 `Unexpected token …`（把网络层问题伪装成解析问题）。社区同款取证：undici 8 被导入后从 legacy 符号取全局 dispatcher，覆盖 Node 内置 fetch。本机桌面 runtime（Node 24.x / Electron-as-node 24.x）实测**复现不出**，故为防御性规避。 |
| 规避代码位置 | `src/shared/json-body.ts`（readJsonBody：原始字节 → UTF-8 试解析 → 按魔数 gzip/zlib-deflate 用 DecompressionStream 自解压（≤3 轮）→ 失败抛字节级诊断）——**0.2.2 起更新提醒删除后当前无调用方，保留作防御工具**；请求侧显式 `accept-encoding: identity` 的原载体 `src/shared/registry-latest.ts` 已随方案 A 删除，该头契约改由 smoke 6f 以「registry 头契约」形式守护（浏览器侧禁加 cache-control/pragma，见 pitfalls §5）。 |
| 回归守护 | smoke-offline 6f：**只留** package-info 求值期缓存 + registry `accept-encoding: identity` 头契约（0.2.2 起四相状态机判定退役）。 |
| 怎么判断上游修没修 | 在宿主进程里对 gzip 响应做一次 `fetch` + `response.headers.get('content-encoding')` + `response.json()` 三件套：头非空且 json 成功 = 已无此症状。 |
| 回退动作 | `registry-latest.ts` 已删（不再有网络 JSON 调用方）；若将来 host 侧重新发起网络 JSON，一律先走 `readJsonBody` 并带 `accept-encoding: identity`，**不要**改回裸 `response.json()`；`json-body.ts` 保留（当前无调用方，防御工具）。 |
| 复核记录 | 0.2.0-rc.1 / 0.2.0-rc.2（范式侧）：复现条件原样存在，**不回退**。本模板 0.2.0-rc.2 迁移：继承规避（首次引入）。**0.2.1-rc.2 复核（范式侧 + 本模板）：仍不回退**——`web-fetch-http/src/network.ts` 与 `http-proxy/src/install.ts` 的 `await import('undici')` + `setGlobalDispatcher` 原样，undici 由 `^8.10.0` 改为**固定** `8.11.2`（仍是 undici 8）；宿主全树唯一生产 `globalThis.fetch =` 仍在 experimental/webworker-runtime。**0.2.2-rc.1 复核：仍不回退**——undici 固定 `8.11.2` 未变（`packages/web/web-fetch-http/package.json:38`、`packages/util/http-proxy/package.json:33`），宿主无 global-fetch polyfill；`src/shared/json-body.ts` 保留（方案 A 后无调用方，见上）。 |

## ② 卸载旧版→重装同名包（不重启）后 host 半继续跑旧代码（已确诊缺陷 → 上游已修 → 防护已拆除）

| 项 | 内容 |
| --- | --- |
| 缺陷描述 | Node ESM 模块缓存：重装只换磁盘，进程内旧模块实例继续运行；且 harness `installBundle` 的 restart-required 判据可被「先卸载」绕过。后果：进程内跑旧代码、磁盘是新包——读磁盘自报版本会把旧模块谎报成新版本，陈旧检测失明；自更新（进程内安装通道）因此只会制造「新 UI + 旧内核」错配（这正是自更新退役的根因）。 |
| 上游修复取证（0.2.1-rc.2 / 0.2.2-rc.1） | 0.2.1-rc.2：`packages/boot/plugin-manager/src/index.ts:439/444`（inspect 阶段对已安装包 `refused('already-installed')`）、`:544`（install 前对已装包 `throw new ManagementFailure('already-installed')`——旧的可绕过护栏已删）；`packages/boot/hmr/src/index.ts:925` `reconcileProfile()` 比对「已加载 `file:` 模块 ↔ 磁盘」（`module-files.ts` 比 inode/size/mtime），`:890` `evictDropped()` 在 `finally` 里驱逐，`:976` 按 `profileRoots()` 覆盖 `<profile>/node_modules/**` 与 link 目标。**0.2.2-rc.1：`plugin-manager/src/index.ts:634/639/888` 的 `already-installed` 拒绝、`hmr/src/index.ts:930` `reconcileProfile()` / `:977-989` `evictDropped` 仍在**，机制原样。 |
| 真机复核 | **2026-10-19 范式侧用户手工复核通过**：插件页卸载 → 重装（不重启）后**不再运行 host 半旧代码**，且运行中版本与磁盘一致、无 `restart-required` 提示。 |
| 原防护（已删） | `src/package-info.ts` 模块求值期缓存自身版本 + `src/client/StaleBanner.tsx`（getUpdateState 快照的 currentVersion 与构建期 BUILD_VERSION **严格不等** → 可关闭 danger 对话框，共提醒两次，零持久化，无豁免分支）。 |
| 拆除清单（本模板 0.2.1 迁移已全部执行） | `src/client/StaleBanner.tsx`、`src/client/build-version.ts`、`scripts/gen-version.mjs` 的 BUILD_VERSION 烧录段、client 入口的 `template-stale-banner` 槽位注册、GlobalNotice 的 stale 让位、`locales.ts` 的 5×2 条 staleBanner 文案、smoke 0d 节与 6f 判定契约、`scripts/check-version-sync.mjs`、`.githooks/pre-commit`（连 `.gitattributes` 的 `.githooks/*` 规则）、`package.json` 的 `check-version` 脚本。**`currentVersion` 恒填保留**作「当前版本」的诚实口径（**0.2.2 起该字段随 `getUpdateState` / `update-state.ts` / `update-contract.ts` 一并删除——方案 A，见 §0 ④**）。 |
| 残留限制（不再用代码兜底） | `link:` 本地链接 + 手工 build、**不经过插件页/CLI 的安装操作**时，host 半仍持进程内旧模块（浏览器端拿到新 bundle → 新 UI + 旧内核）。开发期照旧「改码/改版本后重启 DeepSeek Harness」。 |
| 回归守护 | 保留 `scripts/test-version-bump.mjs`：0.2.2 起改验**插件页 Versions 区更新流程**（装 A → Versions 区更新到 B → 不重启跑新码 → 全程无更新提醒/陈旧对话框），并临时写 profile 的 `.npmrc` 指向 Verdaccio、结束严格还原；不再注入 `registry-latest.ts` 候选源。 |
| 复核记录 | 0.2.0-rc.1 / 0.2.0-rc.2（范式侧）：保留（发现新版本的提示弹窗是正常产品设计，将来只拆陈旧检测、不拆提示）。本模板 0.2.0-rc.2 迁移：继承防护（首次引入）。**0.2.1-rc.2：上游已修 + 真机确认 → 按回退清单整体拆除**（**不要再加回来**）。**0.2.2-rc.1：`already-installed` 与 `reconcileProfile()`/`evictDropped` 仍在 → 陈旧检测保持拆除**；同轮按方案 A 连「版本提示」链路一起删除（产品决定，非上游修复强制，见 §0 ④）。 |

## 已评估、暂不采用的上游机制

### `engines.dsh`（0.2.1-alpha.3 起）

| 项 | 内容 |
| --- | --- |
| 机制事实 | 插件 `package.json` 声明 `engines.dsh` 后，**它单独决定兼容性、peers 被忽略**（`packages/boot/app-boot/src/plugin-compatibility.ts:56-61`）；空串 / 非法范围 / `workspace:` 形态的 `engines.dsh` 一律判为不满足。 |
| 执行点（三层，全在 import 之前） | ① 安装期（plugin-manager 的 inspect/install）；② 运行时 bundle 级（每次启动 + 每次重组）；③ 运行时行级（compatibility-preflight 给不兼容行加 `disabled`）。运行中改 `package.json` 不即时判定。 |
| 否决理由 | ① 只能拒绝、不能解释 → 本插件的「已停用」面板、窗口文案、「更新/降级桌面版到 X」的可执行指引、`DSH_PLUGIN_TEMPLATE_STRICT` 排查开关全部失效；② 合并「声明面/验证面」，写精确版本无收益、写宽范围放行未验证版本；③ 反馈受 recomposition 调度。 |
| 激活条件 | **上游为第三方插件补上「指引更新 / 一键更新」能力后**即可采纳。 |
| 采纳时硬约束 | 精确版本（不写范围）、保留 peers（用于安装期信息面）、保留 `allow-version` 逃生口；注意空串陷阱。 |
| 本轮结论 | 0.2.1-rc.2 / **0.2.2-rc.1** 复核：机制原样生效（`plugin-compatibility.ts:52,57-61` 零 diff，仍单独决定并忽略 peers、执行点全在 import 之前）→ **继续不采纳**，保留 `src/version-gate.ts` 的软禁用 + 可执行指引（行为地图见 AGENTS.md）。 |

## ④ 0.2.2 宿主侧新增 `updateBundle()`（可选能力，不封禁插件自身提醒）

> 本条**不是缺陷规避**，而是 0.2.2 新增的宿主侧能力，记录在此以免后续 agent
> 误把它当成「harness 强制删除插件自身更新提醒」的依据。

| 项 | 内容 |
| --- | --- |
| 机制事实 | 0.2.2 `packages/boot/plugin-manager/src/index.ts:714` 新增 `updateBundle(name, version, options)`（`:490` `updatable`、`types.ts` 的 `PluginUpdateStep`），插件页 Versions 区据此提供「检查 → 卸载旧版 → 安装新版」（失败回滚）。 |
| 性质 | **可选能力**：`shell.overlay`（list/root）、`plugins.bundle.config`（keyed/root）、`PLATFORM_MODULES` 冻结表、`dsh.client.inject`（无白名单）、四个 host API、桌面 argv[2]、peer 预检语义在 0.2.2-rc.1 **全部保留且未变**；一个仍保留版本提醒与 overlay 条目的插件升到 0.2.2-rc.1 **不会被 harness 强制破坏**。 |
| 本轮结论 | 删除全部更新提醒（方案 A）是**产品决定**（与官方版本区功能重复、插件零出网、避免把已被取代的范式教给派生插件），不是 harness 要求，也不是 ④ 的强制后果。证据见 `docs/compat-plan-0.2.2-rc.1.md` §2 特别判定 / §3 / §11。 |
