# 项目性质

本项目（dsh-plugin-template）是一个 **DeepSeek Harness（DSH）插件模板**——
插件开发的起手骨架，包含宿主端（host）与客户端（client）两部分，
基于 cordis 插件框架，支持 HMR 开发，可直接发布 npm 或推 GitHub 供用户安装。

- 宿主端入口：`src/` → 构建产物 `lib/index.js`
- 客户端入口：`src/client/` → 构建产物 `lib/client.js`
- 常用命令：`pnpm run dev`（HMR 开发）、`pnpm run build`、`pnpm run typecheck`
- 版本门禁：`src/version-gate.ts`（`[MIN_HARNESS_VERSION, MAX_HARNESS_VERSION]`
  双边界窗口——当前为 `[0.1.5-rc.1, 0.1.5-rc.2]`，窗口外软禁用 + client 半停用面板），
  追新验证通过后手动上调 MAX

## 硬约定

- **自更新只走官方 CLI 通道**：`src/self-update.ts` 的 profile 定位是三级发现——
  ① 包根上溯找 `dsh.profile` 清单目录（registry 实体安装）；② link 开发副本反查：
  扫描 `$DSH_HOME/profiles/*`（启动 argv 里的 profile 名优先候选并作权威裁决，
  `dsh web` = `--profile web`），找 `node_modules/<pkg>` realpath 指向本包根的
  profile（物理证据；多 link 无 argv 才报错），③ 都找不到才报错。安装校验用
  `dsh plugin --profile <name> list --json`，更新执行
  `dsh plugin --profile <name> add <pkg>@<ver>`（官方转发器 = pnpm add +
  bundles reconcile）。**不要绕过它直接调 pnpm，也不要用 `pnpm update`（会剥
  rc 包的 `^`）**。dsh CLI 优先 `node <process.argv[1]>`（与 version-gate 同源
  的入口锚点，且严格校验 argv[1] 确是 @deepseek-ai/dsh 包声明的 bin），失败回落
  PATH 上的 `dsh`。已知坑：pnpm 无法用 registry 版本直接覆盖 link 依赖
  （ERR_PNPM_ENOENT，且 `pnpm remove` 不删顶层 junction 残留）——link 场景先清
  残留 junction（rmSync 只删链接本体，绝不触及链接目标即源码仓库）再走官方 add。
- **启动更新通知（update-notice + UpdateBubble）**：host 半 `apply()` 经
  `src/update-notice.ts` fire-and-forget 调 `checkSelfUpdate()`（同一官方通道），
  结论缓存为 `pending/ready/failed` 状态机，经 `template/getUpdateNotice` 端点供
  前端 `shell.overlay` 气泡（`client/UpdateBubble.tsx`）轮询；「知道了」确认态存
  浏览器 localStorage（键 `dsh-update-ack:dsh-plugin-template`，值 = 已确认的
  latest 版本号）——未确认每次打开 DSH 都弹，确认后该版本不再弹，新版本再弹；
  检查失败折叠为 failed、前端静默放弃（apply 绝不因网络失败）；软禁用路径不注册
  气泡（彼时无 RPC 可轮询）。多插件同屏经 `data-dsh-update-bubble` 标记全量重排
  堆叠（首个贴顶 16px，步进 96px）。派生插件移植本功能时只改：ACK 键、locale
  命名空间与契约类型前缀。
- **依赖名单职责分离**（窗口内同线，细节与代码见 docs/compat-guide-0.1.2-to-0.1.5.md）：
  peer = 安装期承诺，dev = typecheck 目标，**两者写同一个 `^<已实测的最低版本>`**
  （当前 `^0.1.5-rc.1`，caret 覆盖整条 0.1.5 预发布线）；
  `dsh.client.inject` 与 tsdown `neverBundle` 只列该版本存在的包。
  不要用范围去"夹"多条 harness 线——范围放宽救不了跨 minor 线的 API 破坏，
  跨线追新是显式手改。
- **运行时分叉按需才做**：窗口内**默认不要任何版本分支**（探测本身就要求
  支持多条线，是双窗口的产物）。确需兼容两线时才用特征探测：`??` 链 + 最小
  收窄接口，新 API 在前、旧 API 兜底；禁止 import 两套再 if-else；每个 fallback
  分支必须进旧线冒烟清单。
