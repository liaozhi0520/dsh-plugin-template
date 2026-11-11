# dsh-plugin-template

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件模板：
**DeepSeek 桌面版专用**（desktop profile），范式对齐 dsh-comfyui-based-tools
0.8.7——两段式入口门禁、「插件」页配置页与详情区、发版工程（离线冒烟 /
Verdaccio 版本更新测试台）。开发完成后可**直接发布 npm** 或**推 GitHub** 供用户
安装。

模板自带的可删改示例面（每个都演示一类范式）：

- **Host half**（`src/index.ts` 薄门禁 shim → `src/main.ts`）：`greet` 工具
  （读 settings，演示 volatile 引用）+ `template/*` Typert 端点
  （ping/getConfig/saveConfig）；**0.2.2 起无任何更新检查/提醒**；
- **Client half**（`src/client/`）：「插件」页组合包详情页的配置页（问候语
  编辑器 = 0.1.7 settings 模型示范 + ping 演示）+ 版本不兼容停用说明面板；
- **插件页显示元数据**：`locale/{zh,en}.json`（title / description / detail）
  与 `assets/detail/{zh,en}.md`（0.2.2 详情区）；
- **Host↔Client 调用**（`src/remote.ts` + `src/client/api.ts`）：表驱动描述符
  的远程调用形态（为什么是手写描述符而非官方 `@Remote` 装饰器，见 remote.ts
  头注释）。

## 使用本模板（衍生新插件）

**完整衍生规则（五张落点表 + 操作流程 + 验证门 + 实测坑）在 `docs/derivation-guide.md`——agent 按它执行；本节只是概览。**

插件身份 = 三件套，互相派生：

| 概念 | 模板取值 | 派生规则 |
|---|---|---|
| **短插件 id** | `dsh-plugin-template` | = 仓库名（cordis 插件名、cordis.patch 条目 id、settings ns、Typert package 都从它派生） |
| **npm 包名** | `@scoped/dsh-plugin-template` | `@<npm用户名>/<短id>`（`npm whoami` 取 scope） |
| **环境前缀** | `DSH_PLUGIN_TEMPLATE` | 短 id 全大写、`-`/`.` → `_`（STRICT 环境变量与停用标记名从它派生） |

流程与验证：

1. 复制模板（排除 `.git`/`node_modules`/`lib`/`.verdaccio-storage`，保留点开头文件）；
2. 按指南五张表改名：① npm 包名 4 处 → ② 短插件 id → ③ 环境前缀 → ④ 顺手项 → **⑤ RPC namespace/service 与端点串（两端必须一致，漏改不报错）**；
3. `pnpm install`（自动首建）→ `pnpm typecheck && pnpm build && pnpm smoke-offline` 三连全绿；
4. `git init` + 初始 commit；
5. 残留核对区分「身份引用」（必须零残留）与「描述性提及」（可保留），详见指南 §4。

> 本指南经过端到端实测：按表衍生 `@demo/dsh-demo-greeter`，三连全绿；实测发现的
> 缺口已回填指南与守护（见指南 §5 实测坑清单）。0.2.2 起删除更新提醒链路、新增
> 插件页详情区与 `pnpm-workspace.yaml`，文件差异计数随之变化，具体口径见指南 §2
> （待下一次衍生 E2E 复测回填）。

## 开发与生效

**一次安装进桌面 profile**（client half 的发现依赖包名解析，必须安装而非
`--patch` 插路径）：

```sh
dsh plugin --profile desktop add <本模板目录的绝对路径>
# 或发布后：dsh plugin --profile desktop add <npm 包名>
```

> pnpm ≥10 的构建许可：首次 add 会被 pnpm 拒绝构建脚本，按提示把包名加进
> profile 的 `pnpm-workspace.yaml`（`~/.dsh/profiles/desktop/pnpm-workspace.yaml`）
> 的 `allowBuilds:` 下再重试。0.2.0-rc.2 起 CLI `rejectElectronProfile` 禁止用
> CLI **启动** desktop profile——上面的 add（管理 profile 内容）不受影响，跑起来
> 一律用桌面壳。

**开发循环（无热更）**：改任何代码（host/client）→ `pnpm build` → **重启
DeepSeek Harness** 生效。为什么不接热加载：桌面热更不可用，且 `link:` 本地
链接 + 手工 build 不经过插件页操作时，host 半仍持进程内旧模块（harness 的
模块驱逐只在经插件页/CLI 的安装操作时发生）——开发期一律「改码必重启」。

