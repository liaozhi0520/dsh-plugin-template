# dsh-plugin-template × DSH 0.2.1-rc.2 兼容追新（执行记录）

> **用法**：结构沿用 `docs/compat-plan-TEMPLATE.md` 与范式仓
> `dsh-comfyui-based-tools/docs/compat-plan-0.2.1-rc.2.md`，保留为
> `0.2.0-rc.2 → 0.2.1-rc.2` **新线迁移**的执行记录。推进在 **`main`**
> 工作区（按用户指示：**不建分支、不发版、不动插件版本号**；改动留在工作区
> 由用户手工复核后再决定提交）。
>
> **窗口决策（用户指定）**：`[0.2.1-rc.1, 0.2.1-rc.2]`。rc.2 = 实测基线
> （本机桌面版内置版本），rc.1 = **用户指定纳入**的同 tuple 相邻预发布，
> 属**取证覆盖**而非单独实机验收——此例外已在 `AGENTS.md`、`README.md`
> 与本文 §4 如实标注。
>
> **结论先行**：这是「**一处硬改动 + tuple 窗口/依赖上移 + 陈旧检测整体拆除 +
> 指引同步**」的迁移。唯一的代码级硬改动是**删除 invariant 伴随件**（上游把整个
> `packages/runtime-diagnostics/` 组移除、不再发布 `@deepseek-ai/dsh-invariants`，
> 并给出官方迁移指南要求删除）；模板实际触达的其余触点包经逐项源码取证判定
> 插件面零 breaking（`settings` 的 `src` 为字节级零 diff、模板用到的 14 个
> ui-primitives 复制件上游逐字节相同）。同轮按用户裁定**拆除陈旧代码检测**
> （缺陷②上游已修 + 真机确认），并把 `Menu.tsx` 的一处监听器泄漏修回。

---

## 0. 执行状态

| 项 | 状态 |
|---|---|
| 分支 | `main` 工作区（按指示不建分支、不提交） |
| `c:/deepseek-harness` | 取证 tag：`dsh-v0.2.1-rc.1`（`1600d8a1e1`）→ `dsh-v0.2.1-rc.2`（`687f282e86`）；基线 `dsh-v0.2.0-rc.2`（`639ed01539`）。**全程 `git show/diff/ls-tree/grep <tag>` 只读，未切换工作树** |
| `src/version-gate.ts` | MIN = `0.2.1-rc.1` / MAX = `0.2.1-rc.2`（tuple 变化，窗口上移；头注释重写，含「行为地图」与 rc.1 例外标注、`engines.dsh` 否决指针） |
| `package.json` | 21 处 `@deepseek-ai/dsh-*` 版本串 `^0.2.0-rc.1` → **`^0.2.1-rc.1`**（peer 10 + dev 11）；删 peer + dev 的 `@deepseek-ai/dsh-invariants`、删 `exports["./invariant"]`；**基座对齐运行时**：cordis `^4.0.1`→**`^4.0.5`**（peer+dev）、schemastery `^3.18.4`→**`^3.18.5`**（peer+dev）、cosmokit `^1.8.5`→**`^1.8.6`**（dev）；新增 devDep `cordis-plugin-include ~1.0.10` / `cordis-plugin-group ~1.0.5`；删 `check-version` 脚本，`version` 脚本改为 `gen-version + git add locale`；**`version` 字段不动（0.1.0）**；`engines.dsh` **不加** |
| `tsconfig.build.json` | `include` → `["src/index.ts"]`（main.ts 由动态 import 跟随编译） |
| `pnpm-lock.yaml` | 由 `pnpm install` 重整：`0.2.0-rc.` 残留 **0 行**、`dsh-invariants` **0 行** |
| `node_modules` | 15 个 `@deepseek-ai/dsh-*` 全 = `0.2.1-rc.2`；基座 = 运行时同版（`cordis 4.0.5` / `cosmokit 1.8.6` / `schemastery 3.18.5`）+ `cordis-plugin-include 1.0.10` / `group 1.0.5`；`pnpm peers check` = **No peer dependency issues found** |
| 插件源码 | 删除：`src/invariant.ts`（整文件，官方指南）、`src/client/StaleBanner.tsx`、`src/client/build-version.ts`；其余源码改动为注释/文案/窗口常量（含陈旧检测拆除，见下） |
| 同轮附带拆除（缺陷②防护） | **陈旧代码检测整体回退**（2026-10-19 用户裁定；上游已修 + 真机确认）：删 `src/client/StaleBanner.tsx`、`src/client/build-version.ts`、`gen-version.mjs` 的 BUILD_VERSION 烧录段、client 入口的 `template-stale-banner` 槽位注册、GlobalNotice 的 stale 让位、`locales.ts` 的 5×2 条 staleBanner 文案、smoke 0d 节与 6f 判定契约、`scripts/check-version-sync.mjs`、`.githooks/pre-commit`（连 `.gitattributes` 的 `.githooks/*` 规则）；`package.json` 脚本同步删 `check-version`、`version` 脚本改为 `gen-version + git add locale`；保留 `currentVersion` 恒填作「当前版本」口径。**`scripts/test-version-bump.mjs` 不拆**（它测「版本更新」本身）：Phase 2 验证改为「重装后立刻跑新版本、且不弹陈旧对话框」 |
| 顺手修复 | `src/client/ui/Menu.tsx:313` cleanup 误用 `addEventListener` → `removeEventListener`（上游两 tag 均为 remove，修完恢复 1:1）；`src/soft-disable.ts` / `src/profile-gate.ts` 注释里残留的 `DSH_COMFYUI_BASED_TOOLS_STRICT` → `DSH_PLUGIN_TEMPLATE_STRICT`；`src/shared/registry-latest.ts` 的 `AGENTS.md 坑 9/10` 交叉引用 → `docs/pitfalls.md §4/§5` |
| 文案 | `locales.ts` 四处更新提示去掉「重启」要求（0.2.1 起卸载→安装免重启生效） |
| 编译验证 | `pnpm run typecheck` **exit 0**；`pnpm run build` **exit 0**（gen-version → tsc → tsdown；`lib/invariant.js` 不再产出） |
| 离线冒烟 | `node scripts/smoke-offline.mjs` **ALL PASSED（31 项）**（含 0g locale 窗口、6a 桌面单锚、6f 状态机、7 退役契约；0d 编号留空） |
| 运行时验收 | **待人工复核**（见 §6.3；本机桌面版 = 0.2.1-rc.2） |
| 指引同步 | `AGENTS.md`（依赖收敛 / 版本窗口 / 版本兼容参考 / 缺陷规避 / 注意签出版本）、`README.md`（支持版本 / 依赖与追新 / 窗口承诺 / 更新提示 / 文件清单）、`docs/module-map.md`、`docs/pitfalls.md`、`docs/harness-defect-workarounds.md`（新增「已评估、暂不采用的上游机制」节）、`docs/derivation-guide.md`、`docs/compat-plan-TEMPLATE.md`、`docs/versioning-and-update-plan.md` 同轮改毕 |

