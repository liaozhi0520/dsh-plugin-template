# dsh-plugin-template

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件模板：
**DeepSeek 桌面版专用**（desktop profile），范式对齐 dsh-comfyui-based-tools
0.8.6——两段式入口门禁、「插件」页配置页、版本提示 + 陈旧代码提醒、发版工程
（版本一致性闸门 / 离线冒烟 / Verdaccio 版本测试台）。开发完成后可**直接发布
npm** 或**推 GitHub** 供用户安装。

模板自带的可删改示例面（每个都演示一类范式）：

- **Host half**（`src/index.ts` 薄门禁 shim → `src/main.ts`）：`greet` 工具
  （读 settings，演示 volatile 引用）+ `template/*` Typert 端点 + 启动更新检查；
- **Client half**（`src/client/`）：「插件」页组合包详情页的配置页（问候语
  编辑器 = 0.1.7 settings 模型示范 + ping 演示 + 插件更新条）+ `shell.overlay`
  版本提醒条目 ×2（StaleBanner / GlobalNotice）+ 版本不兼容停用说明面板；
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
3. `pnpm install`（自动首建）→ `pnpm typecheck && pnpm build && pnpm smoke-offline` 全绿；
4. `git init` + `git config core.hooksPath .githooks` + 初始 commit（pre-commit 跑版本一致性闸门）；
5. 残留核对区分「身份引用」（必须零残留）与「描述性提及」（可保留），详见指南 §4。

> 本指南经过端到端实测：按表衍生 `@demo/dsh-demo-greeter`，34 文件差异、四连全绿、
> pre-commit 放行；实测发现的缺口已回填指南与守护（见指南 §5 实测坑清单）。

## 开发与生效

**一次安装进桌面 profile**（client half 的发现依赖包名解析，必须安装而非
`--patch` 插路径）：

```sh
dsh plugin --profile desktop add <本模板目录的绝对路径>
# 或发布后：dsh plugin --profile desktop add <npm 包名>
```

> pnpm ≥10 的构建许可：首次 add 会被 pnpm 拒绝构建脚本，按提示把包名加进
> profile 的 `pnpm-workspace.yaml`（`~/.dsh/profiles/desktop/pnpm-workspace.yaml`）
> 的 `allowBuilds:` 下再重试。rc.2 起 CLI `rejectElectronProfile` 禁止用 CLI
> **启动** desktop profile——上面的 add（管理 profile 内容）不受影响，跑起来
> 一律用桌面壳。

**开发循环（无热更）**：改任何代码（host/client）→ `pnpm build` → **重启
DeepSeek Harness** 生效。为什么不接热加载：桌面热更不可用，且模板自带
StaleBanner「改码必重启」纪律（运行中代码 ≠ 磁盘包就会提醒）——热更只会制造
新旧错配的中间态。

验证路径：桌面版「插件」页 → 卡片（icon + 标题 + 描述）→ 组合包详情页配置页
（改 greeting → 保存 → 让 agent 调 `greet` 工具应立即用新值）→ ping 按钮。

## 发版纪律（version bump）

bump 了 `package.json` 的 version 就**必须跑一次 build**：build 链首步
`scripts/gen-version.mjs` 把新版本烧进 `src/client/build-version.ts` 并重生成
`locale/{zh,en}.json` 显示元数据。漏跑 = 发布包里 bundle 烧旧版、host 自报新版
——**每个用户每次启动都被 StaleBanner 误报「陈旧代码」**。

```sh
pnpm version patch --no-git-tag-version   # version 生命周期脚本自动烧录并 git add 生成物
git commit -am "chore(release): x.y.z"
pnpm publish                              # prepack 会自动完成构建
```

- `patch|minor|major` 是 `pnpm version` 的参数；`version` 生命周期脚本 argv 为
  空、`npm_package_version` 已是 bump 后新值（烧的就是新版本）。
- `pnpm version` 要求干净工作树；`pnpm run version` 只直跑脚本**不 bump**（误用）。
- 两道闸门：bump 期 = version 生命周期；提交期 = `.githooks/pre-commit` →
  `scripts/check-version-sync.mjs`（~50ms 纯比对 package.json /
  build-version.ts / lib/client.js，不一致 exit 1 附修复命令）。新克隆启用：
  `git config core.hooksPath .githooks`（`.gitattributes` 已锁 `.githooks/*`
  LF——CRLF shebang 会让钩子静默失效）。跳过：`git commit --no-verify`。

## 本地版本 bump 测试（Verdaccio）

「版本提示」弹窗（available）与陈旧提醒（stale）的端到端验证不需要真发版：