验证路径：桌面版「插件」页 → 卡片（icon + 标题 + 描述）→ 详情区
（`assets/detail/<lang>.md`）→ 组合包详情页配置页
（改 greeting → 保存 → 让 agent 调 `greet` 工具应立即用新值）→ ping 按钮。

## 发版纪律（version bump）

改 `package.json` 的 version 后**跑一次 build**：build 链首步
`scripts/gen-version.mjs` 重生成 `locale/{zh,en}.json` 显示元数据（卡片 title +
description + detail 与兼容窗口）和 `assets/detail/{zh,en}.md`（0.2.2 插件页
详情区）。漏跑 = 卡片窗口文案停在旧值。

- `locale/{zh,en}.json` 与 `assets/detail/*.md` 都是**生成物，勿手改**——改文案改
  `scripts/templates/detail.{zh,en}.md` 与 `scripts/gen-version.mjs` 的
  `DESCRIPTION`；`meta.description` 必须**非空**（产品介绍 + 带括号的兼容窗口，
  窗口由 gen-version 的 `{{compat}}` 占位符构建期替换），`meta.detail` 指向
  `assets/detail/<lang>.md`（不声明会回退渲染包内 README）；`package.json` 的
  `files` 白名单已加 `assets`。

```sh
pnpm version patch --no-git-tag-version   # version 生命周期脚本自动重生成并 git add 生成物
git commit -am "chore(release): x.y.z"
pnpm publish                              # prepack 会自动完成构建
```

- `patch|minor|major` 是 `pnpm version` 的参数；`version` 生命周期脚本 argv 为
  空、`npm_package_version` 已是 bump 后新值。
- `pnpm version` 要求干净工作树；`pnpm run version` 只直跑脚本**不 bump**（误用）。
- 发版前的完整守护是 `node scripts/smoke-offline.mjs`（**0g 节**守护 locale
  元数据、`meta.detail` 与 `src/version-gate.ts` 的窗口一致）。
- **【本轮迁移不 bump 插件版本】**：0.2.2-rc.1 跨线迁移只改声明/依赖/代码/指引，
  插件 `version` 保持 `0.1.0`，真机通过后单独 `chore(release)` 发版（见
  `docs/compat-plan-0.2.2-rc.1.md` §0 / §9）。
- **【0.2.1 起已无提交期闸门】**：原 `src/client/build-version.ts` 的
  `BUILD_VERSION` 烧录、`scripts/check-version-sync.mjs` 与 `.githooks/pre-commit`
  都是为**陈旧代码检测**服务的；该检测已随上游修复整体拆除（卸载→重装不重启由
  harness 自行驱逐旧模块，2026-10-19 真机确认），闸门与生成步骤一并删除，
  **不要再加回来**。取证与回退记录见 `docs/harness-defect-workarounds.md`
  的历史防护回退块。

## 本地版本更新测试（Verdaccio）

插件页 Versions 区「检查更新 → 卸载旧版 → 安装新版（不重启跑新码）」的端到端
验证不需要真发版：

```sh
pnpm test-version-bump                    # 交互式（缺省 bump 模式）
pnpm test-version-bump --mode bump        # 版本 A = 工作区当前版本，B = patch+1，同工作区构建两次
pnpm test-version-bump --mode commit --a <ref> --b <ref>   # 两个 commit 各在临时 worktree 里构建
```

- 本地 Verdaccio registry 发布被测包；0.2.2 插件页「重新检查」读 **profile 的
  `pnpm config get registry`**（cwd = profile），故脚本临时写
  `~/.dsh/profiles/desktop/.npmrc` 指向本地源，dsh 内从该源安装（文件夹形式
  安装的副本不参与测试）；正常结束/出错/Ctrl+C 都会自动还原（`.npmrc` 原本
  不存在就删掉、候选源回官方、版本号回滚、worktree 删除、停 Verdaccio）；资产
  集中在 git-ignored 的 `.verdaccio-storage/`。
- commit 模式的「版本相同」陷阱与 Windows 三坑（worktree force 穿 junction、
  `<sha>^{commit}` 转义、npm publish stdin 卡死）已在脚本内钉死，见其头注释。
- 启动诊断（2026-10-19 范式修复迁移）：verdaccio 用 `spawn(node, [bin, …])` +
  管道落盘启动（`detached + shell` 在 Windows 上会让孙进程的输出句柄失效、日志
  恒为 0 字节）；`on('error')`/`on('exit')` 让「启动即死」立即报错并贴出日志尾部；
  启动前预检 4873 是否被占用。故障排查细节见 `docs/pitfalls.md` §13。