## 1. 区间事实

- 基线 → 目标区间：`dsh-v0.2.0-rc.2`（`639ed01539`，2026-09-29）→
  `dsh-v0.2.1-rc.2`（`687f282e86`，2026-10-17T15:22:43+08:00）：
  **1925 commits / 8431 files（+320,407 / −84,704）**。
- **窗口内部差量**：`dsh-v0.2.1-rc.1`（`1600d8a1e1`，2026-10-16T21:46:57+08:00）→
  `rc.2` 仅 **9 commits / 456 files**——这是「把 rc.1 纳入窗口」的主要依据之一。
- 版本锚：根 / `apps/desktop` / `apps/desktop-host` 的 package.json version
  均 = `0.2.1-rc.2`（锁步同版成立）；`apps/desktop/src/host-process.ts`
  两 tag **零 diff**（`argv[2] = runtimeDir` 契约不变）→ `version-gate.ts`
  的桌面单锚语义不变。
- 桌面实装（本机 app.asar 取证）：`/dsh/package.json` =
  `@deepseek-ai/dsh-desktop-runtime@0.2.1-rc.2`，全部 `@deepseek-ai/dsh-*` 锁步
  `0.2.1-rc.2`；cordis `4.0.5`、cosmokit `1.8.6`、schemastery `3.18.5`、
  cordis-plugin-loader `1.0.6`、include `1.0.10`、group `1.0.5`。
- npm：`next = 0.2.1-rc.2`、`latest = 0.0.1-rc.1`（0.2.x 线全走 `next`）、
  `alpha = 0.2.1-alpha.5`；`0.2.1-rc.1` / `rc.2` 均可安装。
- vendor 树（三 tag 对比）：`vendor/cordis`、`vendor/cosmokit`、
  `vendor/schemastery` 的 `src` **tree hash 相同**（`cce345a8` / `d89a6968` /
  `284041b2`）——基座无 API 变化，只有版本号对齐。

## 2. 破坏面核验

取证方法：全程 `git show <tag>:<path>` / `git diff <tagA> <tagB> -- <path>` /
`git ls-tree` / `git grep <pattern> <tag>` 只读进行；符号存活与否逐个在目标
tag 上核验，"零 diff"结论用 **tree/blob hash 相等**而非 diff 静默证明。

### 2.1 字节级零 diff 的触点（插件面 = 原样）

| 包 / 文件 | 依据 | 插件用到什么 |
|---|---|---|
| `packages/settings/settings/src` | 两 tag `git diff --stat` **空** | `settings.configure({auto}, owner?)`（`:266`）、`settings.replace(ns, section, expectedRevision?)`（`:357`）、volatile 语义 |
| `packages/host/webserver/src/injections.ts` | 两 tag **零 diff** | `webserver/index-inject` 的 `IndexInjection` 行类型（`{kind:'global';name;value}`） |
| `vendor/cordis/src` | tree hash `cce345a8`（三 tag 相同） | `Context`、插件 API（cordis 4.0.5） |
| `vendor/cosmokit/src` | tree hash `d89a6968` | `Volatile` 类型（dev 依赖） |
| `vendor/schemastery/src` | tree hash `284041b2` | `Schema`（`Config` schema；3.18.5） |
| `apps/desktop/src/host-process.ts` | 两 tag **零 diff** | `argv[2] = runtimeDir` spawn 契约（版本锚） |
| `packages/client/locale/src` | 两 tag **零 diff** | `ctx.locale.register` / `'locale/change'` / `TranslateNS` |
| 模板用到的 14 个 ui-primitives 文件 | 逐 blob hash 相同（`Button.tsx` `31a6edd7`、`Menu.tsx` `fd5b655d`、`Modal.tsx` `e7fa7faa`、`MenuSurface.tsx` `1bdefd0d`、`Switch.tsx` `980a08f6`、`focus.ts` `bc7e5a37`、`keyboard-composition.ts` `6c21bbda`、`overlay-top-margin.ts` `02ed6792`、`useModalLayer.ts` `dff4a226` 及 5 个 css） | UI 原语复制件**无需重同步** |

