# 项目性质

本项目（dsh-plugin-template）是一个 **DeepSeek Harness（DSH）插件模板**——
插件开发的起手骨架，范式对齐 dsh-comfyui-based-tools 0.8.7（本轮迁移记录见
`docs/compat-plan-0.2.2-rc.1.md`）。宿主端（host）与客户端（client）两部分，
基于 cordis 插件框架，可直接发布 npm 或推 GitHub 供用户安装。

**支持范围（设计决策，长期有效）：本插件仅适配 DeepSeek 桌面版
（desktop profile）的 Harness runtime。** `dsh web`、自定义 profile、
SDK/headless 等形态一律不支持——启动时 profile 门禁（`src/profile-gate.ts`，
`profileContext.name === 'desktop'` 指纹）会自动软禁用本插件。写任何代码、
做任何取证与测试，都只需要考虑桌面 runtime 这一个形态，不要再为其他形态
写兼容代码（要改掉这个决策，删掉 `src/profile-gate.ts` 与 index.ts 的门禁一
即可，其余代码不感知）。

模板自带的可删改示例面（每个都演示一类范式）：

- **Host half**（`src/index.ts` 薄门禁 shim → `src/main.ts` 业务）：`greet`
  工具（含 settings 读取示范）+ `template/*` Typert 端点（ping/getConfig/
  saveConfig）；**0.2.2 起无任何更新检查/提醒**；
- **Client half**（`src/client/`）：`plugins.bundle.config` 配置页（问候语
  编辑器 = 0.1.7 settings 模型示范 + ping 演示）+ 版本不兼容停用说明面板；
- **插件页显示元数据**：`locale/{zh,en}.json` 的 `meta.title` /
  `meta.description` / `meta.detail`（0.2.2 详情区指向
  `assets/detail/{zh,en}.md`）；
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
  `pnpm run test-version-bump`（Verdaccio 版本更新测试台：验证插件页
  Versions 区的更新流程，需桌面壳人工确认）。
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
- **发版纪律 / 0.2.2 插件页显示元数据**：改 `package.json` 的 version 后必跑
  一次 build——build 链首步 `scripts/gen-version.mjs` 重生成
  `locale/{zh,en}.json` 的**包显示元数据**（卡片 title / description / detail
  与兼容窗口）和 `assets/detail/{zh,en}.md`（0.2.2 插件页详情区）；漏跑会让
  卡片窗口停在旧值。`locale/*.json` 与 `assets/detail/*.md` 都是**生成物，
  勿手改**——改文案改 `scripts/templates/detail.{zh,en}.md` 与
  `scripts/gen-version.mjs` 的 `DESCRIPTION`；`meta.description` 必须**非空**
  （产品介绍 + 带括号的兼容窗口，窗口由 gen-version 的 `{{compat}}` 占位符
  构建期替换），`meta.detail` 指向 `assets/detail/<lang>.md`（不声明则插件页
  回退渲染包内 README）；`package.json` 的 `files` 白名单已加 `assets`。
  bump 用 `pnpm version patch --no-git-tag-version`（version 生命周期脚本自动
  重生成并 `git add locale/`，随后 `git commit -am "chore(release): x.y.z"`）。
  发版前完整守护 = `node scripts/smoke-offline.mjs`（0g 节，含 meta.detail
  断言）。
  **【0.2.1 起已无提交期闸门】**——原 `.githooks/pre-commit` →
  `scripts/check-version-sync.mjs` 与 `src/client/build-version.ts` 的
  `BUILD_VERSION` 烧录，都是为**陈旧代码检测**服务的；该检测已随上游修复整体
  拆除（卸载→重装不重启由 harness 自行驱逐旧模块，2026-10-19 真机确认），
  闸门与生成步骤一并删除，**不要再加回来**（取证见
  `docs/harness-defect-workarounds.md` 的历史防护回退块）。

## 硬约定

- **0.2.2 起本插件不做任何版本更新提醒、不联网查 registry；版本检查与更新由官方
  插件页（plugin-manager 的 Versions 区）接管，用户走卸载重装/插件页更新**。
  方案 A 的删除清单、保留面（`src/shared/json-body.ts` 缺陷① 防御工具 / version
  gate / 停用面板 / `plugins.bundle.config` 槽位 / `greet` 工具与
  `template/ping`、`getConfig`、`saveConfig` 端点）与 smoke 守护见
  `docs/compat-plan-0.2.2-rc.1.md` §5.1，缺陷规避复核见
  `docs/harness-defect-workarounds.md`；自更新通道（0.2.0 已退役）与陈旧代码
  检测（0.2.1 已拆）都**不要加回来**。
