# dsh-plugin-template 版本兼容与自更新方案

> ⚠️ **窗口模型变迁注记（2026-09-12）**：本文写作时的窗口模型是
> `[MIN_HARNESS_VERSION, MAX_HARNESS_VERSION]` 双窗口（§1.2 的 peer 并集、
> dev 钉线、特征探测、旧线冒烟均属该模型的方法论）。当前已收敛为
> **双边界窗口 `[0.1.5-rc.1, 0.1.5-rc.1]`（两端同值 = 仅支持该版本）**：
> 门禁保持 `[MIN, MAX]` 比较、peer/dev 同值 `^0.1.5-rc.1`、默认零版本分支。
> 现行写法见 `docs/compat-guide-0.1.2-to-0.1.5.md` 与 `AGENTS.md`；升级方案见
> 派生插件任一份 `docs/dsh-0.1.5-rc.1-upgrade-report.md`。本文的 §1 提交解剖与
> 自更新机制（§1.3/§4）仍准确，双线相关章节仅作历史方法论保留。

> 依据：`dsh-meme-gen` 插件的完整演进史（git `41ecd61..2679ce8`），重点解剖三个提交——
> `5cc0a0f` compat(0.1.1) 回退适配、`9684343` compat(0.1.2) 双线窗口、`4cd71dc` 设置面板自更新。
> 本文是**方案**（what / why / how），不是执行记录；执行时按第 5 节顺序落地。

---

## 1. 参考实现研究结论（dsh-meme-gen 是怎么做的）

### 1.1 提交链与两条主线

| 提交 | 内容 | 沉淀 |
|---|---|---|
| `5cc0a0f` compat(0.1.1) | 依赖/门禁下调到 0.1.1 线：删 `dsh-client-ui-chat`（0.1.1 不存在，web 启动硬失败）、改走 `dsh-client-runtime/client`、`JsonValue` 改从 `dsh-session` 导入、system prompt order 硬编码（0.1.1 无 `getSectionOrder`） | 门禁窗口 = `[MIN, MAX]`，回退 = 下调双端 + peer/dev 同步降线 |
| `9684343` compat(0.1.2) | 适配「会话视图拆分」：MAX 上调 `0.1.2-rc.1`、peer 改**并集** `^0.1.1-rc.2 \|\| ^0.1.2-rc.1`、dev **钉死** `^0.1.2-rc.1`、3 处 `import type` 迁移、1 处运行时特征探测（`Session.events` → `snapshotEvents()`）、`docs/compat-plan-0.1.2-rc.1.md` 执行记录 | 双线兼容的完整操作形态 |
| `4cd71dc` 自更新 | host 半 `self-update.ts`（487 行）+ 契约端点 `meme/checkUpdate`、`meme/updateSelf` + client 半标题行更新条 | 插件自更新的完整实现 |

### 1.2 版本兼容的机制（从 compat 提交提炼）

1. **门禁窗口 = 对外承诺的边界**。`MIN_HARNESS_VERSION` = 代码实际使用的 API 面要求的最低版本；`MAX_HARNESS_VERSION` = **已验证兼容**的最新 tag，宁紧勿松（`0.1.2-rc.1` 会挡掉 `rc.2`/正式版——追新验证通过后再上调）。失败语义是软禁用（apply 时 no-op + client 停用面板），不是抛错——harness 对插件抛错零容忍（boot reject → exit(1)）。
2. **peer 与 dev 职责分离，双线期写法不同**：
   - peer = 安装期兼容承诺 → 双线期写**并集** `^0.1.1-rc.2 || ^0.1.2-rc.1`。不能单写 `^0.1.2-rc.1`：npm semver 预发布规则下旧线 harness 装 peer 会失败或拉重复副本；
   - dev = typecheck 目标 → 永远**钉一条线**（`^0.1.2-rc.1`）。dev 也写并集是实测坑：pnpm 会沿用 lockfile 满足并集第一臂的旧解析，typecheck 目标混成两线必炸。
