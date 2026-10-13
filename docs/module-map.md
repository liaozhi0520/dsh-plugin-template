# 模块清单（module map）

> 范式来源标注：与 dsh-comfyui-based-tools 0.8.6 同构的模块注明「范式同构」；
> 模板特有的（demo 面）注明「模板特有」。迁移取证见 `docs/compat-plan-0.2.0-rc.2.md`。

## host 半（src/ → lib/）

| 模块 | 职责 | 来源 |
| --- | --- | --- |
| `index.ts` | 薄门禁 shim：name/inject/Config 值导出 + `settings.configure({auto:false})` + profile/version 两道门禁 + 动态 import main.ts（两段式入口第一段） | 范式同构 |
| `main.ts` | 业务主体（重模块图，只在门禁全过后被动态拉起）：greet 工具 + settings 句柄 + TemplateRemote + typert.register + 启动更新检查 | 范式同构（业务为模板 demo） |
| `spec.ts` | 0.1.7 settings 模型：`SETTINGS_NS`、全字段 volatile 的 Config schema、`TemplateConfig`（Volatile 引用）、`TemplateSettingsHandle`（get 即时读 / replace 整段写） | 范式同构 |
| `profile-gate.ts` | desktop-only 门禁（`profileContext.name === 'desktop'` 指纹，返回 profile.dir） | 范式同构 |
| `soft-disable.ts` | 软禁用装配（两个门禁与重模块图加载失败共用出口）：错误日志 + no-op + `webserver/index-inject` 注入停用标记（载荷含 runtimeVersion/plugin） | 范式同构 |
| `version-gate.ts` | 版本门禁：窗口 `[0.2.0-rc.1, 0.2.0-rc.2]` + 桌面单锚（argv[2]=runtimeDir 读 runtime 内 @deepseek-ai/dsh）+ compareVersions re-export | 范式同构 |
| `package-info.ts` | 自身 package.json 读取（**模块求值期缓存** = 运行中代码版本；陈旧防护基石） | 范式同构 |
| `update-state.ts` | 版本提示状态机（host 半唯一权威源，内存态不落盘）：四相 idle/checking/available/up-to-date，无安装相位；候选源固定 npm→npmmirror | 范式同构 |
| `remote.ts` | Typert 端点：表驱动描述符（ping/getConfig/saveConfig/checkUpdate/getUpdateState）+ TemplateRemote 服务（第三方插件勿改回装饰器形态） | 范式同构 |
| `invariant.ts` | 官方 invariant 伴随件 | 模板原有 |

## shared/（双端共享，禁 Node 依赖——client bundle 内联本目录）

| 模块 | 职责 | 来源 |
| --- | --- | --- |
| `contract.ts` | 业务 RPC 契约：TEMPLATE_ENDPOINT（ping/getConfig/saveConfig）+ TemplateConfigValue | 模板特有 |
| `update-contract.ts` | 版本提示 RPC 契约：UPDATE_ENDPOINT（checkUpdate/getUpdateState）+ 四相 UpdateMachineState（currentVersion 恒自报口径——契约钉子，两处同步） | 范式同构 |
| `disabled-flag.ts` | 软禁用标记契约：DISABLED_GLOBAL + 载荷 {reason,min,max,installVersion,runtimeVersion?,plugin?} | 范式同构 |
| `version-compare.ts` | 严格 semver 比较（纯函数零依赖） | 范式同构 |
| `registry-latest.ts` | npm registry /latest 查询（host/client 同构；npm→npmmirror 逐源降级、identity 头、noCache 仅 host） | 范式同构 |
| `json-body.ts` | 响应体健壮读取（按魔数自解压 + 字节级诊断；宿主 fetch 缺陷规避①） | 范式同构 |

## client 半（src/client/ → lib/client.js）

