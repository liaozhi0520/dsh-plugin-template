# dsh-plugin-template

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件模板：**双端（host + client）HMR 开发**，开发完成后可**直接发布到 npm** 或**推到 GitHub** 供用户安装。

模板自带两个可删改的示例功能，分别覆盖两端：

- **Host half**（`src/index.ts`）：注册模型可调用的 `greet` 工具，演示 `inject` / `Config` schema / 事件监听；
- **Client half**（`src/client/index.tsx`）：在 Web 设置页注册一个"HMR 演示"面板，演示 slot 组合与浏览器原地热替换。

## 使用本模板

1. 复制本目录（或点 GitHub 的 "Use this template"），然后**全局改名**：

   | 位置 | 改成你的 |
   |---|---|
   | `package.json` 的 `name` | 你的包名（如 `@you/dsh-foo`） |
   | `cordis.patch.yml` 的 `id` / `name` | 同上 |
   | `tsdown.config.ts` banner 里的 `id` | 同上 |
   | `src/client/index.tsx` 的 slot `id`、label | 你的 UI 标识 |
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

## 发布到 npm

```sh
npm login          # 首次
pnpm publish       # prepack 会自动完成构建
```

`files` 白名单只带运行必需的产物（`lib/index.js`、`lib/client.js`、`cordis.patch.yml`），发布前建议 `pnpm pack` 检查内容。用户安装：

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
├── src/index.ts          # host half 入口（greet 工具示例）
├── src/client/index.tsx  # client half 入口（settings.section 面板示例）
├── scripts/dev.mjs       # pnpm dev：并行两个构建监视器
├── tsdown.config.ts      # client bundle 构建（CJS 工厂 + 基线外部化）
├── tsconfig.json         # 全量类型检查（pnpm typecheck）
├── tsconfig.build.json   # host 半构建（lib/index.js）
├── cordis.patch.yml      # bundle 层：安装时插入插件行
├── cordis.dev.yml        # 开发 overlay：重启用 HMR 并监听 lib/
└── package.json          # dsh.bundle + dsh.client 双清单，prepare/prepack 构建
```
