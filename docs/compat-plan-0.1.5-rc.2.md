# <插件名> × DSH 0.1.5-rc.2 兼容计划（执行记录）

> **用法**：本文件由 `docs/compat-plan-TEMPLATE.md` 复制而来，逐节填写后保留为执行记录。
> **窗口前提**：双边界 `[MIN_HARNESS_VERSION, MAX_HARNESS_VERSION]`，本次为
> **`[0.1.5-rc.1, 0.1.5-rc.2]`**——同属 0.1.5 预发布线内的追新，MIN 保持
> 已实测的最低版本 0.1.5-rc.1，只抬 MAX 到 0.1.5-rc.2。
> **结论先行**：**0.1.5-rc.1 → 0.1.5-rc.2 是插件面零变化的小追新**——无 breaking、
> 无新增包、无删除包、无依赖改动，因此本次迁移只需改版本窗口与指引文件，
> 源码与 `package.json` 的依赖字段**一行不动**。

---

## 0. 执行状态

| 项 | 状态 |
|---|---|
| `src/version-gate.ts` | MIN = `0.1.5-rc.1` / MAX = `0.1.5-rc.2`（仅抬 MAX） |
| `c:/deepseek-harness` | 签出 tag：`dsh-v0.1.5-rc.2`（`git describe --tags` 已核对） |
| `package.json` | **无改动**。peer 与 dev 仍是 `^0.1.5-rc.1`——caret 在预发布线上恰好覆盖 `{rc.1, rc.2}`，见 §1.2 |
| node_modules | 全部 `@deepseek-ai/dsh-*` 实装 0.1.5-rc.2（caret 解析结果，未改依赖即已生效） |
| 插件源码 | **零改动**（无 `import type` 迁移、无版本探测分支可删） |
| 指引同步 | `AGENTS.md` / `README.md` / `src/version-gate.ts` 注释已同轮改为 `[0.1.5-rc.1, 0.1.5-rc.2]` |
| 编译验证 | `pnpm install` + `pnpm run typecheck` + `pnpm run build`（全绿） |
| 待办 | 运行时冒烟（§6） |

## 1. 调研总结论

### 1.1 区间事实

取证 tag 与命令：

```powershell
git -C c:/deepseek-harness describe --tags          # dsh-v0.1.5-rc.2
git -C c:/deepseek-harness diff --stat dsh-v0.1.5-rc.1 dsh-v0.1.5-rc.2
git -C c:/deepseek-harness diff --name-only dsh-v0.1.5-rc.1 dsh-v0.1.5-rc.2 -- . ':(exclude)**/package.json'
```

- 区间全量改动 **334 files changed, +1050/−1050**，其中 **271 个是 `package.json`**
  ——即绝大多数改动只是把版本号从 `0.1.5-rc.1` 改成 `0.1.5-rc.2`。
- 剔除 `package.json` 后只剩 **63 个文件**，且**全部落在 harness 自身的 UI 与文档**：
  `packages/client/ui-message-feedback`、`packages/client/ui-deliverables`、
  `packages/client/ui-chat`、`packages/client/ui-primitives`、`packages/feedback/*`、
  `apps/web/tests`、`snapshots/web`、`docs/`、`.agents/notes/`。
- **无新增包、无删除包**：新增文件只有 icon artwork 数据文件
  （`code-file-icon-artwork.ts` / `.manifest.json`）与几个 harness 自测 spec、
  feature note；没有任何新的 `packages/**/package.json` 出现或消失。

### 1.2 关键判断：依赖写法不需要改

`^0.1.5-rc.1` 是**预发布 caret**，semver 语义下它只匹配
**同一 `major.minor.patch` 的更高预发布号**（不跨 patch）。实测确认：

```
^0.1.5-rc.1   satisfies   0.1.5-rc.1  → true
^0.1.5-rc.1   satisfies   0.1.5-rc.2  → true
^0.1.5-rc.1   satisfies   0.1.6-alpha.2 → false
^0.1.5-rc.1   satisfies   0.1.5       → false   （正式版需另写范围）
```

