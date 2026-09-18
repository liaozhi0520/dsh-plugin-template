# <插件名> × DSH <目标版本> 兼容计划（剧本模板）

> **用法**：`cp docs/compat-plan-TEMPLATE.md docs/compat-plan-<目标版本>.md` 后逐节填写。
> 差异事实从当前窗口的兼容手册取（现为 `docs/compat-guide-0.1.2-to-0.1.5.md`；
> 若目标版本更新，先按其 §6 取证方法对新区间重新取证，再更新手册）；本文档只组织
> **执行流程**。迁移完成后本文档保留为执行记录。
>
> **窗口前提（默认双边界，同线内可含多个 rc）**：本模板与其派生插件的窗口是
> `[MIN_HARNESS_VERSION, MAX_HARNESS_VERSION]`，peer/dev 写同一个
> `^<已实测的最低版本>`，门禁用双边界比较，代码里**不留版本探测分支**。
> 同 minor 线内追新（如 rc.1 → rc.2）caret 已覆盖，**只抬 MAX、不动依赖**；
> 跨 minor 线才需要手改依赖并重跑破坏面取证。当前窗口为
> `[0.1.5-rc.1, 0.1.5-rc.2]`。如确需多线支持，参考
> `docs/compat-guide-0.1.1-to-0.1.2.md`（历史手册）的双线方法，并在
> `AGENTS.md` 与本计划里明确标注为多线。

---

## 0. 执行状态

> 迁移过程中随手维护；完成后作为速览表。

| 项 | 状态 |
|---|---|
| `src/version-gate.ts` | MIN = ? / MAX = ?（窗口两端；实测通过后才抬 MAX） |
| `c:/deepseek-harness` | 签出 tag：？（先 `git describe --tags` 核对） |
| `package.json` | peer 与 dev 是否同值 `^<目标版本>`？删了什么、增了什么？ |
| node_modules | 全部 `@deepseek-ai/dsh-*` 实装 ?；死包已移除？ |
| 插件源码 | import type 迁移几处？删除了哪些版本探测分支？P2 顺手项？ |
| 指引同步 | `AGENTS.md` / `README.md` / `version-gate.ts` 注释的版本表述是否同一轮改掉？ |
| 编译验证 | `pnpm run typecheck` + `pnpm run build`（绿/红） |
| 待办 | 运行时冒烟（§6） |

## 1. 调研总结论

> 逐项列「新线变化 → 对本插件的实际影响」，并把每项归到
> **运行时破坏 / 类型层破坏 / normal** 三类（分类标准见当前窗口兼容手册 §0）。
> 结论示例：破坏集中在哪些层，运行时分叉几处。

| 新线变化 | 对本插件的实际影响 | 分级 |
|---|---|---|
| | | 运行时 / 类型层 / normal |

## 2. 必改清单（P0，迁移执行时照此操作）

### 2.1 `package.json` 依赖收敛

- **删**：目标版本已不存在的死包（peer + dev 全删，源码引用同步清零；
  `pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude` 白名单同步清理）；
- **增**：目标版本新增、本插件要用到的包（只 `import type` 的进 dev 即可，
  值导入必须进 peer 并同步 `dsh.client.external`）；
- **peer 与 dev 同值**：全部 `@deepseek-ai/dsh-*` 收敛为 `^<目标版本>`
  （窗口内没有"下限/上限/并集"之分）；
- `dsh.client.inject` / tsdown `neverBundle`：对齐目标版本的包集
  （当前基线见兼容手册 §3.3 的 `PLATFORM_MODULES`）。

### 2.2 源码迁移

**import type 迁移表**（逐条：文件:行 | 旧导入点 → 新导入点）：

```ts
// 文件:行
- import type { X } from '@deepseek-ai/dsh-旧家'
+ import type { X } from '@deepseek-ai/dsh-新家'
```

**删除版本探测分支**（单线专属步骤——上一次迁移留下的
`typeof ctx.x.y === 'function'` / `??` 链探测，在目标版本上已可直呼新 API）：

```ts
// 文件:行
- interface Accessor { 新API?: () => T; 旧API?: T }
- const value = obj?.新API?.() ?? obj?.旧API ?? fallback
+ const value = obj?.新API()
```

### 2.3 门禁与指引同步

- `src/version-gate.ts`：`MAX_HARNESS_VERSION` 上调到目标版本（实测通过后），
  `MIN_HARNESS_VERSION` 保持已实测的最低版本；
- `AGENTS.md`（"版本门禁"bullet + "注意签出版本"段）与 `README.md`
  （"依赖版本与追新"一节）同一轮改掉——留旧窗口 = 让后续 agent 照旧窗口写代码。

### 2.4 验证

`pnpm install` → `pnpm run typecheck` → `pnpm run build` 全绿 = 编译级迁移完成。

## 3. 版本窗口决策

MIN = ?（保持已实测的最低版本）；MAX = ?（**已实测验证**的 tag；冒烟通过前不得抬）。
窗口保持双边界：MIN 保持已实测的最低版本，需要支持新版本时只上调 MAX——
同 minor 线内的新 rc（如 rc.1 → rc.2）caret 已覆盖，**不动依赖**；跨 minor 线
才需手改依赖并重跑破坏面取证。不要随意加宽到未实测的 tag（跨版本 API 破坏频繁，
范围放宽救不了）。

## 4. 可选项（P2，顺手项）

过时注释 / 可简化的 cast / 已被新 API 取代的旧写法（逐条列，随迁移一并执行或明确不做）。

## 5. 已逐项验证无需改动

> 防重复调研：列出本插件实际使用、且已对照两棵树确认同构的 API 面
> （从当前窗口兼容手册的"未变面"一节里挑本插件用到的，加标注）。

## 6. 迁移后需实测的运行时点

1. 软禁用链路：临时压低 `MAX_HARNESS_VERSION` 触发一次，确认
   「已停用」面板照常渲染、index-inject 无残留，再改回；
2. 装载链路：`dsh plugin add` → profile 装载一次通过（新线新增的安装机制走一遍）；
3. 端到端：设置面板 + 全部业务工具/端点 + HMR 热替换；
4. 旧会话/旧数据：若目标版本升级了 Session 格式（如 V3），验证旧会话打开、
   迁移后本插件的读取路径仍工作。

## 7. 边界与后续

- `MAX_HARNESS_VERSION` 挡掉了哪些后续 tag（追新验证后再抬）；
- 依赖版本为**手动维护**（本模板不带追新脚本；派生插件的 `bump-deps.mjs`
  只抬同 major.minor 线内最新版，且并集范围会被静默跳过）：本次把 peer/dev
  改成了什么、为什么这么改；
- 更新线的包发布状态（npm 上是否已可安装）。

## 8. 证据索引

- 取证 tag 与命令（兼容手册 §1 的两树对照命令）；
- 关键源码位置（文件:行）；
- 新线拆分/变更的提交链；
- 调研方法（只读对照，两份独立调研交叉验证）。
