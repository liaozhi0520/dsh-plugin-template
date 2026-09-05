# DSH 0.1.1 ↔ 0.1.2 兼容手册（写兼容代码前必读）

> **读者**：用本模板开发插件的 agent。目标：给出 `0.1.1-rc.2` 与 `0.1.2-rc.1` 两线的
> **全部已知差异**（breaking / normal 分级）+ 每项的**兼容方案与具体代码**，照抄即可写出
> 双线兼容的插件。
>
> **证据基础**：`c:/deepseek-harness` 两棵树对照取证（tag `dsh-v0.1.1-rc.2` vs checkout
> `dsh-v0.1.2-rc.1`）+ `dsh-meme-gen` 双线迁移实操（提交 `5cc0a0f` 回退 0.1.1、`9684343`
> 上双线 0.1.2、`docs/compat-plan-0.1.2-rc.1.md` 执行记录）。每条差异都标了证据位置；
> 引用 meme-gen 记录但本次未在源码复核的条目已注明「实操记录」。

---

## 0. 总则：写兼容代码的四条规矩（先读这个再抄代码）

1. **先分层，再动手**：把 harness 的每个变化先归类为「类型层破坏」还是「运行时破坏」。
   类型层破坏（import 路径/包没了）只需迁移 `import type`——类型导入编译期擦除，运行时
   无感、零分叉；只有运行时破坏（方法/字段/行为变了）才需要特征探测。0.1.1→0.1.2 的
   实测结论：破坏几乎全在类型层，运行时分叉仅一处（§3.1）。
2. **源码只保留一套 import 链**：typecheck 只对一条链成立（`dsh-client-runtime/client`
   链与 `dsh-client-ui-renderer/client` 链互斥），双线兼容的正确姿势 =
   **源码写 0.1.2（新线）的 import 面 + 编译产物在旧线上靠特征探测跑**。
   禁止 import 两套再 if-else——typecheck 不可能同时过两套。
3. **三类依赖名单，职责分离**：peer = 安装期兼容承诺（双线写并集）；dev = typecheck
   目标（永远钉死一条线）；`dsh.client.inject` 与 tsdown `neverBundle` 只准列
   **双线都存在**的包（§1.3、§1.4 有反例）。
4. **旧线兼容是推断，冒烟坐实**：typecheck 对的是新线，旧线能跑是调研结论；每个
   特征探测的 fallback 分支必须进冒烟清单，在旧线 harness 上实测一次。

---

## 1. 依赖清单层（package.json / tsdown）

### 1.1 两线包清单差异总表

| 包 | 0.1.1-rc.2 | 0.1.2-rc.1 | 分级 |
|---|---|---|---|
| `@deepseek-ai/dsh-client-runtime` | 存在（client 聚合包：`ctx.slots` 增补、`ToolCallBlock`、connection/slots 类型；且是 `PRELOADED_CLIENT_EXTERNALS` 唯一成员） | **整包删除**（提交 `be531688f3`） | **breaking** |
| `@deepseek-ai/dsh-client-ui-renderer` | 不存在 | 新增（`ctx.slots` 类型新家） | 0.1.2-only |
| `@deepseek-ai/dsh-client-ui-chat` | 不存在 | 新增（`ToolCallBlock` 惯用导入点；定义 owner 是 `dsh-client-ui-conversation`） | 0.1.2-only |
| `@deepseek-ai/dsh-util-values` | 不存在 | 新增（`JsonValue` 新家） | 0.1.2-only |
| `@deepseek-ai/dsh-client-store` | 不是模块表基线 | 进入 `PLATFORM_MODULES` 基线 | normal |
| `PRELOADED_CLIENT_EXTERNALS` | `['@deepseek-ai/dsh-client-runtime/client']`（packages/client/web/src/platform.ts） | `[]`（清空） | normal |

> 证据：`git show dsh-v0.1.1-rc.2:packages/client/web/src/platform.ts` vs
> `packages/client/web/src/platform.ts@0.1.2-rc.1`；`packages/client/runtime/` 在 0.1.2
> 已无 `package.json`（不再是包）。

### 1.2 双线依赖写法（照抄）

