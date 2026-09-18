# dsh-plugin-template

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件模板：**双端（host + client）HMR 开发**，开发完成后可**直接发布到 npm** 或**推到 GitHub** 供用户安装。

模板自带三个可删改的示例功能，覆盖两端与端间调用：

- **Host half**（`src/index.ts`）：注册模型可调用的 `greet` 工具，演示 `inject` / `Config` schema / 事件监听；
- **Client half**（`src/client/index.ts`）：在 Web 设置页注册一个"HMR 演示"面板，演示 slot 组合、locale 词典（zh/en 双语键集）、CSS Modules 样式与浏览器原地热替换；
- **Host↔Client 调用**（`src/remote.ts` + `src/client/api.ts`）：面板上的"调用 host"按钮经 Typert Gateway 调用 host 半的 `template/ping` 端点，演示第三方插件的远程调用形态（为什么是手写描述符而非官方 `@Remote` 装饰器，见 `src/remote.ts` 头注释）。

## 使用本模板

通过 GitHub 的 "Use this template" **创建新的插件仓库**（仓库名随意），**克隆到本地**后，
先**改名**。改名前搞懂插件身份由**三样东西**组成，它们互相派生：

| 概念 | 本模板取值 | 怎么派生 |
|---|---|---|
| **短插件 id** | `dsh-plugin-template` | = **仓库名**（use-this-template 建库时你起的名字；克隆到本地即根文件夹名） |
| **npm 包名**（scoped） | `@scoped/dsh-plugin-template` | `@<scope>/` + 短 id；`@scope` = 你的 npm 用户名 |
| **环境前缀** | `DSH_PLUGIN_TEMPLATE` | 短 id 全大写、`-`/`.` 转 `_` |

`@scope` 怎么拿：`npm whoami`（未登录先 `npm login`）。本模板占位为
`@scoped/dsh-plugin-template`，把 `@scoped` 换成 `npm whoami` 的结果即可。

改名 = 换这三样东西，各有固定落点。**漏改不报错**——这些标识只是注册 key，构建/加载
都不校验一致性，漏改只会让对应功能静默失效（面板不出现、HMR 不重载、RPC 404），
所以必须逐表核对。建议执行顺序：**先全局换短 id（包名里的短 id 会一并变）→ 再换 3 处
scope → 再换前缀 → 最后核对顺手项**。

### ① npm 包名（scoped）—— 只 3 处

| 位置 | 改成 |
|---|---|
| `package.json` 的 `name` | `@<新scope>/<新短id>` |
| `cordis.patch.yml` 的 `name:` | `"@<新scope>/<新短id>"`（**必须加引号**，YAML 里 `@` 是保留指示符；按它解析到包 `exports['.']`） |
| `tsdown.config.ts` banner 的 `__ModuleLoader__` id | 同上（client 按包名发现） |

### ② 短插件 id —— 其余 15+ 处

| 位置 | 改成 |
|---|---|
| `cordis.patch.yml` 的 `id:` | `<新短id>` |
| `src/index.ts` 的 `export const name` + Typert `package:` 字段 | 同上（cordis 插件名） |
| `src/client/index.ts` 的 `export const name` + 两处 slot `id` | 同上 |
| `src/remote.ts` 的端点描述符 `id`（`<短id>#…`） | 同上（Typert 关联） |
| `src/invariant.ts` 的 `PACKAGE_NAME` / `name` | 同上（伴生插件名） |
| `tsdown.config.ts` 的 CSS 虚拟模块前缀 + 插件名 | 同上 |

### ③ 环境前缀 —— 2 处 + 各文件错误/日志前缀

| 位置 | 改成 |
|---|---|
| `src/version-gate.ts` 错误前缀、`DSH_<前缀>_STRICT` 变量名 | `<新前缀>` + `_STRICT` |
| `src/shared/disabled-flag.ts` 的 `__DSH_<前缀>_DISABLED__` 变量名 | `__<新前缀>_DISABLED__` |
| `src/self-update.ts` 的错误/日志前缀（`dsh-plugin-template:` / `[dsh-plugin-template]`） | 换成新短 id（包名/版本本身从自身 package.json 读，无需改） |

### ④ 顺手项

| 位置 | 改成 |
|---|---|
| `cordis.dev.yml` 的 root 绝对路径（root 列表 + 顶部用法注释） | 你机器上实际的 `lib/` 路径 |
| `src/client/locales.ts` 的 `nav` / `title`（slot label 来自这里） | 你的 UI 标识（如 "Meme 生成"） |
| `src/shared/update-contract.ts` 端点 namespace（`'template/…'`）与 `src/remote.ts` 的 `namespace` / `serviceKey` / `service` | 与 Typert 服务名同源，改服务名时一并改 |
| `LICENSE` 版权行 | 你的名字 |
| `README.md` / `AGENTS.md` / 示例文案里出现的旧短 id | 同上 |