个别符号另按内容逐字节比对确认：`snapshotEvents`、`PromptSection`、
`ImageBlock`、`InvocationDescriptor`（`typert/protocol/src/types.ts`，
仅新增可选 `description?`）。

### 2.2 有 src 改动、逐项核验为插件面零 breaking 的触点

| 包 | 改动 | 对本插件的影响 |
|---|---|---|
| `core/tools` | 8 files +517/−533（`ptc.ts` 重构、`invariant.ts` **删**、`ptc-calls.ts` 新增） | **normal**：`defineTool`（值导入）、`ToolDefinition`、`ToolRunContext`、`ctx.tools.register`、`tools/result` 事件（`:199`）全部存活；`schema.ts` 的唯一改动是**注释**（`presentationMeta` 措辞） |
| ↳ `ToolPresentationMode` | `'native'\|'ptc'\|'both'` → `'native'\|'ptc'` | **normal**：本插件不设 `tools.mode`、不调 `presentAs`（0 命中）；属宿主配置面风险（历史 profile 若写 `both` 会在加载期被 schema 拒绝） |
| `typert/protocol` | +690/−45（新增 `principal.ts`/`remote-access.ts`/`remote-info.ts`、资源注册面） | **normal**（纯增量）：`InvocationDescriptor` 字段未变、`TypertCodec{mode:'src-json'}` 仍在（`:360`）、`TypertContribution` 形状未变；新增面本插件未采纳 |
| `typert/registry` | +56（`ResourceStore` / `resources` getter） | **normal**（纯增量）：`register(contribution)` 签名未变 |
| `client/ui-slots` | +15/−3（`inline?: true`、`KeyedStandardSource` 加 `member?`） | **normal**：`PropsLocale` / `PropsRuntime` 签名未变 |
| `client/ui-layout` | +55/−16（新增 `shell.bottom` 槽位、主题字号变量） | **normal**：`shell.overlay` 声明与 `AppFrame` 渲染点未变（`index.ts:105/186`） |
| `client/ui-plugin-manager` | 14 files +1136/−161（页面重写、`plugins.tab`/`plugins.add.actions` 新槽位、`slot-contract` 的 `PluginPackageRef` 加字段） | **normal**：`plugins.bundle.config` 声明与 `PluginConfigViewProps` 未变（`slot-contract.ts:142`）；新增槽位本插件未用。`slot-contract.d.ts:20` 新增 `import type { BundleInfo } from '@deepseek-ai/dsh-api-remotes/client'`（模板未声明该包，靠 `skipLibCheck: true` 通过）——**已核实为上游惯例、不需处理**，见 §7.1 |
| `client/connection` | +511/−130（peer 模型重构：`operator` → `browserPeer`、`admitConnection`、按调用方授权） | **normal**：本插件只用 `ConnectionHandle.rpc`（`ClientConnectionRpc.call` 签名未变）与 `ctx.get('connection')` |
| `client/ui-renderer` | +79/−92（`invariant.ts` 删、bindings 调整） | **normal**：`ctx.slots` 服务增强与 `SlotRegistry` 归属未变 |
| `boot/app-boot` | 12 files +736/−180（preflight 重构、`engines.dsh` 优先、profile resolution） | **normal**：`semver.satisfies(runtime, range, {includePrerelease:true})` 语义未变；本插件不声明 `engines.dsh`，走 peer 路径；`dsh.bundle.patch` 处理与 `Config` 识别原样 |
| `apps/desktop-host` | +2/−2（`--host 127.0.0.1 --port 0`、`ctx.webServer.protocol`） | **normal**：`argv[2]=runtimeDir` / `installAnchor` 未变 |
| `client/web/platform.ts` | `PLATFORM_MODULES` **新增** `zod`、`@tanstack/react-virtual` | **normal**：只增不减；本插件 client 半全为 `import type`，产物 `lib/client.js` 的运行时外部只有 `react`/`react/jsx-runtime`/`react-dom`（smoke 0 节守护） |

### 2.3 唯一硬改动：invariant 子系统整体移除

- 上游：`packages/runtime-diagnostics/` 整组删除（`dsh-v0.2.0-rc.2` 存在、
  `dsh-v0.2.1-rc.1` **已不存在**）；各包 `*/src/invariant.ts` 文件数 **38 → 0**；
  `ctx.invariants` 服务消失；npm 上 `@deepseek-ai/dsh-invariants` 最高只到
  `0.2.0-rc.2`（`0.2.1-rc.2` 为 404）。官方指南：
  `docs/upgrade-guide/v0.2.0-rc.2/remove-runtime-invariants/guide.md`
  （"The next release no longer publishes … or any `<package>/invariant` subpath"，
  迁移步骤 = 删除行 / 删除依赖与 import）。
- 本插件触点（已全部按指南删除）：`src/invariant.ts`（整文件）、
  `package.json` 的 `exports["./invariant"]` + peer + dev、`tsconfig.build.json`
  的 include、git-ignored 的 `lib/invariant.js`、README/AGENTS/derivation-guide
  的表述。
- **诚实分级**：清理前 `pnpm typecheck` **不会变红**（npm 仍供 `0.2.0-rc.2`、
  lockfile 钉着它）——编译的是"目标 runtime 已不存在的 API 的旧副本"；harness 的
  peer 预检只看版本范围、不做模块解析，**不会**因此禁用插件。故这是"按官方指南
  清理"，不是"会炸"。附带运营面影响：profiles 关闭自动 peer 安装，声明面留死包
  会在安装/启动期报缺 peer。