3. **破坏面几乎全在类型层**。0.1.1 → 0.1.2 的实际必改 = 删 1 依赖、增 3 个 dev 依赖（只 `import type`，运行时缺席无害）、3 处 `import type` 路径迁移；**唯一**运行时分叉用特征探测解决：
   ```ts
   interface SessionEventAccessor { snapshotEvents?: () => readonly E[]; events?: readonly E[] }
   const events = session?.snapshotEvents?.() ?? session?.events ?? []
   ```
4. **旧线兼容是推断，必须冒烟坐实**。源码 typecheck 只对一套 import 链成立（`client-runtime` 链与 `ui-renderer` 链互斥），双线窗口的可行性建立在「破坏全在类型层、运行时面两版一致」的调研结论上，执行后须在旧线 harness 补一次冒烟（装载 + 面板 + 工具端到端，必须覆盖特征探测的 fallback 分支）。
5. **每次迁移留执行记录**：`docs/compat-plan-<目标版本>.md`（调研结论 → 必改清单 → 验证 → 实测点 → 证据索引）。
6. **已知债**：`scripts/bump-deps.mjs` 的 `^0.x.y-rc.N` 正则对并集范围失效（meme-gen 文档明说「下次追新前先处理」）——最终决策（见 A2）：**删除脚本，追新改手动显式流程**。

### 1.3 自更新的机制（4cd71dc）

- **硬原则：安装/更新只走官方 CLI 通道** `dsh plugin --profile <name> add <pkg>@<version>`。它在 harness 侧是「profile 目录里的 pnpm add + `dsh.profile.bundles` 清单 reconcile」的官方转发器——更新已装插件时 reconcile 是 no-op，与用户手动安装完全同构，未来 CLI 增加安装期校验/钩子也自动兼容。**不绕过它直接调 pnpm，不用 `pnpm update`（会剥 rc 包的 `^`）**。
- **checkUpdate（只读）**：npm registry `/<pkg>/latest` 一次往返（scoped 包名 `%2F` 编码；`accept: application/json`——abbreviated packument 头会被 406 拒）+ 严格 semver 比较（复用 version-gate 的 `compareVersions`）。
- **updateSelf（动作面）**：三级 profile 定位 → 官方通道校验 → 安装 → 回读：
  1. ① 包根逐级上溯找声明 `dsh.profile` 且认领本包（bundles/dependencies 列出包名）的目录（registry 实体安装）；
  2. ② link 开发副本反查：Node 把链接 realpath 成源码仓库、上溯必然失败，于是扫描 `$DSH_HOME/profiles/*` 找 `node_modules/<pkg>` 的 realpath 指向本包根的 profile（**物理证据**）；启动 argv 里的 profile 名（`dsh web` = `--profile web` 硬编码别名）作权威裁决，多 link 无 argv 才报错交人工；
  3. ③ 都找不到 → 明确报错提示手动命令。
- **官方通道校验**：安装前先 `dsh plugin --profile <name> list --json` 交叉核对——子进程解析的 profile 目录与定位一致（排除同名异 home）、本包在 profile 依赖里。
- **link 场景的坑**：pnpm 无法用 registry 版本直接覆盖现存 junction（`pnpm add` 报 ERR_PNPM_ENOENT，11.7 实测），且 `pnpm remove` 不删顶层 junction 残留 → 先 `rmSync` 只删链接本体（绝不触及源码仓库），再走官方 add 全新安装。
- **dsh CLI 调用形态**：优先 `node <process.argv[1]>`（与 version-gate 同一锚点假设；严格校验 argv[1] 确是 `@deepseek-ai/dsh` 包自己声明的 bin），失败回落 PATH 上的 `dsh`（win32 经 shell 解析 .cmd shim；参数全部过白名单正则后再拼接，DEP0190 安全）。
- **并发与竞态**：模块级 in-flight 锁合并重复点击；点更新时 latest 回落到 ≤ 当前 → 归位「已是最新」。当前版本读自身包根 package.json 并**模块级缓存**（更新只改磁盘不改本进程内存，缓存保证运行期口径一致）。
- **client 半**：标题行右侧紧凑更新条（版本徽标 + 状态词 + 动作按钮），长文案下沉标题行下详情行（pre-wrap + 滚动 + 可复制）；六态状态机 `idle/checking/up-to-date/available/updating/updated`；mount 静默检查一次（离线不打扰，手动可重试）。

