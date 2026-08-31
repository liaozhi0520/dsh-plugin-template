import { readFile } from 'node:fs/promises'
import { dirname, resolve as resolvePath } from 'node:path'
import { defineConfig } from 'tsdown'
import { transform } from 'lightningcss'

/**
 * `.module.css` 导入：lightningcss 编译（CSS Modules 哈希类名 + 压缩），
 * 默认导出类名映射，命名导出 `cssText` 为编译后文本。
 * 复刻 harness 内置预设 packages/client/tsdown.client.ts 的
 * dsh-css-modules-inline，一处有意不同：官方虚拟模块在求值时自注入
 * <style>（去重守卫，HMR 下样式变动会残留旧样式）；本模板不自注入——
 * 注入由 src/client/index.ts 的 ctx.effect 管，HMR 卸载即移除、重载带新 CSS。
 * 虚拟 id 不能以 .css 结尾（tsdown 的 css-guard 按后缀拦截）；
 * addWatchFile 让 CSS 改动也触发 tsdown --watch 重构建（HMR 覆盖样式）。
 */
const CSS_MODULE_SUFFIX = '.module.css'
const CSS_VIRTUAL_PREFIX = '\0dsh-plugin-template-css-module:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

/**
 * 浏览器侧 bundle 必须打包成"惰性 CJS 工厂"形态：
 * 产物执行时调用 window.__ModuleLoader__.load({ id, factory }) 完成注册，
 * 基线外部依赖通过注入的 require 从客户端模块表取用（不进 bundle）。
 * 对齐 harness 内置预设 packages/client/tsdown.client.ts 的 clientConfig，
 * 但该预设按包名在 harness 仓库里找 manifest，树外包用不了，这里重述最小配置。
 */
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
        // 虚拟 id 会把物理样式表挡在 Rolldown 的 watch 图之外，手动登记。
        this.addWatchFile(fileId)
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
        return [`const css = ${JSON.stringify(code.toString())};`, `export const cssText = css;`, `export default ${JSON.stringify(classMap)};`].join('\n')
      },
    },
  ],
  deps: {
    // web shell 播种的基线模块（见 harness packages/client/web/src/platform.ts 的
    // PLATFORM_MODULES / PRELOADED_CLIENT_EXTERNALS）保持外部引用。
    neverBundle: [
      'react',
      'react/jsx-runtime',
      'react-dom',
      'react-dom/client',
      '@deepseek-ai/cordis',
      '@deepseek-ai/dsh-client-ui-slots',
      '@deepseek-ai/dsh-client-ui-primitives',
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
    banner: 'window.__ModuleLoader__.load({ id: "dsh-plugin-template", factory: (require) => {',
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
})