### 2.4 client / 槽位 / 复制件

- 14 个 1:1 复制件（`src/client/ui/`）的上游对应文件在两 tag 间**逐字节相同**
  → **无需重同步**；本轮只把注释里的 `@ dsh-v0.2.0-rc.2` 更新为
  `@ dsh-v0.2.1-rc.2`（正文零改动，已用 `git diff` 逐行核对）。
- **顺手修复（非本轮引入）**：`Menu.tsx:313` cleanup 内误写
  `window.addEventListener('blur', …)`（上游两 tag 均为 `removeEventListener`）
  ——每次开关菜单泄漏一个常驻 window blur 监听；已改回并恢复与上游 1:1。
- `dsh.client.inject`（connection/locale/plugin-manager）为**信息性声明**，
  非模块表来源；本插件**不声明** `dsh.client.external`（正确做法——基线
  externals 已在 shell 播种），tsdown `neverBundle` 维持 React 四件套。

### 2.5 两项缺陷规避的复核结论

- **① 宿主全局 fetch 不解压压缩响应 → 规避保留（不回退）**：
  `web-fetch-http/src/network.ts` 与 `http-proxy/src/install.ts` 的
  `await import('undici')` + `setGlobalDispatcher` 原样（两文件 `src` 零 diff）；
  undici 由 `^8.10.0` 改为**固定** `8.11.2`（仍是 undici 8）；宿主全树唯一
  生产 `globalThis.fetch =` 仍在 experimental/webworker-runtime。→ smoke 6f 的
  `accept-encoding` 契约与 `readJsonBody` 全部保留。
- **② 卸载重装不重启跑旧代码 → 上游已修 + 真机确认 → 防护整体拆除**：
  `plugin-manager/src/index.ts:439/444`（inspect 阶段 `already-installed`）、
  `:544`（install 前 `throw new ManagementFailure('already-installed')`——旧的
  可绕过护栏已删）；`hmr/src/index.ts:925` 的 `reconcileProfile()` 比对
  "已加载 `file:` 模块 ↔ 磁盘"（`module-files.ts:72-86` 比 inode/size/mtime）
  并在 `finally` 里 `evictDropped()` 驱逐（`:890`，`profileRows` 覆盖
  `<profile>/node_modules/**` 与 link 目标）。范式侧 2026-10-19 真机复核确认后
  已整体拆除；本模板同轮跟随（拆除清单见 §0 与 `docs/harness-defect-workarounds.md`）。
  **残留限制**：`link:` 本地链接 + 手工 build、不经过插件页/CLI 的安装操作时，
  host 半仍持进程内旧模块——开发期照旧「改码/改版本后重启」。
- 附带产品面事实：0.2.1 起第三方插件仍**没有**「一键更新」——harness 文案明说
  "其他插件请先卸载再安装新版"；本插件提示流程不变，**仅去掉"重启"要求**。

### 2.6 `engines.dsh`：评估后否决（记录进 `docs/harness-defect-workarounds.md`）

- 机制：声明了 `engines.dsh` 则**它单独决定、peers 被忽略**
  （`plugin-compatibility.ts:56-61`）；执行点三层（安装期 / 运行时 bundle 级
  每次启动+每次重组 / 运行时行级），**全在 import 之前**；运行中改
  `package.json` 不即时判定。
- 否决理由：① 只能拒绝、不能解释 → 本插件的「已停用」面板、窗口文案、
  "更新/降级桌面版到 X"的可执行指引、`DSH_PLUGIN_TEMPLATE_STRICT` 排查开关
  全部失效；② 合并"声明面/验证面"，写精确版本无收益、写宽范围放行未验证版本；
  ③ 反馈受 recomposition 调度。
- 激活条件：**上游为第三方插件补上"指引更新 / 一键更新"能力后**即可采纳；
  采纳时三条硬约束（精确版本、保留 peers、`allow-version` 逃生口）与空串陷阱
  已写入该文档。

## 3. 代码变更清单（本轮实际改动）