```jsonc
// peerDependencies —— 安装期承诺：双线写【并集】，老线 harness 才能装
// ⚠️ 不能单写 ^0.1.2-rc.1：npm semver 预发布规则下，0.1.1-rc.2 这种
//    [major,minor,patch] 带预发布的版本不满足 ^0.1.1-rc.2 之外的跨线范围，
//    0.1.1 harness 上 `dsh plugin add` 会 peer 解析失败或拉重复副本。
"@deepseek-ai/dsh-tools": "^0.1.1-rc.2 || ^0.1.2-rc.1",
"@deepseek-ai/dsh-client-connection": "^0.1.1-rc.2 || ^0.1.2-rc.1",

// devDependencies —— typecheck 目标：永远【钉死一条线】（这里钉新线 0.1.2）
// ⚠️ dev 也写并集是实测坑：pnpm 会沿用 lockfile 里满足并集第一臂的旧解析，
//    既有 dsh 包一个都不升，typecheck 目标混成两线必炸。
"@deepseek-ai/dsh-client-connection": "^0.1.2-rc.1",

// 0.1.2 新增包（两线差异包）：只进 devDependencies，理由有二——
// ① 源码对它们只有 import type，编译期擦除，旧线运行时缺席无害；
// ② 进 peer 会让 0.1.1 harness 安装期解析失败（0.1.1 没有这些包）。
"@deepseek-ai/dsh-client-ui-renderer": "^0.1.2-rc.1",   // dev only
"@deepseek-ai/dsh-client-ui-chat": "^0.1.2-rc.1",       // dev only
"@deepseek-ai/dsh-util-values": "^0.1.2-rc.1",          // dev only

// dsh-client-runtime（旧聚合包）：peer + dev 【全删】，源码不再引用它。
```

### 1.3 `dsh.client.inject`：只列双线都存在的包（有硬失败反例）

**语义（0.1.2 实证，`packages/client/modules/src/client/manifest.ts`）**：host 把插件
manifest 的 `dsh.client.inject` 编进 client boot graph（`WebBootEntry.inject`）——
「inject 指名的包行，其 factory 必须先于本行 materialize 到达」。它是**加载顺序依赖边**，
不是纯注释。

**规矩**：inject 名单里的每个包必须在**所有支持线**上都存在且会出现在模块图里。

> **反例（meme-gen 实操记录 `5cc0a0f`）**：插件在 0.1.2-alpha 线开发时 inject 列了
> `dsh-client-ui-chat`，回退 0.1.1 时该包不存在 → **web 启动硬失败**，必须从 inject
> 移除。0.1.2-only 包（ui-renderer / ui-chat / util-values）一律**不进 inject**。
> （注：meme-gen 0.3.0 实际把 ui-renderer 加回了 inject 并称其为信息性边、其 0.1.1
> 冒烟当时仍是待办——模板取更保守的规矩，冒烟未过前不学它。）

```jsonc
// dsh.client.inject —— 双线都存在的包才准进
"dsh": { "client": { "inject": [
  "@deepseek-ai/dsh-client-connection",   // 两线都有 ✓
  "@deepseek-ai/dsh-client-locale",       // 两线都有 ✓
  "@deepseek-ai/dsh-client-ui-settings"   // 两线都有 ✓
  // ✗ "@deepseek-ai/dsh-client-ui-renderer" —— 0.1.1 没有，不进
] } }
```

### 1.4 tsdown `neverBundle`（client bundle 外部依赖）：对齐两线基线交集

模块表只播种 `PLATFORM_MODULES`（两线并集差集见 §1.1）。bundle 里**值级 import** 的
dsh 包必须是两线模块表都提供的：

```ts
// tsdown.config.ts —— 模板现值即两线交集，照此保持：
neverBundle: [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  // 'react-dom/client' 后的名单改动要对着两线 PLATFORM_MODULES 核对；
  // 0.1.2 新基线 dsh-client-store 只有在两线都用它时才可加。
],
```

---

## 2. 类型层 breaking changes（迁移 `import type`，运行时零分叉）

> 共同原理：以下三处源码引用都是**类型导入**——编译期擦除，只要 typecheck 过了，
> 产物在两线上行为完全一致。改法 = 换导入路径，无任何运行时代码。