### 验证

1. `pnpm install`（自动跑 `prepare` 完成首次构建）
2. `pnpm typecheck && pnpm build` 通过
3. `git grep <旧短id>` 与 `git grep <旧包名>`，全仓应无残留
4. 若该目录此前已装进 profile：重跑 `dsh plugin --profile web add`

## 开发（HMR）

**一次安装进 profile**（client half 的发现依赖包名解析，必须安装而非 `--patch` 插路径）：

```sh
# 安装了 dsh CLI：
dsh plugin --profile web add <本模板目录的绝对路径>

# 或用 harness 源码仓库：
cd <deepseek-harness 仓库> && pnpm dsh plugin --profile web add <本模板目录的绝对路径>
```

**每个开发会话两个终端**：

```sh
# 终端 1：构建监视器（tsc --watch + tsdown --watch，持续重写 lib/）
pnpm dev

# 终端 2：harness（叠加开发 overlay，重新启用 HMR 并监听 lib/）
dsh web --patch <本模板目录>/cordis.dev.yml --port 3081
# 或源码仓库里：pnpm dsh web --patch ... --port 3081
```

然后：

- **改 `src/index.ts`（host 半）** → tsc 重写 `lib/index.js` → cordis-plugin-hmr 重载插件 → 终端打印新的 `host half loaded` 日志。在 Web UI 让 agent 调用 `greet` 工具验证。
- **改 `src/client/index.ts`（client 半）** → tsdown 重写 `lib/client.js`（<100ms）→ host 的 client-hmr 轮询发现 → SSE 广播 → **浏览器不刷新页面就地更新**。打开 `http://127.0.0.1:3081` → 设置 → "HMR 演示"面板可见。

无浏览器验证 client 链：`curl -N http://127.0.0.1:3081/plugins/events`，改 client 源码会实时收到 `data: {"type":"rebuilt","id":"dsh-plugin-template",...}`。

> **安装版 dsh 注意**：cordis-plugin-hmr 需要读 Node 内部模块加载器。若启动报 `--expose-internals is required for HMR`，用 `NODE_OPTIONS=--expose-internals dsh web ...` 启动即可（从源码运行的 `pnpm dsh` 自带 tsx，无此问题）。

## 依赖版本与追新

harness 处于 0.1 rc 快速迭代期，要点：

- **peer 与 dev 同一下限**：dev = 编译所用版本，peer = 运行时最低兼容声明（不强制 harness 升级，但旧环境装插件会得到 unmet peer 警告）。官方规则：every peer has a matching development range。
- **范围写法**：用 `^0.1.5-rc.1`（= 已实测的最低版本，peer 与 dev 写同一个）。不要用 `latest`/`*`（dist-tag 停在老线，反而拿到最旧），也不要用精确钉死（`pnpm add` 默认写死，永不移动）。caret 在预发布线上只覆盖同一 `major.minor.patch` 的更高预发布号，所以 `^0.1.5-rc.1` 恰好等于 `{0.1.5-rc.1, 0.1.5-rc.2}`——**追新到 0.1.5 线内的新 rc 不需要改依赖，只抬 MAX**（跨 minor 线才需要手改依赖）。
- **harness 版本门禁（双边界窗口）**：模板自带 `src/version-gate.ts`，声明支持窗口 `[MIN_HARNESS_VERSION, MAX_HARNESS_VERSION]`（当前为 `[0.1.5-rc.1, 0.1.5-rc.2]`），已安装版本落在窗口外即软禁用。`dsh plugin add` 只是 pnpm 转发器，安装期没有插件版本检查钩子，所以门禁放在插件 apply 时执行：以 harness CLI 入口（`process.argv[1]`）为锚点，向上找最近的 `package.json` 并校验包名为 `@deepseek-ai/dsh`（CLI 包本体，`dsh --version` 同源；**不读 dsh-tools 等内嵌依赖**——它们按 caret 实装，版本可能高于 CLI 本体，实测 rc.1 的 CLI 内嵌 rc.2 的 dsh-tools，读它会误判；也不能以插件自身为锚点——devDependencies 里的开发副本会让解析永远命中插件自己的 node_modules）。版本出窗口时默认**软禁用**：醒目错误日志 + 插件不注册任何业务能力，不影响 dsh web 启动（Loader/app-boot 对插件抛错零容忍，抛错 = 整个 harness exit(1)）；`DSH_PLUGIN_TEMPLATE_STRICT=1` 恢复抛错 fail-loud。软禁用时 host 半经 `webserver/index-inject` 向页面注入 `__DSH_PLUGIN_TEMPLATE_DISABLED__` 标记（fiber-bound，卸载即撤、无残留），client 半读到后改挂"已停用"说明面板并展示支持窗口（`src/shared/disabled-flag.ts` 是两侧共享的标记契约）。