```sh
pnpm test-version-bump                    # 交互式（缺省 bump 模式）
pnpm test-version-bump --mode bump        # 版本 A = 工作区当前版本，B = patch+1，同工作区构建两次
pnpm test-version-bump --mode commit --a <ref> --b <ref>   # 两个 commit 各在临时 worktree 里构建
```

- 本地 Verdaccio registry 发布被测包，dsh 内**一律从该源安装**（文件夹形式安装
  的副本不参与测试）；正常结束/出错/Ctrl+C 都会自动还原（候选源回官方、版本
  号回滚、worktree 删除、停 Verdaccio）；资产集中在 git-ignored 的
  `.verdaccio-storage/`。
- commit 模式的「版本相同」陷阱与 Windows 三坑（worktree force 穿 junction、
  `<sha>^{commit}` 转义、npm publish stdin 卡死）已在脚本内钉死，见其头注释。
- 弹窗本身在桌面壳里看（脚本准备完环境后人工确认两阶段弹窗）。

## 依赖版本与追新

harness 处于 0.x rc 快速迭代期，要点：

- **peer 与 dev 同一下限**：dev = 编译所用版本，peer = 运行时最低兼容声明。
  官方规则：every peer has a matching development range。
- **范围写法**：用 `^0.2.0-rc.1`（= 已实测的最低版本，peer 与 dev 写同一个）。
  不要用 `latest`/`*`（dist-tag 停在老线，反而拿到最旧），也不要精确钉死。caret
  在预发布线上只覆盖同一 `major.minor.patch` 的更高预发布号——**同线追新
  （rc.1→rc.2）不需要改依赖，只抬 MAX**；**peer precheck 的 caret 数学上不跨
  minor 线**，跨线迁移必须同轮重写全部 peer/dev（单点窗口，MIN/MAX 一并上移）。
  0.2.0 线**已不存在**的包（勿抄回）：`dsh-client-ui-settings`、
  `dsh-client-ui-primitives`、`dsh-plugin-manager`（UI 原语已复制进
  `src/client/ui/`；自更新通道已退役）。
- **版本门禁（双边界窗口）**：`src/version-gate.ts` 声明支持窗口
  `[0.2.0-rc.1, 0.2.0-rc.2]`，窗口外软禁用。版本源 = 桌面 runtime 内的
  `@deepseek-ai/dsh` 包 version（**桌面单锚**：host 子进程 argv[2] =
  runtimeDir，读其 node_modules；不读 dsh-tools 等内嵌依赖——caret 实装版本
  可能高于本体）。软禁用 = 醒目日志 + 插件 no-op + client 停用说明面板
  （载荷含支持窗口/当前 harness 版本/插件版本，client 自查最新版）；
  `DSH_PLUGIN_TEMPLATE_STRICT=1` 恢复抛错 fail-loud。与 harness 内建 peer
  预检的分工：预检守「声明面」（caret 放行集宽于窗口），门禁守「验证面」
  （MAX 只写已实测 tag）——两者并存、缺一不可。

**追新流程（手动，无脚本）**：

```sh
# ① 查目标线的最新版本（各 @deepseek-ai/dsh-* 与 harness 同步发版，查 dsh-tools 即可代表全线）：
pnpm view @deepseek-ai/dsh-tools versions --json

# ② 手改 package.json：全部 @deepseek-ai/dsh-* 的 peer 与 dev 改成同一个 ^<目标版本>
#    （当前依赖：^0.2.0-rc.1）
#    同 minor 线内追新（如 rc.1→rc.2）caret 已覆盖，无需改依赖，直接跳到 ④
#    仅当 MIN 也要上移（旧 MIN 从未实测 / 已不可安装）时才同步改写依赖下限
#    本版本才有的包只进 dev（只 import type 时编译期擦除）

# ③ 同步与验证：
pnpm install
pnpm typecheck && pnpm build && pnpm smoke-offline   # 红 = 上游破坏性变更，按 compat-plan 迁移清单修

# ④ 实测通过后手动上调 src/version-gate.ts 的 MAX_HARNESS_VERSION（MIN 保持已实测的最低版本）
# ⑤ 同一轮同步指引：rg -n '0\.2\.' AGENTS.md README.md src/version-gate.ts
#    ——留旧窗口的指引 = 让后续 agent 照旧窗口写代码。
```

- 不用 `pnpm update`：它会剥掉 rc 包的 `^`，且不碰 peer 侧。
- 每次迁移按 `docs/compat-plan-TEMPLATE.md` 复制一份
  `docs/compat-plan-<目标版本>.md` 填写并保留为执行记录（0.2.0-rc.2 的先例见
  `docs/compat-plan-0.2.0-rc.2.md`）。

## 版本更新提示与陈旧代码提醒