### 2.1 `JsonValue`：`@deepseek-ai/dsh-session` → `@deepseek-ai/dsh-util-values`

> 证据：0.1.1 `packages/core/session/src/index.ts:28`
> `export type { JsonValue } from './json.ts'`；0.1.2 session 只从 util-values 导入
> `snapshotJsonValue`、**不再转出 JsonValue**；新家
> `packages/util/values/src/index.ts:3`。

```ts
// before（0.1.1 面）
import type { JsonValue } from '@deepseek-ai/dsh-session'
// after（0.1.2 面；0.1.1 线该包不存在，但这是 type-only，旧线上不解析、无害）
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
```

### 2.2 `ctx.slots` 类型增补：`dsh-client-runtime/client` → `dsh-client-ui-renderer/client`

> 证据：0.1.1 `packages/client/runtime/src/client/index.ts:169-170`
> `declare module '@deepseek-ai/cordis' { interface Context { slots: import('./slots.ts').SlotRegistry } }`；
> 0.1.2 同构声明移到 `packages/client/ui-renderer/src/client/index.ts`。

```ts
// before（0.1.1 面）—— src/client/index.ts
import type {} from '@deepseek-ai/dsh-client-runtime/client'
// after（0.1.2 面）—— 空导入只为拉类型增补（declare module 合并），换包名即可
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
```

> **本模板在 0.1.1→0.1.2 迁移中实际命中的就是这一处**（`src/client/index.ts`）；
> 其余条目是给你往模板里加业务代码时用的。

### 2.3 `ToolCallBlock`：`dsh-client-runtime/client` → `dsh-client-ui-chat/client`

> 证据：0.1.1 `packages/client/runtime/src/client/index.ts:80`（类型再导出清单含
> `ToolCallBlock`）；0.1.2 `packages/client/ui-chat/src/client/index.ts` 再导出自
> `./contract/snapshot.ts`（定义 owner 是 `dsh-client-ui-conversation`，从 ui-chat
> 导入是官方惯例）。

```ts
// before（0.1.1 面）
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
// after（0.1.2 面）
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-ui-chat/client'
```

**附带字段删除（0.1.2）**：`ToolCallBlock` 删了 `callView` / `resultView` 字段
（meme-gen 未使用）。若你的代码用到，先类型收窄再可选访问：

```ts
// 兼容旧线字段：typecheck 只认 0.1.2 面（无 callView），旧线运行时可能带——
// 用结构化收窄而不是 (block as any).callView
interface LegacyToolCallBlockView { callView?: unknown; resultView?: unknown }
const legacy = block as unknown as LegacyToolCallBlockView
const callView = legacy.callView // 0.1.1 上有值，0.1.2 上恒 undefined
```

---

## 3. 运行时层 breaking changes（特征探测）

### 3.1 `Session.events` getter → `snapshotEvents()` 方法（两线**唯一已知**运行时分叉）

> 证据：0.1.1 `packages/core/session/src/index.ts:559`
> `get events(): readonly SessionEvent[]`；0.1.2 同文件 `:600`
> `snapshotEvents(fromSeq = SessionLogOffset(0), toSeqExclusive = this.seq)` ——
> 无参调用返回缓存的全量只读冻结快照，与旧 getter 语义逐字等价（方法体同构）。

**兼容代码（meme-gen `session-images.ts` 实装，签名已核对）**：

```ts
/** 两线事件访问器收窄：0.1.2 方法在前（正向探测），0.1.1 getter 兜底。 */
interface SessionEventAccessor {
  snapshotEvents?: () => readonly SessionEvent[]
  events?: readonly SessionEvent[]
}
const session = exec.agent?.session as unknown as SessionEventAccessor | undefined
const events = session?.snapshotEvents?.() ?? session?.events ?? []
```

写法要点：
- **新 API 在前**：`snapshotEvents?.()` 可选调用探测方法存在性，旧线上是 `undefined`，
  `??` 落到 `events` getter；
- `as unknown as` 结构化收窄，不碰 `any`；
- 全部改动里**唯一的运行时分支**——冒烟时必须在 0.1.1 上实测到这条 fallback 路径。

