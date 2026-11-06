# 模块清单（module map）

> 范式来源标注：与 dsh-comfyui-based-tools 0.8.7 同构的模块注明「范式同构」；
> 模板特有的（demo 面）注明「模板特有」。本轮迁移记录见
> `docs/compat-plan-0.2.2-rc.1.md`（上一轮 `docs/compat-plan-0.2.1-rc.2.md`、
> 更早 `docs/compat-plan-0.2.0-rc.2.md` 已归档）。
> **【0.2.2 起方案 A】更新提醒链路整条删除**（`update-state.ts` /
> `registry-latest.ts` / `update-contract.ts` / `GlobalNotice.tsx`(+css) /
> `CommandChip.tsx`(+css) / `disabled-version-check.ts` / `package-info.ts`），
> 新增 `assets/detail/`、`scripts/templates/detail.*.md`、`pnpm-workspace.yaml`；
> 下表按当前实际文件树维护。

## host 半（src/ → lib/）

| 模块 | 职责 | 来源 |
| --- | --- | --- |
| `index.ts` | 薄门禁 shim：name/inject/Config 值导出 + `settings.configure({auto:false})` + profile/version 两道门禁 + 动态 import main.ts（两段式入口第一段） | 范式同构 |
| `main.ts` | 业务主体（重模块图，只在门禁全过后被动态拉起）：greet 工具 + settings 句柄 + TemplateRemote + typert.register。**0.2.2 起无启动更新检查** | 范式同构（业务为模板 demo） |
| `spec.ts` | 0.1.7 settings 模型：`SETTINGS_NS`、全字段 volatile 的 Config schema、`TemplateConfig`（Volatile 引用）、`TemplateSettingsHandle`（get 即时读 / replace 整段写） | 范式同构 |
| `profile-gate.ts` | desktop-only 门禁（`profileContext.name === 'desktop'` 指纹，返回 profile.dir） | 范式同构 |
| `soft-disable.ts` | 软禁用装配（两个门禁与重模块图加载失败共用出口）：错误日志 + no-op + `webserver/index-inject` 注入停用标记（载荷 `reason/min/max/installVersion/runtimeVersion?`，**不再带 plugin**） | 范式同构 |
| `version-gate.ts` | 版本门禁：**单点窗口 `[0.2.2-rc.1, 0.2.2-rc.1]`** + 桌面单锚（argv[2]=runtimeDir 读 runtime 内 @deepseek-ai/dsh）+ compareVersions re-export | 范式同构 |
| `remote.ts` | Typert 端点：表驱动描述符（ping/getConfig/saveConfig）+ TemplateRemote 服务（第三方插件勿改回装饰器形态） | 范式同构 |

> `invariant.ts`（官方 invariant 伴随件）已在 0.2.1 线迁移中删除；
> `package-info.ts` / `update-state.ts` 已在 0.2.2 方案 A 中删除（前者无调用方、
> 后者是版本提示状态机）；照官方指南
> `docs/upgrade-guide/v0.2.0-rc.2/remove-runtime-invariants/` 清理的取证见
> `docs/compat-plan-0.2.1-rc.2.md`。

## shared/（双端共享，禁 Node 依赖——client bundle 内联本目录）

| 模块 | 职责 | 来源 |
| --- | --- | --- |
| `contract.ts` | 业务 RPC 契约：TEMPLATE_ENDPOINT（ping/getConfig/saveConfig）+ TemplateConfigValue | 模板特有 |
| `disabled-flag.ts` | 软禁用标记契约：DISABLED_GLOBAL + 载荷 `{reason,min,max,installVersion,runtimeVersion?}` | 范式同构 |
| `version-compare.ts` | 严格 semver 比较（纯函数零依赖；只服务 version-gate 窗口判定） | 范式同构 |
| `json-body.ts` | 响应体健壮读取（按魔数自解压 + 字节级诊断；宿主 fetch 缺陷规避①）。**0.2.2 起当前无调用方、也不产出 lib 文件**（`tsconfig.build.json` 只编译入口图），保留为源码级防御工具 | 范式同构 |

> `update-contract.ts` / `registry-latest.ts` 已随方案 A 删除。

## client 半（src/client/ → lib/client.js）

| 模块 | 职责 | 来源 |
| --- | --- | --- |
| `index.ts` | client 入口：词典注册 + plugins.bundle.config 注册（正常/停用两路径，key=BUNDLE_KEY）；**0.2.2 起不再注册 shell.overlay**；无 CSS 注入（构建期自注入） | 范式同构 |
| `bundle-key.ts` | plugins.bundle.config 注册 key（逐字 = 包名；smoke 0c 守护） | 范式同构 |
| `locales.ts` | zh/en 词典（ns `template.panel`；title 是卡片显示名，gen-version 提取、zh/en 须同值） | 模板特有 |
| `api.ts` | 浏览器 → host RPC 数据层（ping/getConfig/saveConfig，OpResult 统一错误面） | 模板原有（对齐范式） |
| `TemplateSection.tsx` | 配置页卡片：问候语编辑（settings 写回示范）+ ping 演示 | 模板特有 |
| `TemplateDisabledSection.tsx` | 停用说明面板：只呈现 harness 组（原因/窗口/当前 runtime 版本/桌面版更新指引），断网可用 | 范式同构 |
| `ui/*` | 官方 UI 原语**裁剪复制件**（17 文件：Button/Modal/NoticeModal/Switch/Menu/MenuSurface/icons + focus/keyboard-composition/useModalLayer/overlay-top-margin + CSS）。注释标注 `@ dsh-v0.2.1-rc.2（0.2.2-rc.1 已复核，代码未同步）`：上游 0.2.2 有 11 文件实质变化，本轮决定不同步，见 `docs/compat-plan-0.2.2-rc.1.md` §12.2 | 范式同构 |
| `*.module.css` | 样式（CSS Modules 哈希类名；tsdown 构建期物化自注入 + data-plugin-css 去重守卫） | 范式同构 |

