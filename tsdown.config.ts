import { defineConfig } from 'tsdown'

/**
 * 浏览器侧 bundle 必须打包成"惰性 CJS 工厂"形态：
 * 产物执行时调用 window.__ModuleLoader__.load({ id, factory }) 完成注册，
 * 基线外部依赖通过注入的 require 从客户端模块表取用（不进 bundle）。
 * 对齐 harness 内置预设 packages/client/tsdown.client.ts 的 clientConfig，
 * 但该预设按包名在 harness 仓库里找 manifest，树外包用不了，这里重述最小配置。
 */
export default defineConfig({
  entry: { client: 'src/client/index.tsx' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2024',
  dts: false,
  sourcemap: true,
  clean: false,
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
      '@deepseek-ai/dsh-client-runtime/client',
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
