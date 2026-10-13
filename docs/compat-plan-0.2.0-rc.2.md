# compat-plan-0.2.0-rc.2：0.1.5-rc.3 → 0.2.0-rc.2 跨线迁移 + 范式收敛执行记录

> 依据 `docs/compat-plan-TEMPLATE.md` 骨架填写；本迁移同时吸收范式插件
> dsh-comfyui-based-tools 在同区间的范式演进（两段式入口 / 桌面专用 / 0.1.7
> settings 模型 / 插件页配置页 / 自更新退役 / 官方原语复制件 / 显示元数据），
> 对应范式侧提交链 abe42fa → 551a2bd → 36adec4 → 40ff057 → 01395e9 →
> bdcd8de → c7d6105（逐提交取证见范式仓 docs/ 同名 compat-plan 四份）。

## 0. 执行状态

| 项 | 值 |
| --- | --- |
| 迁移前窗口 | `[0.1.5-rc.1, 0.1.5-rc.3]`（peer/dev `^0.1.5-rc.1`） |
| 迁移后窗口 | `[0.2.0-rc.1, 0.2.0-rc.2]`（peer/dev `^0.2.0-rc.1`，schemastery `^3.18.4`） |
| harness 签出 | `c:/deepseek-harness` @ `dsh-v0.2.0-rc.2`（`git describe` 已核对） |
| 编译验证 | `pnpm typecheck` / `pnpm build` 全绿（0.2.0-rc.2 dev 依赖实装） |
| client bundle 指纹 | dsh-* 运行时 require = 0；CSS 物化自注入 = 6 处；BUILD_VERSION 已烧录 |
| 待办 | 桌面真机端到端（插件页卡片 / 配置页 / greet / 提示弹窗）为常规人工待验 |

## 1. 调研总结论（破坏面 → 对本插件的实际影响）

1. **0.1.7 settings 重构**（范式 abe42fa 取证）：`settings.register`/`SettingsScope`
   移除 → cordis Loader 约定名的 `Config` schema（**必须从入口模块值导出**，
   否则 `apply` 的 config 为 undefined）+ 全字段 `volatile`（Volatile 类型从
   `@deepseek-ai/cosmokit` 导入，npm cordis 4.0.2 构建未 re-export）+ 面板写回
   走 `ctx.settings.replace(ns, section)` 整段替换 + `configure({ auto: false })`
   退出自动配置页。**影响：spec.ts 新建、main.ts 设置句柄、Config 迁移**。
2. **0.1.7 包面变化**：`dsh-client-ui-settings`、`dsh-client-ui-primitives` 在
   0.2.0 线已不存在（范式 node_modules 实证）——模板的 settings.section 槽位与
   ui-primitives 运行时依赖必须同 commit 内替换，无法分阶段过渡。
   替代：配置页迁 `plugins.bundle.config` keyed 槽位（`dsh-client-ui-plugin-manager`，
   0.2.0-rc.2 harness README 60-112 行取证：key 逐字等于包名）；UI 原语复制进
   `src/client/ui/`（官方 primitives 0.2.0-rc.1 字节级复制，范式 01395e9 复核
   rc.2 仍字节一致）。
3. **0.2.0-rc.1 跨 minor**（范式 40ff057）：插件面零变化，单点窗口 MIN/MAX 一并
   上移（peer precheck 的 caret 数学上不跨 minor 线）。
4. **0.2.0-rc.2 同线追新**（范式 01395e9）：只抬 MAX 型，插件面零 breaking；
   rc.2 CLI 新增 `rejectElectronProfile`（桌面 profile 不能再从 CLI 启动——
   真机验证只能走桌面壳）。
5. **桌面专用 runtime**（范式 36adec4）：`profileContext.name === 'desktop'`
   指纹（app-boot profile.ts:688 `name: basename(dir)` + 桌面 launcher 写死
   `profiles/desktop`）；版本锚收敛为 argv[2]=runtimeDir 单锚
   （apps/desktop/src/host-process.ts spawn 契约）。
6. **自更新退役**（范式 bdcd8de）：进程内安装通道整段删除（Node ESM 模块缓存
   缺陷——重装后旧模块继续运行，自更新制造「新 UI + 旧内核」错配）；只留
   checkUpdate/getUpdateState + shell.overlay 提示（GlobalNotice/CommandChip）+
   StaleBanner 陈旧提醒（currentVersion=package-info 求值期缓存 vs 构建期
   BUILD_VERSION 严格不等）。

## 2. 必改清单（P0，已全部落地）

- **package.json**：peer/dev 全量 `^0.2.0-rc.1`；−ui-settings/−ui-primitives/
  −schemastery 3.18.1；+dsh-client-ui-plugin-manager/+dsh-settings/+cosmokit
  （dev，type-only）+clsx（dev，ui 原语同款）/schemastery `^3.18.4`；
  `dsh.client.inject` = connection/locale/ui-plugin-manager；+`icon`、
  exports/files + `locale/*.json`；scripts：build 链首步 gen-version、`version`
  生命周期（gen-version + git add）。
- **两段式入口**：src/index.ts 重写为薄门禁 shim（静态图仅 node builtins +
  schemastery；Config 值导出；profile → version 两道门禁 → 动态 import
  main.ts）；业务迁 src/main.ts；新增 profile-gate/soft-disable/package-info。