| 文件 | 变更 |
|---|---|
| `src/invariant.ts` | **删除整文件**（官方指南要求） |
| `src/client/StaleBanner.tsx` | **删除整文件**（陈旧检测拆除） |
| `src/client/build-version.ts` | **删除整文件**（生成物；烧录段同步删除） |
| `scripts/check-version-sync.mjs` | **删除整文件** |
| `.githooks/pre-commit` | **删除**（连 `.githooks/` 目录） |
| `tsconfig.build.json` | `include` → `["src/index.ts"]` |
| `package.json` | 删 `exports["./invariant"]`；删 peer + dev 的 `@deepseek-ai/dsh-invariants`；21 处 `^0.2.0-rc.1` → `^0.2.1-rc.1`；**基座对齐运行时**（cordis `^4.0.5`、schemastery `^3.18.5`、cosmokit `^1.8.6`）；新增 devDep `cordis-plugin-include ~1.0.10` / `cordis-plugin-group ~1.0.5`；删 `check-version` 脚本、`version` → `gen-version + git add locale` |
| `src/version-gate.ts` | MIN `0.2.0-rc.1` → `0.2.1-rc.1`、MAX `0.2.0-rc.2` → `0.2.1-rc.2`；头注释重写（tuple 事实、行为地图、rc.1 例外、engines.dsh 否决指针） |
| `src/client/ui/Menu.tsx` | `:313` `addEventListener` → `removeEventListener`；头部补 0.2.1-rc.2 复核与修复记录 |
| `src/client/ui/*`（其余 14 个） | 注释 `@ dsh-v0.2.0-rc.2` → `@ dsh-v0.2.1-rc.2`（正文逐字不变） |
| `src/client/index.ts` | 删 `StaleBanner` import 与 `template-stale-banner` 注册；头注释「×2」→ 1 |
| `src/client/GlobalNotice.tsx` | 删 `BUILD_VERSION` import 与 `stale` 让位；`updateOpen` 只按 `available`；头注释改写 |
| `src/client/locales.ts` | 删 `staleBannerTitle/Text/Ack/TextFinal/AckFinal`（zh+en 各 5 条）；`updateAvailableHint` / `updateModalText` / `disabledPluginOutdated`（zh+en 各 3 处）去掉「重启」要求 |
| `src/client/api.ts` | `getUpdateStateViaHost` 注释口径改「当前版本」 |
| `src/package-info.ts` / `src/update-state.ts` / `src/main.ts` / `src/shared/update-contract.ts` | 注释口径同步（陈旧检测 → 当前版本口径 + 拆除指针） |
| `src/soft-disable.ts` / `src/profile-gate.ts` | `DSH_COMFYUI_BASED_TOOLS_STRICT` → `DSH_PLUGIN_TEMPLATE_STRICT` |
| `src/shared/registry-latest.ts` | `AGENTS.md 坑 9/10` → `docs/pitfalls.md §4/§5` |
| `scripts/gen-version.mjs` | 删 BUILD_VERSION 生成段与注释；保留 locale 显示元数据 |
| `scripts/smoke-offline.mjs` | 删 0d（2 项）与 6f 的 stale 契约（2 项），编号留空并写退役理由；头注释同步；**31 项**；6a fixture 版本串 → `0.2.1-rc.2` |
| `scripts/test-version-bump.mjs` | Phase 2 文案改为「重装后立刻以新版本运行、且不弹任何陈旧对话框」（bump/commit 各一处）；头注释与流程提示同步。**另迁移范式 `70a09e8` 的启动修复**（用户指示）：弃用 `detached + shell` 启动形态（Windows 上 DETACHED_PROCESS 让孙进程拿到无效 stdio 句柄 → 日志恒 0 字节），改 `spawn(process.execPath, [bin, '--config', cfg])` + 管道 `writeSync` 落盘；bin 经包清单 `bin` 字段解析（`exports` 不放行 `verdaccio/bin/verdaccio`）；挂 `on('error')`/`on('exit')` 使「启动即死」立即判死并贴日志尾部；探测逐次记录原因与耗时（非 2xx 报状态码）；`assertRegistryPortFree()` 启动前占用预检；配置里的 `log: { type: file }` 段删除；配置路径保持绝对（`storage` → `.verdaccio-storage/storage`、`htpasswd` → `HTPASSWD_PATH` 常量单源） |
| `.gitattributes` | 移除 `.githooks/*` 规则（目录已删），保留自 LF 规则 |
| `AGENTS.md` | 范式 0.8.7 / 新 plan 指针；删陈旧防护契约钉子整段（保留 `currentVersion` 口径）；发版纪律改「无提交期闸门」；依赖与窗口全部改新值 + tuple 说明 + rc.1 例外；缺陷② 改回退记录；坑 8/9 调整 |
| `README.md` | 支持版本、依赖与追新、门禁行为地图、开发循环、发版纪律、更新提示、追新流程、文件清单（−5 文件 +1 plan） |
| `docs/module-map.md` | 删 invariant/build-version/StaleBanner 三行；窗口与 scripts 表；smoke 清单 **31 项** |
| `docs/pitfalls.md` | §8 钩子改历史注记；§9 补 tuple 变化；§10 改写为「漏 build 只影响卡片窗口文案」+ 历史形态 |
| `docs/harness-defect-workarounds.md` | ① 保留 + 0.2.1-rc.2 复核；② 改**历史防护回退块**（上游取证行号 / 真机确认 / 拆除清单 / `link:` 残留限制）；新增「已评估、暂不采用的上游机制」节（`engines.dsh`） |
| `docs/derivation-guide.md` | 表② 删 invariant 行、overlay id 只留 update-notice；§1 删伴生 invariant；§3 删 hooksPath、改 version 脚本；§4 删 check-version、smoke 31 项；§6 DoD 改三连；文件计数 34→29（估算，待下轮衍生 E2E 复核） |
| `docs/compat-plan-TEMPLATE.md` | 窗口示例、手册指针、验证点同步到 0.2.1 线 |
| `docs/versioning-and-update-plan.md` | 存档横幅补「陈旧提醒亦已拆除」；窗口注记改新窗口 |
| `docs/compat-plan-0.2.1-rc.2.md` | 本文 |

**未改**：`dsh.client.inject`、tsdown `neverBundle`/`alwaysBundle`、
`cordis.patch.yml`、插件 `version`（按指示不发版）、`src/client/bundle-key.ts`、
`src/remote.ts` 的端点表。

## 4. 版本窗口决策

- **窗口 `[0.2.1-rc.1, 0.2.1-rc.2]`**（用户指定）。实测自洽性：

| version | range | 语义 | 结果 |
|---|---|---|---|
| 0.2.1-rc.1 | `^0.2.1-rc.1` | 预检 / 默认解析 | true / true |
| 0.2.1-rc.2 | `^0.2.1-rc.1` | 预检（includePrerelease） | true |
| 0.2.1-rc.2 | `^0.2.1-rc.1` | **pnpm 默认解析** | **true**（同 tuple 预发布，dev 树可装 rc.2 类型面） |
| 0.2.1-rc.3 / 0.2.1 | `^0.2.1-rc.1` | 预检 | true（声明面放行 → 由 MAX 门禁拦下） |
| 0.2.0-rc.2 | `^0.2.1-rc.1` | 预检 | **false**（低于下限 → harness 组合期跳过） |
| 0.2.1-rc.2 | `^0.2.0-rc.1` | 默认解析 | **false**（← 本轮必须改写下限的硬理由） |