- 更新流程在桌面壳里看（脚本准备完环境后人工确认）：装 A → 插件页 Versions 区
  更新到 B → 不重启即跑新码、且**全程无任何提醒弹窗/更新条**（方案 A 后插件自身
  零提醒）；profile `.npmrc` 结束已还原。

## 依赖版本与追新

harness 处于 0.x rc 快速迭代期，要点：

- **peer 与 dev 同一下限**：dev = 编译所用版本，peer = 运行时最低兼容声明。
  官方规则：every peer has a matching development range。
- **范围写法**：用 `^0.2.2-rc.1`（= 已实测的最低版本，peer 与 dev 写同一个）。
  不要用 `latest`/`*`（dist-tag 停在老线，反而拿到最旧），也不要精确钉死。caret
  在预发布线上只覆盖同一 `major.minor.patch` 的更高预发布号——**同 tuple 内追新
  （rc.1→rc.2）不需要改依赖，只抬 MAX**；**tuple 变化（0.2.1→0.2.2）或跨 minor
  迁移（0.1.7→0.2.0）时 caret 取不到新线**（`includePrerelease` 下实测可放行
  新线，但 pnpm 解析仍停在旧 tuple、类型面拿不到新线），**MIN/MAX 一并上移 +
  依赖下限同步改写**。0.2.0 线**已不存在于本插件依赖面**的包（勿抄回）：
  `dsh-client-ui-settings`、`dsh-client-ui-primitives`、`dsh-plugin-manager`；
  0.2.2 起随更新提醒删除 `dsh-client-ui-layout`（peer + dev）
  （UI 原语已复制进 `src/client/ui/`；自更新通道已退役）。
- **基座与 engines（0.2.2 线）**：cordis `^4.1.0` / schemastery `^3.19.0` /
  cosmokit `^1.9.0` / cordis-plugin-group·include `~1.1.0`；
  `engines.node >=24.9`（源码精确 `>=24.9.0`）。本机桌面版已内置
  `0.2.2-rc.1` / node `24.21.0`。`dsh.client.inject` 仍是 connection / locale /
  ui-plugin-manager 三项不变。
- **版本门禁（单点窗口）**：`src/version-gate.ts` 声明支持窗口
  `[0.2.2, 0.2.2]`（MIN = MAX；MIN/MAX 与运行时版本均只按 `major.minor.patch`
  比较，`0.2.2-rc.1` 视为 `0.2.2`），窗口外软禁用。版本源 = 桌面 runtime
  内的 `@deepseek-ai/dsh` 包 version（**桌面单锚**：host 子进程 argv[2] =
  runtimeDir，读其 node_modules；不读 dsh-tools 等内嵌依赖——caret 实装版本
  可能高于本体）。软禁用 = 醒目日志 + 插件 no-op + client 停用说明面板
  （载荷含支持窗口/当前 harness 版本；**不再**回显插件 `currentVersion`、
  **不再**比较 registry latest）；`DSH_PLUGIN_TEMPLATE_STRICT=1` 恢复抛错
  fail-loud。与 harness 内建 peer 预检的分工：预检守「声明面」（caret 放行集
  宽于窗口），门禁守「验证面」（MAX 只写已实测 tag）——两者并存、缺一不可。
  **行为地图**：低于 MIN 的宿主由 harness 声明面在组合期拦截（静默跳过、插件
  无机会出面板）；窗口内正常加载；**高于 MAX 由本插件门禁软禁用并给出可执行的
  更新/降级指引**。声明 `engines.dsh` 则它**单独决定、peers 被忽略**且执行点
  全在 import 之前（0.2.2-rc.1 复核仍原样）——本插件**刻意不用**，理由与激活
  条件见 `docs/harness-defect-workarounds.md`。

**追新流程（手动，无脚本）**：

