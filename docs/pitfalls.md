# 已踩过的坑（全文与取证）

> AGENTS.md「已踩过的坑」一节是本文件的一句话索引；本文件保留叙述与取证。
> 范式来源：dsh-comfyui-based-tools `docs/pitfalls.md` 的通用子集（ComfyUI
> 部署/工作流专属坑未收录）。
>
> ⚠️ **【0.2.2 起方案 A】本文涉及「版本提示 / registry 候选源 / shell.overlay
> 更新条目 / 自更新 / 陈旧检测」的条目（§4、§5、§12–14 等）所对应的代码已
> 整体删除，仅作历史取证保留，勿照其恢复**。其中「宿主 fetch 压缩体」的防御工具
> `src/shared/json-body.ts` 仍保留（当前无调用方、也不产出 lib 文件），将来 host
> 侧重新发起网络 JSON 请求时纪律仍适用。现行事实见 `AGENTS.md` 与
> `docs/compat-plan-0.2.2-rc.1.md`。

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
替换。inject 列表必须与 peer/neverBundle 同步维护（0.2.1 包集）。

### 7b. 别追 dsh-* 声明文件里的跨包 `import type`（`skipLibCheck` 是上游前提）

症状：`node_modules/@deepseek-ai/dsh-*/lib/types/**` 里会 `import type` 到模板
**没声明**的包（0.2.1 实测：`ui-plugin-manager` → `dsh-api-remotes/client`、
`ui-slots`/`ui-layout` → `dsh-client-store`、`dsh-llm` → `dsh-attachment`），
而 `pnpm peers check` 与 `tsc` 都不报错。

**原因**：`tsconfig.json` 的 `skipLibCheck: true` 跳过 `.d.ts` 内部检查（含其
import 解析）。上游把这些包全部放在**自己的 devDependencies**（`workspace:*`），
peer 里只有 `cordis`——这是 harness 的惯例，不是本模板的缺口。

**纪律：不要为它补 devDep、更不要关 `skipLibCheck`。** 实测（0.2.1-rc.2）：
补齐 4 个包后关掉 `skipLibCheck`，错误数 16 → 16（换成了
`dsh-api-gateway/client`、`dsh-plugin-manager/types` 等 13 个更下游的包，
`dsh-api-remotes` 是网关面聚合包，链条无限）。

**代价边界**：`skipLibCheck` 只跳过库内部检查，不影响对外类型面——实测
`PropsRuntime<'plugins.bundle.config'>` 的 `view` 仍精确为 `'summary' | 'page'`、
`form` 仍是 `ConfigPageForm | undefined`；**唯一退化**是
`PluginPackageRef.availability → any`。真要用到那个字段时，在**自己代码里**本地
声明联合类型并断言，别去动依赖面。完整取证见
`docs/compat-plan-0.2.1-rc.2.md` §7.1。

## 8. Windows core.autocrlf=true 会弄坏 git 钩子（历史注记）

> **本模板 0.2.1 起已无 git 钩子**（`.githooks/pre-commit` 随陈旧检测拆除）。
> 若将来重新引入任何 `sh` 钩子，这条坑仍然成立，照下面的做法处理。

checkout 时 LF→CRLF，`.githooks/pre-commit` 的 shebang 变 `#!/bin/sh\r`——
钩子**静默失效**（不报错、不执行），版本一致性闸门形同虚设。`.gitattributes`
锁定 `.gitattributes` 自身与 `.githooks/*` 为 LF。启用钩子：
`git config core.hooksPath .githooks`（新克隆一次）。

## 9. peer precheck 的 caret 数学上不跨 minor 线

app-boot 的插件兼容预检按 `semver.satisfies(runtime, peerRange,
{ includePrerelease: true })` 放行；`^0.1.5-rc.1` 在 0.2.0 runtime 上不满足
→ 插件行直接 disabled、代码不会被 import。跨 minor 迁移必须**同轮**重写全部
peer/dev 到新线（单点窗口），不存在「靠范围夹住两条线」的写法（OR 并集被
AGENTS.md 硬约定禁止）。**tuple 变化同样命中**：`^0.2.0-rc.1` 对 `0.2.1-rc.2`
在默认解析语义下也是 false（0.2.1 迁移实测），故 MIN 上移时依赖下限必须同轮改写。

## 10. 发版漏 build（0.2.1 起只影响卡片窗口文案）

> **0.2.1 起「陈旧代码误报」这一事故形态已随检测拆除**（上游修复了
> 「卸载重装不重启跑旧模块」）。剩下的影响只有一个：`locale/{zh,en}.json` 的
> 兼容窗口文案停在旧值（smoke 0g 会 FAIL）。仍然必须「改 `version-gate.ts` 或
> bump version 后跑一次 build」。

历史形态（供追溯）：`BUILD_VERSION`（烧进 client bundle）与 `currentVersion`
（运行中 host 模块自报）严格不等即弹 `StaleBanner`，bundle 烧旧版 + 包清单新版
→ 每个用户每次启动都被误报。当时的防线是 `version` 生命周期脚本自动烧录 +
pre-commit 闸门 + smoke 0d——三者已全部删除（**不要再加回来**）。

bump 用 `pnpm version patch --no-git-tag-version`（生命周期脚本 argv 为空、
`npm_package_version` 已是新值；`pnpm run version` 只直跑脚本**不 bump**，属
误用）；`pnpm version` 要求干净工作树。

## 11. pnpm 无法用 registry 版本直接覆盖 link 依赖

`pnpm add <pkg>@<version>` 对现存 link（junction）报 ERR_PNPM_ENOENT，且
`pnpm remove` 不删顶层 junction 残留——先把链接本体删掉（rmSync 只删链接，
绝不触及链接目标即源码仓库）再走全新安装。开发态装/卸本插件时同理。

