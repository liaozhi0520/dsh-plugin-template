# 兼容手册：DSH 0.1.2-rc.1 ↔ 0.1.5-rc.1

> 定位：本模板及其派生插件（`dsh-send-to-feishu` / `dsh-qw-tool` / `dsh-post-gen` /
> `dsh-meme-gen`）当前窗口 **单窗口 `[0.1.5-rc.1, 0.1.5-rc.1]`** 的取证手册。
> 取证方式：本地 `c:/deepseek-harness`（`git describe` = `dsh-v0.1.5-rc.1`）上对
> `dsh-v0.1.2-rc.1..dsh-v0.1.5-rc.1`（1486 commits，2635 files，+133490/−32968）
> 逐 API 源码核对 + GitHub Release message 交叉定位。
> 完整升级方案与逐插件改动清单见任一插件 `docs/dsh-0.1.5-rc.1-upgrade-report.md`
> （四插件各一份逐字相同的完整副本）。
> 历史手册 `compat-guide-0.1.1-to-0.1.2.md` 已归档，仅在需重新引入双线时查阅。

---

## 1. 区间版本事实

- 区间内 tag：`0.1.3-alpha.1`（09-04）、`0.1.3-alpha.2`（09-07）、
  `0.1.5-alpha.1`（09-08）、`0.1.5-alpha.2`（09-09）、`0.1.5-rc.1`（09-10）。
- **不存在 0.1.4 线**（0.1.3-alpha.2 直跳 0.1.5-alpha.1）。
- Release message 里点名的破坏面：Session 格式 V3、Session persistence 改
  `SessionHandle`、`agentLoop.create()` 变异步、移除 `ctx.agent`、
  `Inbox` 改纯类型、Web 插件面板 API 调整（`conversation` 槽迁移）、
  ApiProxy 移除（统一 `@Remote` 网关）、persona 配置拆分 prefix/suffix。
- 复现核对命令：

```powershell
git -C c:/deepseek-harness describe --tags
git -C c:/deepseek-harness rev-list --count dsh-v0.1.2-rc.1..dsh-v0.1.5-rc.1
git -C c:/deepseek-harness diff --shortstat dsh-v0.1.2-rc.1..dsh-v0.1.5-rc.1 -- packages/<area>/src
```

## 2. 默认依赖与门禁写法（单窗口）

```jsonc
// package.json —— peer 与 dev 写同一个值
"peerDependencies": { "@deepseek-ai/dsh-tools": "^0.1.5-rc.1", ... },
"devDependencies":  { "@deepseek-ai/dsh-tools": "^0.1.5-rc.1", ... }
```

```ts
// src/version-gate.ts —— 双边界窗口门禁（当前两端同值 = 仅支持该版本）
export const MIN_HARNESS_VERSION = '0.1.5-rc.1'
export const MAX_HARNESS_VERSION = '0.1.5-rc.1'
export function assertHarnessSupported(): void {
  const installed = installedHarnessVersion()
  if (compareVersions(installed, MIN_HARNESS_VERSION) < 0) throw new Error(`…要求 harness >= ${MIN_HARNESS_VERSION}…`)
  if (compareVersions(installed, MAX_HARNESS_VERSION) > 0) throw new Error(`…仅支持 harness <= ${MAX_HARNESS_VERSION}…`)
}
```

要点：

- 软禁用语义不变（`apply()` 捕获后 no-op + 注入停用标记），因为 0.1.5-rc.1 的
  `installFailLoud` 仍 `proc.exit(1)`——插件抛错 = 整个 `dsh web` 死掉。
- 保留 `compareVersions()`：它同时服务 `self-update.ts`（比较插件自身 npm 版本），
  不属于可删的兼容代码。
- 版本解析锚点：`process.argv[1]` → 从 CLI 入口向上找最近 `package.json` 并校验
  包名为 `@deepseek-ai/dsh`（CLI 包本体，`dsh --version` 同源）。**不要**读
  `dsh-tools` 等内嵌依赖的版本当 harness 版本——CLI 包对内嵌依赖是 caret 语义，
  实装版本可能高于 CLI 本体（实测 `@deepseek-ai/dsh@0.1.5-rc.1` 内嵌的
  `dsh-tools` 已是 0.1.5-rc.2，读它会误判版本不匹配而软禁用）。
- **不要写版本探测分支**：单窗口下 `typeof ctx.x.y === 'function'` 这类守卫是双窗口遗物；
  全部删除（本次已从四个插件删净 `getSectionOrder` 与 `Session.events` 两处探测）。

## 3. 破坏面分级（0.1.2-rc.1 → 0.1.5-rc.1）

### 3.1 breaking（若用到必改）

