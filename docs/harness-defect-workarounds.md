# 待复核的 harness 缺陷规避（追新适配时逐条复核）

> 性质：下表不是产品设计，而是宿主缺陷留下的防御。抬 MAX 追新适配时**必须先
> 复核新版本是否已修**，修好了就按「回退动作」改回正常代码（历史规避不清会
> 沉淀成永久复杂度）。范式侧已完成 0.2.0-rc.1 / rc.2 / 0.2.1-rc.2 三轮复核；
> 本模板随 0.2.1-rc.2 迁移继承同一结论（② 已按回退清单拆除），下一轮追新从
> 「0.2.1-rc.2 结论」起手。

## ① 宿主全局 fetch 可能不解压压缩响应（防御性规避，真因未坐实）

| 项 | 内容 |
| --- | --- |
| 缺陷描述 | 宿主进程的全局 `fetch` 在某些运行时上响应头全 null、压缩体不解压，`response.json()` 只报 `Unexpected token …`（把网络层问题伪装成解析问题）。社区同款取证：undici 8 被导入后从 legacy 符号取全局 dispatcher，覆盖 Node 内置 fetch。本机桌面 runtime（Node 24.x / Electron-as-node 24.x）实测**复现不出**，故为防御性规避。 |
| 规避代码位置 | `src/shared/json-body.ts`（readJsonBody：原始字节 → UTF-8 试解析 → 按魔数 gzip/zlib-deflate 用 DecompressionStream 自解压（≤3 轮）→ 失败抛字节级诊断）；`src/shared/registry-latest.ts`（请求侧显式 `accept-encoding: identity`，让请求不进压缩路径；host 半 noCache 加 cache-control——浏览器侧禁加，见 pitfalls §5）。 |
| 回归守护 | smoke-offline 6f：registry 请求钉 `accept-encoding: identity` 契约。 |
| 怎么判断上游修没修 | 在宿主进程里对 gzip 响应做一次 `fetch` + `response.headers.get('content-encoding')` + `response.json()` 三件套：头非空且 json 成功 = 已无此症状。 |
| 回退动作 | registry-latest 改回直接 `response.json()`；json-body.ts 删除（保留与否只影响诊断能力，不影响正确性）。 |
| 复核记录 | 0.2.0-rc.1 / 0.2.0-rc.2（范式侧）：复现条件原样存在，**不回退**。本模板 0.2.0-rc.2 迁移：继承规避（首次引入）。**0.2.1-rc.2 复核（范式侧 + 本模板）：仍不回退**——`web-fetch-http/src/network.ts` 与 `http-proxy/src/install.ts` 的 `await import('undici')` + `setGlobalDispatcher` 原样，undici 由 `^8.10.0` 改为**固定** `8.11.2`（仍是 undici 8）；宿主全树唯一生产 `globalThis.fetch =` 仍在 experimental/webworker-runtime。 |

## ② 卸载旧版→重装同名包（不重启）后 host 半继续跑旧代码（已确诊缺陷 → 上游已修 → 防护已拆除）

