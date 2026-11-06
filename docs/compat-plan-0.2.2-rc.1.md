# dsh-plugin-template × the agent harness（DSH）0.2.2-rc.1 兼容迁移计划

> **性质**：`0.2.1 线 → 0.2.2 线` **跨 minor 线 / tuple 变化迁移**（按 AGENTS.md
> 跨线纪律 → MIN/MAX 同轮上移、peer/dev 下限重写），参考衍生插件
> `c:/agentProjects/dsh-vibe-wallpaper` 的 commit history 制定。
> **状态：编译级迁移已完成（2026-11-06）· 真机验收待人工**。本文由计划转为
> 该轮**执行记录**：§3 决策已确认、§9 checklist 已按结果勾选、§12 记录实际偏差。
> **决策确认**：D1 = **方案 A（删除全部更新提醒）** /
> D2 = **采用 `meta.detail`** / D3 = **单点窗口** / D4 = **一步到位** /
> D5 = **本轮不 bump 版本**。§5.2 方案 B 仅存档。
>
> **目标版本判定依据**（若意图是别的版本，请先确认再执行）：
> ① 本机桌面版 `resources/runtime/primary-runtime/runtime.json` 的
> `desktopVersion` 已是 `0.2.2-rc.1`（node 24.21.0）；② `c:/deepseek-harness`
> 当前签出 `dsh-v0.2.2-rc.1`（`66491b05`）；③ 衍生插件的最终迁移目标也是
> 0.2.2-rc.1（`9bbcd07` + 3 个 refinement，发版 `0.2.0`）。
>
> **参考链**：`e4948e7`（2026-10-24）从本模板当前 HEAD `12d9b8f` 衍生，
> 衍生时窗口同为 `[0.2.1-rc.1, 0.2.1-rc.2]` —— 两边**同一份代码基线**，
> 故其三轮追新（`53d8b73` rc.3 → `cea6987` rc.5 → `9bbcd07` 0.2.2-rc.1）
> 与三份 `docs/compat-plan-*.md` 可作为本轮直接复用的取证链。

---

## 0. 执行状态速览

| 项 | 迁移前 | 执行结果 |
| --- | --- | --- |
| 窗口 | `[0.2.1-rc.1, 0.2.1-rc.2]` | ✅ `[0.2.2-rc.1, 0.2.2-rc.1]`（单点） |
| harness 源码 | 待取证 | ✅ 签出 `dsh-v0.2.2-rc.1` / `66491b05`，逐 API 复核（§2） |
| peer/dev + 基座 | `^0.2.1-rc.1` + 旧基座 | ✅ `^0.2.2-rc.1` + cordis 4.1.0 / schemastery 3.19.0 / cosmokit 1.9.0 / group·include 1.1.0；删 `dsh-client-ui-layout` |
| `engines.node` | `>=22` | ✅ `>=24.9` |
| 决策 | 待确认 | ✅ D1=A / D2=采用 / D3=单点 / D4=一步到位 / D5=不 bump |
| 更新提醒链路 | 完整（host + client） | ✅ 全部删除（方案 A）→ 插件零出网 |
| 插件页 `meta.detail` | 无 | ✅ 采用：`gen-version.mjs` 生成 `locale/*.json` 的 meta.detail 与 `assets/detail/{zh,en}.md` |
| 指引同步 | 旧窗口 | ✅ AGENTS.md / README / docs 全清单 |
| 插件版本 | `0.1.0` | ✅ 本轮**不 bump** |
| 编译级验证 | — | ✅ `pnpm run typecheck` exit 0 / `pnpm run build` exit 0 / `node scripts/smoke-offline.mjs` **ALL PASSED（39 项）** |
| 真机验收 | — | ⏳ **待人工**（需重启 the agent harness；见 §8 的 7 项） |

## 1. 为什么现在必须迁移

- 当前桌面版内置 `0.2.2-rc.1`，而模板 `MAX_HARNESS_VERSION = 0.2.1-rc.2`。
  **实际后果**：入口被加载 → 自家门禁 `compareVersions(0.2.2-rc.1, MAX) > 0`
  抛错 → `soft-disable` 软禁用 → 插件页显示停用面板，`greet` / 配置页 /
  更新提示全部不可用。
- **一处需要修正的旧结论**：AGENTS.md 与历史 compat-plan 写「peer precheck 的
  caret 数学上不跨 minor 线」。实测 harness 自带 `semver@7.8.5`：
  `semver.satisfies('0.2.2-rc.1', '^0.2.1-rc.1', { includePrerelease: true }) === true`
  （caret 展开 `>=0.2.1-rc.1 <0.3.0-0`）。即**声明面并不会拦下模板**，
  软禁用来自自家 MAX 门禁。但「跨线必须重写 peer/dev」的操作结论**不变**——
  理由不是 precheck 数学，而是 MIN 上移的硬约定、类型面/锁文件要落到新线、
  以及窗口承诺面须收敛到同 tuple。此条建议回填 AGENTS.md 的表述（见 §6 可选项）。
- 0.2.2 起官方 plugin-manager 提供插件页版本检查/更新流程（插件页 Versions 区），
  与模板自建的 registry 轮询 + overlay 弹窗功能重叠 —— 这是决策 D1 的背景。
- **真机条件已具备**：衍生插件记录里「待人工（桌面壳需先升 0.2.2-rc.1）」
  的前提已消失，本轮可在本机直接做端到端验收。

### 现状 → 目标态对照

