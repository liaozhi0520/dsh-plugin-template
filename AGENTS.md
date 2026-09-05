# 项目性质

本项目（dsh-plugin-template）是一个 **DeepSeek Harness（DSH）插件模板**——
插件开发的起手骨架，包含宿主端（host）与客户端（client）两部分，
基于 cordis 插件框架，支持 HMR 开发，可直接发布 npm 或推 GitHub 供用户安装。

- 宿主端入口：`src/` → 构建产物 `lib/index.js`
- 客户端入口：`src/client/` → 构建产物 `lib/client.js`
- 常用命令：`pnpm run dev`（HMR 开发）、`pnpm run build`、`pnpm run typecheck`
- 版本门禁：`src/version-gate.ts`（`[MIN_HARNESS_VERSION, MAX_HARNESS_VERSION]`
  窗口，软禁用 + client 半停用面板），追新验证通过后手动上调 MAX

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
- **依赖名单职责分离**（双线兼容，细节与代码见 docs/compat-guide-0.1.1-to-0.1.2.md）：
  peer = 安装期承诺（双线期写并集 `^A || ^B`）；dev = typecheck 目标（永远钉死
  一条线，**不写并集**——pnpm 沿用 lockfile 首臂旧解析是实测坑）；
  `dsh.client.inject` 与 tsdown `neverBundle` 只列**所有支持线都存在**的包。
- **运行时分叉只用特征探测**：`??` 链 + 最小收窄接口，新 API 在前、旧 API 兜底；
  禁止 import 两套再 if-else（typecheck 不可能同时过两套）；每个 fallback 分支
  必须进旧线冒烟清单。
- **版本窗口**：`MAX_HARNESS_VERSION` 只写已验证 tag（追新验证通过后手动上调）；
  每次兼容迁移按 `docs/compat-plan-TEMPLATE.md` 复制一份
  `docs/compat-plan-<目标版本>.md` 填写并保留为执行记录。

## 版本兼容参考（写兼容代码前必读）

`docs/compat-guide-0.1.1-to-0.1.2.md`：0.1.1-rc.2 ↔ 0.1.2-rc.1 两线的全部已知差异
（breaking / normal 分级）与**带代码**的兼容方案——双线依赖清单写法（peer 并集 / dev
钉死 / inject 与 neverBundle 名单规矩）、`import type` 迁移表、运行时特征探测范式
（`Session.events` → `snapshotEvents()` 等）、normal changes 清单与冒烟要求。

凡涉及 harness 版本兼容的工作——追新上调 `MAX_HARNESS_VERSION`、回退适配旧线、
双线支持、判断「某 API 在别的 harness 版本上能不能用」——**先读该手册，再按其中
§5 的操作序与 §6 的取证方法对照 harness 源码动手**；不要凭记忆写兼容代码。

## DeepSeek Harness 源代码

本机的 DeepSeek Harness 源代码在 **`c:/deepseek-harness`**。

当需要查阅 DSH 的内部实现、插件 API、系统提示词组装、工具/上下文注入机制时，
直接去该目录下阅读源码（`packages/` 为各功能包，`apps/` 为应用入口），不要凭空猜测行为。

**注意签出版本**：该仓库用 tag 标记发布（如 `dsh-v0.1.2-rc.1`；本模板当前窗口
`[0.1.1-rc.2, 0.1.2-rc.1]` 双线，typecheck 目标 0.1.2-rc.1，迁移记录见
`docs/compat-plan-0.1.2-rc.1.md`）。
进行版本相关的兼容性分析前，先 `git -C c:/deepseek-harness describe --tags`
确认签出的 tag 与目标 harness 版本一致，不一致先 `git fetch --tags && git checkout <tag>`——
用旧版源码分析新版行为会得出滞后结论。

常用参考位置：

- `c:/deepseek-harness/AGENTS.md` — DSH 仓库自身的开发约定
- `c:/deepseek-harness/docs/` — 内部设计文档