- **版本窗口**：`MAX_HARNESS_VERSION` 只写**已验证** tag（追新验证通过后手动上调）；
  `MIN_HARNESS_VERSION` 保持已实测的最低版本（当前窗口为
  `[0.1.5-rc.1, 0.1.5-rc.2]`——MIN 仍是 0.1.5-rc.1）；
  每次迁移按 `docs/compat-plan-TEMPLATE.md` 复制一份
  `docs/compat-plan-<目标版本>.md` 填写并保留为执行记录。
- **指引文件随窗口同步**：harness 版本或本插件支持窗口一变，`AGENTS.md`、
  `README.md`（"依赖版本与追新"一节）与 `src/version-gate.ts` 里所有版本表述
  必须同一轮改掉。留着旧窗口的指引，等于让后续 agent 照旧窗口写代码——
  四个派生插件都踩过这个坑（其中两个的 AGENTS.md 曾滞后到 0.1.1 线）。

## 版本兼容参考（写兼容代码前必读）

`docs/compat-guide-0.1.2-to-0.1.5.md`：**0.1.2-rc.1 ↔ 0.1.5-rc.1 的全部已知差异**
（当前窗口的取证手册）——本区间是插件面破坏最大的一次跨越：槽位词表 52 → 61
（`conversation` → `main`、`details` → `rightbar`、`conversation.details.tool` 删除）、
PTC 事件名与子调用 ID 格式改写、system prompt 段位表重排与 persona 段拆分为
prefix/suffix、Session 格式升 V3、attachment 新增 file 通道。含 `import type`
迁移表、静默失效模式清单与冒烟要求。

`docs/compat-guide-0.1.1-to-0.1.2.md`：0.1.1-rc.2 ↔ 0.1.2-rc.1 的差异手册，
**已属历史**（双线窗口期的产物）。仅在确需重新引入双线支持、或排查跨 0.1.1/0.1.2
线行为差异时查阅；其"peer 写并集 + dev 钉死一条线"的依赖写法在双边界窗口下不适用。

凡涉及 harness 版本兼容的工作——追新上调 `MAX_HARNESS_VERSION`、判断「某 API 在别的
harness 版本上能不能用」——**先在 `c:/deepseek-harness` 里把源码 checkout 到目标 tag
逐 API 核实，再按 compat-guide 的取证方法动手**；不要凭记忆写兼容代码。

## DeepSeek Harness 源代码

本机的 DeepSeek Harness 源代码在 **`c:/deepseek-harness`**。

当需要查阅 DSH 的内部实现、插件 API、系统提示词组装、工具/上下文注入机制时，
直接去该目录下阅读源码（`packages/` 为各功能包，`apps/` 为应用入口），不要凭空猜测行为。

**注意签出版本**：该仓库用 tag 标记发布。**本模板（及其派生插件）的兼容窗口是
双边界 `[0.1.5-rc.1, 0.1.5-rc.2]`（MIN = 已实测的最低版本 0.1.5-rc.1，
MAX = 已追新验证的最新 tag 0.1.5-rc.2，同属 0.1.5 预发布线）**；
typecheck / 编译锚点 = 0.1.5-rc.2，peer 与 dev 写同一个 `^0.1.5-rc.1`
（caret 恰好覆盖 `{rc.1, rc.2}`），门禁在版本出窗口时软禁用。分析与实现一律以
`git checkout dsh-v0.1.5-rc.2` 为准；跨线迁移记录见
`docs/compat-guide-0.1.2-to-0.1.5.md`，0.1.5 线内 rc.1→rc.2 追新记录见
`docs/compat-plan-0.1.5-rc.2.md`。
进行版本相关的兼容性分析前，先 `git -C c:/deepseek-harness describe --tags`
确认签出的 tag 与目标 harness 版本一致，不一致先 `git fetch --tags && git checkout <tag>`——
用旧版源码分析新版行为会得出滞后结论。

常用参考位置：

- `c:/deepseek-harness/AGENTS.md` — DSH 仓库自身的开发约定
- `c:/deepseek-harness/docs/` — 内部设计文档