| 维度 | 现状 | 目标 |
| --- | --- | --- |
| 窗口 | `[0.2.1-rc.1, 0.2.1-rc.2]` | `[0.2.2-rc.1, 0.2.2-rc.1]`（单点） |
| peer/dev dsh-* | peer 10 项 + dev 11 项全为 `^0.2.1-rc.1` | 全部 `^0.2.2-rc.1` |
| 基座 | cordis `^4.0.5` / schemastery `^3.18.5` / cosmokit `^1.8.6` / group `~1.0.5` / include `~1.0.10` | `^4.1.0` / `^3.19.0` / `^1.9.0` / `~1.1.0` / `~1.1.0` |
| `engines.node` | `>=22` | `>=24.9` |
| `dsh.client.inject` | connection / locale / ui-plugin-manager | **不变**（新线 `PLATFORM_MODULES` 零 diff） |
| `dsh-client-ui-layout` peer | 有（`shell.overlay` 用） | **删除**（随 overlay 注册一并移除） |
| 更新链路 | `update-state` / `registry-latest` / `update-contract` / `GlobalNotice` / 2 RPC / overlay | **全部删除**（方案 A） |
| locale 元数据 | `meta.title` + `meta.description`（窗口烧在 description） | 同 + **新增 `meta.detail`**（D2） |
| 缺陷规避 | ① `json-body` 保留；② 陈旧检测已拆除；`engines.dsh` 不采纳 | **全部保持** |

## 2. 取证结论（`dsh-v0.2.1-rc.2` → `dsh-v0.2.2-rc.1`）

> 纪律（AGENTS.md）：先 `git -C c:/deepseek-harness describe --tags` 确认签出，
> 再逐 API 核实，不要凭记忆写兼容代码。本轮已确认签出 `66491b05`、工作区干净。

| 项 | 事实 |
| --- | --- |
| 区间规模 | `git rev-list --count dsh-v0.2.1-rc.2..dsh-v0.2.2-rc.1` = **2642**；`git diff --shortstat` = **8278 files**, +398390 / −717805 |
| rc.5→rc.1 子区间 | 2623 commits / 8120 files（衍生插件 `compat-plan-0.2.2-rc.1.md` §1） |
| 基座 / engines | 根 `package.json:9` `engines.node` = **`>=24.9.0`**（旧 `^22.19.0 \|\| >=24.0.0`）；vendor 实装 cordis **4.1.0** / schemastery **3.19.0** / cosmokit **1.9.0** / group·include **1.1.0**（旧 4.0.5 / 3.18.5 / 1.8.6 / 1.0.5 / 1.0.10）。**唯一环境层 breaking**，只影响 dev/安装环境 |
| 官方指南 | `git diff --name-status rc.5 rc.1 -- docs/upgrade-guide` 新增 54 条 `guide.zh.md`（**注意目录名 ≠ 首发版本**，多为后补录）；与本插件相关 8 条**全判兼容/组合层/无关**。逐条核实：`webserver-index-peer`（`renderIndex(html,peer)` 增第二参，本插件只读注入表）、`conditional-tools`（`register(def,{when})` 新增**可选**条件；`system-prompt/assemble` 不再带 tools，本插件不监听 assemble）、`tool-executor-plugins`（组合层）、`built-in-japanese`（自有 ns）、`node-24`（→ engines）、`cordis-loader-entry-trees`（`EntryTree.write()`→`commit(change)`、Include journal；**只动 cordis.yml 持久化层，不动注册 API**，`cordis.patch.yml` 不受影响）、`cordis-timer-wrappers` / `official-bundle-lists`（不依赖）。**无一条 breaking 于「注册 typert/tools/settings/client 槽位」的插件** |
| 依赖面（host API） | `boot/app-boot/src/plugin-compatibility.ts` 零 diff；`ctx.typert.register(contribution)`（`typert/registry/src/service.ts:568`）、`ctx.tools.register(def,options={})`（`core/tools/src/index.ts:128`）+ `defineTool`（`schema.ts:555`）、`ctx.settings.configure/replace`（`settings/src/index.ts:266/358`）、`ctx.webServer.register(route)`（`host/webserver/src/index.ts:445`）**签名全部未变** |
| 依赖面（client） | `client/web/src/platform.ts:8` PLATFORM_MODULES **10 项与 rc.2 逐字相同**；`modules/src/client/manifest.ts:182` 仅校验 `inject` 是 `string[]`，`ui-workspace/src/client/index.ts:98` 明注 *informational … NOT constrained* → **`inject` 无白名单**（但仍按模板纪律核对）；`ui-plugin-manager/src/client/slot-contract.ts:142` `plugins.bundle.config` = `{keyed,root}`、**`key` 是 required**、schema 未变；`ui-layout/src/client/index.ts:107` `shell.overlay` = `{list,root}` **未变**；`@deepseek-ai/dsh-client-ui-layout@0.2.2-rc.1` 包仍存在 |
| 插件页详情区 | 0.2.2 **新增** `packages/util/plugin-detail/`（`git cat-file` 证实 rc.2 无此路径），经 `BundleDetailSection.tsx` → `DetailDocument.tsx` → `document.ts` 选 `locale meta.detail`（非空、相对 `.md`），**缺失 = undefined 不报错，回退渲染包内 README**。属**可选能力**。「`meta.description` 不能空串」在源码里是 harness 对自身官方 bundle / 升级指南的**构建期闸门**（`verify-locale-metadata.ts` 等），对第三方插件**无运行时强制**；但衍生插件实测记录仍把它列为坑（空串会弃整份 locale），故按经验保持非空（§7 坑 1） |
| 桌面锚 / peer 预检 | `apps/desktop/src/host-process.ts:212-218` spawn 参数序 `entry, runtimeDir, …` → **`argv[2]=runtimeDir` 锚成立**；`plugin-compatibility.ts:52` 仍是 `semver.satisfies(..., {includePrerelease:true})`、`:57-61` `engines.dsh` 仍单独决定并忽略 peers。0.2.2 新增 **version exemption**（`dsh plugin allow-version` / `set_version_exemption`），与 AGENTS.md 已述的豁免路径一致 |
| 缺陷规避 | ① 宿主全局 fetch 不解压：undici 仍固定 `8.11.2`（`web/web-fetch-http/package.json:38`、`util/http-proxy/package.json:33`）→ **不回退**，`shared/json-body.ts` 与 `accept-encoding: identity` 守护保留；② `plugin-manager/src/index.ts:634/639/888` 的 `already-installed` 拒绝 + `hmr/src/index.ts:930` `reconcileProfile()` / `:977-989` `evictDropped` 仍在 → **陈旧检测保持拆除，不要加回**；③ `engines.dsh` 执行点全在 import 前 → **继续不采纳**；④ 0.2.2 **宿主侧新增** `updateBundle(name,version,options)`（`plugin-manager/src/index.ts:714`、`:490` `updatable`、`types.ts` 的 `PluginUpdateStep`）——**可选能力，不封禁插件自身版本提醒**（这是 D1 的背景，非强制删除理由） |
| 声明面 / 发布态 | 实测 `^0.2.1-rc.1` 放行 `0.2.2-rc.1`（见 §1），peer 预检**不会**拒绝现有声明；但 pnpm 解析 `^0.2.1-rc.1` 仍停在 0.2.1 tuple、typecheck 面按插件纪律须改写。npm：`@deepseek-ai/dsh` `latest = next = 0.2.2-rc.1`、`alpha = 0.2.2-alpha.3` → rc.1 系列已可安装 |
| 特别判定 | **一个仍保留版本更新提醒与 `shell.overlay` 条目的插件，升到 0.2.2-rc.1 不会被 harness 强制破坏**：槽位、`inject` 冻结表、ui-layout 包、四个 host API、桌面 argv[2]、peer 预检语义全部保留且未变；详情区与 `updateBundle` 都是可选项/宿主侧能力 |

