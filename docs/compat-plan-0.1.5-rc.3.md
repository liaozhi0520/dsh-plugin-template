# <插件名> × DSH 0.1.5-rc.3 兼容计划（执行记录）

> **用法**：本文件由 `docs/compat-plan-TEMPLATE.md` 复制而来，逐节填写后保留为执行记录
> （派生插件复制时把 `<插件名>` 与各节中"本插件"落到自己的名字与实际 API 面）。
> **窗口前提**：双边界 `[MIN_HARNESS_VERSION, MAX_HARNESS_VERSION]`，本次为
> **`[0.1.5-rc.1, 0.1.5-rc.3]`**——同属 0.1.5 预发布线内的追新，MIN 保持
> 已实测的最低版本 0.1.5-rc.1，只抬 MAX 到 0.1.5-rc.3。
> **结论先行**：**0.1.5-rc.2 → 0.1.5-rc.3 是插件面零变化的小追新**——无 breaking、
> 无新增包、无删除包、无依赖改动，因此本次迁移只需改版本窗口与指引文件，
> 源码与 `package.json` 的依赖字段**一行不动**。

---

## 0. 执行状态

| 项 | 状态 |
|---|---|
| `src/version-gate.ts` | MIN = `0.1.5-rc.1` / MAX = `0.1.5-rc.3`（仅抬 MAX） |
| `c:/deepseek-harness` | 签出 tag：`dsh-v0.1.5-rc.3`（`git describe --tags` 已核对；commit `a4c74a91e0`） |
| `package.json` | **无改动**。peer 与 dev 仍是 `^0.1.5-rc.1`——caret 在预发布线上恰好覆盖 `{rc.1, rc.2, rc.3}`，见 §1.2 |
| node_modules | 维持既有 lockfile 解析（rc.2 实装；依赖未动），见 §1.2 |
| 插件源码 | **零改动**（无 `import type` 迁移、无版本探测分支可删） |
| 指引同步 | `AGENTS.md` / `README.md` / `src/version-gate.ts` 注释已同轮改为 `[0.1.5-rc.1, 0.1.5-rc.3]` |
| 编译验证 | `pnpm run typecheck` + `pnpm run build`（全绿），编译产物门禁为 0.1.5-rc.3 |
| 待办 | 运行时冒烟（§6） |

## 1. 调研总结论

### 1.1 区间事实

取证 tag 与命令：

```powershell
git -C c:/deepseek-harness describe --tags          # dsh-v0.1.5-rc.3
git -C c:/deepseek-harness diff --stat dsh-v0.1.5-rc.2 dsh-v0.1.5-rc.3
git -C c:/deepseek-harness diff --name-only dsh-v0.1.5-rc.2 dsh-v0.1.5-rc.3 -- . ':(exclude)**/package.json'
```

- 区间全量改动 **277 files changed, +1484/−1443**，其中 **274 个是 `package.json`**
  ——即绝大多数改动只是把版本号从 `0.1.5-rc.2` 改成 `0.1.5-rc.3`（纯版本 bump）。
- 剔除 `package.json` 后只剩 **3 个文件**，且**全部是 harness 内部的发布工程维护**：
  `pnpm-lock.yaml`（workspace specifier `workspace:^` → `workspace:*` 同步）、
  `scripts/verify-package-dependencies.ts` 与其 spec（vendor 依赖钉版策略，
  涉及 cordis / cosmokit / schemastery / cordis-plugin-*）。
- **无新增包、无删除包**（`git diff --diff-filter=AD` 为空）：区间内没有任何
  `packages/**/package.json` 出现或消失；`packages/**` 与 `apps/**` 的全部
  `.ts`/`.tsx` 源码**零 diff**——插件面向的 API 面（host 服务、槽位、
  system prompt、session 格式、attachment 通道）没有任何变化。

### 1.2 关键判断：依赖写法不需要改

`^0.1.5-rc.1` 是**预发布 caret**，semver 语义下它匹配**同一 `major.minor.patch`
的全部更高预发布号**（semver 包实测，即 npm/pnpm 所用实现）：