**插件更新 = 到「插件」页卸载本插件后重新安装；插件不做任何进程内安装**
（自更新通道已退役：重装后进程内旧模块不会被替换——Node ESM 模块缓存缺陷，
自更新只会制造「新 UI + 旧内核」错配）。插件自身只做两件事：

- **版本提示**：host 半 `src/update-state.ts` 四相状态机（idle/checking/
  available/up-to-date，纯内存态不落盘，host 半唯一权威源）在 apply 时静默查
  registry `/<pkg>/latest`（npm → npmmirror 逐源降级，`shared/registry-latest.ts`
  + `shared/json-body.ts` 按魔数自解压）；available 时 `shell.overlay` 条目
  `GlobalNotice`（order 101，neutral NoticeModal）弹「卸载重装」提示并内嵌
  可复制安装 spec 命令片（`<包名>@<latest>`，CommandChip）；「我知道了」仅内存
  态关闭本次窗口，下次启动未更新则重弹。配置页更新条共用同一状态机
  （`template/checkUpdate` / `template/getUpdateState` RPC）。
- **陈旧代码提醒**：运行中模块自报版本（`src/package-info.ts` **模块求值期
  缓存**——求值时刻 = 代码加载时刻，缓存值严格等于运行代码版本）与构建期烧录
  的 `BUILD_VERSION`（`src/client/build-version.ts`，gen-version 生成勿手改）
  **严格不等** → `shell.overlay` 条目 `StaleBanner`（order 100，danger）弹可
  关闭提醒，**共两次**：①版本不一致说明（关闭后 5 秒重弹）→ ②「请立即重启
  DeepSeek Harness…」+「当前我没有使用此插件，无需立即重启」（关闭后不再
  提醒）。重启后版本一致、条件自然消失。升级与降级重装都命中，无豁免分支。
  **不做全屏阻断**——插件无权锁死宿主，误报时阻断等于劫持整个 DSH。

前提：版本提示要求插件已发布到 npm（GitHub-only 分发时 registry 检查失败，
静默/手动重试，属预期）。软禁用态没有版本提示（无 RPC 可轮询），停用说明面板
承担版本修复指引（含插件最新版自查与 package@version 复制药丸）。

## 发布到 npm

```sh
npm login          # 首次
pnpm publish       # prepack 会自动完成构建
```

`files` 白名单只带运行必需的产物（`lib/`、`cordis.patch.yml`、`icon.svg`、
`locale/*.json`），发布前建议 `pnpm pack` 检查内容。`locale/{zh,en}.json` 是
「插件」页卡片静态读取的显示元数据（title/description，gen-version 生成）。

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
- **版本提醒走 shell.overlay 槽位条目**（NoticeModal 复制的 Modal 本体）——
  随插件停用自动撤下，两条件同时成立按官方层栈叠放、stale 优先。
- **显示元数据**：「插件」页卡片不激活插件即静态读取包内 `icon.svg` 与
  `locale/{zh,en}.json`（gen-version 构建期生成，description 携带 [MIN,MAX]
  兼容窗口——抬窗口后跑一次 build 自动跟随）。
- **CSS 物化期自注入**：tsdown 虚拟模块复刻官方 styleInjectionModule——样式
  标签在插件 fiber 物化时进 `<head>`，`data-plugin-css` 去重守卫 +
  `loadCache.styles` 记账清理；组件只 `import classes from './x.module.css'`。
- **分发形态即开发形态**：`exports['.']` 恒指向 `lib/index.js`，npm 包、git
  安装、本地 link 走同一条加载路径。
- **依赖规则**：`@deepseek-ai/*` 一律进 peerDependencies（不进 dependencies）；
  client 要用的第三方依赖进 devDependencies 让 tsdown 打进 bundle（clsx）；
  双端共用运行时依赖才评估 tsdown `alwaysBundle`。`dsh.client.inject` 与
  neverBundle 按 0.2.0 包集维护（client 半对 dsh-* 只有 type-only import，
  bundle 内零 dsh-* 运行时依赖——smoke 0 节守护）。
- **版本窗口纪律**：MAX 只写已验证 tag；MIN = 已实测最低版本；同线追新只抬
  MAX；跨线迁移单点窗口 + 依赖下限同轮改写（详见 AGENTS.md 硬约定）。

## 文件清单