**核心结论：0.2.2-rc.1 对本模板没有强制 API 适配**。必改项全部落在「版本声明 / 依赖 caret / 基座 / engines / 指引」层；「删除更新提醒」「删 `dsh-client-ui-layout` peer」「采用 `meta.detail`」都是**产品决定**，不是 harness 要求（证据见 §3、§11）；**本轮按 D1/D2 已确认全部采纳，执行面见 §5.1 / §5.3**。已逐项验证无需改动：`src/index.ts` 静态图、`cordis.patch.yml`、`src/shared/*`（禁 Node 依赖）、三处 client 槽位注册、`greet` / `template/*` 端点串。

## 3. 需拍板的决策点

| ID | 决策 | 选项 | **确认结果** |
| --- | --- | --- | --- |
| **D1** | 是否跟进衍生插件「删除全部版本更新提醒」 | A 跟进删除 / B 保留链路 | ✅ **A 跟进删除** |
| **D2** | 是否采用 0.2.2 插件页详情区 `meta.detail` | 采用 / 不采用（回退渲染包内 README） | ✅ **采用**（提升为 P1 必做，见 §5.3） |
| **D3** | 窗口形态 | 单点 / 保留旧 MIN | ✅ **单点 `[0.2.2-rc.1, 0.2.2-rc.1]`** |
| **D4** | 执行路径 | 一步到位 / 复刻 rc.3→rc.5→rc.1 三步 | ✅ **一步到位**（三轮取证作证据链复用） |
| **D5** | 插件版本 | 本轮 bump / 不 bump | ✅ **不 bump**（真机通过后单独 `chore(release)`） |

> 以下保留两案依据供追溯；**执行路径只有方案 A**（§5.1 + §5.3）。

### D1 决策依据（方案 A 已确认，方案 B 仅存档）

**方案 A（✅ 已确认采纳，对齐衍生插件最终态）**
- 理由：① 0.2.2 官方 plugin-manager 已接管插件页版本检查/更新（Versions 区 →
  「检查 → 卸载旧版 → 安装新版」，失败回滚），插件自建 registry 轮询 + overlay
  弹窗与之重复，且会把「已被官方能力取代」的范式教给所有派生插件；② 删除后
  插件**零出网**，收缩攻击面；③ 衍生插件已在真机走通（`9bbcd07` + `4fef58b` +
  `3f18af7` + `c004beb`），坑已踩完。
- 代价（**breaking change**）：删 `template/checkUpdate` / `template/getUpdateState`
  两个 RPC 与 `shell.overlay` 条目 `template-update-notice`；需同步改 AGENTS.md
  硬约定「插件更新 = 卸载重装；插件只做版本提示（非阻断）」、README、
  `docs/derivation-guide.md` 表②（overlay id）/表⑤（`update-contract.ts` 落点）、
  smoke 6f/7 节、`scripts/test-version-bump.mjs`。
- **必须补的范式覆盖**：`shell.overlay` 是模板演示的槽位之一，删除后要在
  derivation-guide 明标「该范式已退役（0.2.2 起官方插件页接管），历史实现见
  `git show 12d9b8f:src/client/GlobalNotice.tsx`」，避免派生 agent 找不到示例。

**方案 B（未采纳，仅存档——执行时不要照此操作）**

> 以下仅说明「为什么 B 也可行」及未采纳的代价，保留作为决策追溯。
- 完全可行：0.2.2 上 `shell.overlay`（list/root）与 `plugins.bundle.config` 均未变，
  `PLATFORM_MODULES` 逐字相同、`dsh.client.inject` 声明面无需改动；`dsh-client-ui-layout` 包仍存在。
