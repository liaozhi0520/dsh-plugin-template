/**
 * 开发监视器：同时跑 host 半（tsc --watch → lib/index.js）和
 * client 半（tsdown --watch → lib/client.js）两个构建。
 * harness 侧的 HMR 监听构建产物：lib/index.js 变化触发 host 插件重载，
 * lib/client.js 变化触发浏览器原地热替换。
 */
import { spawn } from 'node:child_process'

const tasks = [
  ['host  tsc', 'tsc', ['-p', 'tsconfig.build.json', '--watch', '--preserveWatchOutput']],
  ['client tsdown', 'tsdown', ['--watch']],
]

const children = tasks.map(([label, cmd, args]) => {
  const child = spawn(cmd, args, {
    stdio: 'inherit',
    // Windows 下 .bin 里的是 .cmd shim，需要 shell 解析；
    // pnpm 运行本脚本时已把 node_modules/.bin 放进 PATH。
    shell: process.platform === 'win32',
  })
  child.on('error', (error) => {
    console.error(`[dev] ${label} 启动失败:`, error)
    shutdown(1)
  })
  return child
})

function shutdown(code) {
  for (const child of children) child.kill('SIGTERM')
  process.exit(code)
}

process.on('SIGINT', () => shutdown(130))
process.on('SIGTERM', () => shutdown(0))