### 3.2 （按需）`ToolHostDescriptionInjected` → `ToolHostInfoInjected`、`hostDescription` → `hostInfo`

> 证据：0.1.2 `packages/client/ui-tool/src/client/contract/slots.ts:52`
> `export type ToolHostInfoInjected`（0.1.1 名为 `ToolHostDescriptionInjected`）。
> **只影响**给 `tool.call.toolview` 等插槽写 client 组件且使用 host 面的插件；
> 本模板与 meme-gen 均未使用，追新时才需要处理。

```ts
// 0.1.2 面 typecheck + 旧线运行时兜底：字段探测而不是类型断言
interface HostFaceAccessor { hostInfo?: unknown; hostDescription?: unknown }
const face = props as unknown as HostFaceAccessor
const host = face.hostInfo ?? face.hostDescription // 0.1.2 取 hostInfo，0.1.1 取 hostDescription
// 类型导入：0.1.2 从 '@deepseek-ai/dsh-client-ui-tool/client' 导 ToolHostInfoInjected
```

### 3.3 特征探测范式（写法规矩）

1. 定义**最小收窄接口**（只列你用到、且两线形态不同的成员，标清哪线是哪种）；
2. **新 API 在前、旧 API 兜底**的 `??` 链；方法用 `?.()` 可选调用，属性直接 `??`；
3. 每处探测留一行注释：两线各自的证据（文件:行号）；
4. 探测点数量控制在个位数——出现大面积探测说明调研结论错了，停下来重新对照两棵树；
5. 每个 fallback 分支登记进冒烟清单（旧线 harness 实测）。

---

## 4. normal changes（无需改代码 / 顺手项）

| 变化 | 证据 | 对插件的影响 |
|---|---|---|
| system prompt 段落 order 中央化：0.1.2 新增 `SECTION_ORDERS` 表 | `packages/core/system-prompt/src/index.ts:121`；0.1.1 无 `getSectionOrder`（全树 grep 零命中） | **硬编码 order 在两线都合法**（0.1.2 允许外部贡献任意有限 order）。模板 `order: 100` 不动 |
| `ctx.settings.register` 的 namespace 校验增强（kebab-case） | meme-gen 实操记录（本模板未用 `ctx.settings`，未复核） | 旧 `as SettingsNamespace` cast 写法仍编译；顺手项：直接传 kebab-case 字面量 |
| webserver index 注入新增 `__DSH_BOOT_READY__` tail script | meme-gen 实操记录 | `{kind:'global'}` 行仍在 head、先于 boot 队列执行 → 模板软禁用注入（`DISABLED_GLOBAL`）两线同构，无需改 |
| 安装链路新增 `reconcileBundlePackages` / `patchReload` | meme-gen 实操记录 | 插件无感；冒烟时按新机制走一遍 `dsh plugin add` 即可 |
| `PRELOADED_CLIENT_EXTERNALS`：runtime → 空；`PLATFORM_MODULES` 增 `dsh-client-store` | 两线 `packages/client/web/src/platform.ts` 对照 | 只影响 bundle 外部依赖决策（§1.4） |

**已逐项验证两线不变的面**（模板实际使用的 API，可放心假设同构；完整清单见 meme-gen
`docs/compat-plan-0.1.2-rc.1.md` §5）：`defineTool` / `ToolRunContext` / `ctx.tools.register`；
手写 `InvocationDescriptor`（`invocation: { kind: 'direct' }` + `src-json` codec）与
`ctx.typert.register`；`ctx.provide`；slots 契约（`settings.section` 的 SlotMap 注册形状）；
`ctx.locale.register/bind`；`ctx.connection.rpc.call('/api', …)`；
`webserver/index-inject` 事件与 `{kind:'global'}` 行；`dsh plugin add` 的 peerDependencies
计入 link 闭包行为；client HMR 链路（stat poll → SSE → fiber 原地替换）。

---

## 5. 把手册用于你的插件：操作序