- 代价：**必须保留 `dsh-client-ui-layout` peer**（删它只因不再引用）；保留网络
  调用与 `registry-latest.ts`；与官方版本区重复；`test-version-bump.mjs` 仍向
  `registry-latest.ts` 注入候选源（0.2.2 官方版本检查读的是 profile 的
  `pnpm config get registry`，两套机制互不相干，见 §7 坑 4）。

## 4. 必改清单 P0（harness 强制，与 D1 无关）

| # | 文件 / 落点 | 现值 → 目标 | 依据 / 验收 |
| --- | --- | --- | --- |
| 4.1 | `src/version-gate.ts:77,90` | MIN `0.2.1-rc.1` → `0.2.2-rc.1`；MAX `0.2.1-rc.2` → `0.2.2-rc.1` | 跨线 MIN/MAX 同轮上移；注释按「跨 minor 迁移」整段重写（`:19-20,62-90,124-139`），删 rc.1「用户指定纳入」的旧说明，写入新取证 tag / 区间规模 / `^0.2.2-rc.1` 放行集 |
| 4.2 | `package.json:56-67,70-85` | peer **10 项** + dev **11 项** `@deepseek-ai/dsh-*` 全部 `^0.2.1-rc.1` → `^0.2.2-rc.1`（模板**不引入** `dsh-skill`，那是衍生插件才有的依赖） | 依赖名单同线收敛硬约定；`pnpm install` 后 lockfile 的 dsh 包 + 基座全部实装 0.2.2-rc.1 |
| 4.3 | `package.json` 基座 | cordis `^4.1.0` / schemastery `^3.19.0` / cosmokit `^1.9.0` / group·include `~1.1.0` | 对齐 rc.1 vendor 实装 |
| 4.4 | `package.json:44` | `engines.node`: `>=22` → `>=24.9`（源码精确值 `>=24.9.0`） | 官方指南 `v0.2.1-rc.2/node-24`：**环境层唯一硬性改动**，只影响 dev/安装环境；本机桌面 node 24.21.0 已满足 |
| 4.5 | `package.json:36-40` / `tsdown.config.ts:19,74-85` | `dsh.client.inject` 与 `neverBundle` **按新 `PLATFORM_MODULES` 逐项核对** | 新线该表 10 项与 rc.2 **逐字相同** → 预计不变；`inject` 仅被校验为 `string[]`、**无白名单**（`modules/src/client/manifest.ts:182`、`ui-workspace/src/client/index.ts:98`），但按模板纪律仍核对；改声明后**必须重启 harness**（坑 7：扫描缓存永不过期） |
| 4.6 | 薄入口 `src/index.ts` | **结构不变**（`name` / `inject=['tools','typert','settings']` / `export {Config}` / 两道门禁 / 动态 import） | 静态图硬约束：只许 node builtins + schemastery，禁止加任何 `@deepseek-ai/dsh-*` 运行时 import（smoke 0/0b 守护）；注释补「0.2.2 起不做任何更新提示」 |
| 4.7 | `src/main.ts` / `src/remote.ts` / `src/client/*` 的 API 面 | **无强制改动**（但按 §5.1 删除更新链路） | 逐 API 复核 `defineTool` / `ctx.typert.register` / `ctx.settings.replace` / `InvocationDescriptor` / 三处槽位（坑 1：未声明静默不触发，逐槽点名核对）；`template/ping`、`template/getConfig`、`template/saveConfig` 端点串保持不变 |
| 4.8 | `src/client/ui/*` 18 个复制件 | 注释 `@ dsh-v0.2.1-rc.2` → `@ dsh-v0.2.2-rc.1` | 原语是官方 1:1 复制件，须 `git diff` 逐行复核新 tag 是否变更；`Menu.tsx:15` 的本地修复记录保留 |
| 4.9 | `scripts/smoke-offline.mjs:196,200` | 6a fixture `0.2.1-rc.2` → `0.2.2-rc.1`（两处） | 桌面单锚守护；6f/7 按 §5.1 反转、0g 按 §5.3 增断言，其余节读常量/形态不需改 |
| 4.10 | `pnpm-lock.yaml` | `pnpm install` 重整 | 全部 dsh 包 + 基座落到 rc.1 |
| 4.11 | `pnpm-workspace.yaml`（**新建**） | `minimumReleaseAgeExclude` 白名单 | 0.2.2-rc.1 系列包刚发布，pnpm 的 minimumReleaseAge 会冻结安装；衍生插件用 37 条白名单绕过（见其 `pnpm-workspace.yaml`） |
| 4.12 | `locale/{zh,en}.json` | **勿手改**，跑一次 `pnpm run build` | gen-version 依新 MIN/MAX 重生成 description 里的窗口串；漏跑 = 卡片窗口停在旧值（发版纪律） |
| 4.13 | 指引同步（同一轮改完） | 见下表 | 留旧窗口 = 让后续 agent 照旧窗口写代码 |