- **version-gate.ts**：窗口 `[0.2.0-rc.1, 0.2.0-rc.2]`；桌面单锚 argv[2]；
  compareVersions 迁至 shared/version-compare.ts（client 复用）。
- **自更新退役**：删 src/self-update.ts 与 updateSelf RPC；update-state 收敛
  四相（idle/checking/available/up-to-date，currentVersion 恒自报口径）；删
  UpdateBubble，新增 GlobalNotice/StaleBanner/CommandChip（shell.overlay
  ×2：order 100/101）。
- **配置页迁移**：client 注册 `plugins.bundle.config`（key = BUNDLE_KEY =
  包名，bundle-key.ts 单源）；正常/停用两路径；停用面板载荷扩展
  `{runtimeVersion, plugin}` + client 自查 registry（disabled-version-check.ts）。
- **构建件**：tsdown CSS 虚拟模块改官方 styleInjectionModule 同构（物化期
  自注入 + data-plugin-css 去重守卫）；neverBundle 收敛为 react 集；
  gen-version.mjs（BUILD_VERSION + locale 显示元数据，title 单一来源强制
  zh/en 同值——首跑即被守卫拦截并修正，守卫有效）。
- **删**：cordis.dev.yml、scripts/dev.mjs（HMR 拆除，桌面热更不可用——
  与 StaleBanner「改码必重启」纪律一致）。

## 3. 版本窗口决策

MIN = 0.2.0-rc.1（跨线迁移落定；0.1.5 线支持随桌面专用决策一并放弃——
0.1.5 时代无 profileContext 指纹与 plugins.bundle.config，本模板 API 面已
不兼容）；MAX = 0.2.0-rc.2（本机 harness 仓签出该 tag 逐 API 复核通过 +
范式生产实证）。依赖 caret 下限同步改写到新 MIN（AGENTS.md 硬约定）。

## 4. 逐 API 复核记录（harness @ dsh-v0.2.0-rc.2）

| API | 取证位置 | 结论 |
| --- | --- | --- |
| `settings.configure({auto}, owner?)` | packages/settings/src/index.ts:266 | 可直呼（inject 硬声明 settings 的前提下） |
| `settings.replace(ns, section)` | packages/settings/tests/configuration.spec.ts:197 | 整段替换语义 |
| `plugins.bundle.config` keyed 槽位 | packages/client/ui-plugin-manager/README(.zh).md §60/110/112 | key=包名；槽位与页面同生；写错静默 |
| `shell.overlay` list 槽位 | packages/client/ui-chat/src/client/apply.ts:268 | 官方同款用法 |
| `ProfileContext{name,dir,patchPath,…}` | packages/boot/app-boot/src/profile-context.ts:15/35 + profile.ts:688 | name=basename(dir) |
| desktop argv[2]=runtimeDir | apps/desktop/src/host-process.ts | spawn 硬契约 |
| peer 预检 | packages/boot/app-boot/src/compatibility-preflight.ts:93/183 | caret 声明面 vs 门禁验证面分工 |
| `Volatile`（cosmokit） | 范式 spec.ts 同款 + typecheck 全绿 | type-only，npm cordis 未 re-export |

## 5. 已验证无需改动

cordis.patch.yml（bundle patch 形态 0.2.0 不变）；typert 手写描述符形态
（remote.ts 表驱动原样）；tools/defineTool、webserver/index-inject、
invariants 面零变化；attachments/systemPrompt 未使用。

## 6. 待实测运行时点（真机清单）

1. 桌面版 0.2.0-rc.2 安装本包 → 插件页卡片显示 icon/title/description（含
   兼容窗口文案）；
2. 组合包详情页配置页渲染：改 greeting → saveConfig → greet 工具立即用新值；
3. ping 往返；启动更新检查静默；手动检查 available → GlobalNotice 弹窗 +
   命令片复制；
4. Verdaccio bump 测试台两阶段弹窗（available / stale）——见
   scripts/test-version-bump.mjs（阶段 2 落地）；
5. 窗口外（0.1.5 桌面壳）软禁用 → 停用面板 harness 组 + 插件组（最新版自查）。

## 7. 边界与后续

- MAX 挡掉 0.2.1+（含 alpha）；追新按 AGENTS.md 手动流程。
- rc.2 起 CLI `rejectElectronProfile`：不能再用 `dsh --profile desktop` 类
  方式冒烟，真机验证一律走桌面壳。
- 待复核缺陷两条（宿主 fetch 解压 / ESM 模块缓存）随范式一并带入，追新时
  逐条复核（docs/harness-defect-workarounds.md，阶段 3 落地）。

## 8. 证据索引

- harness 源码：`c:/deepseek-harness` @ dsh-v0.2.0-rc.2（上表逐行）。
- 范式插件链式取证：`c:/agentProjects/dsh-comfyui-based-tools/docs/compat-plan-0.1.7-rc.1.md`、`-0.1.7-rc.2.md`、`-0.2.0-rc.1.md`、`-0.2.0-rc.2.md`。
- 本仓代码锚点：src/index.ts（薄 shim）、src/spec.ts（0.1.7 settings）、
  src/version-gate.ts（桌面单锚）、src/client/index.ts（plugins.bundle.config
  + shell.overlay ×2）、tsdown.config.ts（CSS 自注入）。