---

## 2. 模板现状与差距

**已有（不重做）**：`src/version-gate.ts`（MIN/MAX 窗口 + 软禁用 + `DSH_PLUGIN_TEMPLATE_STRICT` 逃逸）、软禁用注入 `disabled-flag` + client 停用面板（`TemplateDisabledSection`）、README「依赖版本与追新」。（原 `scripts/bump-deps.mjs` 追新脚本已删除，见 A2 决策。）

**差距**：

| 能力 | dsh-meme-gen | 模板现状 |
|---|---|---|
| 双线兼容剧本 | compat-plan 文档 + peer 并集实操 | 无文档、无示范 |
| 追新方式 | —— | 原带 bump 脚本，已删除（A2），README 固化手动显式流程 |
| 自更新 host | `self-update.ts` 全套 | 无 |
| 自更新契约 | shared contract 端点 + 类型 | 无 |
| 自更新 client | 更新条状态机 + 静默检查 | 无 |

---

## 3. 方案 A：版本兼容能力固化

### A1 固化「兼容剧本」文档 `docs/compat-plan-TEMPLATE.md`（新文件）

把 meme-gen 执行记录逆向成可复用骨架，追新/回退时 `cp docs/compat-plan-TEMPLATE.md docs/compat-plan-<目标版本>.md` 逐节填：

```
0. 执行状态表（门禁 / harness 签出 tag / package.json / node_modules / 源码 / 编译验证 / 待办）
1. 调研总结论（破坏面归类：类型层 vs 运行时层，逐项列「变化 → 对本插件的实际影响」）
2. 必改清单（P0）
   2.1 package.json 重组：删什么 / 增什么（只 import type 的新包只进 dev）/ peer 并集 / dev 钉死 / dsh.client.inject 增列
   2.2 源码迁移：import type 迁移表（旧导入点 → 新导入点）+ 运行时特征探测代码样式
   2.3 验证：pnpm install → typecheck → build 全绿 = 编译级迁移完成
3. 版本窗口决策（MIN 是否保持双线；MAX 上调到哪个已验证 tag）
4. P2 顺手项（过时注释 / 可简化的 cast）
5. 已逐项验证无需改动的 API 清单（防重复调研）
6. 迁移后需实测的运行时点（含旧线冒烟 + 特征探测 fallback 分支）
7. 边界与后续（MAX 挡掉的后续 tag、脚本兼容债）
8. 证据索引（harness tag、关键源码位置、拆分提交链、调研方法）
```

> **配套手册已就位**：`docs/compat-guide-0.1.1-to-0.1.2.md`——0.1.1-rc.2 ↔ 0.1.2-rc.1
> 两线的全部已知差异（breaking / normal 分级）+ 每项带代码的兼容方案，证据全部在
> `c:/deepseek-harness` 两棵树对照取证（手册 §6 给了复现命令）。与剧本模板分工：
> **手册 = 差异事实与兼容代码（what），剧本模板 = 迁移执行流程（how）**，执行时配套
> 使用；AGENTS.md 已挂链接，agent 做版本兼容工作前会先读它。

### A2 追新脚本 `scripts/bump-deps.mjs`：**删除**（决策记录）

原计划是把脚本升级到认识并集范围；实施冒烟暴露了更根本的问题，改为删除：

