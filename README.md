# dsh-plugin-template

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件模板：
**DeepSeek 桌面版专用**（desktop profile），范式对齐 dsh-comfyui-based-tools
0.8.7——两段式入口门禁、「插件」页配置页、版本提示、发版工程（离线冒烟 /
Verdaccio 版本测试台）。开发完成后可**直接发布 npm** 或**推 GitHub** 供用户
安装。

模板自带的可删改示例面（每个都演示一类范式）：

- **Host half**（`src/index.ts` 薄门禁 shim → `src/main.ts`）：`greet` 工具
  （读 settings，演示 volatile 引用）+ `template/*` Typert 端点 + 启动更新检查；
- **Client half**（`src/client/`）：「插件」页组合包详情页的配置页（问候语
  编辑器 = 0.1.7 settings 模型示范 + ping 演示 + 插件更新条）+ `shell.overlay`
  版本提醒条目（GlobalNotice）+ 版本不兼容停用说明面板；
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
> 缺口已回填指南与守护（见指南 §5 实测坑清单）。0.2.1 起陈旧检测拆除后文件差异
> 计数随之下调，具体口径见指南 §2。

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

验证路径：桌面版「插件」页 → 卡片（icon + 标题 + 描述）→ 组合包详情页配置页
（改 greeting → 保存 → 让 agent 调 `greet` 工具应立即用新值）→ ping 按钮。

## 发版纪律（version bump）

改 `package.json` 的 version 后**跑一次 build**：build 链首步
`scripts/gen-version.mjs` 重生成 `locale/{zh,en}.json` 显示元数据（卡片 title +
兼容窗口）。漏跑 = 卡片窗口文案停在旧值。

```sh
pnpm version patch --no-git-tag-version   # version 生命周期脚本自动重生成并 git add 生成物
git commit -am "chore(release): x.y.z"
pnpm publish                              # prepack 会自动完成构建
```

- `patch|minor|major` 是 `pnpm version` 的参数；`version` 生命周期脚本 argv 为
  空、`npm_package_version` 已是 bump 后新值。
- `pnpm version` 要求干净工作树；`pnpm run version` 只直跑脚本**不 bump**（误用）。
- 发版前的完整守护是 `node scripts/smoke-offline.mjs`（**0g 节**守护 locale
  元数据与 `src/version-gate.ts` 的窗口一致）。
- **【0.2.1 起已无提交期闸门】**：原 `src/client/build-version.ts` 的
  `BUILD_VERSION` 烧录、`scripts/check-version-sync.mjs` 与 `.githooks/pre-commit`
  都是为**陈旧代码检测**服务的；该检测已随上游修复整体拆除（卸载→重装不重启由
  harness 自行驱逐旧模块，2026-10-19 真机确认），闸门与生成步骤一并删除，
  **不要再加回来**。取证与回退记录见 `docs/harness-defect-workarounds.md`
  的历史防护回退块。

## 本地版本 bump 测试（Verdaccio）

「版本提示」弹窗（available）与「卸载重装免重启生效」的端到端验证不需要真发版：

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
- 启动诊断（2026-10-19 范式修复迁移）：verdaccio 用 `spawn(node, [bin, …])` +
  管道落盘启动（`detached + shell` 在 Windows 上会让孙进程的输出句柄失效、日志
  恒为 0 字节）；`on('error')`/`on('exit')` 让「启动即死」立即报错并贴出日志尾部；
  启动前预检 4873 是否被占用。故障排查细节见 `docs/pitfalls.md` §13。
- 弹窗本身在桌面壳里看（脚本准备完环境后人工确认两阶段：available 弹窗 → 重装
  后**立刻以新版本运行、且不弹任何陈旧对话框**）。

## 依赖版本与追新

harness 处于 0.x rc 快速迭代期，要点：

- **peer 与 dev 同一下限**：dev = 编译所用版本，peer = 运行时最低兼容声明。
  官方规则：every peer has a matching development range。
- **范围写法**：用 `^0.2.1-rc.1`（= 已实测的最低版本，peer 与 dev 写同一个）。
  不要用 `latest`/`*`（dist-tag 停在老线，反而拿到最旧），也不要精确钉死。caret
  在预发布线上只覆盖同一 `major.minor.patch` 的更高预发布号——**同 tuple 内追新
  （rc.1→rc.2）不需要改依赖，只抬 MAX**；**tuple 变化（0.2.0→0.2.1）或跨 minor
  迁移（0.1.7→0.2.0）时 caret 取不到新线**（实测 `^0.2.0-rc.1` 对 `0.2.1-rc.2`
  在默认解析下为 false → pnpm 装不到新线的类型面），**MIN/MAX 一并上移 + 依赖
  下限同步改写**。0.2.0 线**已不存在于本插件依赖面**的包（勿抄回）：
  `dsh-client-ui-settings`、`dsh-client-ui-primitives`、`dsh-plugin-manager`
  （UI 原语已复制进 `src/client/ui/`；自更新通道已退役）。