**指引同步清单**（4.13）：`AGENTS.md`（窗口/依赖/行为地图/兼容参考/缺陷复核/「注意签出版本」段；**方案 A 还要删掉「插件更新 = 卸载重装；插件只做版本提示（非阻断）」整条硬约定**，改写为「0.2.2 起插件不做任何更新提醒、不联网查 registry，版本检查/更新由官方插件页接管」；**注意 65536 字节静默截断预算，长内容拆 docs 分册**）、`README.md`（范围/窗口/依赖与追新/更新链路/文件清单）、`docs/module-map.md`、`docs/harness-defect-workarounds.md`（本轮复核结论 + 新取证行号）、`docs/compat-plan-TEMPLATE.md`（取证基线与窗口前提改为 0.2.2-rc.1）、`docs/pitfalls.md`、`docs/versioning-and-update-plan.md`、`docs/derivation-guide.md`（表② overlay id 与表⑤ `update-contract.ts` 落点标注退役，新增 `assets/detail/` 与 `pnpm-workspace.yaml` 落点）。
历史执行记录 `docs/compat-plan-0.2.1-rc.2.md` / `-0.2.0-rc.2.md` / `compat-guide-*` **归档勿改**。

**执行记录**：按 AGENTS.md 每轮兼容迁移须留一份 `docs/compat-plan-<目标版本>.md`。本文已按该命名建立为**计划态**，执行时逐节填写状态/结论即转为执行记录并保留（**不要再用 `docs/compat-plan-TEMPLATE.md` 覆盖本文**）。

## 5. 方案 A 执行清单（D1 已确认采纳）

### 5.1 删除全部更新提醒（执行路径）

| 动作 | 文件 |
| --- | --- |
| 删 | `src/update-state.ts`、`src/shared/registry-latest.ts`、`src/shared/update-contract.ts`、`src/client/GlobalNotice.tsx`(+css)、`src/client/disabled-version-check.ts` |
| 改 | `src/main.ts`（删 `startUpdateCheck`）、`src/remote.ts`（删两个描述符与方法）、`src/client/index.ts`（删 overlay 注册 + 两个 API 调用 + `ui-layout` type import；停用面板载荷只留 `reason/min/max/runtimeVersion`）、`src/client/api.ts`、`src/client/TemplateSection.tsx`(+css)（删更新条）、`src/client/TemplateDisabledSection.tsx`、`src/client/locales.ts`（删 update/disabledPlugin 键，zh/en 同步）、`src/package-info.ts`（删 `selfVersionOrNull`）、`src/soft-disable.ts` / `src/shared/disabled-flag.ts`（载荷收敛） |
| 保留 | `src/shared/json-body.ts`（缺陷① 防御工具，当前无调用方；将来 host 侧读网络 JSON 必须走它）、version gate、停用面板、`lib/client.js` 的 `plugins.bundle.config` 槽位 |
| 守护 | `scripts/smoke-offline.mjs`：6f 只留 package-info 求值期缓存 + registry 头契约；**第 7 节反转**为「两 RPC / 状态机 / updateSelf 在 host+client 双侧零残留 + `lib/update-state.js`、`lib/shared/registry-latest.js` 不存在 + 主要产物无 `fetch(` + `json-body` 保留」 |
| 测试台 | `scripts/test-version-bump.mjs` **保留并改造**：不再注入 `registry-latest.ts` 候选源、不再验 available 弹窗；改验插件页更新流程（装 A → Versions 区更新到 B → 不重启跑新码 → 无任何提醒） |
| 依赖 | 删 `dsh-client-ui-layout` peer + dev；`package.json` 的 `files` / `dsh.client.inject` 不变 |

### 5.2 方案 B：保留更新提醒

- 4.2 中 `dsh-client-ui-layout` **照常升到 `^0.2.2-rc.1`**（不要删）；
- `src/client/index.ts` 的 `shell.overlay` 注册、`GlobalNotice.tsx`、两个 RPC、
  `update-state.ts` / `registry-latest.ts` / `json-body.ts` 全部保留；
- smoke 6f/7 节**不改**（仍守护四相状态机 + registry 头契约 + 自更新退役契约）；
- `test-version-bump.mjs` 仍可用，但要补一条说明：0.2.2 官方插件页版本检查读
  profile registry，与本脚本注入的自家候选源是两套机制（§7 坑 4）；
- AGENTS.md「插件更新 = 卸载重装；插件只做版本提示」硬约定**不用改**。

### 5.3 D2 详情区（✅ 已确认采用，P1 必做）

0.2.2 插件页新增详情区：`locale/<lang>.json` 的 `meta.detail` 指向包内 Markdown；
**不声明会回退渲染包内 README**（开发者文档，不该出现在插件页）。以衍生插件
最终态 `c004beb`（`3f18af7` 收尾）为准，**不是**主提交 `9bbcd07` 的中间形态。

| 落点 | 改动 |
| --- | --- |
| `scripts/gen-version.mjs` | 新增 `DETAIL_PATHS` / `DETAIL_TEMPLATES` / `DESCRIPTION`（zh/en 各一句产品介绍）；`{{compat}}` 占位符在 **description** 里替换为带括号的兼容窗口（窗口仍从 `src/version-gate.ts` 提取）；模板/DESCRIPTION 缺占位符 → build 显式报错。生成两件产物：`locale/{zh,en}.json`（`meta.title` + `meta.description` + `meta.detail`）与 `assets/detail/{zh,en}.md`（模板原样落盘，只放标题 + 用法）。`writeIfChanged` 幂等 |
| `scripts/templates/detail.{zh,en}.md`（**新建**） | 详情正文模板：只有标题 + 三步「如何使用」，不重复产品介绍/兼容窗口/前提 |
| `assets/detail/{zh,en}.md`（**生成物，勿手改**） | 由 gen-version 生成；改文案改模板 |
| `locale/{zh,en}.json`（**生成物，勿手改**） | `meta.detail` = `assets/detail/<lang>.md`；`meta.description` 保持**非空**（§7 坑 1）且携带新窗口 |
| `package.json` 的 `files` | 白名单加 `assets` |
| `scripts/smoke-offline.mjs` 0g 节 | 增断言：`meta.detail` 已声明、是相对子目录的 `.md`、指向文件存在；description 非空且携带当前 `[MIN,MAX]` |
| `README.md` / `AGENTS.md` | 说明「详情区是 0.2.2 新增、生成物勿手改」，发版前必跑一次 build |