因此 `^0.1.5-rc.1` **恰好等于 `{0.1.5-rc.1, 0.1.5-rc.2}` 的并集**：本次窗口
`[0.1.5-rc.1, 0.1.5-rc.2]` 与既有依赖写法**完全重合**，依赖字段无需改动，
`pnpm install` 本就把 `node_modules` 解析到了 rc.2（实装核对见 §5）。
这也解释了为什么本次 `typecheck` 早已是"对着 rc.2 类型面"跑的。

> ⚠️ 反面提醒：**不要**因为"窗口上限变成 rc.2 了"就把依赖改成 `^0.1.5-rc.2`。
> 那会把 MIN 实际抬到 rc.2（caret 不再匹配 rc.1），与 `MIN_HARNESS_VERSION`
> 声明的 0.1.5-rc.1 承诺冲突——**下限 = 已验证承诺，抬下限等于宣布插件不再支持
> rc.1**。本次刻意不抬下限。

### 1.3 逐项影响

| 新线变化 | 对本插件的实际影响 | 分级 |
|---|---|---|
| `ui-primitives`：`CodeFileIcon` 内部实现改为静态 artwork 表 + `dangerouslySetInnerHTML`；新增导出 `CODE_FILE_ARTWORK` / `CODE_FILE_ICON_ID_TOKEN` | 组件**对外签名不变**（`IconProps & { type: CodeFileType }` 原样），新增导出是增量；本插件未直接使用 `CodeFileIcon`/新导出 | normal |
| `ui-deliverables`：`Deliverables.tsx` 加 `data-after-produced-files` 属性、`PresentedFileCard` 给 `FileTypeIcon` 传 `size={20}`、`Deliverables.module.css` 调间距 | 均为 harness 组件内部渲染细节；`FileTypeIcon` 的 `size` 是可选项，签名未变 | normal |
| `ui-chat`：`TurnTailNodeView.module.css` 加 turn-tail 间距 | CSS 内部调整 | normal |
| `feedback/message-feedback`：`types.ts` 仅改 `category` 字段的**注释措辞**（"negative judgment" → "the judgment"） | 类型逐字不变 | normal |
| `ui-message-feedback`：dialog/controller/slots 内部重构 | 槽位 key（`MessageFeedbackActions` id `feedback`、`FeedbackDialog` id `feedback-dialog`）与 `ui-deliverables` 槽位（`Deliverables`、`PresentRow` key `present`）经 slot-catalog 比对**未变** | normal |
| 其余：`apps/web/tests`、`snapshots/web`、`docs/`、`.agents/notes/` | harness 仓库自身测试与文档，不进入插件运行时面 | normal |

**运行时破坏：0 处。类型层破坏：0 处。需改代码：0 处。**

## 2. 必改清单（P0）

### 2.1 `package.json` 依赖收敛

**不做任何改动。** 理由见 §1.2：`^0.1.5-rc.1` 已恰好覆盖 `{rc.1, rc.2}`。
`dsh.client.inject` 与 tsdown `neverBundle` 同样无需改动（rc.2 没有新增/删除包）。

### 2.2 源码迁移

**无。** 本次没有 `import type` 迁移表，也没有遗留的版本探测分支可删
（0.1.5-rc.1 那轮已把 `getSectionOrder` 与 `Session.events` 两处探测删净）。

### 2.3 门禁与指引同步

- `src/version-gate.ts`：`MAX_HARNESS_VERSION` 由 `0.1.5-rc.1` 上调为
  **`0.1.5-rc.2`**；`MIN_HARNESS_VERSION` 保持 **`0.1.5-rc.1`** 不动；
  文件头注释的窗口表述同步改写。
- `AGENTS.md`（"版本门禁"bullet、"版本窗口"bullet、"依赖名单职责分离"bullet、
  "注意签出版本"段）与 `README.md`（"依赖版本与追新"一节）同轮改为
  `[0.1.5-rc.1, 0.1.5-rc.2]`，并补一句"同 minor 线内追新 caret 已覆盖，只抬 MAX"。
- `docs/compat-guide-0.1.2-to-0.1.5.md` 的窗口表述同步（该手册的区间破坏面
  结论对 rc.2 依然适用）。

### 2.4 验证