## 12. 从范式仓移植「带硬编码 scope」的脚本时，鉴权路径可能从未被验证过

test-version-bump.mjs 移植自范式仓，其 verdaccio 配置的 packages 段曾硬编码
`'@liaozhi/**': publish: $all`——范式插件发布**根本不走鉴权**，所以配套的
legacy `username/_password` npmrc 在范式仓从未被真正校验过；换 scope 后本插件
落进 `'**'` 的 `publish: $authenticated`，而新版 npm 对 npmrc 的
`username/_password` 形态不会自动发 Basic（实测 401 "need: Basic, Bearer"，
npm 侧自报 HttpErrorAuthUnknown）→ E401。

教训与修法（scripts/test-version-bump.mjs）：
- **scope 模式从包名动态推导**（`verdaccioConfigFor(manifest.name)`），不写死
  任何 scope；scope 块 publish/unpublish $all 与范式同款（本地一次性测试源，
  发布不依赖鉴权）；
- **发布凭据用 Bearer `_authToken`**：verdaccio 就绪后用 Basic 凭据 PUT
  `/-/user/org.couchdb.user:<user>` 换 JWT 写进 npmrc（`mintPublishToken`）——
  `_authToken` 是 npm 全版本都认的形态；mint 失败仅警告不阻断（scope 块 $all
  兜底）。验证探针：legacy 凭据 + $all 发布 ✓、token mint 201 ✓、whoami=test ✓、
  _authToken 发布 ✓。

通用规则：移植任何「按假设的包名/scope/路径生成配置」的脚本，先把假设参数化，
再追问——**原仓库里这条路径真的被执行过吗**（publish: $all 会让鉴权代码变成
从未运行的死角）。

## 13. 轮询预算会缩水；后台 verdaccio 的日志被 DETACHED_PROCESS 静默丢弃

**预算**：`waitForRegistry` 曾写「25 次探测 × 600ms」当 30s 预算用——端口未监听时
fetch 是瞬间失败（ECONNREFUSED），实际预算只有 ~15s：verdaccio 热启动 2s 就绪
（掩盖问题），冷启动（当日首次拉起，Defender 扫描 + 依赖预热）实测超 15s → 误报
「30s 内未就绪」。修法：**预算按时间计**（`Date.now() + 60_000`）。

**日志被吞（真因，2026-10-19 修复）**：`spawn(..., { detached: true, shell: true,
stdio: ['ignore', log, log] })` 在 Windows 上只让**直接子进程**拿到 stdio 句柄，
孙进程（verdaccio 实际跑在 `node bin/verdaccio`）拿到的是**无效句柄** → 输出被
静默丢弃。实测：verdaccio 正常监听、`/` 返回 200，日志仍恒为 **0 字节**——故障时
等于把唯一证据扔了。修法（范式 `70a09e8`，本模板已迁移）：

1. **启动形态**：`spawn(process.execPath, [binPath, '--config', CONFIG_PATH], {
   stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })` + `writeSync(log, chunk)`
   把两条管道落盘；bin 入口**经包清单 `bin` 字段解析**（`require.resolve('verdaccio/package.json')`
   → `join(dirname(...), manifest.bin.verdaccio)`）——不能直接 resolve
   `verdaccio/bin/verdaccio`，包的 `exports` 不放行该子路径。
2. **生命周期监听**：`on('error')` / `on('exit')` 记录事实，探测循环**发现启动即死
   立即判死**（原来「启动即死」与「还在启动」在脚本眼里一模一样，只能白等满预算），
   并把日志尾部（`verdaccioLogTail()`）贴进错误信息。
3. **探测可诊断**：逐次记录失败原因与耗时，非 2xx 也报状态码；超时文案改
   「已等待 Xs；最后一次探测：…」+ 日志尾部。
4. 配置里的 `log: { type: file }` 段**随之删除**（管道已能落盘，两套日志只会打架）。

**实测（本模板复现）**：同 spawn 形态 + 独立端口 4899 → **2.0s 就绪**、日志
**431 字节 / 6 行**（含 `http address` 行）；对照旧 `detached + shell` 形态同条件
0 字节。

## 14. 生成 verdaccio 配置的两个致命细节（@ 保留指示符 + 相对路径解析基准）

verdaccio 6.10 实测（test-version-bump 三连坑的最终形态）：

1. **YAML 里 `@` 是保留指示符**——纯标量不能以 `@` 开头。把 web.title 参数化成
   `title: ${pkgName} …` 后，包名 `@scoped/…` 让 js-yaml 直接抛错 →
   `@verdaccio/config` parseConfigFile 转成 `CONFIG: it does not look like a
   valid config file` → verdaccio exit 1。与 cordis.patch.yml 的 name 是**同一个
   坑**（README 改名表 ①）：凡按包名生成 YAML 的地方，含 `@` 的值一律加引号。
2. **verdaccio 把配置里的相对路径解析到配置文件所在目录**（不是 CWD）——
   `storage: ./.verdaccio-storage`、`file: ./.verdaccio-storage/htpasswd` 实际
   落在 `.verdaccio-storage/.verdaccio-storage/` 嵌套目录（file log 实证
   "using htpasswd file: …嵌套…\htpasswd"）：脚本播种的 htpasswd 失效、storage
   与脚本资产混层。修法：**生成的配置里所有路径一律绝对化**
   （`JSON.stringify(join(...))` 产出的双引号 YAML 串转义正确）。
3. 诊断手法沉淀：verdaccio 自己打印的每行加载日志（现在经管道落盘，见 §13）会写明
   每个插件实际加载的路径——「配置里写的路径」与「插件实际用的路径」对不上时一眼
   现形（实测 `using htpasswd file: <绝对路径>` 直接暴露嵌套目录问题）。
