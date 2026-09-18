# dsh-plugin-template × DSH 0.1.2-rc.1 兼容计划（执行记录）

> ⚠️ **历史归档（2026-09-12）**：本执行记录的双窗口决策已被**双边界
> [0.1.5-rc.1, 0.1.5-rc.2]** 取代，见派生插件任一份
> `docs/dsh-0.1.5-rc.1-upgrade-report.md` 与本模板
> `docs/compat-guide-0.1.2-to-0.1.5.md`。仅作历史追溯。

> **结论：迁移已完成（编译级全绿）。** 依 `docs/compat-guide-0.1.1-to-0.1.2.md` 执行。
> 本文档是 `docs/compat-plan-TEMPLATE.md` 的首次实际使用，保留为执行记录与后续追新样例。

---

## 0. 执行状态

| 项 | 状态 |
|---|---|
| `src/version-gate.ts` | MIN = `0.1.1-rc.2`（保持双线）；MAX = `0.1.2-rc.1`（已上调） |
| `c:/deepseek-harness` | 签出 `dsh-v0.1.2-rc.1`（`git describe --tags` 已核对） |
| `package.json` | peer 并集 `^0.1.1-rc.2 \|\| ^0.1.2-rc.1`（11 个 dsh-*）；dev 钉 `^0.1.2-rc.1`；删 `dsh-client-runtime`（peer+dev）；dev 增 `dsh-client-ui-renderer` |
| node_modules | 全部 `@deepseek-ai/dsh-*` 实装 `0.1.2-rc.1`；`dsh-client-runtime` 已移除、`dsh-client-ui-renderer` 已就位（已验证） |
| 插件源码 | `import type` 迁移 1 处（见 2.2）；运行时特征探测 **0 处**（本插件无运行时分叉）；P2 无 |
| 编译验证 | `pnpm typecheck` + `pnpm build` 全绿（0.1.2-rc.1 类型面） |
| 待办 | 0.1.1 旧线冒烟（双线坐实，见第 6 节）；0.1.2 实机装载冒烟 |

## 1. 调研总结论

0.1.1-rc.2 → 0.1.2-rc.1 的「会话视图拆分」对本模板的破坏**全部集中在类型层与依赖清单层**，
运行时分叉为零（模板 API 面小：tools / typert / webserver index-inject / slots / locale）。

| 0.1.2 变化 | 对本模板的实际影响 | 分级 |
|---|---|---|
| `dsh-client-runtime` 整包删除 | 仅 `src/client/index.ts:15` 一处 type-only 导入（编译期擦除）；peer 声明移除 | 类型层 |
| `ctx.slots` 类型归属移动 | 新家 `dsh-client-ui-renderer/client`（declare module 合并在位） | 类型层 |
| 新增 `dsh-client-ui-renderer` | 只 `import type` → 只进 devDependencies，不进 peer / `dsh.client.inject` | 0.1.2-only |
| `PLATFORM_MODULES` 增 `dsh-client-store`、`PRELOADED_CLIENT_EXTERNALS` 清空 | 模板 client bundle 无值级 dsh 依赖，`neverBundle` 交集不变 | normal |

## 2. 必改清单（P0，已执行）

### 2.1 `package.json` 依赖重组

- **删**：`@deepseek-ai/dsh-client-runtime`（peer + dev 全删；0.1.2 中该包不存在，源码不再引用）。
- **增（仅 devDependencies，钉 `^0.1.2-rc.1`）**：`@deepseek-ai/dsh-client-ui-renderer`（`ctx.slots` 类型增补新归属）。
- **peer 改并集**：其余 11 个两线都存在的 `@deepseek-ai/dsh-*` peer → `^0.1.1-rc.2 || ^0.1.2-rc.1`。
- **dev 钉死 `^0.1.2-rc.1`**（typecheck 目标；不写并集——lockfile 首臂解析坑）。
- `dsh.client.inject` 不变：`connection` / `locale` / `ui-settings` 两线都存在（手册 §1.3 规矩）。
- tsdown `neverBundle` 不变（手册 §1.4）。

### 2.2 源码迁移（1 处 `import type`，无运行时改动）

```ts
// src/client/index.ts:15
- import type {} from '@deepseek-ai/dsh-client-runtime/client'
+ import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
```

### 2.3 验证

`pnpm install` → `pnpm typecheck` → `pnpm build` 全绿 = 编译级迁移完成（已执行）。

## 3. 版本窗口决策

MIN = `0.1.1-rc.2`（保持双线）；MAX = `0.1.2-rc.1`。

> 依据：调研结论「破坏全在类型层、运行时面两版一致」（手册 §4 两线不变清单覆盖本模板
> 全部使用的 API 面）。**0.1.1 线兼容属推断，冒烟未做前窗口未完全坐实**——本模板此前
> 即按 0.1.1 面编写且本次源码零运行时改动（产物 diff 仅类型擦除差异），0.1.1 兼容
> 风险极低，但仍按规程列第 6 节冒烟。

## 4. 可选项（P2）

无。0.1.2 的 `SECTION_ORDERS` / `settings.register` 校验 / `__DSH_BOOT_READY__` 对本模板
均无影响（手册 §4 normal 表）。

## 5. 已逐项验证无需改动

本模板使用的全部 API 面（对照手册 §4 清单）：`defineTool` / `ctx.tools.register`；
手写 `InvocationDescriptor`（`invocation: { kind: 'direct' }` + `src-json`）与
`ctx.typert.register`；`ctx.provide`；`settings.section` 槽位契约；`ctx.locale.register/bind`；
`ctx.connection.rpc.call('/api', …)`；`webserver/index-inject` 事件与 `{kind:'global'}` 行；
`ctx.slots.inject/register`。host 半 `self-update.ts` 使用的 `process.argv[1]` 锚点、
`dsh plugin list/add` 转发器形态两线一致。

## 6. 迁移后需实测的运行时点

1. **0.1.2 实机**：`dsh plugin --profile web add` 装载 → 设置面板 + `greet` 工具 +
   更新条 up-to-date 态 + HMR 热替换（自更新 link 场景见
   `docs/versioning-and-update-plan.md` §5 验证清单）。
2. **0.1.1 旧线冒烟**（双线坐实）：同上在 0.1.1 harness 跑一遍；本插件无特征探测
   fallback 分支，重点确认软禁用注入链路与 RPC 面。

## 7. 边界与后续

- MAX = `0.1.2-rc.1` 把 `0.1.2-rc.2` / `0.1.2` 正式版 / `0.1.3` 线挡在门外；发布后
  按 README 追新流程再走一轮（手动流程，本模板无追新脚本）。
- `dsh-v0.1.3-alpha.1` tag 的 dsh 包未发 npm，0.1.3 线不在范围。

## 8. 证据索引

- 取证：`c:/deepseek-harness` 两树对照（`dsh-v0.1.1-rc.2` tag vs `dsh-v0.1.2-rc.1` checkout），
  命令与关键源码位置见 `docs/compat-guide-0.1.1-to-0.1.2.md` §6。
- 关键迁移点：`packages/client/ui-renderer/src/client/index.ts`（slots 合并声明）、
  `packages/client/runtime/`（0.1.2 无 package.json，包已删）。
- 实操参照：dsh-meme-gen `9684343`（同向迁移，双线窗口一致）。