```sh
# ① 查目标线的最新版本（各 @deepseek-ai/dsh-* 与 harness 同步发版，查 dsh-tools 即可代表全线）：
pnpm view @deepseek-ai/dsh-tools versions --json

# ② 手改 package.json：全部 @deepseek-ai/dsh-* 的 peer 与 dev 改成同一个 ^<目标版本>
#    （当前依赖：^0.2.2-rc.1）
#    同 tuple 内追新（如 0.2.2-rc.1→rc.2）caret 已覆盖，无需改依赖，直接跳到 ④
#    仅当 MIN 也要上移（tuple 变化 / 跨线迁移 / 旧 MIN 从未实测 / 已不可安装）时才同步改写依赖下限
#    本版本才有的包只进 dev（只 import type 时编译期擦除）

# ③ 同步与验证：
pnpm install
pnpm typecheck && pnpm build && pnpm smoke-offline   # 红 = 上游破坏性变更，按 compat-plan 迁移清单修

# ④ 实测通过后手动上调 src/version-gate.ts 的 MAX_HARNESS_VERSION（写 major.minor.patch 核心版本；MIN 保持已实测的最低版本）
# ⑤ 同一轮同步指引：rg -n '0\.2\.' AGENTS.md README.md src/version-gate.ts
#    ——留旧窗口的指引 = 让后续 agent 照旧窗口写代码。
```

- 不用 `pnpm update`：它会剥掉 rc 包的 `^`，且不碰 peer 侧。
- 每次迁移按 `docs/compat-plan-TEMPLATE.md` 复制一份
  `docs/compat-plan-<目标版本>.md` 填写并保留为执行记录（先例：
  `docs/compat-plan-0.2.2-rc.1.md`、`docs/compat-plan-0.2.1-rc.2.md`、
  `docs/compat-plan-0.2.0-rc.2.md`）。

## 版本更新（0.2.2 起：无插件侧提醒）

**0.2.2 起本插件不做任何版本更新提醒、不联网查 registry；版本检查与更新由官方
插件页（plugin-manager 的 Versions 区）接管，用户走卸载重装/插件页更新。**
方案 A 已删除 `template/checkUpdate` / `template/getUpdateState` 两个 RPC、
`startUpdateCheck`、`shell.overlay` 条目 `template-update-notice`、配置页更新条，
以及 `src/update-state.ts` / `src/shared/registry-latest.ts` /
`src/shared/update-contract.ts` / `src/client/GlobalNotice.tsx`(+css) /
`src/client/disabled-version-check.ts`——插件零出网。**保留**
`src/shared/json-body.ts`（宿主 fetch 缺陷① 的防御工具，当前无调用方）、version
gate、停用说明面板、`plugins.bundle.config` 槽位、`greet` 工具与
`template/ping` / `getConfig` / `saveConfig` 端点。完整决策与执行面见
`docs/compat-plan-0.2.2-rc.1.md` §5.1，缺陷规避复核见
`docs/harness-defect-workarounds.md`。

- 第三方插件没有「一键更新」；官方插件页 Versions 区已提供
  「检查 → 卸载旧版 → 安装新版」（失败回滚），且**免重启即生效**（harness 在
  卸载/重装时自行驱逐旧模块，2026-10-19 真机复核确认）。
- **【0.2.1 起】陈旧代码提醒已整体拆除**：原「运行中模块自报版本 vs 构建期
  `BUILD_VERSION` 严格不等 → danger 对话框（两次提醒）」整条链路（含
  `StaleBanner.tsx`、`build-version.ts`、gen-version 烧录段、槽位注册、
  GlobalNotice 的 stale 让位、locales 文案、smoke 0d/6f 守护、
  `check-version-sync.mjs`、`.githooks/pre-commit`）已删除——它兜底的 harness
  缺陷已被上游修复。**不要再加回来**；取证与回退记录见
  `docs/harness-defect-workarounds.md`。
- 软禁用态没有 RPC 可轮询；停用说明面板承担版本修复指引（窗口/当前 runtime
  版本/桌面版更新引导），但**不再**回显插件 `currentVersion`、不再
  比较 registry latest。

## 发布到 npm

```sh
npm login          # 首次
pnpm publish       # prepack 会自动完成构建
```

`files` 白名单只带运行必需的产物（`lib/`、`cordis.patch.yml`、`icon.svg`、
`locale/*.json`、`assets/`），发布前建议 `pnpm pack` 检查内容。
`locale/{zh,en}.json` 是「插件」页卡片静态读取的显示元数据
（title/description/detail，gen-version 生成；`meta.detail` 指向
`assets/detail/<lang>.md`，不声明会回退渲染包内 README），
`assets/detail/*.md` 同为生成物。两者都**勿手改**，发版前必跑一次 build。

## 上传到 GitHub

直接 push 源码即可（**不要**提交 `lib/`、`.verdaccio-storage/`，它们在
.gitignore 里）。本模板带了 `prepare` 脚本：用户从 git 安装时 pnpm 会用它现场
构建产物（自包含，只依赖 npm 上的公开包）。