- **版本门禁（双边界窗口）**：`src/version-gate.ts` 声明支持窗口
  `[0.2.1-rc.1, 0.2.1-rc.2]`，窗口外软禁用。版本源 = 桌面 runtime 内的
  `@deepseek-ai/dsh` 包 version（**桌面单锚**：host 子进程 argv[2] =
  runtimeDir，读其 node_modules；不读 dsh-tools 等内嵌依赖——caret 实装版本
  可能高于本体）。软禁用 = 醒目日志 + 插件 no-op + client 停用说明面板
  （载荷含支持窗口/当前 harness 版本/插件版本，client 自查最新版）；
  `DSH_PLUGIN_TEMPLATE_STRICT=1` 恢复抛错 fail-loud。与 harness 内建 peer
  预检的分工：预检守「声明面」（caret 放行集宽于窗口），门禁守「验证面」
  （MAX 只写已实测 tag）——两者并存、缺一不可。**行为地图**：低于 MIN 的宿主
  由 harness 声明面在组合期拦截（静默跳过、插件无机会出面板）；窗口内正常加载；
  **高于 MAX 由本插件门禁软禁用并给出可执行的更新/降级指引**。0.2.1 起若声明
  `engines.dsh` 则它**单独决定、peers 被忽略**且执行点全在 import 之前——本插件
  **刻意不用**，理由与激活条件见 `docs/harness-defect-workarounds.md`。

**追新流程（手动，无脚本）**：

