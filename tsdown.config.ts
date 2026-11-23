import { readFile } from 'node:fs/promises'
import { basename, dirname, resolve as resolvePath } from 'node:path'
import { defineConfig } from 'tsdown'
import { transform } from 'lightningcss'

/**
 * 浏览器侧 bundle 必须打包成"惰性 CJS 工厂"形态：
 * 产物执行时调用 window.__ModuleLoader__.load({ id, factory }) 完成注册，
 * 基线外部依赖通过注入的 require 从客户端模块表取用（不进 bundle）。
 * 对齐 harness 内置预设 packages/client/tsdown.client.ts 的 clientConfig，
 * 但该预设按包名在 harness 仓库里找 manifest，树外包用不了，这里重述最小配置。
 *
 * `.module.css` 导入与官方预设 dsh-css-modules-inline 同构：lightningcss 编译
 * （CSS Modules 哈希类名 + 压缩），生成「物化期自注入」模块——样式标签在插件
 * fiber 物化时自动进 <head>，带去重守卫与 `data-plugin`/`data-plugin-css`
 * 归属标记（client 模块系统的 loadCache.styles 据此记账与清理）；默认导出
 * 类名映射。虚拟 id 不能以 .css 结尾（tsdown 的 css-guard 按后缀拦截）。
 */
const PLUGIN_ID = '@scoped/dsh-plugin-template'
const CSS_MODULE_SUFFIX = '.module.css'
const CSS_VIRTUAL_PREFIX = '\0dsh-plugin-template-css-module:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

export default defineConfig({
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2024',
  dts: false,
  sourcemap: true,
  clean: false,
  plugins: [
    {
      name: 'dsh-plugin-template-css-modules-inline',
      resolveId(source, importer) {
        if (!source.endsWith(CSS_MODULE_SUFFIX)) return null
        const abs = importer ? resolvePath(dirname(importer), source) : source
        return CSS_VIRTUAL_PREFIX + abs + CSS_VIRTUAL_SUFFIX
      },
      async load(virtualId) {
        if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
        const fileId = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
        const source = await readFile(fileId)
        const { code, exports: cssExports } = transform({
          filename: fileId,
          code: source,
          cssModules: { pattern: '[hash]_[local]' },
          minify: true,
        })
        const classMap: Record<string, string> = {}
        for (const [local, exp] of Object.entries(cssExports ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
          classMap[local] = exp.name
        }
        // 官方 styleInjectionModule（packages/client/tsdown.client.ts:37-56）同款：
        // 物化期自注入 + data-plugin-css 去重守卫 + 类名映射默认导出。
        const tagId = `${PLUGIN_ID}/${basename(fileId)}`
        return [
          `const css = ${JSON.stringify(code.toString())};`,
          `const tagId = ${JSON.stringify(tagId)};`,
          'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\') === null) {',
          '  const tag = document.createElement(\'style\');',
          `  tag.dataset.plugin = ${JSON.stringify(PLUGIN_ID)};`,
          '  tag.dataset.pluginCss = tagId;',
          '  tag.textContent = css;',
          '  document.head.appendChild(tag);',
          '}',
          `export default ${JSON.stringify(classMap)};`,
        ].join('\n')
      },
    },
  ],
  deps: {
    // web shell 播种的基线模块（见 harness packages/client/web/src/platform.ts 的
    // PLATFORM_MODULES / PRELOADED_CLIENT_EXTERNALS）保持外部引用。
    // dsh-* 一律不进 neverBundle：client 半对它们只有 type-only import（编译期
    // 擦除），UI 原语已复制进 src/client/ui/（0.8.0 范式），bundle 内没有任何
    // dsh-* 运行时依赖。
    neverBundle: [
      'react',
      'react/jsx-runtime',
      'react-dom',
      'react-dom/client',
    ],
  },
  define: {
    // 浏览器 bundle 内联的依赖可能读这两个值；CJS 产物没有 import.meta 环境。
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
})