| 区域 | 变化 | 处置 |
|---|---|---|
| Client 槽位词表 | 52 → 61；`conversation` → `main`（**kind: single→keyed，scope: session→root**）+ 新子槽 `main.conversation`；`details` → `rightbar`（+`rightbar.session`）；`conversation.details.tool` **删除** | 改用新槽位；注意 `ctx.slots.inject` 对未声明 key **静默不触发回调**（不抛错） |
| 槽位新增占用 | `tool.call.toolview` 域新增官方 key `present`、`read_image` | 默认优先级注册会 throw 冲突，接管需显式 `priority` |
| PTC 词汇 | 事件名 `tool/code-dispatch(-start)` → `tool/ptc-dispatch(-start)`；子调用 ID `<parent>:code:<n>` → `<parent>:ptc:<n>`（契约声明 opaque） | 只监听新事件名；**不要解析 ID 前缀** |
| system prompt 段位 | `HARNESS_SOURCE` −900→10000、`WEB_SURFACE` −800→10100（本地路径/端点说明从提示词最前挪到最后）；`DEPLOYMENT_PERSONA: 0` 拆为 `DEPLOYMENT_PERSONA_PREFIX: 0` + `DEPLOYMENT_PERSONA_SUFFIX: 10200`；`TOOL_WORKFLOW` 仍 **2600** | 用 `getSectionOrder(name)` 运行时现取，**不要硬编码段号**（段号会重排） |
| persona 槽 | `PERSONA_SECTION`/`'deployment:persona'` → `PERSONA_PREFIX_SECTION` + `PERSONA_SUFFIX_SECTION`；`Config.persona` → `personaPrefix` + `personaSuffix` | 影子替换 persona 的插件/部署改新名 |
| attachment | 模块级 `admitPromptContent` 取消导出 → 抽象类方法 `ctx.attachments.admitPromptContent()`（参数类型加宽含 `{type:'file'}`）；`AttachmentErrorCode` 新增 `INVALID_FILE_BASE64` / `ATTACHMENT_FILES_UNSUPPORTED` | 走服务方法；穷举 error code 的 switch 补 default |
| Session | `SESSION_FORMAT_VERSION` 0 → 3（**升级后不支持降级读取**；迁移生成新文件并保留原文件）；`assistant/chunk` 移除、`assistant/message` 新增必填 `stream`、`EpochHeader.system` 移除、`./chunk-rows` 子路径导出删除 | 只读事件的插件无感；写日志/实现读取器的插件必须适配 V3 |
| Agent / Inbox | `ctx.agent` 移除（显式传参）；`Inbox` 改纯类型，`hasPending`/`claim` 退出公共接口（用 `agent.inbox`） | 工具内取会话走 `exec.agent?.session`（该字段两版逐字相同） |
| ui-primitives | `MessageText` 删除（文件移除）；新增 `Tag`/`Switch`/`LinkIcon`/`FileTypeIcon`/`fileSizeText`/`rankByName` 等 | 改用 `MarkdownText` / `projectUserText` |
| ui-chat | 移除 `SelectionTarget`、`Details*` 系列（`ToolCallBlock`/`RunningToolCall`/`ToolResultNode` 定义与导出位置不变） | 不要 import 已删类型 |
| ui-tool | `ToolCallOwnerProps.openFile` 加宽为 `(path, options?: {line?})`，新增必填 `loadImage`；`ChatNodeOwnerProps.selectedCallId` 移除 | 转发 `openFile` 时必须透传第二参数 |
| ui-conversation | 附件词汇改名：`onAddImages`→`onAddFiles`、`SubmitImageAttachment`→`SubmitAttachment`、`addImages`→`addAttachments`、`imageIds`→`attachmentIds` 等；新增必需服务 `fileUpload` | 组合 composer 的部署需补 file-upload 包 |
| ApiProxy | 移除，统一 `@Remote` 网关 | 插件侧维持 `ctx.typert.register` + `connection.rpc.call('/api', …)` 即不受影响 |
| 应用启动 | `--profile desktop` 被 CLI 拒绝；新增 `--from-default-profile <name>` | 脚本勿用 desktop profile |

### 3.2 已核实未变（可直接依赖）

整目录零 diff：`settings/settings/src`、`host/webserver/src`、`skill/skill/src`、
`runtime-diagnostics/invariants/src`、`util/values/src`、`typert/loader/src`、
`extensions/cordis-host-runner/src`、`client/ui-renderer/src`、`client/ui-settings/src`、
`client/locale/src`、`client/modules/src/client`、`client/hmr/src`。

逐字相同的契约：`defineTool` / `ToolDefinition` / `ToolSchema` / `ToolOutput` /
`ToolRunContext` / `ToolExecutionInput.agent`、`ctx.tools.register`、
`ctx.systemPrompt.section` / `getSectionOrder`（平局规则
`order 差 || name 字典序` 未变）、`ctx.typert.register` / `InvocationDescriptor` /
`RemoteResult` / `src-json` codec、`AttachmentStore.saveImage` / `ImageAttachmentRef` /
`ImageMediaType`、`'webserver/index-inject'` 与 `IndexInjection` 全部 kind、
`Session.header.cwd` / `snapshotEvents()` / `isSeeded`、`JsonValue`（仍在
`dsh-util-values`）、`dsh-tools` 的 `exports['./package.json']`、
`apps/cli/src/plugin.ts`（`dsh plugin add/list` 转发器）、`installFailLoud`。

