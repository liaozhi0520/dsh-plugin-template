# 项目性质

本项目（dsh-plugin-template）是一个 **DeepSeek Harness（DSH）插件模板**——
插件开发的起手骨架，范式对齐 dsh-comfyui-based-tools 0.8.7（见 `docs/compat-plan-0.2.1-rc.2.md`
的迁移记录）。宿主端（host）与客户端（client）两部分，基于 cordis 插件框架，
可直接发布 npm 或推 GitHub 供用户安装。

**支持范围（设计决策，长期有效）：本插件仅适配 DeepSeek 桌面版
（desktop profile）的 Harness runtime。** `dsh web`、自定义 profile、
SDK/headless 等形态一律不支持——启动时 profile 门禁（`src/profile-gate.ts`，
`profileContext.name === 'desktop'` 指纹）会自动软禁用本插件。写任何代码、
做任何取证与测试，都只需要考虑桌面 runtime 这一个形态，不要再为其他形态
写兼容代码（要改掉这个决策，删掉 `src/profile-gate.ts` 与 index.ts 的门禁一
即可，其余代码不感知）。

模板自带的可删改示例面（每个都演示一类范式）：

- **Host half**（`src/index.ts` 薄门禁 shim → `src/main.ts` 业务）：`greet`
  工具（含 settings 读取示范）+ `template/*` Typert 端点 + 启动更新检查；
- **Client half**（`src/client/`）：`plugins.bundle.config` 配置页（问候语
  编辑器 = 0.1.7 settings 模型示范 + ping 演示 + 插件更新条）+ `shell.overlay`
  版本提醒条目（GlobalNotice）+ 停用说明面板；
- **Host↔Client 调用**（`src/remote.ts` + `src/client/api.ts`）：表驱动描述符
  的远程调用形态（为什么是手写描述符而非官方 `@Remote` 装饰器，见 remote.ts
  头注释）。

- **衍生新插件**：按 `docs/derivation-guide.md` 执行（五张落点表 + 操作流程 +
  验证门 + 实测坑清单；README「使用本模板」是其概览）——该指南经端到端实测
  （衍生 `@demo/dsh-demo-greeter`，文件差异计数见指南 §2 口径），衍生过程中
  发现的新落点/新坑必须回填该指南。

- 双入口：host 半 `src/index.ts` → `lib/index.js`；client 半 `src/client/` →
  `lib/client.js`。双端共享契约在 `src/shared/`（**禁 Node 依赖**——client
  bundle 会内联本目录）。
- 常用命令：`pnpm run build`（gen-version → tsc → tsdown）/ `pnpm run
  typecheck` / `pnpm run smoke-offline`（离线全量守护，零费用）/
  `pnpm run test-version-bump`（Verdaccio 版本弹窗测试台，需桌面壳人工验证
  弹窗）。
- **改任何代码（host/client）后必须重启 DeepSeek Harness 才生效**（本插件
  不接热加载——桌面热更不可用；`link:` 本地链接 + 手工 build 不经过插件页
  操作时，host 半仍持进程内旧模块，开发期一律「改码必重启」）。

## 结构与构建（模块清单见 `docs/module-map.md`）

- **两段式入口**：host 半入口是薄门禁 shim（`name`/`inject`/`Config` + 两道
  门禁 + 门禁全过后动态 import `src/main.ts`）。cordis Loader 先完整求值入口
  的静态 import 图再 apply——门禁若在重模块图里，未验证 harness 版本的 API
  漂移会让入口 import 失败（Loader catch → entry 停摆），软禁用与 client 停用
  面板将没有机会运行。
- **静态图硬约束**：`src/index.ts` 只允许 node builtins + schemastery，**禁止
  import 任何 `@deepseek-ai/dsh-*` 运行时模块**（smoke-offline 第 0/0b 节守护：
  dsh-* 拦截钩子 + 入口图逐文件白名单，往薄入口加任何 import 都会显式破冒烟）。
  `Config` 必须从入口**值导出**（Loader 只认领 apply 所在入口的 Config 导出；
  0.1.7 settings 模型踩坑，见 docs/pitfalls.md）。
