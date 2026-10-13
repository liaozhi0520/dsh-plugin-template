# 衍生指南（agent 执行用）：从 dsh-plugin-template 派生新插件

> 目标读者：执行「按模板衍生新插件」任务的 **agent**。人读概览在 README「使用本模板」；
> 本文是完整落点清单、操作流程、验证门与实测坑——依据 2026-10 的端到端实测
> （衍生 `@demo/dsh-demo-greeter`：34 文件差异、四连全绿、初始 commit 被 pre-commit
> 放行、模板仓零改动）。发现新的落点/坑时**必须回填本文件**（这正是衍生测试的产出）。

## 0. 任务简报模板（派工时给 agent 的输入）

按下面结构填写后连同本文档一起交给执行 agent（实测验证过的首条提示词骨架）：

```markdown
## 输入与输出
- 模板仓库（只读，绝不修改）：<模板绝对路径>
- 衍生目标（新建）：<目标绝对路径>

## 新插件的目标身份（三件套）
| 概念 | 目标值 |
|---|---|
| 短插件 id | <新短id>（= 仓库名） |
| npm 包名（scoped） | @<scope>/<新短id> |
| 环境前缀 | DSH_<新短id大写，-/→_>

## 配套目标值（表④/⑤）
- locales.ts title：<插件名>（zh/en 必须同值）
- panelTitle：en = Setting Panel of <插件名>；zh = <插件名> 设置面板
- TEMPLATE_NS：<语义>.panel；RPC 服务名：<语义>（端点串 <语义>/<method>）
- shell.overlay 条目 id：<语义前缀>-stale-banner / <语义前缀>-update-notice
- gen-version BASE_DESCRIPTION：zh/en 各一句
- spec.ts 默认值（greeting/punctuation）+ cordis.patch.yml config 注释示例
- icon.svg / LICENSE / package.json description / README、AGENTS、docs 旧身份全量替换

## 操作流程约束
按 docs/derivation-guide.md §3 执行；验证按 §4 四连；纪律按 §5。

## 报告格式
① 改名落点清单（按表①–⑤分组 + 「表外项」单列）② 本文档缺口/含糊反馈
③ 四连验证逐条结果 ④ git 状态 ⑤ 遗留问题。
```

## 1. 身份三件套与联动关系

| 概念 | 模板取值 | 派生规则 |
|---|---|---|
| **短插件 id** | `dsh-plugin-template` | = 仓库名（克隆后即根目录名）；cordis 插件名、cordis.patch 条目 id、settings ns、Typert package、伴生 invariant 名都从它派生 |
| **npm 包名** | `@scoped/dsh-plugin-template` | `@<npm用户名>/<短id>`（`npm whoami` 取 scope） |
| **环境前缀** | `DSH_PLUGIN_TEMPLATE` | 短 id 全大写、`-`/`.` → `_`；派生 STRICT 环境变量与 DISABLED_GLOBAL 标记名 |

三条链各自独立、互不包含：短 id ≠ 包名（包名多 scope 前缀）≠ 前缀（大写）。改完整套后，三件套在代码里的每一处落点见 §2。

## 2. 改名落点全清单（五张表）

> 实测口径：按本清单衍生，与模板的差异恰为 **34 个文件**；多一个文件 = 有意外改动，少一个 = 有漏项。

### 表① npm 包名 —— 4 处

| 位置 | 改成 |
|---|---|
| `package.json` 的 `name` | `@<scope>/<短id>` |
| `cordis.patch.yml` 的 `name:` | `"@<scope>/<短id>"`（**必须带引号**：`@` 是 YAML 保留指示符，纯标量以 @ 开头会让解析直接抛错——test-version-bump 的 verdaccio 配置实测踩过同一坑） |
| `src/client/bundle-key.ts` 的 `BUNDLE_KEY` | 同上（plugins.bundle.config 槽位 key + 升级提示命令片同源；smoke 0c 节守护与包清单一致） |
| `tsdown.config.ts` 的 `PLUGIN_ID` | 同上（`__ModuleLoader__` banner id 与 CSS `data-plugin` 归属同源） |