**追新流程（手动，无脚本）**：

版本抬升刻意做成显式手改——目标线选择、破坏面评估、门禁改值三件事本来就该人工过目；交给脚本反而会引入「当前线」的语义模糊（实测教训：`0.1.x` 线内带破坏性变更的跨 patch 追新会被脚本静默扫进来）。追新的每一步都值得慢下来看一眼：

```sh
# ① 查目标线的最新版本（各 @deepseek-ai/dsh-* 与 harness 同步发版，查 dsh-tools 即可代表全线）：
pnpm view @deepseek-ai/dsh-tools versions --json

# ② 手改 package.json：把全部 @deepseek-ai/dsh-* 的 peer 与 dev 都改成同一个目标版本
#    （当前依赖：^0.1.5-rc.1。peer 与 dev 同值——窗口内没有"下限/上限"之分）
#    同 minor 线内追新（如 rc.1→rc.2）caret 已覆盖，无需改依赖，直接跳到 ④
#    本版本才有的包只进 dev（只 import type 时编译期擦除）

# ③ 同步与验证：
pnpm install
pnpm typecheck && pnpm build        # 红 = 上游破坏性变更，按 docs/compat-guide 的迁移清单修

# ④ 实测通过后手动上调 src/version-gate.ts 的 MAX_HARNESS_VERSION（MIN 保持已实测的最低版本）
# ⑤ 同一轮同步指引：rg -n '0\.1\.' AGENTS.md README.md src/version-gate.ts
```

- 不用 `pnpm update`：它会剥掉 rc 包的 `^`（实测），且不碰 peer 侧。
- **下限 = 已验证承诺**：抬下限等于宣布「插件已在那个版本上验证过」，没实测过的版本不要抬。
- 锁文件会钉住首次安装版本：想每次克隆都最新就删掉它，否则按上面流程主动抬下限。

**多线兼容（默认不做）**：

本模板与其派生插件的默认窗口是**`[0.1.5-rc.1, 0.1.5-rc.2]`**——同属 0.1.5 预发布线（MIN 是已实测的最低版本，MAX 是已追新验证的最新 tag），`peer` / `dev` 写同一个 `^0.1.5-rc.1`，代码里**不应出现任何版本分支**（`typeof ctx.x.y === 'function'` 这类探测本身就意味着要支持多条线，是双窗口的产物）。理由：预发布线跨 minor 的 API 破坏频繁（0.1.2 → 0.1.5 一次跨越就改了槽位词表、PTC 事件名、persona 段位、Session 格式），用范围"夹"多线只会把不确定性带进 typecheck。

确有需要时（例如已发布插件必须同时服务两条 harness 线）才按下面的历史方法重新引入双线；一旦引入，必须在 `AGENTS.md` 与本节的窗口表述里**明确标注为双线**，不要让它悄悄变成默认。

### 历史方法：双线窗口（`dsh-v0.1.1-rc.2 ↔ dsh-v0.1.2-rc.1`）

双边界窗口（peer 并集 + dev 钉线 + 特征探测回退）是 0.1.1→0.1.2 时代的做法，保留作方法论参考——带代码的取证与迁移方案见 `docs/compat-guide-0.1.1-to-0.1.2.md`（peer 并集 `^0.1.1-rc.2 || ^0.1.2-rc.1` / dev 钉死一条线、`import type` 迁移表、运行时特征探测范式、normal changes 清单），执行流程照 `docs/compat-plan-TEMPLATE.md` 复制填写。要点：

- 依赖写法：peer = 安装期承诺，双线写**并集** `^0.1.1-rc.2 || ^0.1.2-rc.1`；dev = typecheck 目标，**永远钉一条线**（写并集是实测坑：pnpm 沿用 lockfile 首臂旧解析，typecheck 目标混线必炸）；新线专属包只进 dev（只 `import type` 时编译期擦除，旧线运行时缺席无害）；
- `dsh.client.inject` 与 tsdown `neverBundle` 只列**所有支持线都存在**的包——新线专属包进 inject 会让旧线 web 启动硬失败（boot graph 的 inject 是 factory 先达边，不是注释）；
- 类型层破坏 = 迁移 `import type`（编译期擦除，运行时零分叉）；运行时破坏 = 特征探测（`??` 链 + 最小收窄接口，新 API 在前、旧 API 兜底），禁止 import 两套再 if-else；
- 旧线兼容属推断：typecheck 只对新线一套 import 链成立，必须旧线冒烟坐实（覆盖每个探测 fallback 分支）；每次迁移留 `docs/compat-plan-<版本>.md` 执行记录。