```
├── src/index.ts                      # host 半入口：薄门禁 shim（两段式入口第一段）
├── src/main.ts                       # host 半业务主体（门禁全过后动态拉起：greet + 端点 + 更新检查）
├── src/spec.ts                       # 0.1.7 settings 模型（volatile Config + SETTINGS_NS + 句柄）
├── src/profile-gate.ts               # desktop-only profile 门禁（profileContext 指纹）
├── src/soft-disable.ts               # 软禁用装配（两门禁 + 重模块图加载失败共用出口）
├── src/version-gate.ts               # 版本门禁（[0.2.0-rc.1, 0.2.0-rc.2] + 桌面单锚 argv[2]）
├── src/package-info.ts               # 自身包清单读取（模块求值期缓存 = 运行中自报版本）
├── src/update-state.ts               # 版本提示状态机（四相，host 半唯一权威源，无安装相位）
├── src/remote.ts                     # Typert 端点（表驱动描述符 + TemplateRemote 服务）
├── src/invariant.ts                  # 官方 invariant 伴随件（每包必有）
├── src/css-modules.d.ts              # CSS Modules 导入声明
├── src/shared/contract.ts            # 业务 RPC 契约（ping/getConfig/saveConfig）
├── src/shared/update-contract.ts     # 版本提示 RPC 契约（checkUpdate/getUpdateState + 四相快照）
├── src/shared/disabled-flag.ts       # 软禁用标记契约（载荷含 runtimeVersion/plugin）
├── src/shared/version-compare.ts     # 严格 semver 比较（纯函数，双端共用）
├── src/shared/registry-latest.ts     # registry /latest 查询（npm→npmmirror 逐源降级，双端同构）
├── src/shared/json-body.ts           # 响应体健壮读取（按魔数自解压 + 诊断；宿主 fetch 缺陷规避）
├── src/client/index.ts               # client 半入口（plugins.bundle.config + shell.overlay ×2）
├── src/client/locales.ts             # zh/en 词典（title = 卡片显示名，zh/en 同值）
├── src/client/api.ts                 # 浏览器 → host RPC（OpResult 统一错误面）
├── src/client/bundle-key.ts          # plugins.bundle.config 注册 key（= 包名，单源）
├── src/client/build-version.ts       # 生成文件勿手改（BUILD_VERSION，gen-version 生成）
├── src/client/disabled-version-check.ts  # 停用面板的插件最新版自查（client 半）
├── src/client/TemplateSection.tsx    # 配置页卡片（settings 写回示范 + ping + 更新条）
├── src/client/TemplateDisabledSection.tsx  # 停用说明面板（harness 组 + 插件组）
├── src/client/GlobalNotice.tsx       # 新版本提示（shell.overlay，NoticeModal + 命令片）
├── src/client/StaleBanner.tsx        # 陈旧代码提醒（shell.overlay，两次提醒非阻断）
├── src/client/CommandChip.tsx        # 可复制命令片
├── src/client/ui/                    # 官方 UI 原语复制件（Button/Modal/NoticeModal/Switch/Menu…）
├── src/client/*.module.css           # 样式（构建期物化自注入）
├── docs/derivation-guide.md           # 衍生指南（agent 执行用）：五张落点表 + 流程 + 验证门 + 实测坑
├── docs/compat-plan-0.2.0-rc.2.md    # 跨线迁移 + 范式收敛执行记录（逐 API 复核）
├── docs/compat-plan-TEMPLATE.md      # 兼容迁移执行记录骨架（每次追新 cp 一份填写）
├── docs/compat-guide-0.1.2-to-0.1.5.md / -0.1.1-to-0.1.2.md  # 历史手册（已归档）
├── docs/module-map.md                # 模块清单 + smoke 守护清单
├── docs/pitfalls.md                  # 已踩过的坑（全文与取证）
├── docs/harness-defect-workarounds.md # 待复核的 harness 缺陷规避（四栏表）
├── docs/versioning-and-update-plan.md # 历史方案存档（自更新章节已退役）
├── scripts/gen-version.mjs           # build 链首步（BUILD_VERSION + locale 显示元数据）
├── scripts/check-version-sync.mjs    # 版本一致性快检（pre-commit 闸门）
├── scripts/smoke-offline.mjs         # 离线全量守护（入口隔离/契约/锚点/状态机）
├── scripts/entry-guard-hook.mjs      # smoke 第 0 节的 resolve 钩子（拦截 dsh-*）
├── scripts/test-version-bump.mjs     # Verdaccio 版本 bump 测试台（bump/commit 双模式）
├── .githooks/pre-commit              # 提交期版本一致性闸门（hooksPath 启用）
├── .gitattributes                    # 锁 .githooks/* LF（CRLF shebang 让钩子静默失效）
├── tsdown.config.ts                  # client bundle 构建（CJS 工厂 + CSS 物化自注入）
├── tsconfig.json / tsconfig.build.json
├── cordis.patch.yml                  # bundle 层：安装时插入插件行
├── icon.svg                          # 插件页卡片图标
├── locale/zh.json / locale/en.json   # 生成文件勿手改（卡片显示元数据）
└── package.json                      # dsh.bundle + dsh.client 清单 + 发版脚本
```