- **「当前 minor 线」语义静默跨破坏面**：脚本把 `0.1.x` 视为一条线、自动抬到该线最新——冒烟实测一把就把 10 个包从 `^0.1.1-rc.2` 静默扫到 `^0.1.2-rc.1`（跨 patch、带会话视图拆分这种大破坏），而 `^0.1.1-rc.2` 的 semver 约束根本拦不住脚本自己改写 manifest；
- **并集/多线状态不可靠**：正则式 range 改写对并集臂数、混合形态天然脆弱（meme-gen 同款脚本也留了这个已知债）；
- **下限抬升本质是人工决策**：抬下限 = 宣布「已在该版本验证」，目标线选择与破坏面评估本就该人工过目。

**替代**：README「追新流程（手动，无脚本）」固化四步显式操作（查目标线最新 → 手改 peer/dev 下限 → install + typecheck/build → 实测后上调 MAX）；每次迁移的 manifest 决策记录进 `docs/compat-plan-<版本>.md` §7。删除范围：`scripts/bump-deps.mjs`、`package.json` 的 `bump:deps` script、README/方案文档中的全部脚本引用。

### A3 README「依赖版本与追新」补双线小节 + AGENTS.md 硬约定

- README 增补「双线兼容」小节：
  - 决策树：调研结论「运行时面两版一致」→ 保 MIN 双线（peer 并集 + dev 钉新线 + 特征探测 + 旧线冒烟）；「运行时面破坏」→ MIN 上调放弃旧线（peer/dev 同步抬到新线，门禁 MIN 跟随）；
  - peer 并集的 semver 预发布规则警示（为什么不写单范围）、dev 钉死的原因（lockfile 首臂解析坑）。
- AGENTS.md 增「硬约定」段：peer/dev 职责分离；dev 不写并集；运行时分叉只用 `??` 链特征探测（不 import 两套）；双线必须冒烟坐实；MAX 只写已验证 tag；每次迁移留 `docs/compat-plan-<ver>.md`。

### A4 特征探测落点示范

模板 API 面小（tools / typert / webserver index-inject / slots / locale），0.1.2 拆分的实际影响点就是 `src/client/index.ts` 的 `ctx.slots` 类型增补 import（0.1.1 归 `dsh-client-runtime/client`，0.1.2 归 `dsh-client-ui-renderer/client`）——**这处差异与全部其他条目的带代码方案已固化在 `docs/compat-guide-0.1.1-to-0.1.2.md` §2/§3**（含 accessor 探测范式与写法规矩），下个 compat 执行时照抄，不再现场发明。

---

## 4. 方案 B：自更新功能移植

全部从 meme-gen 已验证实现移植（4cd71dc），改动点只有：命名空间 `meme` → `template`、日志前缀、locale key 前缀。包名/版本从自身 `package.json` 读取，**零硬编码**，天然 rename 安全。

### B1 host 半：`src/self-update.ts`（新文件，≈480 行）

照搬 meme-gen `src/self-update.ts` 六个区块：

1. **manifest**：读自身包根 `package.json` 的 name/version（模块级缓存；缺字段抛错）；
2. **registry 检查**：`fetchLatestVersion`（`/latest`、`accept: application/json`、15s 超时、版本串白名单 `^[\w.+-]+$`）+ `checkSelfUpdate`；
3. **profile 三级发现**：`walkUpToProfile` / `findLinkingProfile`（argv 权威裁决）/ `locateProfileDir`；`dshHome()`（`$DSH_HOME` 支持 `~` 前缀）与 `launcherProfileName()`（`dsh web` 别名、`--profile`/`--patch` 启动面语义）照搬；
4. **CLI 调用**：`harnessEntry()` 严格校验（`@deepseek-ai/dsh` 的 bin 声明）→ `runDshCli`（node 直调优先 → PATH `dsh` → win32 白名单拼接）；`spawnCaptured`（输出尾部 512KB 截断、超时 kill；list 60s / add 10min）；
5. **官方通道校验**：`verifyInstallChannel`（profile name = 目录 basename + `list --json` 的 `root.path` 交叉核对 + 依赖认领核对）；
6. **apply**：`applySelfUpdate`（in-flight 锁）→ 竞态兜底 → link 残留 junction 清理（`removeResidualDevLink`：只删指向 profile 之外的链接本体）→ `dsh plugin add` → 回读磁盘版本 → `restartRequired: true`。