- **依赖下限跟随 MIN**：全部 peer + dev 写 `^0.2.1-rc.1`（约定：peer 与 dev
  同值 = `^<MIN>`）。旧下限 `^0.2.0-rc.1` 在默认解析语义下取不到 0.2.1-rc.2
  类型面，故不能「只抬 MAX」。
- **MIN 例外标注**：仓库对 MIN 的原始定义是「已实测的最低版本」；rc.1 属
  **用户指定纳入**的同 tuple 相邻预发布——依据是 rc.1 已具备本线关键事实
  （`packages/runtime-diagnostics` 已移除、precheck 已读 `engines.dsh`、
  settings/vendor 与 rc.2 同源）+ rc.1→rc.2 仅 9 commits / 456 files；
  **未单独实机验收**。若将来要收紧为严格「已实测」，把 MIN 抬到
  `0.2.1-rc.2` 即可（无需同步改依赖下限）。
- **行为地图（0.2.1 起，写进 AGENTS.md / README.md）**：
  低于 MIN → harness 声明面在组合期拦截（静默跳过，插件无机会出面板）；
  窗口内 → 正常加载；**高于 MAX → 本插件门禁软禁用 + 可执行指引**
  （这是保留自家 gate 而非改用 `engines.dsh` 的核心价值）。

## 5. 依赖与供应链

- **基座依赖（本轮按用户指示升级并对齐运行时）**：`@deepseek-ai/cordis`
  `^4.0.1` → **`^4.0.5`**（peer + dev 同值）、`@deepseek-ai/schemastery`
  `^3.18.4` → **`^3.18.5`**（peer + dev 同值）、`@deepseek-ai/cosmokit`
  `^1.8.5` → **`^1.8.6`**（dev）。依据：**rc.1 与 rc.2 的 vendor 基座完全同版**
  （`cordis 4.0.5` / `cosmokit 1.8.6` / `schemastery 3.18.5`，逐 tag 取证），
  故该下限对窗口内每个宿主都成立；三者 `src` 两 tag tree hash 相同（无 API 变化）。
- **`cordis-plugin-include` / `cordis-plugin-group` 显式进 devDeps**
  （`~1.0.10` / `~1.0.5`）：它们是 `@deepseek-ai/cordis@4.0.5` 的 **peer**
  （`~1.0.10` / 由 dsh-app-boot 要求 `~1.0.5`），pnpm 自动补齐时保留了旧解析
  （1.0.7 / 1.0.4）→ `pnpm install` 后 `peers check` 报 unmet peer。声明到根后
  **`pnpm peers check` = "No peer dependency issues found"**。二者是本插件从不
  import 的 loader 机件、仅影响 dev 树解析一致性。
- **未夹带其它升级**（实测核对）：react 18.3.1 / typescript 5.9.3 / tsdown
  0.22.14 / lightningcss 1.33.0 / clsx 2.1.1 / verdaccio 6.10.5 / @types/node
  22.20.1 全部原样。
- **供应链闸门**：pnpm 11 默认 `minimumReleaseAge = 1440`（1 天）。目标版本
  发布于 2026-10-17T08:18Z（dsh 包）/ 08:33Z（ui-plugin-manager），本轮安装时点
  2026-10-19 已超 24h → **未触发** `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`，
  故无需 `pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude`（本仓库目前没有
  该文件）。
- `pnpm-lock.yaml` 由 `pnpm install` 重整：全 `0.2.1-rc.2`、`dsh-invariants`
  彻底消失、`0.2.0-rc.` 零残留。

## 6. 验证

### 6.1 自动门（本轮已跑）

| 项目 | 命令 | 结果 |
|---|---|---|
| 依赖安装 | `pnpm install` | **exit 0**（9.2s；15 个 dev `@deepseek-ai/dsh-*` 全部解析到 `0.2.1-rc.2`；基座 4.0.5 / 1.8.6 / 3.18.5；`dsh-invariants` 移除） |
| 依赖一致性 | `pnpm peers check` | **No peer dependency issues found** |
| 类型检查 | `pnpm run typecheck` | **exit 0**（零红点——`src/` 未做任何 API 迁移，与 §2 的「插件面零 breaking」取证一致；基座 4.0.2→4.0.5 亦无类型红点） |
| 构建 | `pnpm run build`（gen-version → tsc → tsdown） | **exit 0**；`lib/client.js` 80.00 kB（gzip 24.66 kB）/ map 120.17 kB；`lib/invariant.js` 不再产出 |
| 离线冒烟 | `node scripts/smoke-offline.mjs` | **ALL PASSED（31 项）**：0 入口隔离 + exports 形状 / 0b 白名单 / 0c key+banner / 0g locale 元数据（携带 `0.2.1-rc.1 ~ 0.2.1-rc.2`）/ 6a 桌面单锚 / 6f 状态机 + registry 头契约 / 7 退役契约 |
| 依赖实装核对 | 见 §6.2 | **PASS** |
| 测试台脚本（改动后复跑） | `node --check scripts/test-version-bump.mjs` + `--help` | **exit 0**；语法与入口正常 |
| verdaccio 启动形态实测（独立探针，端口 4899） | 同款 `spawn(node, [bin, '--config'])` + 管道落盘 | **2.0s 就绪 / 日志 431 字节 6 行**（含 `http address` 行）；对照旧 `detached + shell` 同条件 **0 字节** |

