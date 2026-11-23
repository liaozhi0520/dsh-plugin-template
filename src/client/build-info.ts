/**
 * 构建期注入的插件版本（tsdown `define` 从 package.json 烧入）。
 *
 * 用途只有一个：给 client 半一个「当前构建属于哪个发布版本」的基准，用来识别
 * 并丢弃页面里由旧版 host 留下的软禁用标记（标记契约见 ../shared/disabled-flag.ts
 * 的 `pluginVersion`）。它不是 0.2.1 已拆除的陈旧代码检测，也不参与任何版本门禁
 * 判定——不要把它扩成 `BUILD_VERSION` / `StaleBanner` 那套机制。
 */
declare const __DSH_PLUGIN_TEMPLATE_VERSION__: string

/** 当前 client bundle 对应的插件包版本（构建期替换为字面量）。 */
export const PLUGIN_VERSION = __DSH_PLUGIN_TEMPLATE_VERSION__