- **发版纪律**：改 `package.json` 的 version 后跑一次 build——build 链首步
  `scripts/gen-version.mjs` 负责重生成 `locale/{zh,en}.json` 的**包显示元数据**
  （「插件」页卡片的 title 与兼容窗口），漏跑会让卡片窗口停在旧值；bump 用
  `pnpm version patch --no-git-tag-version`（version 生命周期脚本自动重生成并
  `git add locale/`，随后 `git commit -am "chore(release): x.y.z"`）。发版前
  完整守护 = `node scripts/smoke-offline.mjs`（0g 节）。
  **【0.2.1 起已无提交期闸门】**——原 `.githooks/pre-commit` →
  `scripts/check-version-sync.mjs` 与 `src/client/build-version.ts` 的
  `BUILD_VERSION` 烧录，都是为**陈旧代码检测**服务的；该检测已随上游修复整体
  拆除（卸载→重装不重启由 harness 自行驱逐旧模块，2026-10-19 真机确认），
  闸门与生成步骤一并删除，**不要再加回来**（取证见
  `docs/harness-defect-workarounds.md` 的历史防护回退块）。

## 硬约定

- **插件更新 = 卸载重装；插件只做版本提示（非阻断）**
  （范式 0.8.0 起，自更新安装通道整体删除——本模板随之退役）：不声明
  `'pluginManager'`、不依赖 `@deepseek-ai/dsh-plugin-manager`，**不得再引入
  任何进程内安装通道**（不绕道 pnpm、不用 installBundle——重装后进程内旧
  模块实例的替换由 harness 自己负责（0.2.1 起已修，见「待复核的 harness
  缺陷规避」第二条的历史块），自更新只会制造「新 UI + 旧内核」的错配；
  卸载重装 + 版本提示弹窗才是完整闭环）。要点：
  - RPC 面仅 `template/checkUpdate`/`template/getUpdateState`（端点名保持
    不变以兼容升级过渡窗口的旧 client）；
  - 版本检查：registry `/<pkg>/latest` 直连，候选源固定官方兜底计划
    （npm → npmmirror，`shared/registry-latest.ts` 逐源降级；网络 JSON 一律走
    `shared/json-body.ts` 的 `readJsonBody`，见缺陷规避第一条）；状态机
    `src/update-state.ts` 驻 host 半（client 半重挂不丢状态），相位
    idle/checking/available/up-to-date，**无任何安装相位**；
  - 发现新版本：弹窗提示「到插件页卸载本插件后重新安装」（0.2.1 起该两步
    **免重启即生效**）——client/GlobalNotice.tsx 为 **shell.overlay 槽位条目**
    （id template-update-notice），渲染 NoticeModal（neutral，复制的 Modal
    本体），内嵌可复制安装 spec 命令片（CommandChip，`<包名>@<latest>`）；
    「我知道了」仅关闭本次窗口（内存态、零持久化），下次启动 DSH 未更新则
    重弹；
  - **`currentVersion` 口径钉子**：getUpdateState 快照的该字段**恒填「运行中
    模块自报版本」**——package-info.ts 在模块求值期（import 时）一次性读自身
    package.json 并缓存（`selfVersionOrNull`；包损坏 = null 按「版本未知」
    回显）。它只是更诚实的「当前版本」口径（提示文案与停用面板回显），
    **不再**用于任何构建期比对。
  - **【0.2.1 起】陈旧代码检测已整体拆除（不要再加回来）**：原
    「`StaleBanner.tsx` 按 `currentVersion ≠ BUILD_VERSION` 弹 danger 对话框、
    共提醒两次」的整套机制——连同 `src/client/build-version.ts`、
    gen-version 的烧录段、client 入口的 `template-stale-banner` 槽位注册、
    GlobalNotice 的 stale 让位、locales 的 staleBanner 文案、smoke 0d/6f
    守护、`scripts/check-version-sync.mjs` 与 `.githooks/pre-commit`——均已
    删除。理由：它兜底的 harness 缺陷（卸载重装不重启时 host 半继续跑旧代码）
    已被上游修复并经 2026-10-19 真机复核确认；取证与回退记录见
    `docs/harness-defect-workarounds.md` 的历史防护回退块。**已知限制（不再用
    代码兜底）**：`link:` 本地链接 + 手工 build 而不经过插件页操作时，host 半
    仍持进程内旧模块——开发期照旧「改码/改版本后重启 DeepSeek Harness」。