### 3.3 浏览器模块表

无 import map，是惰性 CJS 表。基线 `PLATFORM_MODULES` = `react`、`react/jsx-runtime`、
`react-dom`、`react-dom/client`、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-store`、
`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-ui-primitives`，
**新增 `@deepseek-ai/dsh-client-ui-dockkit`**，无移除。

值导入只能落在：基线 ∪ 本包 `dsh.client.external` 声明。其余 `@deepseek-ai/*`
值导入会被构建期 purity gate 判失败；type-only import 编译期擦除、不构成请求。
`dsh.client.inject` 在 0.1.5 升级为**真实拓扑依赖边**：被依赖行先物化；
自依赖与成环会被镜像拒绝。

## 4. 静默失效模式（写代码/审查时必查）

1. **槽位未声明 = 静默不渲染**：`ctx.slots.inject(key, cb)` 只在 key 已声明时执行
   cb。迁移后槽位不渲染且无日志时，先对照
   `packages/extensions/cordis-client-runner/src/client/slot-catalog.ts`
   （`gen-client-catalog` 产物）逐槽位点名，不要指望异常。
2. **PTC 子调用 ID 是 opaque**：按 `:code:` 前缀匹配会静默失配；旧事件名
   `tool/code-dispatch` 已不在 `KNOWN_SESSION_EVENT_TYPES`。
3. **event 名/段号不要落盘**：Session V3 不可降级，把事件名或硬编码段号写进
   settings/磁盘会造成跨版本不可读或位置错乱。
4. **模块表外的 require 编译能过、运行时炸**：`client-modules: require("…") missed the
   module table`。值导入前先确认 specifier 在基线或 `dsh.client.external` 里。
5. **门禁只认 CLI 包（@deepseek-ai/dsh）的版本**：从 `process.argv[1]` 向上找
   最近 package.json 并校验包名；不要读 `dsh-tools` 等内嵌依赖的版本——它们按
   caret 实装，可能高于 CLI 本体（实测 rc.1 的 CLI 内嵌 rc.2 的 dsh-tools，读它
   会误判不匹配而软禁用）。

## 5. 0.1.5-rc.1 新增、值得采纳的能力（非兼容必需）

- attachment file 通道：`ctx.attachments.saveFile` / `saveFileStream` /
  `readFileStream` / `fileHostPath` / `admitEncodedFile` / `admitPromptContent()`（服务方法）。
- 图片宿主路径：`ctx.attachments.imageHostPath(ref)`（0.1.2 起就在，0.1.5 仍可用）——
  需要附件落盘路径时优先于读私有 `root` 字段。
- 工具定义新增可选元数据：`timeoutMs`（协作式超时预算）、`isConcurrencySafe`、
  `finalizeContent`。
- 工具卡片附件画廊子槽位 `tool.call.images`（owner 提供 `images` + `loadImage`）。
- 侧栏面板槽位族：`sidebar.panellist` / `rightbar` / `rightbar.session` /
  `sidebar.right.*` / `main` / `main.conversation`。
- 新 client 服务：`fileUpload`、`resources`、`sidebarRight(+Tabs)`、`workspaceFiles`；
  `GlobalStandardProps` 新增 `useResource` / `usePanelInfo`。

## 6. 迁移后的冒烟要求（最低集）

- [ ] `pnpm typecheck && pnpm run build` 全绿；
- [ ] `dsh web` 启动：host 半打印加载日志、无"版本不兼容"软禁用日志；
- [ ] 设置面板（`settings.section`）渲染、locale 切换生效、HMR 重载后样式标签不残留；
- [ ] 工具卡片（`tool.call.toolview`）running / settled 两态渲染，`inspect` 可用；
- [ ] 引导段落在渲染出的系统提示词中位于工具导语区之后
      （`order = getSectionOrder('TOOL_WORKFLOW') + 10`，0.1.5-rc.1 实测为 2610）；
- [ ] 旧会话（0.1.2 时代）打开后，按附件 ID 引用历史图片的流程可走通
      （验证 V2→V3 迁移后 `snapshotEvents()` 仍能解析 `user/message` / `tool/result`）；
- [ ] 临时压低 `MAX_HARNESS_VERSION` 验证软禁用路径仍生效（错误日志 + 停用面板 + `dsh web` 不退出）后改回；
- [ ] `dsh plugin --profile <name> list --json` / `add` 通道可用（自更新依赖）。

## 7. 与升级报告的对应关系

本手册是**方法论与取证**；执行层面的逐文件改动清单、决策记录（不覆盖 0.1.5-rc.2、
`DisabledFlag` 不瘦身、母版纳入）与验收清单在
`docs/dsh-0.1.5-rc.1-upgrade-report.md`（四个插件各一份完整副本）。
两文档不重复：报告说"改哪里"，本手册说"为什么、怎么取证、防哪些静默坑"。