- **依赖名单同线收敛**：peer 与 dev 的全部 `@deepseek-ai/dsh-*` 写同一个
  `^<已实测的最低版本>`（当前 `^0.2.2-rc.1`，门禁窗口
  `[0.2.2, 0.2.2]`，MIN/MAX 与运行时版本均只按 major.minor.patch 比较）
  ——窗口内没有"下限/上限"之分，
  **不要用范围去"夹"多条 harness 线**（预发布线内跨版本 API 破坏频繁，范围
  放宽救不了；caret 在 `includePrerelease` 下实测**可放行新线、不承诺跨线**，
  但跨线迁移只能单点、必须同轮把 peer + dev 与 MIN/MAX 一并上移）。
  `dsh.client.inject` 仍是 connection / locale / ui-plugin-manager 三项不变；
  tsdown `neverBundle` 按 0.2.2 的包集维护（**勿抄回已死包**：
  dsh-client-ui-settings / dsh-client-ui-primitives / dsh-plugin-manager 在
  0.2.0 线已不存在于本插件的依赖面；0.2.2 起随更新提醒删除
  `dsh-client-ui-layout` 的 peer + dev；UI 原语已复制进 `src/client/ui/`）。
  **同 tuple 内追新（如 0.2.2-rc.1→rc.2）默认只抬 MAX、不动依赖**——caret 已
  覆盖同 tuple 的更高预发布号；**MIN 上移时**（tuple 变化 / 跨线迁移 / 旧 MIN
  未验证 / 已不可安装）才把 peer + dev 的 caret 下限同步改写到新 MIN。
- **默认零版本分支**：窗口内不写任何 `typeof ctx.x.y === 'function'` /
  `??` 回落探测——探测本身就是双窗口时代的产物，API 直呼目标版本的形态。
  若将来重新引入多线，才按历史手册 `docs/compat-guide-0.1.1-to-0.1.2.md` 的
  特征探测范式来。
- **版本窗口**：`MAX_HARNESS_VERSION` 只写已验证 tag 的 major.minor.patch
  核心版本（追新验证通过后手动上调）；`MIN_HARNESS_VERSION` 保持已实测的
  最低版本（当前 `[0.2.2, 0.2.2]` **单点窗口**，MIN/MAX 与运行时版本都只按
  major.minor.patch 比较、忽略 `-rc.x` 等预发布后缀——0.2.1 线 → 0.2.2 线跨
  minor 迁移，MIN/MAX 同轮上移，取证见 `docs/compat-plan-0.2.2-rc.1.md`；
  peer precheck 在 `includePrerelease` 下不承诺跨线，双窗口 OR 范围夹线被上条
  硬约定禁止，tuple 变化/跨线迁移时 MIN/MAX 一并上移）；
  MIN 上移 = 收缩承诺面：tuple 变化与跨 minor 迁移必做（caret 硬约束）；同
  tuple 内只在旧 MIN **从未通过运行时验证**或**已不可安装**（从 npm versions
  移除）时做，且须同轮把依赖 caret 下限改写到新 MIN——**dist-tag 被接任本身
  不构成 MIN 上移理由**；每次兼容迁移按 `docs/compat-plan-TEMPLATE.md` 复制
  一份 `docs/compat-plan-<目标版本>.md` 填写并保留为执行记录。
- **行为地图（0.2.2 起）**：低于 MIN 的宿主由 harness 声明面在组合期拦截
  （静默跳过，插件无机会出面板）；窗口内正常加载；**高于 MAX 由本插件门禁
  软禁用并给出可执行的更新/降级指引**（这是保留自家 gate 而非改用
  `engines.dsh` 的核心价值）。
- **指引文件随窗口同步**：harness 版本或本插件支持窗口一变，`AGENTS.md`、
  `README.md`（「依赖版本与追新」一节）与 `src/version-gate.ts` 里所有版本
  表述必须同一轮改掉。留着旧窗口的指引，等于让后续 agent 照旧窗口写代码。
  `AGENTS.md` 注意 65536 字节预算（harness 指令注入超限**静默截断**）——
  长内容拆 `docs/` 分册，正文只留结论 + 指针。

## 版本兼容参考（写兼容代码前必读）

`docs/compat-plan-0.2.2-rc.1.md`：**0.2.1 线 → 0.2.2-rc.1 跨线迁移的执行
记录**（本轮决策：单点窗口 `[0.2.2-rc.1, 0.2.2-rc.1]`、方案 A 删除全部更新
提醒、采用插件页 `meta.detail` 详情区、本轮不 bump 插件版本；取证：无强制
API 适配，破坏面全在声明/依赖/基座/指引层）。

