# dsh-plugin-template

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件模板：**双端（host + client）HMR 开发**，开发完成后可**直接发布到 npm** 或**推到 GitHub** 供用户安装。

模板自带三个可删改的示例功能，覆盖两端与端间调用：

- **Host half**（`src/index.ts`）：注册模型可调用的 `greet` 工具，演示 `inject` / `Config` schema / 事件监听；
- **Client half**（`src/client/index.ts`）：在 Web 设置页注册一个"HMR 演示"面板，演示 slot 组合、locale 词典（zh/en 双语键集）、CSS Modules 样式与浏览器原地热替换；
- **Host↔Client 调用**（`src/remote.ts` + `src/client/api.ts`）：面板上的"调用 host"按钮经 Typert Gateway 调用 host 半的 `template/ping` 端点，演示第三方插件的远程调用形态（为什么是手写描述符而非官方 `@Remote` 装饰器，见 `src/remote.ts` 头注释）。

## 使用本模板

1. 复制本目录（或点 GitHub 的 "Use this template"），然后**全局改名**：

   | 位置 | 改成你的 |
   |---|---|
   | `package.json` 的 `name` | 你的包名（如 `@you/dsh-foo`） |
   | `cordis.patch.yml` 的 `id` / `name` | 同上 |
   | `tsdown.config.ts` banner 里的 `id` | 同上 |
   | `src/client/index.ts` 的 slot `id`、label | 你的 UI 标识 |
   | `cordis.dev.yml` 的 `root` 绝对路径 | 本模板在你机器上的 `lib/` 路径 |
   | `LICENSE` 版权行 | 你的名字 |

2. 安装依赖：`pnpm install`（全部来自 npm，会自动跑 `prepare` 完成首次构建）。

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
dsh web --patch <本模板目录>/cordis.dev.yml --no-open
# 或源码仓库里：pnpm dsh web --patch ... --no-open
```

然后：

- **改 `src/index.ts`（host 半）** → tsc 重写 `lib/index.js` → cordis-plugin-hmr 重载插件 → 终端打印新的 `host half loaded` 日志。在 Web UI 让 agent 调用 `greet` 工具验证。
- **改 `src/client/index.tsx`（client 半）** → tsdown 重写 `lib/client.js`（<100ms）→ host 的 client-hmr 轮询发现 → SSE 广播 → **浏览器不刷新页面就地更新**。打开 `http://127.0.0.1:3080` → 设置 → "HMR 演示"面板可见。

无浏览器验证 client 链：`curl -N http://127.0.0.1:3080/plugins/events`，改 client 源码会实时收到 `data: {"type":"rebuilt","id":"dsh-plugin-template",...}`。

> **安装版 dsh 注意**：cordis-plugin-hmr 需要读 Node 内部模块加载器。若启动报 `--expose-internals is required for HMR`，用 `NODE_OPTIONS=--expose-internals dsh web ...` 启动即可（从源码运行的 `pnpm dsh` 自带 tsx，无此问题）。

## 依赖版本与追新

harness 正处在 0.1 rc 快速迭代期，版本策略要点如下。

**先澄清影响面**：`@deepseek-ai/*` 的版本号只影响**开发期**（本地 typecheck/build 的类型与 API 保真度）；运行时这些包全部由 harness 安装环境兜底解析提供，插件实际跑的是 harness 自带的版本。所以"版本追不上"的代价是开发时类型对不上新版 API，不会让运行时用旧库。

**版本范围的语义**（实测 `@deepseek-ai/dsh-client-runtime`）：

| 写法 | 解析结果 | 说明 |
|---|---|---|
| `^0.1.1-rc.1` | 当前线最新（如 0.1.1-rc.2） | ✅ 在本线内追踪 rc 递增，模板默认写法 |
| `^0.1.0-rc.7` | 0.1.0-rc.8 | ⚠️ 锁死在 0.1.0 线，追不到 0.1.1 线 |
| `0.1.1-rc.1`（无 `^`） | 永不移动 | ❌ `pnpm add pkg@版本` 默认写死，注意补 `^` |
| `latest` / `*` | 0.0.1-rc.1（老线！） | ❌ 陷阱：dist-tag 停在这条老线上，追最新反而拿到最旧 |

**追新的操作**：

```sh
pnpm update            # 锁文件范围内重解析到最新（rc 线内递增）
pnpm update -L         # 忽略锁文件，强制取范围内最新
```

- **跨线升级**（harness 出 0.2.x）：没有自动机制——rc 期 minor 变化常带破坏性变更，需要手动把范围改成 `^0.2.0-rc.x`，然后跑 `pnpm typecheck` 按报错修 API 变化。版本号即兼容性文档，别让范围偷偷越线。
- **锁文件**：仓库提交的 `pnpm-lock.yaml` 会把安装钉在写锁那一刻。想"克隆即最新"，可从模板里移除锁文件（首次安装现场解析）；想可复现，保留它并养成 `pnpm update` 习惯。
- **追新的代价**：rc 线上 `pnpm update` 后 build 可能红（上游破坏性变更），属预期，按报错修即可。

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
├── src/index.ts                      # host half 入口（greet 工具示例 + Typert 端点注册）
├── src/remote.ts                     # host 半 Typert 远程端点示例（template/ping，第三方安全形态）
├── src/invariant.ts                  # 官方 invariant 伴随件（每包必有）
├── src/css-modules.d.ts              # CSS Modules 导入声明（*.module.css）
├── src/client/index.ts               # client half 入口（词典/样式/槽位注册组装，无 JSX）
├── src/client/locales.ts             # zh/en 词典（所有 UI 文案走 locale key）
├── src/client/api.ts                 # 浏览器 → host 的 RPC 调用（ctx.connection.rpc）
├── src/client/TemplateSection.tsx    # 演示组件（settings.section 面板）
├── src/client/TemplateSection.module.css  # 演示样式（CSS Modules + --dsw 设计令牌）
├── scripts/dev.mjs                   # pnpm dev：并行两个构建监视器
├── tsdown.config.ts                  # client bundle 构建（CJS 工厂 + 基线外部化 + CSS Modules 内联）
├── tsconfig.json                     # 全量类型检查（pnpm typecheck）
├── tsconfig.build.json               # host 半构建（lib/index.js + lib/invariant.js）
├── cordis.patch.yml                  # bundle 层：安装时插入插件行
├── cordis.dev.yml                    # 开发 overlay：重启用 HMR 并监听 lib/
└── package.json                      # dsh.bundle + dsh.client 双清单，prepare/prepack 构建
```