```
^0.1.5-rc.1   satisfies   0.1.5-rc.1    → true
^0.1.5-rc.1   satisfies   0.1.5-rc.2    → true
^0.1.5-rc.1   satisfies   0.1.5-rc.3    → true
^0.1.5-rc.1   satisfies   0.1.6-alpha.2 → false
^0.1.5-rc.1   satisfies   0.1.7-rc.1    → false
^0.1.5-rc.1   satisfies   0.1.5         → true    （正式版 > 同元组预发布）
```

> 📌 **勘误**：rc.2 执行记录里「`^0.1.5-rc.1` 不匹配正式版 `0.1.5`」的说法**有误**
> （正式版排序高于同元组预发布，caret 会匹配到它）。正确结论是：caret 覆盖
> **整条 0.1.5 线**（rc.1/rc.2/rc.3/…/正式版），只有 0.1.6+ 被挡在外面。
> 这对「同线追新只抬 MAX、不动依赖」的决策**没有影响**；正式版发布时的处理见 §7。

因此 `^0.1.5-rc.1` 覆盖本次窗口 `[0.1.5-rc.1, 0.1.5-rc.3]` 的全部 tag，
依赖字段无需改动。node_modules 维持既有 lockfile 解析（实装 rc.2），
本次 typecheck 继续对着 rc.2 类型面跑——rc.2 → rc.3 的 `packages/**` 源码
零 diff，rc.2 类型面 ≡ rc.3 类型面，结论等效于对着 rc.3 验证。

> ⚠️ 反面提醒：**不要**因为"窗口上限变成 rc.3 了"就把依赖改成 `^0.1.5-rc.3`。
> 那会把 MIN 实际抬到 rc.3（caret 不再匹配 rc.1/rc.2），与 `MIN_HARNESS_VERSION`
> 声明的 0.1.5-rc.1 承诺冲突——**下限 = 已验证承诺，抬下限等于宣布插件不再支持
> rc.1**。本次刻意不抬下限。

### 1.3 逐项影响

| 新线变化 | 对本插件的实际影响 | 分级 |
|---|---|---|
| 274 个 `package.json` 版本号 bump | 纯版本号变更，无依赖图变化 | normal |
| `pnpm-lock.yaml` + `scripts/verify-package-dependencies{,.spec}.ts` | harness 内部 vendor 钉版策略（`workspace:^` → `workspace:*`），不涉外部依赖版本变化，不进插件运行时面 | normal |
| `packages/**`、`apps/**` 全部源码 | **零 diff**；本插件用到的宿主服务与槽位（逐项列举见 §5）不受影响 | normal |

**运行时破坏：0 处。类型层破坏：0 处。需改代码：0 处。**

## 2. 必改清单（P0）

### 2.1 `package.json` 依赖收敛

**不做任何改动。** 理由见 §1.2：`^0.1.5-rc.1` 已覆盖 `{rc.1, rc.2, rc.3}`。
`dsh.client.inject` 与 tsdown `neverBundle` 同样无需改动（rc.3 没有新增/删除包）。

### 2.2 源码迁移

**无。** 本次没有 `import type` 迁移表，也没有遗留的版本探测分支可删
（窗口内默认零版本分支）。

### 2.3 门禁与指引同步

- `src/version-gate.ts`：`MAX_HARNESS_VERSION` 由 `0.1.5-rc.2` 上调为
  **`0.1.5-rc.3`**；`MIN_HARNESS_VERSION` 保持 **`0.1.5-rc.1`** 不动；
  文件头注释的窗口表述同步改写。
- `AGENTS.md`（"版本门禁"bullet、"版本窗口"bullet、"注意签出版本"段）与
  `README.md`（"依赖版本与追新"一节）同轮改为 `[0.1.5-rc.1, 0.1.5-rc.3]`，
  并补上本文件的指针。

### 2.4 验证

`pnpm run typecheck` → `pnpm run build` 全绿 = 编译级迁移完成；
编译产物（`lib/version-gate.js`）中 `MAX_HARNESS_VERSION` 为 `0.1.5-rc.3`。

## 3. 版本窗口决策

- **MIN = `0.1.5-rc.1`**（保持已实测的最低版本；本次未在 rc.1 上重跑冒烟，
  不做任何"已不再支持"的声明）。