上一轮：`docs/compat-plan-0.2.1-rc.2.md`（0.2.0-rc.2 → 0.2.1-rc.2 新线迁移
执行记录：settings 模型 / plugins.bundle.config keyed 槽位 / shell.overlay /
ProfileContext / argv[2] 桌面锚；唯一硬改动 = `@deepseek-ai/dsh-invariants`
整体移除；同轮拆除陈旧代码检测）。更早：`docs/compat-plan-0.2.0-rc.2.md`
（0.1.5-rc.3 → 0.2.0-rc.2 跨线迁移 + 范式收敛；0.1.7 起
`dsh-client-ui-settings`、`dsh-client-ui-primitives` 不在本插件依赖面）。

历史手册（**已归档，勿按其写代码**）：`docs/compat-guide-0.1.2-to-0.1.5.md`
（0.1.2↔0.1.5 差异）、`docs/compat-guide-0.1.1-to-0.1.2.md`（双线窗口期方法论）。
`docs/versioning-and-update-plan.md` 的自更新与版本提示章节均已退役（仅存档）。

凡涉及 harness 版本兼容的工作——追新上调窗口、判断「某 API 在别的 harness
版本上能不能用」——**先 `git -C c:/deepseek-harness describe --tags` 确认
签出 tag，把源码 checkout 到目标 tag 逐 API 核实，再动手**；不要凭记忆写
兼容代码。

## 待复核的 harness 缺陷规避（追新适配时逐条复核；上游修好即回退）

**性质**：第一条规避不是产品设计，而是宿主缺陷留下的防御；第二条防护已按
回退清单拆除。抬 MAX 追新适配时**必须先复核新版本是否已修**。**0.2.2-rc.1
复核结论**：① `readJsonBody` 与 `accept-encoding: identity` **不回退**（undici
仍固定 `8.11.2`）；② 陈旧检测**保持拆除、不要加回**（`already-installed`
拒绝与 `reconcileProfile()`/`evictDropped` 仍在）；③ `engines.dsh` **继续不
采纳**（仍在 import 前单独决定并忽略 peers）；④ 宿主侧新增 `updateBundle()`
（plugin-manager:714）是可选能力，**不封禁插件自身提醒**——本轮删提醒是产品
决定（方案 A），非 harness 强制。完整表格与源码行号见
`docs/harness-defect-workarounds.md`。

- ① **宿主全局 `fetch` 可能不解压压缩响应** → 网络 JSON 一律走 `readJsonBody`
  （按魔数自解压 + 带诊断），请求侧显式 `accept-encoding: identity`；位置
  `src/shared/json-body.ts`（**当前无调用方，保留作防御工具**）；回归守护
  smoke 6f。**0.2.2-rc.1：不回退**（`web/web-fetch-http/package.json:38`、
  `util/http-proxy/package.json:33` 的 undici 仍是 `8.11.2`）。
- ② **卸载旧版→重装同名包（不重启）后 host 半继续跑旧代码** → 原
  `package-info.ts` + `StaleBanner.tsx` 防护**已整体拆除，不要再加回来**
  （上游 `already-installed` 拒绝
  `packages/boot/plugin-manager/src/index.ts:634/639/888`、
  `reconcileProfile()`/`evictDropped`
  `packages/boot/hmr/src/index.ts:930,977-989` 仍在）；残留限制
  （`link:` 开发路径）见 `docs/harness-defect-workarounds.md`。
- **`engines.dsh` 已评估、暂不采用**：声明后它单独决定、peers 被忽略，三个
  执行点全在 import 之前——只能拒绝、不能解释，本插件的停用面板与可执行指引
  会全部失效。0.2.2-rc.1 复核：机制原样生效 → **继续不采纳**（激活条件与采纳
  硬约束见 `docs/harness-defect-workarounds.md`）。

## 已踩过的坑（不要再踩）

详细叙述与取证见 `docs/pitfalls.md`。一句话索引：

1. client 槽位**"未声明即静默不触发"**——槽位类改动只能逐槽位点名核对；
   `plugins.bundle.config` 的 key 写错同样静默（smoke 0c 守护）。
2. `Config` 必须从**入口模块值导出**（0.1.7 起 Loader 只认领 apply 所在入口），
   放 spec.ts 里不 re-export 会让 `apply(ctx, config)` 的 config 变 undefined。
3. 0.1.7 settings 只放行 **volatile** 字段写回；面板写回必须**整段
   `replace`**（深合并 update 删不掉键）。
4. 宿主全局 fetch 的压缩体坑：网络 JSON 一律 `readJsonBody`（同缺陷①；
   `src/shared/json-body.ts` 保留作防御工具，当前无调用方）。