> `build-version.ts` / `StaleBanner.tsx` 已在 0.2.1 线迁移中删除；
> `GlobalNotice.tsx` / `CommandChip.tsx` / `disabled-version-check.ts` 已在
> 0.2.2 方案 A 中删除。取证见 `docs/harness-defect-workarounds.md` 的历史回退块
> 与 `docs/compat-plan-0.2.2-rc.1.md` §5.1。

## 插件页静态产物（生成物，勿手改）

| 路径 | 生成者 | 用途 |
| --- | --- | --- |
| `locale/{zh,en}.json` | `scripts/gen-version.mjs` | 卡片 `meta.title` / `meta.description`（产品介绍 + 带括号的兼容窗口，非空）/ `meta.detail` |
| `assets/detail/{zh,en}.md` | `scripts/gen-version.mjs` ← `scripts/templates/detail.*.md` | 0.2.2 插件页详情区正文（只放标题 + 三步用法）；不声明 meta.detail 会回退渲染包内 README |

## scripts/ 与守护

| 脚本 | 职责 |
| --- | --- |
| `gen-version.mjs` | build 链首步：生成 `locale/{zh,en}.json`（title 从 locales.ts 提取、zh/en 须同值；`DESCRIPTION` 的 `{{compat}}` 占位符替换成 [MIN,MAX]；写 `meta.detail`）与 `assets/detail/{zh,en}.md`（模板原样落盘）。产物内容不变则不写盘。**0.2.1 起不再烧录 BUILD_VERSION** |
| `smoke-offline.mjs` | 离线全量守护（39 项）：0 入口隔离 / 0b 入口图白名单 / 0c bundle key / 0g locale 元数据（含 meta.detail 断言）/ 6a 桌面单锚 / 6f 无更新状态机产物 / 7 无更新提示契约（0d 已退役、编号留空） |
| `entry-guard-hook.mjs` | smoke 第 0 节的 module.register 钩子（resolve 阶段拦截 dsh-* 运行时依赖） |
| `test-version-bump.mjs` | Verdaccio 版本更新测试台（bump/commit 双模式）：**0.2.2 起改验插件页 Versions 区更新流程**（装 A → 「重新检查」列出 B → 更新（检查→卸载旧版→安装新版，失败回滚）→ 不重启跑新码 → 全程无更新提醒）；`pointProfileAtRegistry()` 临时把 `~/.dsh/profiles/desktop/.npmrc` 指向 Verdaccio 并严格还原（含 Ctrl+C）。**启动形态**：`spawn(process.execPath, [bin, '--config', cfg])` + 管道 `writeSync` 落盘（不用 detached/shell，见 pitfalls §13）；bin 经包清单 `bin` 字段解析；`assertRegistryPortFree()` 启动前占用预检 |
| `templates/detail.{zh,en}.md` | 详情文档模板（改详情文案改这里，不要手改 `assets/detail/*.md`） |

> `check-version-sync.mjs` 与 `.githooks/pre-commit` 已随陈旧检测拆除（0.2.1）。

## 配置与构建

| 文件 | 作用 |
| --- | --- |
| `pnpm-workspace.yaml` | `minimumReleaseAgeExclude` 37 条白名单：0.2.2-rc.1 系列包刚发布时绕过 pnpm 的冻结 |
| `tsdown.config.ts` | client bundle：CJS 工厂 + CSS Modules 物化自注入；`neverBundle` = react / react-dom 集 |
| `tsconfig.build.json` | `include: ["src/index.ts"]`——**只从入口图编译**，无引用模块（如 `json-body.ts`）不产出 lib |

```
pnpm build = gen-version.mjs → tsc -p tsconfig.build.json（lib/index.js + 跟随的 main.js 等）→ tsdown（lib/client.js，CJS 工厂 + CSS 物化自注入）
```

> **坑**：tsc 不会删除已消失源文件的旧 `lib/` 产物，而 `files` 白名单含 `lib`。
> 删源文件后**必须先清空 `lib/` 再 build**，否则 smoke「产物不存在」断言误报，
> 且陈旧产物会被打进发布包。见 `docs/compat-plan-0.2.2-rc.1.md` §12.3。

## smoke-offline 守护清单（39 项）

0) 入口隔离 + exports 形状（inject 3 项无 pluginManager）×7 · 0b) 白名单 ×2 ·
0c) key/banner ×2 · 0g) locale 元数据 ×14（每语言：title 同源 / description
非空且带窗口 / detail 声明 / detail 路径形态 / detail 文件存在 / locale 存在）·
6a) 桌面单锚 ×3 · 6f) 无更新状态机产物 ×4（update-state / registry-latest /
update-contract / package-info 的 lib 产物均不存在）· 7) 无更新提示契约 ×7
（两 RPC 缺席 / 三业务端点在位 / main 无 startUpdateCheck / client 无更新面 /
client 仍注册 config / host 产物零出网 / json-body 保留）。
（0d「BUILD_VERSION 三处一致」×2、6f 的 stale 契约 ×2 与状态机 stub 已退役。）
新增守护节时同步本清单。
