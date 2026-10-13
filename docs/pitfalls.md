# 已踩过的坑（全文与取证）

> AGENTS.md「已踩过的坑」一节是本文件的一句话索引；本文件保留叙述与取证。
> 范式来源：dsh-comfyui-based-tools `docs/pitfalls.md` 的通用子集（ComfyUI
> 部署/工作流专属坑未收录）。

## 1. client 槽位「未声明即静默不触发」

client 半 `ctx.slots.inject('槽位名', …)` 注册的条目，只有当**宿主侧真的声明了
该槽位**时才会渲染；槽位名拼错、宿主版本改名、或 keyed 槽位的 key 写错，都是
**静默不出现、无任何报错**。槽位类改动只能逐槽位点名核对（在 harness 源码里
grep 槽位名确认声明处），不能靠「跑一遍看效果」。

- `plugins.bundle.config` 的 key 必须逐字等于 `package.json` 的 `name`
  （插件页以组合包名作 entryKey 匹配）——守护：`src/client/bundle-key.ts`
  单源 + smoke-offline 0c 节（常量声明值 = 包清单 name、banner bundle id =
  name，双钉）。
- `shell.overlay` 条目的 id/order 只影响层栈排序，不影响是否触发。

## 2. Config 必须从入口模块值导出（0.1.7 settings 模型）

0.1.7 起 cordis Loader 从 **apply 所在入口模块**读领 `Config` schema（校验条目
配置、填默认值、求值 volatile 引用后注入 apply 第二参）。schema 若只放在
`src/spec.ts` 而入口不 `export { Config } from './spec.js'`（**值导出**，不是
type-only），`apply(ctx, config)` 的 config 会是 `undefined`——运行期才炸，
且症状是「读字段时报 undefined」而不是启动报错。

同族坑：宿主对 `apply` 收到的 config 里每个 volatile 字段塞的是**稳定引用 +
原地更新**的 Volatile 快照——读配置要 `config.x.get()`，不能把字段当普通值
解构后缓存。

## 3. 0.1.7 settings 只放行 volatile 字段写回；写回必须整段 replace

`ctx.settings.replace(ns, section)` 只放行 schema 里标记了 `.volatile()` 的
字段；**深合并 update 删不掉键**（缺席键留在存储里）——面板写回一律整段
`replace`（重置全部 live 字段后以传入值铺底）。schema 求值发生在 Loader 侧、
先于 apply，入口静态图含 schemastery 不新增风险面。

## 4. 宿主全局 fetch 可能不解压压缩响应（缺陷规避①）

症状：`response.json()` 抛 `Unexpected token …`，响应头全为 null。根因取证与
防御性设计见 `src/shared/json-body.ts` 头注释。**纪律：所有网络 JSON 读取走
`readJsonBody`；请求侧显式 `accept-encoding: identity`**（让请求根本不进压缩
路径）。回归守护：smoke 6f 的 accept-encoding 契约钉子。

## 5. 跨源请求别自己写 cache-control / pragma

浏览器跨源 GET 时，非 CORS-safelisted 头（`cache-control`/`pragma`）会把请求
升级成 OPTIONS 预检；`registry.npmjs.org` 对 OPTIONS 回 404 且不带 CORS 头——
client 半首个候选恒失败。**`fetch(url, { cache: 'no-store' })` 不能规避**：
实测 headless Chromium 照样把两个头写进请求。结论（`shared/registry-latest.ts`
头注释）：浏览器路径一个缓存指令都不加（`/latest` 自带 `max-age=300`，版本
检查容忍几分钟陈旧）；host 半（无 CORS、无 HTTP 缓存）经 `noCache` 选项显式
加头绕中间层坏缓存。

## 6. client 与 host 共用的依赖不能进 dependencies

tsdown 默认把 `dependencies` 外部化，而 harness 的 client 模块表里没有你的
业务依赖——`require("three")` 这类缺失会让 **client 半整体激活失败**（面板/
条目全灭）。纪律：client 要用的第三方依赖进 **devDependencies**（tsdown 打进
bundle，clsx 同款）；确需 client+host 双端共用同一份运行时依赖时，用
tsdown `deps.alwaysBundle` 显式打进 client（范式 three 的踩坑记录）。反过来，
`@deepseek-ai/*` 一律进 peerDependencies，永不进 dependencies。

## 7. dsh.client 声明是包元数据，扫描缓存永不过期

`package.json` 的 `dsh.bundle` / `dsh.client`（含 `inject` 列表）在 harness
侧有扫描缓存，**改它必须重启 harness** 才生效；`lib/` 内容变化才会走产物
替换。inject 列表必须与 peer/neverBundle 同步维护（0.2.0 包集）。

## 8. Windows core.autocrlf=true 会弄坏 git 钩子

checkout 时 LF→CRLF，`.githooks/pre-commit` 的 shebang 变 `#!/bin/sh\r`——
钩子**静默失效**（不报错、不执行），版本一致性闸门形同虚设。`.gitattributes`
锁定 `.gitattributes` 自身与 `.githooks/*` 为 LF。启用钩子：
`git config core.hooksPath .githooks`（新克隆一次）。

## 9. peer precheck 的 caret 数学上不跨 minor 线

app-boot 的插件兼容预检按 `semver.satisfies(runtime, peerRange,
{ includePrerelease: true })` 放行；`^0.1.5-rc.1` 在 0.2.0 runtime 上不满足
→ 插件行直接 disabled、代码不会被 import。跨 minor 迁移必须**同轮**重写全部
peer/dev 到新线（单点窗口），不存在「靠范围夹住两条线」的写法（OR 并集被
AGENTS.md 硬约定禁止）。

## 10. 发版漏 build = 每用户每次启动误报「陈旧代码」

BUILD_VERSION（烧进 client bundle）与 currentVersion（运行中 host 模块自报）
严格不等即弹 StaleBanner。bundle 烧旧版 + 包清单新版 → 每个用户每次启动都被
误报。防线：`version` 生命周期脚本自动烧录 + pre-commit 闸门 +
smoke 0d。bump 用 `pnpm version patch --no-git-tag-version`（生命周期脚本
argv 为空、`npm_package_version` 已是新值；`pnpm run version` 只直跑脚本
**不 bump**，属误用）；`pnpm version` 要求干净工作树。

## 11. pnpm 无法用 registry 版本直接覆盖 link 依赖

`pnpm add <pkg>@<version>` 对现存 link（junction）报 ERR_PNPM_ENOENT，且
`pnpm remove` 不删顶层 junction 残留——先把链接本体删掉（rmSync 只删链接，
绝不触及链接目标即源码仓库）再走全新安装。开发态装/卸本插件时同理。