### 表② 短插件 id —— 15+ 处

| 位置 | 改成 |
|---|---|
| `cordis.patch.yml` 的 `id:` | `<短id>` |
| `src/index.ts` 的 `export const name` + effect label（`dsh-plugin-template: settings-page-policy`） | `<短id>` |
| `src/main.ts` 的 Typert `package:` 字段 | `<短id>` |
| `src/spec.ts` 的 `SETTINGS_NS`（= settings.replace 的 ns，profile 组合条目 id） | `<短id>` |
| `src/client/index.ts` 的 `export const name` + effect label（`: dictionaries`） | `<短id>` |
| `src/invariant.ts` 的 `PACKAGE_NAME` 与伴生件名（`dsh-plugin-template-invariant`） | `<短id>`（伴生件名 = `<短id>-invariant`） |
| `tsdown.config.ts` 的 CSS 虚拟模块前缀（`\0dsh-plugin-template-css-module:`）与插件名（`dsh-plugin-template-css-modules-inline`） | `<短id>` |
| shell.overlay 两个条目 id（`template-stale-banner` / `template-update-notice`） | `<语义前缀>-stale-banner` / `<语义前缀>-update-notice`（语义前缀 = 插件语义缩写如 `demo`；两 id 只需彼此唯一，不必等于短 id） |
| 日志/错误前缀 `[dsh-plugin-template]` / `dsh-plugin-template: `：main.ts×3、soft-disable.ts×2、update-state.ts×3、package-info.ts×1、profile-gate.ts×2、client/index.ts×2、TemplateDisabledSection.tsx×1、根 index.ts×1；version-gate.ts 4 条错误文案前缀 | `<短id>` |
| README / AGENTS / docs / 各文件头注释里的旧短 id | 全量替换 |

### 表③ 环境前缀 —— 2 处 + 文档

| 位置 | 改成 |
|---|---|
| `src/index.ts` 的 `DSH_<前缀>_STRICT`（×3 处使用 + 注释）、`src/version-gate.ts` STRICT 注释 | `DSH_<新前缀>_STRICT` |
| `src/shared/disabled-flag.ts` 的 `DISABLED_GLOBAL = '__DSH_<前缀>_DISABLED__'` | `__DSH_<新前缀>_DISABLED__` |
| README / docs 里的前缀表述 | 同步 |

### 表④ 顺手项

| 位置 | 改成 |
|---|---|
| `src/client/locales.ts` 的 `title` | 插件名——**zh/en 必须同值**：gen-version 构建期提取为卡片显示名，不一致 build 显式报错（实测守护有效，首跑即拦） |
| `src/client/locales.ts` 的 `panelTitle` | en = `Setting Panel of <插件名>`；zh = `<插件名> 设置面板`（详情页设置面板标题，与卡片显示名解耦） |
| `src/client/locales.ts` 的 `TEMPLATE_NS` | locale 命名空间——**共 6 处同源**：locales.ts 本体、client/index.ts 的 LocaleNamespaceMap 声明、4 个组件的 `PropsLocale<'…'>` 类型参数（typecheck 拦漏改，非静默，但别靠它兜底） |
| `scripts/gen-version.mjs` 的 `BASE_DESCRIPTION`（zh/en） | 卡片描述基底文案（兼容窗口 `[MIN,MAX]` 构建期自动注入，不用写版本） |
| `src/spec.ts` 的 greeting/punctuation 默认值 + `cordis.patch.yml` 顶部 config 注释示例 | demo 默认值（两处同步） |
| `package.json` 的 `description` | 插件一句话描述 |
| `icon.svg` | 插件图标（「插件」页卡片静态读取；可沿用模板占位图后换） |
| `LICENSE` 版权行 | 你的名字 |
| README / AGENTS / docs / 示例文案里的旧短 id | 全量替换 |