```sh
# ① 查目标线的最新版本（各 @deepseek-ai/dsh-* 与 harness 同步发版，查 dsh-tools 即可代表全线）：
pnpm view @deepseek-ai/dsh-tools versions --json

# ② 手改 package.json：全部 @deepseek-ai/dsh-* 的 peer 与 dev 改成同一个 ^<目标版本>
#    （当前依赖：^0.2.1-rc.1）
#    同 tuple 内追新（如 rc.1→rc.2）caret 已覆盖，无需改依赖，直接跳到 ④
#    仅当 MIN 也要上移（tuple 变化 / 跨线迁移 / 旧 MIN 从未实测 / 已不可安装）时才同步改写依赖下限
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
  `docs/compat-plan-<目标版本>.md` 填写并保留为执行记录（先例：
  `docs/compat-plan-0.2.1-rc.2.md`、`docs/compat-plan-0.2.0-rc.2.md`）。

## 版本更新提示

**插件更新 = 到「插件」页卸载本插件后重新安装；插件不做任何进程内安装**
（自更新通道已退役：进程内安装只会制造「新 UI + 旧内核」错配）。插件自身只做
一件事——**版本提示**：

- host 半 `src/update-state.ts` 四相状态机（idle/checking/available/up-to-date，
  纯内存态不落盘，host 半唯一权威源）在 apply 时静默查 registry `/<pkg>/latest`
  （npm → npmmirror 逐源降级，`shared/registry-latest.ts` + `shared/json-body.ts`
  按魔数自解压）；available 时 `shell.overlay` 条目 `GlobalNotice`（order 101，
  neutral NoticeModal）弹「卸载重装」提示并内嵌可复制安装 spec 命令片
  （`<包名>@<latest>`，CommandChip）；「我知道了」仅内存态关闭本次窗口，下次
  启动未更新则重弹。配置页更新条共用同一状态机（`template/checkUpdate` /
  `template/getUpdateState` RPC）。
- **0.2.1 起该闭环免重启**：harness 在卸载/重装时自行驱逐旧模块，装完即跑新
  版本（2026-10-19 真机复核确认）。第三方插件仍**没有**「一键更新」——那只对
  按需官方插件开放。
- **【0.2.1 起】陈旧代码提醒已整体拆除**：原「运行中模块自报版本 vs 构建期
  `BUILD_VERSION` 严格不等 → danger 对话框（两次提醒）」整条链路（含
  `StaleBanner.tsx`、`build-version.ts`、gen-version 烧录段、槽位注册、
  GlobalNotice 的 stale 让位、locales 文案、smoke 0d/6f 守护、
  `check-version-sync.mjs`、`.githooks/pre-commit`）已删除——它兜底的 harness
  缺陷已被上游修复。**不要再加回来**；取证与回退记录见
  `docs/harness-defect-workarounds.md`。

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
  随插件停用自动撤下。
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
  neverBundle 按 0.2.1 包集维护（client 半对 dsh-* 只有 type-only import，
  bundle 内零 dsh-* 运行时依赖——smoke 0 节守护）。
- **别追 dsh-\* 声明文件里的跨包 `import type`**：`tsconfig.json` 的
  `skipLibCheck: true` 会跳过 `.d.ts` 内部检查，而上游把 `dsh-api-remotes` /
  `dsh-client-store` / `dsh-attachment` 等只放在自己的 devDependencies（peer
  只有 `cordis`）——这是 harness 惯例，**不要补 devDep、更不要关
  `skipLibCheck`**（实测补齐后只是把缺失推给更下游）。唯一退化是
  `PluginPackageRef.availability → any`；真要用到该字段时在自己代码里本地声明
  联合类型并断言。详见 `docs/pitfalls.md` §7b。
- **版本窗口纪律**：MAX 只写已验证 tag；MIN = 已实测最低版本；同 tuple 追新只
  抬 MAX；tuple 变化/跨线迁移单点窗口 + 依赖下限同轮改写（详见 AGENTS.md
  硬约定）。

## 文件清单

```
├── src/index.ts                      # host 半入口：薄门禁 shim（两段式入口第一段）
├── src/main.ts                       # host 半业务主体（门禁全过后动态拉起：greet + 端点 + 更新检查）
├── src/spec.ts                       # 0.1.7 settings 模型（volatile Config + SETTINGS_NS + 句柄）
├── src/profile-gate.ts               # desktop-only profile 门禁（profileContext 指纹）
├── src/soft-disable.ts               # 软禁用装配（两门禁 + 重模块图加载失败共用出口）
├── src/version-gate.ts               # 版本门禁（[0.2.1-rc.1, 0.2.1-rc.2] + 桌面单锚 argv[2]）
├── src/package-info.ts               # 自身包清单读取（模块求值期缓存 = 运行中自报版本）
├── src/update-state.ts               # 版本提示状态机（四相，host 半唯一权威源，无安装相位）
├── src/remote.ts                     # Typert 端点（表驱动描述符 + TemplateRemote 服务）
├── src/css-modules.d.ts              # CSS Modules 导入声明
├── src/shared/contract.ts            # 业务 RPC 契约（ping/getConfig/saveConfig）
├── src/shared/update-contract.ts     # 版本提示 RPC 契约（checkUpdate/getUpdateState + 四相快照）
├── src/shared/disabled-flag.ts       # 软禁用标记契约（载荷含 runtimeVersion/plugin）
├── src/shared/version-compare.ts     # 严格 semver 比较（纯函数，双端共用）
├── src/shared/registry-latest.ts     # registry /latest 查询（npm→npmmirror 逐源降级，双端同构）
├── src/shared/json-body.ts           # 响应体健壮读取（按魔数自解压 + 诊断；宿主 fetch 缺陷规避）
├── src/client/index.ts               # client 半入口（plugins.bundle.config + shell.overlay）
├── src/client/locales.ts             # zh/en 词典（title = 卡片显示名，zh/en 同值）
├── src/client/api.ts                 # 浏览器 → host RPC（OpResult 统一错误面）
├── src/client/bundle-key.ts          # plugins.bundle.config 注册 key（= 包名，单源）
├── src/client/disabled-version-check.ts  # 停用面板的插件最新版自查（client 半）
├── src/client/TemplateSection.tsx    # 配置页卡片（settings 写回示范 + ping + 更新条）
├── src/client/TemplateDisabledSection.tsx  # 停用说明面板（harness 组 + 插件组）
├── src/client/GlobalNotice.tsx       # 新版本提示（shell.overlay，NoticeModal + 命令片）
├── src/client/CommandChip.tsx        # 可复制命令片
├── src/client/ui/                    # 官方 UI 原语复制件（Button/Modal/NoticeModal/Switch/Menu…）
├── src/client/*.module.css           # 样式（构建期物化自注入）
├── docs/derivation-guide.md           # 衍生指南（agent 执行用）：五张落点表 + 流程 + 验证门 + 实测坑
├── docs/compat-plan-0.2.1-rc.2.md    # 0.2.0→0.2.1 新线迁移执行记录（含陈旧检测拆除）
├── docs/compat-plan-0.2.0-rc.2.md    # 上一轮跨线迁移 + 范式收敛执行记录
├── docs/compat-plan-TEMPLATE.md      # 兼容迁移执行记录骨架（每次追新 cp 一份填写）
├── docs/compat-guide-0.1.2-to-0.1.5.md / -0.1.1-to-0.1.2.md  # 历史手册（已归档）
├── docs/module-map.md                # 模块清单 + smoke 守护清单
├── docs/pitfalls.md                  # 已踩过的坑（全文与取证）
├── docs/harness-defect-workarounds.md # 待复核的 harness 缺陷规避（含历史回退块 + engines.dsh 评估）
├── docs/versioning-and-update-plan.md # 历史方案存档（自更新章节已退役）
├── scripts/gen-version.mjs           # build 链首步（locale 显示元数据；BUILD_VERSION 已退役）
├── scripts/smoke-offline.mjs         # 离线全量守护（入口隔离/契约/锚点/状态机）
├── scripts/entry-guard-hook.mjs      # smoke 第 0 节的 resolve 钩子（拦截 dsh-*）
├── scripts/test-version-bump.mjs     # Verdaccio 版本 bump 测试台（bump/commit 双模式）
├── .gitattributes                    # 锁本文件 LF
├── tsdown.config.ts                  # client bundle 构建（CJS 工厂 + CSS 物化自注入）
├── tsconfig.json / tsconfig.build.json
├── cordis.patch.yml                  # bundle 层：安装时插入插件行
├── icon.svg                          # 插件页卡片图标
├── locale/zh.json / locale/en.json   # 生成文件勿手改（卡片显示元数据）
└── package.json                      # dsh.bundle + dsh.client 清单 + 发版脚本
```