5. **【0.2.2 起随更新提醒退役】跨源请求别自己写 `cache-control`/`pragma`**
   （浏览器会升级成 OPTIONS 预检）；`fetch(cache:'no-store')` 不触发预检但
   **照样**会带这两个头——浏览器路径一个缓存指令都不加，host 半才经 noCache
   选项加。原候选源查询 `registry-latest.ts` 已删；**将来 host 侧重新发起
   网络 JSON 请求时此纪律仍适用**（同缺陷①）。
6. client 与 host 共用的依赖**不能进 `dependencies`**（tsdown 外部化 + client
   模块表没有它 = **client 半整体死亡**）——客户端要用的依赖进 devDependencies
   让 tsdown 打进 bundle（clsx 同款），确需双端共用的再评估 alwaysBundle。
7. `dsh.client` 声明是包元数据，扫描缓存永不过期：改它要重启 harness。
8. **别追 dsh-\* 声明文件里的跨包 `import type`**：`skipLibCheck` 跳过 `.d.ts`
   内部检查，上游把这些包放在自己的 devDependencies（peer 只有 cordis）——
   补 devDep 只会把缺失推给更下游，**不要关 `skipLibCheck`**；唯一退化是
   `PluginPackageRef.availability → any`（见 docs/pitfalls.md §7b 与
   `docs/compat-plan-0.2.1-rc.2.md` §7.1）。
9. peer precheck 的 caret 在 `includePrerelease` 下实测可放行新线、不承诺跨线
   ——tuple 变化/跨线迁移仍必须同轮重写 peer/dev 与 MIN/MAX（操作结论不变）。
10. 发版漏 build 不再误报「陈旧代码」（该机制已拆除），但会让**卡片兼容窗口
    文案 / `meta.detail` 详情停在旧值**——改 `version-gate.ts` 或详情文案后
    仍必须跑一次 build。
11. **0.2.2 插件页详情区**：`meta.description` 必须非空（经验上空串会弃整份
    locale）、`meta.detail` 不声明会回退渲染包内 README；`assets/detail/*.md`
    与 `locale/*.json` 都是生成物，改文案改 `scripts/templates/detail.*.md`
    与 gen-version 的 `DESCRIPTION`（`{{compat}}` 占位符）；`package.json` 的
    `files` 加 `assets`。详见 `docs/compat-plan-0.2.2-rc.1.md` §5.3 / §7。

## DeepSeek Harness 源代码

本机的 DeepSeek Harness 源代码在 **`c:/deepseek-harness`**。

当需要查阅 DSH 的内部实现、插件 API、系统提示词组装、工具/上下文注入机制时，
直接去该目录下阅读源码（`packages/` 为各功能包，`apps/` 为应用入口），不要凭空
猜测行为。

**注意签出版本**：该仓库用 tag 标记发布。**本模板（及其派生插件）的兼容窗口是
单点 `[0.2.2, 0.2.2]`（MIN = MAX = `0.2.2`，按 major.minor.patch 比较，
已实测 `0.2.2-rc.1`；0.2.1 线 → 0.2.2 线跨 minor 迁移）**；typecheck /
编译锚点 = `dsh-v0.2.2-rc.1`，peer 与 dev 写同一个 `^0.2.2-rc.1`，门禁在版本
出窗口时软禁用。分析与实现一律以
`git checkout dsh-v0.2.2-rc.1` 为准；本轮迁移记录见
`docs/compat-plan-0.2.2-rc.1.md`。本机桌面版已内置 `0.2.2-rc.1` /
node `24.21.0`；基座 cordis `^4.1.0` / schemastery `^3.19.0` /
cosmokit `^1.9.0` / cordis-plugin-group·include `~1.1.0`，
`engines.node >=24.9`（源码精确 `>=24.9.0`）。0.2.0-rc.2 起 CLI
`rejectElectronProfile` 拒绝 CLI 启动 desktop profile——桌面真机验证只能走桌面壳。
进行版本相关的兼容性分析前，先 `git -C c:/deepseek-harness describe --tags`
确认签出的 tag 与目标 harness 版本一致，不一致先
`git fetch --tags && git checkout <tag>`——用旧版源码分析新版行为会得出滞后
结论（本机 clone 曾落后 5 个 tag，一度误判"最新 = 0.2.0-rc.2"）。

常用参考位置：

- `c:/deepseek-harness/AGENTS.md` — DSH 仓库自身的开发约定
- `c:/deepseek-harness/docs/` — 内部设计文档
- 范式插件（本模板的取证来源）：`c:/agentProjects/dsh-comfyui-based-tools`