`pnpm install` → `pnpm run typecheck` → `pnpm run build` 全绿 = 编译级迁移完成。
因依赖未动、源码未动，预期与 rc.1 那轮结果一致。

## 3. 版本窗口决策

- **MIN = `0.1.5-rc.1`**（保持已实测的最低版本；本次未在 rc.1 上重跑冒烟，
  不做任何"已不再支持"的声明）。
- **MAX = `0.1.5-rc.2`**（本次追新验证的目标 tag）。
- 窗口保持双边界。`0.1.6-alpha.2` 已在远端存在但**明确挡在窗口外**——
  跨 minor 线（0.1.5 → 0.1.6）属于需要重新取证的破坏面，不是抬 MAX 就能覆盖的。

## 4. 可选项（P2）

- 无。本次刻意不做任何"顺手改"：区间既然零插件面变化，最小改动就是最正确的改动。

## 5. 已逐项验证无需改动

对照 `dsh-v0.1.5-rc.1` 与 `dsh-v0.1.5-rc.2` 两棵树确认同构的面：

- **依赖解析**：6 个插件的 `node_modules/@deepseek-ai/` 下全部包实装
  **0.1.5-rc.2**（`^0.1.5-rc.1` 的 caret 解析结果），即本次 typecheck 一直在
  对着 rc.2 类型面跑。
- **`packages/util/values/src`**（`JsonValue` 等）、`settings`、`host/webserver/src`、
  `client/ui-renderer/src`、`client/ui-settings/src`、`client/locale/src`、
  `typert/protocol`、`typert/registry`：区间内**零 diff**（未出现在 63 个改动文件中）。
- **`ctx.systemPrompt.section` / `getSectionOrder`**：区间零 diff，`TOOL_WORKFLOW`
  段位仍为 2600，故各插件 `gate.ts` 里 `getSectionOrder('TOOL_WORKFLOW') + 10`
  （实测 2610）的注释与逻辑无需改。
- **槽位词表**：`slot-catalog` 产物比对显示 `ui-deliverables` 与
  `ui-message-feedback` 的槽位 key 在 rc.1 → rc.2 之间未变。
- **`installFailLoud`**（`packages/boot/app-boot/src/index.ts`）：区间零 diff，
  仍 `proc.exit(1)`——软禁用语义必须保留。

## 6. 迁移后需实测的运行时点

1. **软禁用链路**：临时压低 `MAX_HARNESS_VERSION`（如改回 `0.1.5-rc.1` 后跑
   rc.2 宿主）触发一次，确认「已停用」面板照常渲染、index-inject 无残留，再改回；
2. **装载链路**：`dsh plugin --profile <name> list --json` / `add` 通道可用
   （自更新依赖）；
3. **端到端**：设置面板 + 全部业务工具/端点 + HMR 热替换；
4. **rc.2 宿主实跑**：在真实 `dsh@0.1.5-rc.2` 下启动 `dsh web`，确认 host 半打印
   加载日志且**无"版本不兼容"软禁用日志**（这是本次抬 MAX 的直接验收点）。

## 7. 边界与后续

- `MAX_HARNESS_VERSION = 0.1.5-rc.2` 挡掉了后续 tag：`0.1.6-alpha.1/2` 等。
  追新到 0.1.6 线需重新做破坏面取证（跨 minor 线，预期是又一次大跨越）。
- 依赖版本仍为**手动维护**：本次**没有**改 peer/dev，理由见 §1.2。
- npm 发布状态：`@deepseek-ai/dsh` 的 `latest` 与 `next` dist-tag 均已指向
  **0.1.5-rc.2**（`alpha` 指向 `0.1.6-alpha.2`），全线 `@deepseek-ai/dsh-*`
  包均已发布 rc.2，可直接安装。

## 8. 证据索引

- 取证 tag：`dsh-v0.1.5-rc.1` → `dsh-v0.1.5-rc.2`（`c:/deepseek-harness`）。
- 关键命令：见 §1.1。
- 区间规模：334 files（含 271 个 `package.json`），剔除后 63 files。
- 方法：只读对照两棵树 + `git diff --name-status` 核对增删文件 + npm dist-tag 核对发布状态。