- **依赖名单同线收敛**：peer 与 dev 的全部 `@deepseek-ai/dsh-*` 写同一个
  `^<已实测的最低版本>`（当前 `^0.2.1-rc.1`——窗口 `[0.2.1-rc.1, 0.2.1-rc.2]`
  的下限；实测该下限在**默认解析语义**下也能落到 0.2.1-rc.2（同 tuple
  预发布），而旧的 `^0.2.0-rc.1` 取不到 rc.2 的类型面——这是 tuple 变化时
  必须改写下限的硬理由）——窗口内没有"下限/上限"之分，
  **不要用范围去"夹"多条 harness 线**（预发布线内跨版本 API 破坏频繁，范围
  放宽救不了；caret 本身不跨 minor 线，跨线迁移只能单点）；`dsh.client.inject`
  与 tsdown `neverBundle` 按 0.2.1 的包集维护（**勿抄回已死包**：
  dsh-client-ui-settings / dsh-client-ui-primitives / dsh-plugin-manager 在
  0.2.0 线已不存在于本插件的依赖面；UI 原语已复制进 `src/client/ui/`，不再
  依赖 ui-primitives 包）。
  **同 tuple 内追新（如 0.2.1-rc.1→rc.2）默认只抬 MAX、不动依赖**——caret 已
  覆盖同 tuple 的更高预发布号；**MIN 上移时**（tuple 变化 / 跨线迁移 / 旧 MIN
  未验证 / 已不可安装）才把 peer + dev 的 caret 下限同步改写到新 MIN。
- **默认零版本分支**：窗口内不写任何 `typeof ctx.x.y === 'function'` /
  `??` 回落探测——探测本身就是双窗口时代的产物，API 直呼目标版本的形态。
  若将来重新引入多线，才按历史手册 `docs/compat-guide-0.1.1-to-0.1.2.md` 的
  特征探测范式来。
- **版本窗口**：`MAX_HARNESS_VERSION` 只写已验证 tag（追新验证通过后手动
  上调）；`MIN_HARNESS_VERSION` 保持已实测的最低版本（当前
  `[0.2.1-rc.1, 0.2.1-rc.2]`——rc.2 为实测基线（本机桌面版内置版本），rc.1 为
  **用户指定纳入**的同 tuple 相邻预发布（取证覆盖、非单独实机验收，取证见
  `docs/compat-plan-0.2.1-rc.2.md`）；peer precheck 的 caret 数学上不跨 minor
  线，双窗口需 OR 范围夹线被上条硬约定禁止，tuple 变化/跨线迁移时 MIN/MAX
  一并上移）；
  MIN 上移 = 收缩承诺面：tuple 变化与跨 minor 迁移必做（caret 硬约束）；同
  tuple 内只在旧 MIN **从未通过运行时验证**或**已不可安装**（从 npm versions
  移除）时做，且须同轮把依赖 caret 下限改写到新 MIN——**dist-tag 被接任本身
  不构成 MIN 上移理由**；每次兼容迁移按 `docs/compat-plan-TEMPLATE.md` 复制
  一份 `docs/compat-plan-<目标版本>.md` 填写并保留为执行记录。
- **行为地图（0.2.1 起）**：低于 MIN 的宿主由 harness 声明面在组合期拦截
  （静默跳过，插件无机会出面板）；窗口内正常加载；**高于 MAX 由本插件门禁
  软禁用并给出可执行的更新/降级指引**（这是保留自家 gate 而非改用
  `engines.dsh` 的核心价值）。
- **指引文件随窗口同步**：harness 版本或本插件支持窗口一变，`AGENTS.md`、
  `README.md`（「依赖版本与追新」一节）与 `src/version-gate.ts` 里所有版本
  表述必须同一轮改掉。留着旧窗口的指引，等于让后续 agent 照旧窗口写代码。
  `AGENTS.md` 注意 65536 字节预算（harness 指令注入超限**静默截断**）——
  长内容拆 `docs/` 分册，正文只留结论 + 指针。

## 版本兼容参考（写兼容代码前必读）