> 与 §5.1 联动：停用面板仍保留「原因 / 窗口 / 当前 runtime 版本 / 桌面版指引」，
> 但**不再**回显插件 `currentVersion`、不再比较 registry latest。

## 6. 可选项 P2

| 项 | 说明 |
| --- | --- |
| ~~`meta.detail` 详情区~~ | **已提升为 P1 必做**（D2 确认采用）→ 完整落点见 §5.3，此处不再作为可选项 |
| 回填 AGENTS.md 的 caret 表述 | §1 的 semver 实测结论（includePrerelease 下会跨线），把「数学上不跨」改为「不承诺跨线、跨线必重写」，操作结论不变 |
| 回填 `docs/derivation-guide.md` | 方案 A 后：表② overlay id 落点、表⑤ `update-contract.ts` 落点删除/标注退役；新增落点 `assets/detail/`、`pnpm-workspace.yaml`；§2 的「约 29 个文件」差异计数需重新 E2E 复测回填 |
| 缺陷规避文档 | 把本轮 ①/②/`engines.dsh` 的 rc.1 复核结论与源码行号写入 `docs/harness-defect-workarounds.md` |
| 清理 | 归档 `docs/compat-plan-0.2.1-rc.2.md` 等历史记录保持不动；勿重建 `.githooks/pre-commit` / `BUILD_VERSION`（陈旧检测已拆除，不要加回） |

## 7. 风险与已踩坑（来自衍生插件 `9bbcd07` 之后的 3 个 refinement）

| # | 坑 | 规避 |
| --- | --- | --- |
| 1 | `meta.description` 写空串 → 衍生插件实测记录（其 AGENTS.md 坑 17）称 harness `textOf` 判**整份 locale 无效**、卡片标题一起丢；源码核证显示该约束落在 harness 自身官方 bundle/指南的**构建期闸门**，对第三方插件**无运行时强制**（§2） | 不争论归属：**description 保持非空**；窗口用 `{{compat}}` 占位符在 build 期替换（缺占位符让 build 显式报错） |
| 2 | 不声明 `meta.detail` → 插件页回退渲染包内 README | 按已确认的 D2 执行 §5.3；`assets/detail/*.md` 与 `locale/*.json` 都是**生成物**，改文案改 `scripts/templates/detail.*.md` / gen-version 常量，别手改生成物（下次 build 覆盖） |
| 3 | 新发布包被 pnpm `minimumReleaseAge` 冻结，跨线首日 `pnpm install` 装不上 | 新建 `pnpm-workspace.yaml` 白名单（衍生插件 37 条） |
| 4 | 0.2.2 插件页「重新检查」读 **profile 的 `pnpm config get registry`**（cwd = profile），UI 不传 registry 参数；默认 npmjs 看不到 Verdaccio 本地发版 → 永远「已是最新」 | `test-version-bump.mjs` 临时写 `~/.dsh/profiles/desktop/.npmrc` → `http://127.0.0.1:4873/`，`revertAll` **含 Ctrl+C** 严格还原（原本不存在就删掉） |
| 5 | 兼容窗口文案停在旧值 | 改 `version-gate.ts` 后必跑一次 `pnpm run build`（gen-version 重生成 locale） |
| 6 | 改任何 host/client 代码后热更无效 | 本插件不接热加载；**改码/改 `dsh.client` 声明必重启 the agent harness** |
| 7 | 衍生插件 `compat-plan-0.2.2-rc.1.md` §4 写「删 verdaccio / test-version-bump」，与真实 `package.json` 不符（二者**仍保留**） | 以 `git show 9bbcd07:package.json` / HEAD 为准，勿照抄文档叙述 |
| 8 | 9bbcd07 不是最终态 | 以 `c004beb`（release 0.2.0）为准：description = 产品介绍 + 窗口，detail 只留用法，test 台已指向 Verdaccio |
| 9 | 0.2.2 的 `dsh.client.inject` 声明是包元数据，扫描缓存永不过期 | 改后重启 harness（AGENTS.md 坑 7） |
| 10 | `@deepseek-ai/dsh-client-ui-layout` 的 `npm view <pkg> version` 返回 `0.0.1-rc.1`（`latest` 占位），`0.2.2-rc.1` 挂在 `next` 且已在 `versions` 列表 | **方案 A 已删该 peer，此条仅作存档**：若将来恢复，别用 `version` 字段判断「包是否已发布」，要看 `dist-tags` / `versions`；`^0.2.2-rc.1` 可正常解析 |

## 8. 验证门与人工待验

**编译级（零费用，必须先绿）**
```
pnpm install                      # 全部 dsh 包 + 基座实装 0.2.2-rc.1
pnpm run typecheck                # exit 0
pnpm run build                    # exit 0；locale 窗口刷新为 0.2.2-rc.1 ~ 0.2.2-rc.1
node scripts/smoke-offline.mjs    # ALL PASSED（入口图白名单 / 0c / 0g / 6a / 6f / 7）
```

**真机（桌面壳已是 0.2.2-rc.1，本轮条件具备）**
1. 插件页卡片显示「兼容 0.2.2-rc.1 ~ 0.2.2-rc.1」，**无停用面板**；
2. 配置页正常渲染（plugins.bundle.config keyed 槽位）：greeting 编辑写回 →
   `greet` 立即用新值；`template/ping` 通；