- **MAX = `0.1.5-rc.3`**（本次追新验证的目标 tag）。
- 窗口保持双边界。0.1.6 / 0.1.7 线已存在但**明确挡在窗口外**（caret 不匹配，
  实证见 §1.2）——跨 minor 线属于需要重新取证的破坏面，不是抬 MAX 就能覆盖的。

## 4. 可选项（P2）

- 无。本次刻意不做任何"顺手改"：区间既然零插件面变化，最小改动就是最正确的改动。

## 5. 已逐项验证无需改动

对照 `dsh-v0.1.5-rc.2` 与 `dsh-v0.1.5-rc.3` 两棵树确认同构的面
（派生插件按自己实际用到的面勾选并补充）：

- **依赖解析**：依赖字段与 lockfile 未动，`node_modules/@deepseek-ai/` 实装维持
  **0.1.5-rc.2**；rc.2 → rc.3 的 `packages/**` 源码零 diff，rc.2 类型面 ≡ rc.3 类型面。
- **`packages/settings`、`host/webserver/src`、`client/ui-renderer/src`、
  `client/ui-settings/src`、`client/locale/src`、`typert/protocol`、
  `typert/registry`、`util/values/src`**：区间内**零 diff**（`packages/**`
  无任何源码改动）。
- **槽位词表**：`settings.section` 与 `tool.call.toolview` 等槽位 key 区间内未变。
- **`ctx.systemPrompt.section` / `getSectionOrder`**：区间零 diff，段位逻辑与
  注释无需改。
- **`installFailLoud`**（`packages/boot/app-boot/src/index.ts`）：区间零 diff，
  仍 `proc.exit(1)`——软禁用语义必须保留。

## 6. 迁移后需实测的运行时点

1. **软禁用链路**：临时压低 `MAX_HARNESS_VERSION`（如改回 `0.1.5-rc.1` 后跑
   rc.3 宿主）触发一次，确认「已停用」面板照常渲染、index-inject 无残留，再改回；
2. **装载链路**：`dsh plugin --profile <name> list --json` / `add` 通道可用
   （自更新依赖）；
3. **端到端**：设置面板 + 全部业务工具/端点 + HMR 热替换；
4. **rc.3 宿主实跑**：在真实 `dsh@0.1.5-rc.3` 下启动 `dsh web`，确认 host 半打印
   加载日志且**无"版本不兼容"软禁用日志**（这是本次抬 MAX 的直接验收点）。

## 7. 边界与后续

- `MAX_HARNESS_VERSION = 0.1.5-rc.3` 挡掉了后续 tag：`0.1.6-alpha.1/2`、
  `0.1.7-rc.1`、`0.1.7-alpha.2` 等。追新到 0.1.6+ 线需重新做破坏面取证
  （跨 minor 线，预期是又一次大跨越）。
- **0.1.5 正式版注意**：正式版 `0.1.5` 发布后，`^0.1.5-rc.1` 的解析会**跳到
  正式版**（实证 satisfies → true，见 §1.2）。届时实测通过后把 MAX 抬到
  `0.1.5`（或显式收窄依赖写法），否则门禁会把正式版宿主软禁用——本次不处理。
- 依赖版本仍为**手动维护**：本次**没有**改 peer/dev，理由见 §1.2。
- npm 发布状态（实测 `pnpm view @deepseek-ai/dsh dist-tags`）：`latest` 指向
  **`0.1.5-rc.3`**，`next` 指向 `0.1.7-rc.1`，`alpha` 指向 `0.1.7-alpha.2`。

## 8. 证据索引

- 取证 tag：`dsh-v0.1.5-rc.2` → `dsh-v0.1.5-rc.3`（`c:/deepseek-harness`；
  两个 tag 均已本地 fetch，`dsh-v0.1.5-rc.3` = commit `a4c74a91e0`）。
- 关键命令：见 §1.1。
- 区间规模：277 files（含 274 个 `package.json`），剔除后 3 files（发布工程维护）。
- 方法：只读对照两棵树 + `git diff --diff-filter=AD` 核对增删文件（结果为空）
  + 全量 JSON diff 过滤非 version 行 + semver 包实测 + npm dist-tag 核对。