`docs/compat-plan-0.2.1-rc.2.md`：**0.2.0-rc.2 → 0.2.1-rc.2 新线迁移的执行
记录**（逐 API 复核表：settings 模型 / plugins.bundle.config keyed 槽位 /
shell.overlay / ProfileContext / argv[2] 桌面锚；唯一硬改动 =
`@deepseek-ai/dsh-invariants` 及其 `./invariant` 子路径整体移除，照官方指南
`docs/upgrade-guide/v0.2.0-rc.2/remove-runtime-invariants/` 删除；同轮拆除
陈旧代码检测）。

上一轮：`docs/compat-plan-0.2.0-rc.2.md`（0.1.5-rc.3 → 0.2.0-rc.2 跨线迁移 +
范式收敛；0.1.7 起 `dsh-client-ui-settings`、`dsh-client-ui-primitives` 不在
本插件依赖面——勿引用）。

历史手册（**已归档，勿按其写代码**）：`docs/compat-guide-0.1.2-to-0.1.5.md`
（0.1.2↔0.1.5 差异）、`docs/compat-guide-0.1.1-to-0.1.2.md`（双线窗口期方法论）。
`docs/versioning-and-update-plan.md` 的自更新机制章节已被上述退役范式取代
（仅存档）。

凡涉及 harness 版本兼容的工作——追新上调窗口、判断「某 API 在别的 harness
版本上能不能用」——**先 `git -C c:/deepseek-harness describe --tags` 确认
签出 tag，把源码 checkout 到目标 tag 逐 API 核实，再动手**；不要凭记忆写
兼容代码。

## 待复核的 harness 缺陷规避（追新适配时逐条复核；上游修好即回退）

**性质**：下面第一条规避**不是产品设计**，而是宿主缺陷留下的防御（防御性
规避，真因未坐实）；第二条防护**已按回退清单拆除**，保留记录供复核与追溯。
抬 MAX 追新适配时**必须先复核新版本是否已修**，修好了就按"回退动作"把规避
改回正常代码（历史规避不清会沉淀成永久复杂度）。完整表格见
`docs/harness-defect-workarounds.md`。

- ① **宿主全局 `fetch` 可能不解压压缩响应**（头全 null、压缩体不解压，
  `response.json()` 只报 `Unexpected token …`）→ 规避：网络 JSON 一律走
  `readJsonBody`（按魔数自解压 + 带诊断），请求侧显式 `accept-encoding:
  identity`；位置 `src/shared/json-body.ts` / `registry-latest.ts`；回归守护
  smoke 6f（accept-encoding 契约）。**0.2.0-rc.1 / rc.2 复核结论（范式侧）：
  复现条件原样存在，不回退。** **0.2.1-rc.2 复核：仍不回退**——undici 由
  `^8.10.0` 固定为 `8.11.2`（仍是 8）、宿主无 global-fetch polyfill。
- ② **卸载旧版→重装同名包（不重启）后 host 半继续跑旧代码**（Node ESM
  模块缓存 + `installBundle` 的 restart-required 判据可被"先卸载"绕过）→
  原防护 = `package-info.ts` 模块求值期缓存自身版本 + `StaleBanner.tsx` 严格
  不等提醒（共两次、可关闭、零持久化），回归守护 smoke 0d/6f。
  **0.2.1-rc.2 复核：上游已修**——`plugin-manager` 对已安装包在跑 pnpm 之前
  即拒绝 `already-installed`，`hmr` 的 `reconcileProfile()` 比对已加载模块与
  磁盘并在 `finally` 里驱逐；**2026-10-19 真机复核确认**（卸载 → 重装不重启
  后不再跑旧 host 代码）。**据此已按回退清单整体拆除**（`StaleBanner.tsx`、
  `build-version.ts`、gen-version 烧录段、槽位注册、GlobalNotice 让位、
  locales 文案、smoke 0d/6f 守护、`check-version-sync.mjs` +
  `.githooks/pre-commit` 全删；`currentVersion` 恒填保留作「当前版本」口径）。
  **不要再加回来**；残留限制（`link:` 开发路径）见
  `docs/harness-defect-workarounds.md`。
- **`engines.dsh` 已评估、暂不采用**：0.2.1 起声明了它则**它单独决定、peers
  被忽略**，三个执行点（安装期 / 运行时 bundle 级 / 运行时行级）全在 import
  之前——只能拒绝、不能解释，本插件的停用面板与可执行指引会全部失效。激活
  条件与采纳硬约束见 `docs/harness-defect-workarounds.md`。