3. 软禁用回归：临时压低 MAX → 停用面板出现且断网正常 → 改回再 build；
4. 卸载 → 重装（**不重启**）后仍跑新代码（缺陷② 持续回归）；
5. 全程无任何更新弹窗/更新条（`shell.overlay` 无条目）、插件零出网；
6. 插件页详情区渲染 `assets/detail/<lang>.md`，不出现 README；
7. `scripts/test-version-bump.mjs`：装 A → Versions 区更新到 B →
   不重启跑新码 → 无提醒；profile `.npmrc` 结束已还原。

## 9. 执行顺序（checklist）

- [x] **P0-0 决策**：✅ D1=A / D2=采用 / D3=单点 / D4=一步到位 / D5=不 bump。
- [x] **P0-1 取证复核**：`git -C c:/deepseek-harness describe --tags` = `dsh-v0.2.2-rc.1`；
      按 §2 表逐 API 点名复核（三路只读取证 + 主会话交叉复核）。
- [x] **P0-2 声明层**：4.1–4.4（version-gate + package.json）；新建 `pnpm-workspace.yaml`（37 条白名单）。
- [x] **P0-3 安装**：`pnpm install --ignore-scripts` exit 0 → lockfile 全部实装 0.2.2-rc.1。
- [x] **P0-4 源码层**：4.5–4.8（确认无强制 API 适配；ui/* 逐文件 diff 复核，见 §12.2 #5）。
- [x] **P1 方案 A**：§5.1（更新提醒全链路删除）+ §5.3（D2 详情区）。
- [x] **P1 守护**：4.9 smoke fixture + 6f/7 反转 + 0g 增断言；`test-version-bump.mjs` 改造（`node --check` OK）。
- [x] **P1 指引**：4.13 全清单同轮改完；本文转为执行记录。
- [x] **P2 验证**：清空 `lib/` → `pnpm run build` 刷新 locale → §8 编译级三连全绿。
- [x] **P2 回填**：AGENTS.md caret 表述、derivation-guide 落点/计数、缺陷规避文档。
- [ ] **P3 真机**：重启 the agent harness → §8 人工 7 项（**待人工**）。
- [ ] **后续轮次（本轮不做，D5）**：真机通过后 `pnpm version patch --no-git-tag-version` →
      `pnpm run build` → smoke 0g → `pnpm publish`（prepack 自动构建）。

## 10. 回滚

- 代码：`git revert` 本轮提交（无数据格式迁移）；`pnpm-lock.yaml` 随 `pnpm install` 回退。
- harness 源码：`git -C c:/deepseek-harness checkout dsh-v0.2.1-rc.2`（仅在需复现旧行为时；
  本轮**未修改**该仓库，正常无需动）。
- 桌面版：本机已是 0.2.2-rc.1，回滚插件后会被 MAX 门禁软禁用（预期行为，
  恢复旧插件版本即可）。
- breaking change：`template/checkUpdate` / `template/getUpdateState`
  被删，升级过渡窗口内旧 client 会调不到 —— 若需兼容，先发一版「保留端点但
  恒返回 up-to-date」的过渡版本，再删除（衍生插件直接删除并在 release note 标注）。

## 11. 证据索引

| 来源 | 位置 / 命令 |
| --- | --- |
| 衍生插件 commit history | `git -C c:/agentProjects/dsh-vibe-wallpaper log --oneline --all`：`53d8b73`（rc.3）/ `cea6987`（rc.5）/ **`9bbcd07`（0.2.2-rc.1 主提交，41 文件 +1363 −1989）** / `4fef58b`（Verdaccio registry）/ `3f18af7`（meta 收尾）/ `c004beb`（release 0.2.0）；衍生基线 `e4948e7` = 模板 HEAD `12d9b8f` |
| 三轮执行记录 | `c:/agentProjects/dsh-vibe-wallpaper/docs/compat-plan-0.2.1-rc.3.md`、`-0.2.1-rc.5.md`、**`-0.2.2-rc.1.md`（§2 指南判定 / §3 逐包 diff / §4 改动清单 / §5 验证 / §6 人工待验）** |
| 「产品决定」证据 | `9bbcd07` commit message「Update notices removed — the plugin no longer reminds users about releases」；`compat-plan-0.2.2-rc.1.md:4,19`「按**产品决定**删除」「代码**无强制 API 适配**」；§3「`shell.overlay`（list/root）不变」「`dsh.client.inject` 包集不变」→ 删 ui-layout peer 只是不再引用的连带结果 |
| harness 源码 | `c:/deepseek-harness` @ `dsh-v0.2.2-rc.1` / `66491b05`（工作区干净）：根 `package.json:9`（engines）、`vendor/*/package.json`（基座）；`packages/boot/app-boot/src/plugin-compatibility.ts:52,57-61`（零 diff / engines.dsh）、`packages/client/web/src/platform.ts:8`（PLATFORM_MODULES 逐字相同）、`packages/client/modules/src/client/manifest.ts:182` 与 `packages/client/ui-workspace/src/client/index.ts:98`（inject 无白名单）、`packages/client/ui-plugin-manager/src/client/slot-contract.ts:142`（keyed/root）、`packages/client/ui-layout/src/client/index.ts:107`（list/root）、`packages/util/plugin-detail/src/document.ts`（meta.detail / README 回退）、`packages/core/tools/src/index.ts:128` + `schema.ts:555`、`packages/host/webserver/src/index.ts:445`、`packages/settings/settings/src/index.ts:266,358`、`packages/typert/registry/src/service.ts:568`、`apps/desktop/src/host-process.ts:212-218`（argv[2] 锚）、`packages/boot/plugin-manager/src/index.ts:634,639,714,888`（already-installed / updateBundle）、`packages/boot/hmr/src/index.ts:930,977-989`（驱逐）、`packages/web/web-fetch-http/package.json:38` 与 `packages/util/http-proxy/package.json:33`（undici 8.11.2）、`docs/upgrade-guide/v0.2.1-rc.2/node-24` |
| 本机桌面版 | `C:/Users/ZhiLiao/AppData/Local/Programs/DeepSeek Harness/resources/runtime/primary-runtime/runtime.json` → `desktopVersion: 0.2.2-rc.1`、`node: 24.21.0`（`versions.json` 同值） |
| semver 实测 | `node -e "require('C:/deepseek-harness/node_modules/.pnpm/semver@7.8.5/node_modules/semver')"` → `^0.2.1-rc.1` 展开 `>=0.2.1-rc.1 <0.3.0-0`，`includePrerelease:true` 下 `0.2.2-rc.1` 为 true |
| 模板现状 | `docs/compat-plan-TEMPLATE.md`、`docs/module-map.md`、`docs/derivation-guide.md`、`docs/harness-defect-workarounds.md`、`scripts/smoke-offline.mjs`（0/0b/0c/0g/6a/6f/7 节）、`scripts/gen-version.mjs` |

---

## 12. 执行结果与实际偏差（2026-11-06）

### 12.1 验证

| 命令 | 结果 |
| --- | --- |
| `pnpm install --ignore-scripts` | exit 0；全部 dsh 包 + 基座实装 0.2.2-rc.1；`dsh-client-ui-layout` 移除 |
| `pnpm run typecheck` | exit 0 |
| `pnpm run build` | exit 0；`gen-version.mjs` 生成 `locale/{zh,en}.json`（含 meta.detail）与 `assets/detail/{zh,en}.md` |
| `node scripts/smoke-offline.mjs` | **ALL PASSED（39 项）**；0g 新增 meta.detail 断言、6f 反转、7 反转 |
| `node --check scripts/test-version-bump.mjs` | OK（子任务执行） |

### 12.2 与定稿计划的偏差（逐条如实登记）

| # | 计划 | 实际 | 理由 |
| --- | --- | --- | --- |
| 1 | `src/package-info.ts` 删 `selfVersionOrNull`、保留文件 | **整个文件删除** | 方案 A 后无调用方；`tsconfig.build.json` 的 `include: ["src/index.ts"]` 只编译入口图，无引用模块不产出 lib，原 6f「求值期缓存」守护无处依附。`package-info.js` 退出 0b 白名单 |
| 2 | 停用面板载荷只留 `reason/min/max/runtimeVersion` | **保留 `installVersion`** | 保住自家门禁「可执行的更新/降级指引」这一核心价值（AGENTS.md 行为地图）；只删 `plugin` 段与 registry 自查 |
| 3 | 6f 只留 package-info 求值期缓存 + registry 头契约 | **6f 反转为「无更新状态机产物」4 条断言** | 状态机与 registry 头契约的载体都已删除，守护改为「陈旧产物不存在」 |
| 4 | `src/shared/json-body.ts` 保留为防御工具 | 保留，但**无 lib 产物**（源码级） | 同上：无引用模块不进 lib，而 `files` 只含 lib → 它是仓库内参考实现而非发布产物；smoke 7 以源码级断言守护 |
| 5 | `src/client/ui/*` 18 个复制件 → 抬 tag 到 0.2.2-rc.1 | 实为 **17 文件 / 15 处 tag**；改回诚实标注 `@ dsh-v0.2.1-rc.2（0.2.2-rc.1 已复核，代码未同步）` | 上游 ui-primitives 在 0.2.2-rc.1 有 11 文件实质变化（含 `Menu.tsx` +170/−123、portal 定位改 `useAnchoredPosition`）；模板是按用例裁剪的复制件、删除 GlobalNotice 后当前仅 Button 被使用，同步风险高于收益。本轮是 harness 兼容迁移，UI 升级留作独立工作 |
| 6 | 5.1 删除 5 个文件 | **实际删除 9 个**：多删 `CommandChip.tsx`(+css)、`disabled-version-check.ts`、`package-info.ts` | 前三者随更新条 / 停用面板插件组 / 求值期缓存一起失去调用方 |
| 7 | 4.11 新建 `pnpm-workspace.yaml` | ✅ 37 条 `minimumReleaseAgeExclude` 白名单 | 与衍生插件同口径；install 实测通过 |

### 12.3 新增坑（已回填 AGENTS.md 坑清单 / module-map / README）

- **删源文件后必须清空 `lib/` 再 build**：`tsconfig.build.json` 从入口图编译且 `tsdown` 配 `clean: false`，tsc 不会删除已消失源文件的旧产物。本轮首次复验时 `lib/update-state.js` / `lib/shared/registry-latest.js` 残留 → smoke「产物不存在」2 项误报；同时 `files` 含 `lib`，陈旧产物会被打进发布包。清空 `lib/` 后重建即全绿。
- `assets/detail/*.md` 与 `locale/*.json` 均为 `gen-version.mjs` 生成物，改文案改 `scripts/templates/detail.*.md` 与 `DESCRIPTION`（`{{compat}}` 占位符）。

### 12.4 待人工（需重启 the agent harness）

见 §8 的 7 项。本机桌面版已是 `0.2.2-rc.1` / node `24.21.0`，具备验收条件；按 AGENTS.md「改码必重启」，需用户重启后逐项确认。本轮不 bump 插件版本（D5）。

---

> 编译级迁移已完成，真机验收待人工；本轮未 bump 插件版本。