```sh
# 1. 首次 add 会被 pnpm 拒绝构建脚本，按提示把包名加进 profile 的
#    pnpm-workspace.yaml（allowBuilds: <包名>: true）
# 2. 重新执行
dsh plugin --profile desktop add github:<owner>/dsh-plugin-template#<commit-sha>
```

> 构建许可 = 允许安装时执行该包的代码，提醒你的用户只对他们信任的包开启，
> 并建议 pin commit。不想让用户配许可的话，也可以发 npm 或提供 `pnpm pack`
> 产物（tarball 安装不跑构建）。

## 原理速记

- **一切都是 Cordis 插件**；通过 `ctx` 注册的都是可逆 effect，卸载自动清理。
- **两段式入口**：cordis Loader 先完整求值入口静态 import 图再 apply——薄
  shim（node builtins + schemastery 白名单，smoke 0/0b 守护）保证未验证
  harness 版本的 API 漂移不会堵死软禁用路径；`Config` 必须从入口**值导出**
  （0.1.7 起 Loader 只认领 apply 所在入口）。
- **0.1.7 settings 模型**：schema 全字段 volatile（变更不触发插件重载，
  `config.x.get()` 即时取值）；面板写回走 `ctx.settings.replace(ns, section)`
  整段替换（深合并删不掉键）；自带配置页的插件 `configure({ auto: false })`
  退出自动表单，配置页注册在 `plugins.bundle.config` keyed 槽位（key 逐字 =
  包名，渲染在组合包详情页）。
- **插件页详情区（0.2.2 新增）**：`locale/<lang>.json` 的 `meta.detail` 指向
  `assets/detail/<lang>.md`；不声明会回退渲染包内 README。`meta.description`
  必须非空（产品介绍 + 带括号的兼容窗口）；`assets/detail/*.md` 与
  `locale/*.json` 都是生成物，改文案改 `scripts/templates/detail.*.md` 与
  gen-version 的 `DESCRIPTION`。
- **显示元数据**：「插件」页卡片不激活插件即静态读取包内 `icon.svg` 与
  `locale/{zh,en}.json`（gen-version 构建期生成；title / description / detail，
  description 携带带括号的 `[MIN,MAX]` 兼容窗口、由 `{{compat}}` 占位符替换——
  抬窗口后跑一次 build 自动跟随，`meta.description` 必须非空）。
- **CSS 物化期自注入**：tsdown 虚拟模块复刻官方 styleInjectionModule——样式
  标签在插件 fiber 物化时进 `<head>`，`data-plugin-css` 去重守卫 +
  `loadCache.styles` 记账清理；组件只 `import classes from './x.module.css'`。
- **分发形态即开发形态**：`exports['.']` 恒指向 `lib/index.js`，npm 包、git
  安装、本地 link 走同一条加载路径。
- **依赖规则**：`@deepseek-ai/*` 一律进 peerDependencies（不进 dependencies）；
  client 要用的第三方依赖进 devDependencies 让 tsdown 打进 bundle（clsx）；
  双端共用运行时依赖才评估 tsdown `alwaysBundle`。`dsh.client.inject` 与
  neverBundle 按 0.2.2 包集维护（client 半对 dsh-* 只有 type-only import，
  bundle 内零 dsh-* 运行时依赖——smoke 0 节守护）。
- **别追 dsh-\* 声明文件里的跨包 `import type`**：`tsconfig.json` 的
  `skipLibCheck: true` 会跳过 `.d.ts` 内部检查，而上游把 `dsh-api-remotes` /
  `dsh-client-store` / `dsh-attachment` 等只放在自己的 devDependencies（peer
  只有 `cordis`）——这是 harness 惯例，**不要补 devDep、更不要关
  `skipLibCheck`**（实测补齐后只是把缺失推给更下游）。唯一退化是
  `PluginPackageRef.availability → any`；真要用到该字段时在自己代码里本地声明
  联合类型并断言。详见 `docs/pitfalls.md` §7b。
- **版本窗口纪律**：当前单点窗口 `[0.2.2, 0.2.2]`；MIN/MAX 与运行时版本都只按
  major.minor.patch 比较（预发布后缀忽略）；MAX 只写已验证 tag 的核心版本；
  MIN = 已实测最低版本；同 tuple 追新只抬 MAX；tuple 变化/跨线迁移
  MIN/MAX 一并上移 + 依赖下限同轮改写（详见 AGENTS.md 硬约定）。

## 文件清单