### 6.2 依赖实装核对（本轮已跑，全部通过）

- `node_modules/@deepseek-ai/dsh-*`（15 个直接依赖）**全部 `0.2.1-rc.2`**：
  client-connection / client-locale / client-ui-layout / client-ui-plugin-manager /
  client-ui-renderer / client-ui-slots / host-webserver / settings / tools /
  typert-protocol / typert-registry（+ 由 peer 声明带入的其余包）。
- 基座依赖：`@deepseek-ai/cordis=4.0.5`、`@deepseek-ai/cosmokit=1.8.6`、
  `@deepseek-ai/schemastery=3.18.5`；配套 devDep
  `@deepseek-ai/cordis-plugin-include=1.0.10` / `cordis-plugin-group=1.0.5`。
- `@deepseek-ai/dsh-invariants`：`node_modules` 目录不存在、`pnpm-lock.yaml`
  命中 **0 行**、`package.json` 无声明（三处齐清）。
- `pnpm-lock.yaml` 中 `0.2.0-rc.` 残留 **0 行**。
- `locale/{zh,en}.json`（build 链 `gen-version.mjs` 生成）已自动携带新窗口：
  「（兼容 DeepSeek Harness **0.2.1-rc.1 ~ 0.2.1-rc.2**）」/「(compatible with
  DeepSeek Harness **0.2.1-rc.1 ~ 0.2.1-rc.2**)」——smoke 0g 已据此判定通过。

### 6.3 人工待验清单（用户手工复核；本机桌面版 = 0.2.1-rc.2）

1. **加载**：重启 DeepSeek Harness → 插件正常加载（无软禁用日志）、`greet`
   工具注册；
2. **面板**：「插件」页本插件详情页 → 配置面板往返（getConfig / 整段 `replace`
   + `settings/document-updated` 门控重估）、ping、更新条；
3. **RPC / 网关面**（rc.1 起「按调用方授权」）：实测 `template/*` 端点往返；
4. **版本提示**：启动静默检查；手动检查 available → GlobalNotice 弹窗 +
   命令片复制；`pnpm test-version-bump` 两阶段（available 弹窗；重装后立刻跑
   新版本、**不弹任何陈旧对话框**）；
5. **软禁用反证**：临时把 `MAX_HARNESS_VERSION` 压到 `0.2.0-rc.2` → 确认
   「已停用」面板照常渲染、给出可执行的更新/降级指引、index-inject 无残留
   → 改回并重启；
6. **拆除确认**：`shell.overlay` 只剩 `template-update-notice` 一个条目，
   浏览器控制台无缺槽位告警。

## 7. 边界与后续

- **本轮不做**：分支冻结、插件版本 bump 与 `pnpm publish`（按用户指示）；
  `engines.dsh` 迁移（已评估否决）；Typert 新增的 `principal` / `remote-access`
  / `resources` 面；`plugin-manager` 新增的 `plugins.tab` / `plugins.add.actions`
  槽位；`ui-layout` 新增的 `shell.bottom` 槽位；UI 原语重同步（14 个文件逐 blob
  相同）；衍生 E2E 复跑。
- **本轮已做（超出最小迁移的一项）**：**陈旧检测整体拆除**——原计划是「复核后
  另起一轮」，用户 2026-10-19 裁定同轮拆除（范式侧已真机确认上游修复）；清单见
  §0 的「同轮附带拆除」行，回退记录与残留场景（`link:` 开发路径）见
  `docs/harness-defect-workarounds.md` 的历史防护回退块。
- **追新注意**：0.2.1 线内 rc.3+ / 正式版仍需先取证再抬 MAX；下次若只是同 tuple
  内（如 rc.2→rc.3）**默认只抬 MAX、不动依赖**（caret 已覆盖）。
- **给下一轮的经验**：
  1. 0.2.1 线的升级指南挂在 **`docs/upgrade-guide/v0.2.0-rc.2/`** 目录下（不是
     `v0.2.1-*`），容易漏看；
  2. 本机 harness clone 会落后于上游 tag——分析前必须 `git fetch --tags` 并核对
     `git describe --tags`；
  3. **`skipLibCheck` 与跨包类型引用**（详见 §7.1）：`ui-plugin-manager` 的
     `slot-contract.d.ts` 引用了 `@deepseek-ai/dsh-api-remotes/client` 等模板未
     声明的包，靠 `skipLibCheck` 通过——这是**上游惯例**而非缺口，**不要**去补
     devDep（实测补了只是把缺失推给下一层）；
  4. pnpm 11 默认 `minimumReleaseAge = 1440`：追新发布后 **24h 内**安装会触发
     `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`，届时需按版本条目写
     `minimumReleaseAgeExclude`（不要设 0）。

### 7.1 `skipLibCheck` 与跨包类型引用：已核实、**不需要处理**

> 用户手工核实后追加（2026-10-19）。结论：**保持现状**；本文 §2.2 与旧版 §7
> 里「若将来关掉 `skipLibCheck`，需补 devDep」的说法**不成立**，已按实测修正。