改动点：所有日志/报错前缀 `[dsh-meme-gen]` → `[dsh-plugin-template]`；`compareVersions` 直接 `import { compareVersions } from './version-gate.js'`（模板已有同一实现，不重复造）。

### B2 共享契约：`src/shared/update-contract.ts`（新文件）

```ts
export const UPDATE_ENDPOINT = {
  checkUpdate: 'template/checkUpdate',
  updateSelf: 'template/updateSelf',
} as const

export interface TemplateUpdateCheck  { currentVersion: string; latestVersion: string; updateAvailable: boolean }
export interface TemplateUpdateApply  { updatedTo: string; changed: boolean; restartRequired: boolean }
export type TemplateUpdateCheckResult =
  | ({ ok: true } & TemplateUpdateCheck)
  | { ok: false; error: { code: string; message?: string } }
export type TemplateUpdateApplyResult =
  | ({ ok: true } & TemplateUpdateApply)
  | { ok: false; error: { code: string; message?: string } }
```

（与 `disabled-flag.ts` 同级同风格：纯数据/类型/常量，两端共用。）

### B3 host 接线：`src/remote.ts`

- `TemplateRemote` 增加 `checkUpdate()` / `updateSelf()` 两个无参方法：`try/catch` 折叠成 `{ ok: false, error: { code, message } }`（照 meme-gen `sticker-service.ts` 的 `fail` 模式；code 用 `check-failed` / `update-failed`），实现委托 `./self-update.js`；
- 描述符：建议顺手把 `PING_DESCRIPTOR` 重构成 meme-gen `typert.ts` 式**表驱动** `DESCRIPTORS: InvocationDescriptor[]`（`[['ping', []], ['checkUpdate', []], ['updateSelf', []]]` map 出 id/service/namespace/method/parameters/result），消除后续每加端点手写一份的样板；保守替代 = 追加两个常量 descriptor（`id: 'dsh-plugin-template#template/checkUpdate'` 等，codec 同为 `src-json`）。
- `src/index.ts` 不动（服务注册已走 `ctx.provide('template', new TemplateRemote())` + `ctx.typert.register`）。

### B4 client 半

- **`src/client/api.ts`**：引入 `OpResult<T>` 统一包络（照 meme-gen 的 `callXxx` 折叠模式：network/http/business 三类失败 + detail），新增 `checkUpdateViaHost` / `updateSelfViaHost`；现有 `pingHost` 一并迁移到 `OpResult`（统一错误面；`TemplateSection` 的 catch 分支同步简化）。
- **`src/client/TemplateSection.tsx`**：标题行改 `headerRow` 布局（左标题、右更新条），移植 meme-gen 六态状态机 `UpdatePhase`（`idle/checking/up-to-date/available/updating/updated`）+ `updateBusyRef` 互斥 + `aliveRef` 卸载守卫 + mount 静默检查一次（`silent=true` 失败不打扰）；更新条渲染：版本徽标 + 各状态词 + 「检查更新 / 立即更新」按钮；详情行：完整错误输出 / 重启提示（pre-wrap + 滚动 + 可选中复制）。
- **`src/client/TemplateSection.module.css`**：新增 `headerRow / updateBar / updateVersion / updateStatus(-Ok/-Error) / updateDetail(-Ok/-Error)` 样式类（照 meme-gen `MemeSection.module.css` 的 83 行更新段裁剪）。
- **`src/client/locales.ts`**：zh/en 同步新增 11 个 key：`updateVersion / updateCheck / updateChecking / updateUpToDate / updateAvailable / updateApply / updateApplying / updateDoneShort / updateDoneHint / updateCheckFailed / updateFailed`。
- **`src/client/index.ts`**：inject face 收拢为 `api: { ping, checkUpdate, updateSelf }`（与 meme-gen 同构；`TemplateSectionInjected` 的 `demo` 面同步改名——两处改动，换长期一致的面形状）。