| 模块 | 职责 | 来源 |
| --- | --- | --- |
| `index.ts` | client 入口：词典注册 + plugins.bundle.config 注册（正常/停用两路径，key=BUNDLE_KEY）+ shell.overlay ×2；无 CSS 注入（构建期自注入） | 范式同构 |
| `bundle-key.ts` | plugins.bundle.config 注册 key（逐字 = 包名；与命令片同源；smoke 0c 守护） | 范式同构 |
| `build-version.ts` | **生成文件勿手改**：BUILD_VERSION（gen-version.mjs 在 build 链生成；陈旧判定的 client 半基准） | 范式同构 |
| `locales.ts` | zh/en 词典（ns `template.panel`；title 是卡片显示名，gen-version 提取、zh/en 须同值） | 模板特有 |
| `api.ts` | 浏览器 → host RPC 数据层（OpResult 统一错误面） | 模板原有（对齐范式） |
| `TemplateSection.tsx` | 配置页卡片：问候语编辑（settings 写回示范）+ ping 演示 + 插件更新条（available 时 CommandChip） | 模板特有 |
| `TemplateDisabledSection.tsx` | 停用说明面板：harness 组（窗口/当前版本/桌面更新指引）+ 插件组（安装版本 + registry 自查 + package@version 药丸） | 范式同构 |
| `disabled-version-check.ts` | 停用面板的插件最新版自查（client 半 fetch——桌面/静态注入是一次性快照，自查才对三种交付形态正确） | 范式同构 |
| `GlobalNotice.tsx` | 新版本提示（shell.overlay order 101，neutral，available 弹窗 + 命令片；stale 让位；「我知道了」内存态） | 范式同构 |
| `StaleBanner.tsx` | 陈旧代码提醒（shell.overlay order 100，danger；running ≠ BUILD_VERSION 严格不等；两次提醒：说明 → 5s 后升级文案 → 不再提醒） | 范式同构 |
| `CommandChip.tsx` | 可复制命令片（clipboard → execCommand 兜底，已复制 2s 反馈） | 范式同构 |
| `ui/*` | 官方 UI 原语复制件（Button/Modal/NoticeModal/Switch/Menu/MenuSurface/icons + focus/keyboard-composition/useModalLayer/overlay-top-margin）——peer 不再依赖 dsh-client-ui-primitives | 范式同构（官方 primitives 逐字复制） |
| `*.module.css` | 样式（CSS Modules 哈希类名；tsdown 构建期物化自注入 + data-plugin-css 去重守卫） | 范式同构 |

## scripts/ 与守护

| 脚本 | 职责 |
| --- | --- |
| `gen-version.mjs` | build 链首步：烧 BUILD_VERSION + 生成 locale/{zh,en}.json 显示元数据（title 从 locales.ts 提取、zh/en 须同值；description 注入 [MIN,MAX]） |
| `check-version-sync.mjs` | 版本一致性快检（package.json / build-version.ts / lib/client.js 三处；pre-commit 闸门，`--quiet` 供钩子用） |
| `smoke-offline.mjs` | 离线全量守护：0 入口隔离 / 0b 入口图白名单 / 0c bundle key / 0d BUILD_VERSION 三处一致 / 0g locale 元数据 / 6a 桌面单锚 / 6f package-info+状态机+stale 契约 / 7 退役契约 |
| `entry-guard-hook.mjs` | smoke 第 0 节的 module.register 钩子（resolve 阶段拦截 dsh-* 运行时依赖） |
| `test-version-bump.mjs` | Verdaccio 版本 bump 测试台（bump/commit 双模式）：本地 registry 发布新旧两版实测 available / stale 两阶段弹窗；退出自动还原 |

## 构建链

```
pnpm build = gen-version.mjs → tsc -p tsconfig.build.json（lib/index.js + 跟随的 main.js 等）→ tsdown（lib/client.js，CJS 工厂 + CSS 物化自注入）
```

tsdown `neverBundle` = react / react-dom 集（dsh-* 在 client 半只有 type-only
import，UI 原语已复制——bundle 内零 dsh-* 运行时依赖，smoke 0 节守护）。

## smoke-offline 守护清单（34 项）

0) 入口隔离 + exports 形状（inject 3 项无 pluginManager）×6 · 0b) 白名单 ×2 ·
0c) key/banner ×2 · 0d) BUILD_VERSION ×2 · 0g) locale 元数据 ×8 ·
6a) 桌面单锚 ×3 · 6f) package-info + 状态机 + 契约钉子 ×8 · 7) 退役契约 ×3。
新增守护节时同步本清单。