### 表⑤ RPC namespace/service 与端点串 —— **两端必须一致，漏改不报错（最危险的缺口）**

模板取值 `template`；整体换成 `<服务名>`（建议 = 短 id 或其语义缩写）。这条链横跨 **10+ 个文件**，且表②的短 id 替换**覆盖不到**它（`template` 不含短 id 字面）——衍生实测中这正是四张表漏掉的唯一「功能必需」项：

| 位置 | 改成 |
|---|---|
| `src/remote.ts`：`DESCRIPTORS` 的 `service` / `namespace`、`id` 前缀（`<短id>#<服务>/<method>`）、`TemplateRemote.typertRemote` 的 `serviceKey` / `namespace` | `<服务名>`（id 前缀用短 id） |
| `src/main.ts` 的 `ctx.provide('<服务>', new TemplateRemote(…))` | `<服务名>` |
| `src/shared/contract.ts` 的 `TEMPLATE_ENDPOINT`（ping/getConfig/saveConfig 三个端点串） | `<服务名>/<method>` |
| `src/shared/update-contract.ts` 的 `UPDATE_ENDPOINT`（checkUpdate/getUpdateState 两个端点串） | `<服务名>/<method>` |
| 各文件头注释与 README/AGENTS 里的端点名散文（`template/ping`、`template/getUpdateState` 等） | 同步更正 |

一致性判据：client 侧调用全部走 shared 契约常量（不硬编码端点），host 侧描述符表与契约常量同源——改完 `git grep "'<旧服务>/"`（含引号）应为 0。

## 3. 操作流程

1. **复制**：从模板复制到目标目录，**排除** `.git`、`node_modules`、`lib`、`.verdaccio-storage`；**必须包含**点开头文件（`.gitignore`、`.gitattributes`、`.githooks/`）。Windows 可用 robocopy `/XD .git node_modules lib .verdaccio-storage`。
2. **改名**：按 §2 顺序执行——先全局换短 id（包名里的短 id 随之变）→ 换 scope（4 处，YAML 里带引号）→ 换环境前缀 → 表④/⑤ 逐项。批量替换时**逐文件显式处理**（见 §5 的摊平事故），改完立即 `pnpm typecheck`。
3. **安装**：`pnpm install`（自动跑 `prepare` = gen-version → tsc → tsdown 完成首次构建；402 包量级）。
4. **验证四连**（§4）。
5. **入库**：`git init` → `git config core.hooksPath .githooks`（启用版本一致性闸门）→ `git commit`（pre-commit 跑 check-version，约 50ms）。
6. **发版**（可选）：`pnpm version patch --no-git-tag-version`（version 生命周期自动烧录 BUILD_VERSION + locale 元数据并 git add）→ `git commit -am "chore(release): x.y.z"`。
7. **安装进桌面 profile**：`dsh plugin --profile desktop add <目录或包名>`（首次需按提示把包名加进 profile 的 pnpm-workspace.yaml `allowBuilds`）；桌面真机验证 = 插件页卡片/详情页配置页（greeting 改完 greet 立即用新值）/ping/版本提示——这是唯一无法离线自动化的部分。

## 4. 验证门与守护对照