> 复用时注意：并集范围会让 `scripts/bump-deps.mjs`（本模板不带该脚本，四个派生插件各自带）**静默跳过**——它的范围正则是 `^\^(\d+)\.(\d+)\.(\d+)-rc\.(\d+)$`，匹配不上 `A || B`；且它只抬同 minor 线内的最新 rc，跨 minor 线永远抬不动，必须手改。

## 插件自更新

设置面板标题行右侧内置「检查更新 / 立即更新」条（client 半 `TemplateSection.tsx` 六态状态机 + host 半 `src/self-update.ts`，经 `template/checkUpdate` / `template/updateSelf` RPC）：

- **检查**：当前版本 vs npm registry `/<pkg>/latest`（严格 semver 比较，含预发布规则）；面板 mount 时静默查一次，离线不打扰、手动可重试；
- **更新**：一律走**官方 CLI 通道** `dsh plugin --profile <name> add <pkg>@<version>`（harness 侧的官方转发器 = pnpm add + bundles reconcile，与手动安装同构）；profile 三级定位（① 包根上溯 registry 实体安装 → ② link 开发副本 realpath 反查 + 启动 argv 权威裁决 → ③ 报错给手动命令）；安装前用 `dsh plugin list --json` 交叉核对 profile 目录与依赖认领；成功后提示重启 harness 生效；
- **前提**：插件必须已发布到 npm。GitHub-only 分发（未发 npm）时 registry 检查失败——面板静默/手动重试，属预期行为；
- **软禁用态没有更新条**：版本门禁软禁用时 host 半不注册任何端点（RPC 必然 404），停用面板只给 harness 版本修复引导——插件更新不了 harness，也不该试图更新；
- 并发与竞态：重复点击合并进同一次安装（host 半 in-flight 锁）；点更新时 latest 回落到 ≤ 当前则归位「已是最新」；更新只换磁盘，需重启 harness 加载新 host 半。

## 发布到 npm

```sh
npm login          # 首次
pnpm publish       # prepack 会自动完成构建
```

`files` 白名单只带运行必需的产物（`lib/index.js`、`lib/invariant.js`、`lib/client.js`、`cordis.patch.yml`），发布前建议 `pnpm pack` 检查内容。用户安装：

```sh
dsh plugin --profile web add dsh-plugin-template
```

## 上传到 GitHub

直接 push 源码即可（**不要**提交 `lib/`，它在 .gitignore 里）。本模板带了 `prepare` 脚本：用户从 git 安装时 pnpm 会用它现场构建产物（自包含，只依赖 npm 上的公开包）。

用户侧安装分两步（pnpm ≥10 的构建许可要求）：

```sh
# 1. 首次 add 会被 pnpm 拒绝构建脚本，按提示把包名加进 profile 的
#    pnpm-workspace.yaml（~/.dsh/profiles/<profile>/pnpm-workspace.yaml）：
#    allowBuilds:
#      dsh-plugin-template: true
# 2. 重新执行
dsh plugin --profile web add github:<owner>/dsh-plugin-template#<commit-sha>
```

> 构建许可 = 允许安装时执行该包的代码，提醒你的用户只对他们信任的包开启，并建议 pin commit。
> 不想让用户配许可的话，也可以发 npm 或提供 `pnpm pack` 产物（tarball 安装不跑构建）。

## 原理速记