| 项 | 内容 |
| --- | --- |
| 缺陷描述 | Node ESM 模块缓存：重装只换磁盘，进程内旧模块实例继续运行；且 harness `installBundle` 的 restart-required 判据可被「先卸载」绕过。后果：进程内跑旧代码、磁盘是新包——读磁盘自报版本会把旧模块谎报成新版本，陈旧检测失明；自更新（进程内安装通道）因此只会制造「新 UI + 旧内核」错配（这正是自更新退役的根因）。 |
| 上游修复取证（0.2.1-rc.2） | `packages/boot/plugin-manager/src/index.ts:439/444`（inspect 阶段对已安装包 `refused('already-installed')`）、`:544`（install 前对已装包 `throw new ManagementFailure('already-installed')`——旧的可绕过护栏已删）；`packages/boot/hmr/src/index.ts:925` `reconcileProfile()` 比对「已加载 `file:` 模块 ↔ 磁盘」（`module-files.ts` 比 inode/size/mtime），`:890` `evictDropped()` 在 `finally` 里驱逐，`:976` 按 `profileRoots()` 覆盖 `<profile>/node_modules/**` 与 link 目标。 |
| 真机复核 | **2026-10-19 范式侧用户手工复核通过**：插件页卸载 → 重装（不重启）后**不再运行 host 半旧代码**，且运行中版本与磁盘一致、无 `restart-required` 提示。 |
| 原防护（已删） | `src/package-info.ts` 模块求值期缓存自身版本 + `src/client/StaleBanner.tsx`（getUpdateState 快照的 currentVersion 与构建期 BUILD_VERSION **严格不等** → 可关闭 danger 对话框，共提醒两次，零持久化，无豁免分支）。 |
| 拆除清单（本模板 0.2.1 迁移已全部执行） | `src/client/StaleBanner.tsx`、`src/client/build-version.ts`、`scripts/gen-version.mjs` 的 BUILD_VERSION 烧录段、client 入口的 `template-stale-banner` 槽位注册、GlobalNotice 的 stale 让位、`locales.ts` 的 5×2 条 staleBanner 文案、smoke 0d 节与 6f 判定契约、`scripts/check-version-sync.mjs`、`.githooks/pre-commit`（连 `.gitattributes` 的 `.githooks/*` 规则）、`package.json` 的 `check-version` 脚本。**`currentVersion` 恒填保留**作「当前版本」的诚实口径。 |
| 残留限制（不再用代码兜底） | `link:` 本地链接 + 手工 build、**不经过插件页/CLI 的安装操作**时，host 半仍持进程内旧模块（浏览器端拿到新 bundle → 新 UI + 旧内核）。开发期照旧「改码/改版本后重启 DeepSeek Harness」。 |
| 回归守护 | 保留 `scripts/test-version-bump.mjs`：Phase 2 验证改为「重装后立刻以新版本运行、且**不弹任何**陈旧对话框」——它同时是版本更新闭环与上游修复的回归断言。 |
| 复核记录 | 0.2.0-rc.1 / 0.2.0-rc.2（范式侧）：保留（发现新版本的提示弹窗是正常产品设计，将来只拆陈旧检测、不拆提示）。本模板 0.2.0-rc.2 迁移：继承防护（首次引入）。**0.2.1-rc.2：上游已修 + 真机确认 → 按回退清单整体拆除**（**不要再加回来**）。 |

## 已评估、暂不采用的上游机制

### `engines.dsh`（0.2.1-alpha.3 起）

| 项 | 内容 |
| --- | --- |
| 机制事实 | 插件 `package.json` 声明 `engines.dsh` 后，**它单独决定兼容性、peers 被忽略**（`packages/boot/app-boot/src/plugin-compatibility.ts:56-61`）；空串 / 非法范围 / `workspace:` 形态的 `engines.dsh` 一律判为不满足。 |
| 执行点（三层，全在 import 之前） | ① 安装期（plugin-manager 的 inspect/install）；② 运行时 bundle 级（每次启动 + 每次重组）；③ 运行时行级（compatibility-preflight 给不兼容行加 `disabled`）。运行中改 `package.json` 不即时判定。 |
| 否决理由 | ① 只能拒绝、不能解释 → 本插件的「已停用」面板、窗口文案、「更新/降级桌面版到 X」的可执行指引、`DSH_PLUGIN_TEMPLATE_STRICT` 排查开关全部失效；② 合并「声明面/验证面」，写精确版本无收益、写宽范围放行未验证版本；③ 反馈受 recomposition 调度。 |
| 激活条件 | **上游为第三方插件补上「指引更新 / 一键更新」能力后**即可采纳。 |
| 采纳时硬约束 | 精确版本（不写范围）、保留 peers（用于安装期信息面）、保留 `allow-version` 逃生口；注意空串陷阱。 |
| 本轮结论 | 0.2.1-rc.2 复核：机制原样生效 → **继续不采纳**，保留 `src/version-gate.ts` 的软禁用 + 可执行指引（行为地图见 AGENTS.md）。 |