### B5 边界明确（写进文档）

- **软禁用态没有更新条**：版本门禁软禁用时 host 半不注册任何业务端点，RPC 必然 404——client 停用分支本就提前 return 不渲染正常面板，天然成立；`TemplateDisabledSection` 保持「修复 harness 版本」的引导（这条链路自更新的职责边界：插件更新不了 harness，也不该试图更新）。
- **自更新要求 npm 发布**：GitHub-only 分发（未发 npm）时 registry `/latest` 404 → check 返回 `ok:false`，面板静默/手动重试。README 注明。
- **更新 = 换磁盘不改内存**：`restartRequired: true` 必须在 UI 明示「需重启 DeepSeek Harness 生效」。

### B6 rename 表更新（README「使用本模板」）

新文件带进来的改名落点补进既有四张表：

| 表 | 新增落点 |
|---|---|
| ③ 环境前缀 | `src/self-update.ts` 的错误/日志前缀（`[dsh-plugin-template]`） |
| ② 短插件 id | `src/remote.ts` 表驱动描述符的 `id` 前缀（本就列出，确认覆盖新端点） |
| ④ 顺手项 | `src/shared/update-contract.ts` 端点 namespace `'template'` 与 `src/remote.ts` 的 `namespace: 'template'` 同源——改 Typert namespace 时一并改 |

---

## 5. 实施顺序与验证

**顺序**：M1 host 自更新（B1 → B2 → B3）→ M2 client 更新条（B4）→ M3 兼容剧本固化（A1 → A2 → A4）→ M4 文档（A3 + B5 + B6）。B 是已验证实现的移植（低风险）；A2 最终落为**删除追新脚本**（决策记录见 A2：冒烟实测暴露「当前线」语义静默跨破坏面），追新固化为 README 手动流程。其中 **兼容手册（`docs/compat-guide-0.1.1-to-0.1.2.md`）与 AGENTS.md 挂链已随本方案先行落地**——它是 A1 剧本模板的差异事实底座，也是 agent 写兼容代码时的默认读物。

**验证清单**：

1. 编译级：`pnpm typecheck && pnpm build` 全绿；
2. 功能级（自更新）：
   - up-to-date 态：checkUpdate 返回 `updateAvailable=false`，面板显示「已是最新」；
   - **link 开发副本场景（开发态最常见，必测）**：`dsh plugin --profile web add <本目录绝对路径>` 安装的是 link → updateSelf 应走 link 反查定位 + 清残留 junction + 经官方 add 换成 registry 版；
   - registry 实体场景：发布新版后走完整 add 通道，回读磁盘版本、提示重启；
   - 并发合并（重复点击）、离线静默（mount 静默检查失败不打扰）、CLI 超时；
3. 兼容级：下次 harness 追新时按 `docs/compat-plan-TEMPLATE.md` 走一遍全流程（不在本次交付内，剧本可用性届时回收）。

**风险与不做的事**：

- ~~本次不把模板升到 0.1.2 线~~ → **已按用户决策执行追新**（peer 并集 + dev 钉 0.1.2-rc.1 + MAX 上调，编译级全绿），执行记录见 `docs/compat-plan-0.1.2-rc.1.md`；双线窗口 `[0.1.1-rc.2, 0.1.2-rc.1]`，旧线冒烟仍待实测（记录第 6 节）；
- 自更新不做「自动后台更新」：只有用户显式点击才安装；不做版本回退 UI（官方 add 通道本身支持 `@<旧版本>`，文档提及即可）。