| 命令 | 拦什么 |
|---|---|
| `pnpm typecheck` | 语法/类型损坏（实测曾当场拦下批量替换事故造成的 4 文件字符级损坏）；locale ns 漏改（PropsLocale 参数不匹配） |
| `pnpm build` | gen-version 的 title 提取失败（locales.ts zh/en title 不同值 → 显式报错）；tsc 编译错误 |
| `pnpm run smoke-offline`（34 项） | 入口隔离与入口图白名单（往薄 shim 加 import）；**BUNDLE_KEY/banner id ≠ 包名**（0c）；**cordis.patch.yml id ↔ 构建产物 entry name** 交叉校验（rename 节）；BUILD_VERSION 三处不一致（0d）；locale 元数据 title 同源与窗口注入（0g）；桌面单锚语义（6a）；状态机与陈旧契约（6f）；退役契约 updateSelf 零残留（7） |
| `pnpm run check-version` | bump 后漏 build（package.json / build-version.ts / lib/client.js 三处不一致，pre-commit 同款闸门） |
| `git grep` 残留核对 | **分两类**：身份引用（RPC 端点串 `<旧服务>/`、`SETTINGS_NS`、locale ns、overlay id、旧 scope、旧前缀）必须零残留；描述性提及可保留（BASE_DESCRIPTION、README「从模板衍生」说明、docs 存档） |

## 5. 实测坑清单（衍生 E2E 观察到的，按危险度排序）

1. **RPC namespace 漏改（最危险）**：功能完全不坏（客户端走契约常量、两端一致即可），**无任何报错**——只会得到「描述符 id 是新短 id、namespace/service 还是旧值」的混合态身份。务必按表⑤逐文件核对，改完用 `git grep "'<旧服务>/"`（带引号搜端点串）归零。
2. **YAML `@` 保留指示符**：按包名生成任何 YAML（cordis.patch.yml 的 name、verdaccio 配置的 title）时，含 `@` 的值必须加引号——实测 exit 1 的根因之一（详见 `docs/pitfalls.md` §14）。
3. **批量替换的数组摊平事故**：PowerShell 里 `@(@('a','b'))` 单元素数组会被摊平，逐对替换循环退化成字符级 `.Replace('t','e')`，一次损坏 4 个文件——**typecheck 当场拦截**（没有静默坏掉），从模板恢复单文件后用防摊平写法重放。教训：批量替换用显式键值对数组校验、或逐文件 edit；每轮替换后立刻 typecheck。
4. **title zh/en 不同值**：gen-version 构建期提取卡片 title 要求单一来源，不一致直接 build 报错——守护有效，别绕（改脚本绕过 = 破坏显示元数据同源）。
5. **locale ns 6 处漏改**：typecheck 拦（非静默），但计数写「两处」会误导——按表④的 6 处核对。
6. **`git status` 对 `src/client/build-version.ts` 的假阳性 M**：重建后 autocrlf 规格化可能标 M 但 `git diff` 为空——以 diff 为准，不要反复 re-add。
7. **`git grep` 全仓无残留的反例**：BASE_DESCRIPTION / package.json description 若含「从模板衍生」字样必然命中——按 §4 的两类区分核对，别为归零删掉描述。
8. **交互式脚本不在衍生验证范围**：`test-version-bump` 是交互式的（需要真机看弹窗），衍生验证跳过；桌面真机安装/配置页/ping/greet 属人工待验项。
9. **verdaccio 配置生成类脚本**：本模板的 test-version-bump 已把包名相关值参数化（scope 块动态推导、title 引号、路径绝对化）——衍生后可直接用；若你改它，保持这三个性质（详见 `docs/pitfalls.md` §12/§13/§14）。

## 6. 完成定义（DoD）

- [ ] 四连全绿：`pnpm typecheck` / `pnpm build` / `pnpm run smoke-offline`（34 项 ALL PASSED）/ `pnpm run check-version`
- [ ] `git grep` 分类核对：身份引用零残留（§4 第 5 行的两类清单）
- [ ] `git init` + `core.hooksPath .githooks` + 初始 commit 被 pre-commit 放行
- [ ] （可选）`pnpm version patch --no-git-tag-version` 冒烟 → check-version 过 → 还原重建
- [ ] 人工待验项已告知：桌面真机安装、配置页/ping/greet、版本提示弹窗（test-version-bump）
- [ ] 本文档的缺口反馈已回填（新落点进 §2、新坑进 §5）