```
├── src/index.ts                      # host 半入口：薄门禁 shim（两段式入口第一段）
├── src/main.ts                       # host 半业务主体（门禁全过后动态拉起：greet + 端点）
├── src/spec.ts                       # 0.1.7 settings 模型（volatile Config + SETTINGS_NS + 句柄）
├── src/profile-gate.ts               # desktop-only profile 门禁（profileContext 指纹）
├── src/soft-disable.ts               # 软禁用装配（两门禁 + 重模块图加载失败共用出口）
├── src/version-gate.ts               # 版本门禁（单点 [0.2.2, 0.2.2]、major.minor.patch 比较 + 桌面单锚 argv[2]）
├── src/remote.ts                     # Typert 端点（表驱动描述符 + TemplateRemote 服务）
├── src/css-modules.d.ts              # CSS Modules 导入声明
├── src/shared/contract.ts            # 业务 RPC 契约（ping/getConfig/saveConfig）
├── src/shared/disabled-flag.ts       # 软禁用标记契约（载荷含 reason/min/max/installVersion/runtimeVersion）
├── src/shared/version-compare.ts     # 严格 semver 比较（纯函数，双端共用）
├── src/shared/json-body.ts           # 响应体健壮读取（缺陷① 防御工具，当前无调用方）
├── src/client/index.ts               # client 半入口（plugins.bundle.config 正常/停用两路）
├── src/client/locales.ts             # zh/en 词典（title = 卡片显示名，zh/en 同值）
├── src/client/api.ts                 # 浏览器 → host RPC（OpResult 统一错误面）
├── src/client/bundle-key.ts          # plugins.bundle.config 注册 key（= 包名，单源）
├── src/client/TemplateSection.tsx    # 配置页卡片（settings 写回示范 + ping）
├── src/client/TemplateDisabledSection.tsx  # 停用说明面板（harness 组）
├── src/client/ui/                    # 官方 UI 原语复制件（Button/Modal/NoticeModal/Switch/Menu…）
├── src/client/*.module.css           # 样式（构建期物化自注入）
├── assets/detail/{zh,en}.md          # 生成物勿手改（0.2.2 插件页详情区）
├── scripts/templates/detail.{zh,en}.md  # 详情正文模板（改文案改这里）
├── locale/{zh,en}.json               # 生成物勿手改（meta.title/description/detail）
├── pnpm-workspace.yaml               # minimumReleaseAgeExclude 白名单
├── docs/derivation-guide.md           # 衍生指南（agent 执行用）：五张落点表 + 流程 + 验证门 + 实测坑
├── docs/compat-plan-0.2.2-rc.1.md    # 本轮 0.2.1→0.2.2 跨线迁移执行记录（方案 A / meta.detail）
├── docs/compat-plan-0.2.1-rc.2.md    # 上一轮新线迁移执行记录（归档）
├── docs/compat-plan-0.2.0-rc.2.md    # 更早跨线迁移 + 范式收敛执行记录（归档）
├── docs/compat-plan-TEMPLATE.md      # 兼容迁移执行记录骨架（每次追新 cp 一份填写）
├── docs/compat-guide-0.1.2-to-0.1.5.md / -0.1.1-to-0.1.2.md  # 历史手册（已归档）
├── docs/module-map.md                # 模块清单 + smoke 守护清单
├── docs/pitfalls.md                  # 已踩过的坑（全文与取证）
├── docs/harness-defect-workarounds.md # 待复核的 harness 缺陷规避（含历史回退块 + engines.dsh 评估）
├── docs/versioning-and-update-plan.md # 历史方案存档（自更新/版本提示章节均已退役）
├── scripts/gen-version.mjs           # build 链首步（locale + assets/detail 显示元数据；{{compat}} 替换）
├── scripts/smoke-offline.mjs         # 离线全量守护（入口隔离/契约/锚点/meta.detail/零残留）
├── scripts/entry-guard-hook.mjs      # smoke 第 0 节的 resolve 钩子（拦截 dsh-*）
├── scripts/test-version-bump.mjs     # Verdaccio 版本更新测试台（插件页 Versions 区流程）
├── .gitattributes                    # 锁本文件 LF
├── tsdown.config.ts                  # client bundle 构建（CJS 工厂 + CSS 物化自注入）
├── tsconfig.json / tsconfig.build.json
├── cordis.patch.yml                  # bundle 层：安装时插入插件行
├── icon.svg                          # 插件页卡片图标
└── package.json                      # dsh.bundle + dsh.client 清单 + 发版脚本
```