## 已踩过的坑（不要再踩）

详细叙述与取证见 `docs/pitfalls.md`。一句话索引：

1. client 槽位**"未声明即静默不触发"**——槽位类改动只能逐槽位点名核对；
   `plugins.bundle.config` 的 key 写错同样静默（smoke 0c 守护）。
2. `Config` 必须从**入口模块值导出**（0.1.7 起 Loader 只认领 apply 所在入口），
   放 spec.ts 里不 re-export 会让 `apply(ctx, config)` 的 config 变 undefined。
3. 0.1.7 settings 只放行 **volatile** 字段写回；面板写回必须**整段
   `replace`**（深合并 update 删不掉键）。
4. 宿主全局 fetch 的压缩体坑：网络 JSON 一律 `readJsonBody`（同缺陷①）。
5. **跨源请求别自己写 `cache-control`/`pragma`**（浏览器会升级成 OPTIONS
   预检）；`fetch(cache:'no-store')` 不触发预检但**照样**会带这两个头——
   浏览器路径一个缓存指令都不加，host 半才经 noCache 选项加。
6. client 与 host 共用的依赖**不能进 `dependencies`**（tsdown 外部化 + client
   模块表没有它 = **client 半整体死亡**）——客户端要用的依赖进 devDependencies
   让 tsdown 打进 bundle（clsx 同款），确需双端共用的再评估 alwaysBundle。
7. `dsh.client` 声明是包元数据，扫描缓存永不过期：改它要重启 harness。
8. **别追 dsh-\* 声明文件里的跨包 `import type`**：`skipLibCheck` 跳过 `.d.ts`
   内部检查，上游把这些包放在自己的 devDependencies（peer 只有 cordis）——
   补 devDep 只会把缺失推给更下游，**不要关 `skipLibCheck`**；唯一退化是
   `PluginPackageRef.availability → any`（见 docs/pitfalls.md §7b 与
   `docs/compat-plan-0.2.1-rc.2.md` §7.1）。
9. peer precheck 的 caret 数学上不跨 minor 线——tuple 变化/跨线迁移必须同轮
   重写 peer/dev。
10. 发版漏 build 不再误报「陈旧代码」（该机制已拆除），但会让**卡片兼容窗口
    文案停在旧值**——改 `version-gate.ts` 后仍必须跑一次 build。

## DeepSeek Harness 源代码

本机的 DeepSeek Harness 源代码在 **`c:/deepseek-harness`**。

当需要查阅 DSH 的内部实现、插件 API、系统提示词组装、工具/上下文注入机制时，
直接去该目录下阅读源码（`packages/` 为各功能包，`apps/` 为应用入口），不要凭空
猜测行为。

**注意签出版本**：该仓库用 tag 标记发布。**本模板（及其派生插件）的兼容窗口是
双边界 `[0.2.1-rc.1, 0.2.1-rc.2]`（MIN = 用户指定纳入的同 tuple 相邻预发布，
MAX = 已实测验证的最新 tag 0.2.1-rc.2，同属 0.2.1 预发布线）**；
typecheck / 编译锚点 = 0.2.1-rc.2，peer 与 dev 写同一个 `^0.2.1-rc.1`
（caret 恰好覆盖 `{rc.1, rc.2}`），门禁在版本出窗口时软禁用。分析与实现一律以
`git checkout dsh-v0.2.1-rc.2` 为准；本轮迁移记录见
`docs/compat-plan-0.2.1-rc.2.md`。0.2.0-rc.2 起 CLI `rejectElectronProfile`
拒绝 CLI 启动 desktop profile——桌面真机验证只能走桌面壳。
进行版本相关的兼容性分析前，先 `git -C c:/deepseek-harness describe --tags`
确认签出的 tag 与目标 harness 版本一致，不一致先
`git fetch --tags && git checkout <tag>`——用旧版源码分析新版行为会得出滞后
结论（本机 clone 曾落后 5 个 tag，一度误判"最新 = 0.2.0-rc.2"）。

常用参考位置：

- `c:/deepseek-harness/AGENTS.md` — DSH 仓库自身的开发约定
- `c:/deepseek-harness/docs/` — 内部设计文档
- 范式插件（本模板的取证来源）：`c:/agentProjects/dsh-comfyui-based-tools`