1. **cp 剧本**：`cp docs/compat-plan-TEMPLATE.md docs/compat-plan-<目标版本>.md`；
2. **取证**：`git -C c:/deepseek-harness describe --tags` 核对签出 = 目标线 tag；
   本手册每条差异按 §6 的命令在两棵树复核一遍（0.1.3+ 线可能有新差异，勿盲信本手册）；
3. **依赖清单**：按 §1.2 改 package.json（peer 并集 / dev 钉新线 / 新包只进 dev /
   删死包）；按 §1.3、§1.4 核对 inject 与 neverBundle；
4. **类型迁移**：grep 源码里所有 `dsh-client-runtime`，按 §2 逐条迁移；
5. **运行时分叉**：对照 §3 写特征探测（模板现状只有 §2.2 一处命中，无运行时分叉；
   你加的业务代码按 §3.1/§3.2 处理）；
6. **编译验证**：`pnpm install → typecheck → build` 全绿 = 编译级迁移完成；
7. **版本窗口**：`src/version-gate.ts` 的 `MAX_HARNESS_VERSION` 上调到已验证 tag
   （保双线则 MIN 不动）；
8. **冒烟**：新线全流程（装载 + 设置面板 + 工具端到端 + HMR）+ 旧线冒烟
   （必须覆盖每个特征探测 fallback 分支）。

**反向回退（0.1.2 → 0.1.1）速查**：peer/dev 下调到 0.1.1 线；源码 import 反向迁移
（util-values → session、ui-renderer/ui-chat → runtime）；inject 移除 0.1.2-only 包
（否则 web 启动硬失败，§1.3 反例）；`MAX_HARNESS_VERSION` 下调；devDeps 里删掉
0.1.2-only 包。

---

## 6. 证据索引与取证方法

**两树对照命令**（本手册所有「证据」都可用它们复现）：

```sh
git -C c:/deepseek-harness describe --tags          # 核对签出（本手册取证时 = dsh-v0.1.2-rc.1）
git -C c:/deepseek-harness tag --list 'dsh-v0.1*'   # 可用发布 tag
git -C c:/deepseek-harness grep -n "snapshotEvents" -- packages/core/session/src        # 新线
git -C c:/deepseek-harness grep -n "get events" dsh-v0.1.1-rc.2 -- packages/core/session/src  # 旧线
git -C c:/deepseek-harness show dsh-v0.1.1-rc.2:packages/client/web/src/platform.ts     # 旧线单文件
```

**关键源码位置（0.1.2-rc.1，除注明外）**：

- `packages/client/ui-renderer/src/client/index.ts` — `ctx.slots` 类型增补（`declare module '@deepseek-ai/cordis'`）；0.1.1 同构声明在 `packages/client/runtime/src/client/index.ts:169`
- `packages/client/ui-chat/src/client/index.ts` — `ToolCallBlock` 再导出；0.1.1 在 `packages/client/runtime/src/client/index.ts:80`
- `packages/util/values/src/index.ts:3` — `JsonValue` 新家；0.1.1 转出在 `packages/core/session/src/index.ts:28`
- `packages/core/session/src/index.ts:600` — `snapshotEvents()`；0.1.1 `get events` 在 `:559`
- `packages/core/system-prompt/src/index.ts:121` — `SECTION_ORDERS`
- `packages/client/ui-tool/src/client/contract/slots.ts:52` — `ToolHostInfoInjected`
- `packages/client/modules/src/client/manifest.ts` — boot graph `inject` 语义（factory 先于 materialize 到达）
- `packages/client/web/src/platform.ts` — `PLATFORM_MODULES` / `PRELOADED_CLIENT_EXTERNALS`（0.1.1：runtime 预载；0.1.2：清空 + store 入基线）

**meme-gen 实操记录**：`dsh-meme-gen` 提交 `5cc0a0f`（回退 0.1.1）、`9684343`（上双线
0.1.2）、`docs/compat-plan-0.1.2-rc.1.md`（完整执行记录 + 踩坑：dev 并集 lockfile 首臂
解析、inject 硬失败反例）。

> **维护规矩**：0.1.3+ 线追新时，先按 §5 取证核对本手册条目是否仍成立，再扩充新条目；
> 过时条目就地更新并注明取证 tag，禁止凭记忆追加差异。
