# 待复核的 harness 缺陷规避（追新适配时逐条复核）

> 性质：下表不是产品设计，而是宿主缺陷留下的防御。抬 MAX 追新适配时**必须先
> 复核新版本是否已修**，修好了就按「回退动作」改回正常代码（历史规避不清会
> 沉淀成永久复杂度）。范式侧已完成 0.2.0-rc.1 / rc.2 两轮复核；本模板随
> 0.2.0-rc.2 迁移继承同一结论，下一轮追新从「rc.2 结论」起手。

## ① 宿主全局 fetch 可能不解压压缩响应（防御性规避，真因未坐实）

| 项 | 内容 |
| --- | --- |
| 缺陷描述 | 宿主进程的全局 `fetch` 在某些运行时上响应头全 null、压缩体不解压，`response.json()` 只报 `Unexpected token …`（把网络层问题伪装成解析问题）。社区同款取证：undici 8 被导入后从 legacy 符号取全局 dispatcher，覆盖 Node 内置 fetch。本机桌面 runtime（Node 24.x / Electron-as-node 24.x）实测**复现不出**，故为防御性规避。 |
| 规避代码位置 | `src/shared/json-body.ts`（readJsonBody：原始字节 → UTF-8 试解析 → 按魔数 gzip/zlib-deflate 用 DecompressionStream 自解压（≤3 轮）→ 失败抛字节级诊断）；`src/shared/registry-latest.ts`（请求侧显式 `accept-encoding: identity`，让请求不进压缩路径；host 半 noCache 加 cache-control——浏览器侧禁加，见 pitfalls §5）。 |
| 回归守护 | smoke-offline 6f：registry 请求钉 `accept-encoding: identity` 契约。 |
| 怎么判断上游修没修 | 在宿主进程里对 gzip 响应做一次 `fetch` + `response.headers.get('content-encoding')` + `response.json()` 三件套：头非空且 json 成功 = 已无此症状。 |
| 回退动作 | registry-latest 改回直接 `response.json()`；json-body.ts 删除（保留与否只影响诊断能力，不影响正确性）。 |
| 复核记录 | 0.2.0-rc.1 / 0.2.0-rc.2（范式侧）：复现条件原样存在，**不回退**。本模板 0.2.0-rc.2 迁移：继承规避（首次引入）。 |

## ② 卸载旧版→重装同名包（不重启）后 host 半继续跑旧代码（已确诊缺陷的防护）

| 项 | 内容 |
| --- | --- |
| 缺陷描述 | Node ESM 模块缓存：重装只换磁盘，进程内旧模块实例继续运行；且 harness `installBundle` 的 restart-required 判据可被「先卸载」绕过。后果：进程内跑旧代码、磁盘是新包——读磁盘自报版本会把旧模块谎报成新版本，陈旧检测失明；自更新（进程内安装通道）因此只会制造「新 UI + 旧内核」错配（这正是自更新退役的根因）。 |
| 防护代码位置 | `src/package-info.ts`（模块求值期——import 时——一次性读自身 package.json 并缓存：缓存值严格等于「正在运行的代码版本」；读取失败缓存 null = 包损坏，`selfPackageInfo()` 延迟抛错、`selfVersionOrNull()` 静默 null）；`src/client/StaleBanner.tsx`（getUpdateState 快照的 currentVersion 与构建期 BUILD_VERSION **严格不等** → 可关闭 danger 对话框，共提醒两次，零持久化，无豁免分支）。 |
| 回归守护 | smoke-offline 0d（三处版本一致）+ 6f（package-info 求值期缓存断言 + StaleBanner 严格不等契约钉子）+ 7（updateSelf 零残留）。 |
| 怎么判断上游修没修 | 宿主进程内 import 本插件入口后卸载重装同名包（不重启）：若 harness 对该形态强制 restart-required（或模块缓存被清理、新代码被加载），即已修。 |
| 回退动作 | 若自更新通道未来重新引入，须先确认 installBundle 后进程内模块会被替换；本防护（package-info 自报口径 + StaleBanner）即便如此也**建议保留**——它是「进程内代码 ≠ 磁盘包」的一般性检测，与安装通道无关。 |
| 复核记录 | 0.2.0-rc.1 / 0.2.0-rc.2（范式侧）：**保留**（发现新版本的提示弹窗是正常产品设计，将来只拆陈旧检测、不拆提示）。本模板 0.2.0-rc.2 迁移：继承防护（首次引入）。 |