- **一切都是 Cordis 插件**；通过 `ctx` 注册的都是可逆 effect，卸载自动清理——这是 HMR 热替换的前提。
- **Host 半 HMR**：`@deepseek-ai/cordis-plugin-hmr`（dsh-base 已挂载，web 模式默认禁用，`cordis.dev.yml` 按 id 重启用）监听构建产物，沿 Node 模块图重载受影响的插件条目。
- **Client 半 HMR**：`dsh.client` 声明让 `modules` 服务把包扫进 `window.__DSH_BOOT__` 并以 `/plugins/<id>/client.js` 供给；`client-hmr` stat 轮询 bundle 变化 → SSE 广播 → 浏览器按"invalidate → prefetch → 卸载旧 fiber → 物化新工厂"原地热替换。**触发源是任何重写 `lib/client.js` 的进程**，本模板用 `tsdown --watch`。
- **分发形态即开发形态**：`exports['.']` 恒指向 `lib/index.js`，npm 包、git 安装、本地开发走同一条加载路径，没有"源码能跑、装上就挂"的落差。
- **依赖规则**：`@deepseek-ai/*` 一律进 `peerDependencies`（运行时由 harness 安装环境提供；dsh profile 的 pnpm 工作区是 `autoInstallPeers: false` + 安装目录兜底解析，不会为你的 peer 链去 npm 拉包），普通第三方库进 `dependencies`，构建工具进 `devDependencies`。不要把 `@deepseek-ai/*` 放进 `dependencies`。
- **HMR 只覆盖 link 开发的场景**：cordis-plugin-hmr 沿 Node 模块图追踪时排除路径含 `/node_modules/` 的模块，所以 npm/git 安装进 profile 的实体副本不参与热重载（它们是给最终用户的不可变产物）；`dsh plugin add <本地目录>` 是符号链接，realpath 后跳出 node_modules，才能被追踪。
- `dsh.client` 声明是包元数据，扫描缓存永不过期：改它要重启 harness；`lib/` 内容变化才走热替换。
- `--patch` overlay 不在运行时监听列表里，改 `cordis.dev.yml` 需重启；profile 的 `cordis.patch.yml` 和 `$DSH_HOME/cordis.patch.yml` 才是热监听的。

### 已知坑（模板已绕过，建议反馈上游）

Windows 下 cordis-plugin-hmr 默认的 `ignored` 含 `**/.*`，而 hmr 用 picomatch 匹配 `path.relative()` 的反斜杠结果时反斜杠被当转义符，`..\..` 前缀会误命中 `**/.*`——**base 目录之外的监听 root 被静默吞掉**。`cordis.dev.yml` 用 `ignored: []` 绕行。上游正解：匹配前归一化分隔符（或 picomatch `windows: true`）。

## 文件清单

```
├── src/index.ts                      # host half 入口（版本门禁 + greet 工具示例 + Typert 端点注册）
├── src/version-gate.ts               # harness 版本门禁（软禁用语义 + CLI 锚点解析 + semver 比较）
├── src/self-update.ts                # 插件自更新 host 半（registry 检查 + 官方 dsh plugin add 通道）
├── src/shared/disabled-flag.ts       # host→client 的软禁用标记契约（全局变量名 + 载荷形状）
├── src/shared/update-contract.ts     # 自更新 RPC 契约（端点名 + 请求/结果类型，两端共用）
├── src/remote.ts                     # host 半 Typert 远程端点（template/*，表驱动描述符 + 第三方安全形态）
├── src/invariant.ts                  # 官方 invariant 伴随件（每包必有）
├── src/css-modules.d.ts              # CSS Modules 导入声明（*.module.css）
├── src/client/index.ts               # client half 入口（词典/样式/槽位注册组装 + 停用标记分支，无 JSX）
├── src/client/locales.ts             # zh/en 词典（所有 UI 文案走 locale key）
├── src/client/api.ts                 # 浏览器 → host 的 RPC 调用（OpResult 统一错误面）
├── src/client/TemplateSection.tsx    # 演示组件（settings.section 面板 + 插件更新条）
├── src/client/TemplateDisabledSection.tsx  # 版本不兼容"已停用"说明面板
├── src/client/TemplateSection.module.css  # 演示样式（CSS Modules + --dsw 设计令牌）
├── docs/compat-guide-0.1.2-to-0.1.5.md     # 当前窗口兼容手册（0.1.2↔0.1.5 差异取证 + 带代码方案）
├── docs/compat-guide-0.1.1-to-0.1.2.md     # 历史：0.1.1↔0.1.2 兼容手册（双线期方法论参考）
├── docs/compat-plan-TEMPLATE.md            # 兼容迁移执行记录骨架（每次追新 cp 一份填写）
├── scripts/dev.mjs                   # pnpm dev：并行两个构建监视器
├── tsdown.config.ts                  # client bundle 构建（CJS 工厂 + 基线外部化 + CSS Modules 内联）
├── tsconfig.json                     # 全量类型检查（pnpm typecheck）
├── tsconfig.build.json               # host 半构建（lib/index.js + lib/invariant.js）
├── cordis.patch.yml                  # bundle 层：安装时插入插件行
├── cordis.dev.yml                    # 开发 overlay：重启用 HMR 并监听 lib/
└── package.json                      # dsh.bundle + dsh.client 双清单，prepare/prepack 构建
```