**现象**：`@deepseek-ai/dsh-client-ui-plugin-manager@0.2.1-rc.2` 的
`lib/types/client/slot-contract.d.ts:20` 有
`import type { BundleInfo } from '@deepseek-ai/dsh-api-remotes/client'`，并用于
`:47` 的 `PluginPackageRef.availability`；该包不在模板依赖面、pnpm 严格布局下
也解析不到（`node_modules/@deepseek-ai/dsh-api-remotes` 与 `.pnpm` 内均不存在）。
`tsc` 不报错是因为 `tsconfig.json` 的 `skipLibCheck: true` 会跳过 **`.d.ts` 文件
内部**的检查（含其自身的 import 解析）。

**五条实测依据**：

1. **运行时零影响**：`lib/client.js` 内 `api-remotes` / `dsh-client-store` /
   `ui-settings` **0 命中**——client 半对 dsh-* 全是 `import type`，编译期擦除。
2. **这是上游惯例，不是本模板缺口**：上游 `ui-plugin-manager` 的 peer 只有
   `@deepseek-ai/cordis`；`dsh-api-remotes` / `dsh-client-store` /
   `dsh-client-ui-settings` / `dsh-plugin-manager` 等**全部只写在 devDependencies**
   （`workspace:*`）。harness 根 `tsconfig.base.json` 同样是
   `skipLibCheck: true`。范式仓 `dsh-comfyui-based-tools` 同样如此。
3. **补 devDep 是死胡同（实测）**：临时装 `api-remotes` / `client-store` /
   `ui-settings` / `attachment` 四个包后关掉 `skipLibCheck`，错误数 **16 → 16**，
   只是换了一批缺失：`dsh-api-gateway/client`、`dsh-plugin-manager/types`、
   `dsh-plugin-market/types`、`dsh-host-plugin-inventory/types`、`dsh-subagent/client`、
   `dsh-api-*-controller/types`、`dsh-cordis-host-runner/types` 等 **13 个**
   （`dsh-api-remotes` 是网关面聚合包，引了整条下游链）。实验后已完整还原
   （`package.json` / `pnpm-lock.yaml` 从备份恢复、手工装的包从 `node_modules` 删除，
   `git diff` 确认无残留）。
4. **退化面极小且未被使用**：`skipLibCheck` 跳过的是「库内部」检查，**不影响**
   库对外的类型面。反向赋值探针实测：
   - `PropsRuntime<'plugins.bundle.config'>` **未整体退化**：`props.view` 仍精确为
     `'summary' | 'page'`，写错字段仍报 TS2339；
   - `form` prop 仍解析为 `ConfigPageForm | undefined`；
   - **唯一退化**：`PluginPackageRef.availability` → `any`。
   而 `PluginPackageRef` / `availability` / `BundleInfo` 在模板 `src/` 里 **0 处引用**
   （模板只用槽位的 `view` 与 `form`），故当前无任何实际损失。
5. **还原后全绿**：`pnpm run typecheck` exit 0 / `build` exit 0 /
   `smoke-offline` ALL PASSED（31 项）/ `pnpm peers check` 无告警。

**边界与将来动作**：若某个衍生插件**要用 `availability`**，那时它是 `any`、写错
不报错。处置优先级：①（推荐）在该插件内本地声明所需联合类型并在边界处断言，
零依赖；② 才考虑加 `@deepseek-ai/dsh-api-remotes` 到 devDependencies（按第 3 条，
收益接近零）。**不要**为此关掉 `skipLibCheck`——那是上游整套声明面的前提。

## 8. 证据索引

- 取证 tag：`dsh-v0.2.0-rc.2`（`639ed01539`）→ `dsh-v0.2.1-rc.1`
  （`1600d8a1e1`）→ `dsh-v0.2.1-rc.2`（`687f282e86`），`c:/deepseek-harness`；
  全程 `git show/diff/ls-tree/grep <tag>` 只读、未切换工作树。
- 官方指南：`docs/upgrade-guide/v0.2.0-rc.2/remove-runtime-invariants/guide.md`、
  `docs/upgrade-guide/v0.2.1-alpha.3/plugin-engines-dsh/guide.md`、
  `docs/upgrade-guide/v0.2.1-alpha.2/plugin-install-over-installed/guide.md`
  （末条**不适用**：本插件是包根插件）。
- 关键源码位置（目标 tag）：`boot/app-boot/src/plugin-compatibility.ts:44-71`
  （判定与 `engines.dsh` 优先）、`boot/app-boot/src/profile.ts`（`name:
  basename(dir)`）、`boot/app-boot/src/compatibility-preflight.ts`（行级检查与
  `disabled` 落点）、`boot/plugin-manager/src/index.ts:439/444/544`（覆盖安装
  拒绝）、`boot/hmr/src/index.ts:890/925/976`（模块↔磁盘比对与驱逐）、
  `packages/settings/settings/src/index.ts:266/357`（configure/replace）、
  `client/ui-plugin-manager/src/client/slot-contract.ts:142`
  （`plugins.bundle.config`）、`client/ui-layout/src/client/index.ts:105/186`
  （`shell.overlay`）、`host/webserver/src/index.ts:39` + `injections.ts`
  （index-inject）、`core/tools/src/index.ts:199`（`tools/result`）、
  `typert/protocol/src/types.ts:360`（`src-json` codec）。
- 实测命令：`semver.satisfies` 矩阵、`git rev-parse <tag>:<dir>` 的 tree hash
  对比、`git ls-tree` 存在性、`git grep` 符号存活、`app.asar` 头解析读桌面
  实装版本、`pnpm why` 追依赖来源。
- 范式侧同轮记录：`c:/agentProjects/dsh-comfyui-based-tools/docs/compat-plan-0.2.1-rc.2.md`
  （提交 `b67ec99`）。
