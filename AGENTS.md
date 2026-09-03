# 项目性质

本项目（dsh-plugin-template）是一个 **DeepSeek Harness（DSH）插件模板**——
插件开发的起手骨架，包含宿主端（host）与客户端（client）两部分，
基于 cordis 插件框架，支持 HMR 开发，可直接发布 npm 或推 GitHub 供用户安装。

- 宿主端入口：`src/` → 构建产物 `lib/index.js`
- 客户端入口：`src/client/` → 构建产物 `lib/client.js`
- 常用命令：`pnpm run dev`（HMR 开发）、`pnpm run build`、`pnpm run typecheck`
- 版本门禁：`src/version-gate.ts`（`[MIN_HARNESS_VERSION, MAX_HARNESS_VERSION]`
  窗口，软禁用 + client 半停用面板），追新验证通过后手动上调 MAX

## DeepSeek Harness 源代码

本机的 DeepSeek Harness 源代码在 **`c:/deepseek-harness`**。

当需要查阅 DSH 的内部实现、插件 API、系统提示词组装、工具/上下文注入机制时，
直接去该目录下阅读源码（`packages/` 为各功能包，`apps/` 为应用入口），不要凭空猜测行为。

**注意签出版本**：该仓库用 tag 标记发布（如 `dsh-v0.1.1-rc.2`；本插件当前适配 0.1.1 线）。
进行版本相关的兼容性分析前，先 `git -C c:/deepseek-harness describe --tags`
确认签出的 tag 与目标 harness 版本一致，不一致先 `git fetch --tags && git checkout <tag>`——
用旧版源码分析新版行为会得出滞后结论。

常用参考位置：

- `c:/deepseek-harness/AGENTS.md` — DSH 仓库自身的开发约定
- `c:/deepseek-harness/docs/` — 内部设计文档
