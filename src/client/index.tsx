/**
 * dsh-plugin-template, browser half: registers a demo settings section so the
 * client-bundle HMR chain is visible end to end — edit this file, the local
 * `tsdown --watch` rewrites lib/client.js, the host's client-hmr stat poll
 * broadcasts the rebuild over SSE, and the browser swaps this plugin's fiber
 * in place without a page reload.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the settings shell's SlotMap merge (the 'settings.section' entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'

export const name = 'dsh-plugin-template'
export const inject = ['slots']

/** Demo settings page. Components receive only the framework props shares; this one needs none. */
function TemplateSection(_props: PropsRuntime<'settings.section'>) {
  return (
    <div style={{ padding: 16 }}>
      <h2>HMR 演示</h2>
      <p>
        这段文字来自 dsh-plugin-template 的 client half。
        编辑 src/client/index.tsx 并保存：tsdown --watch 会重写 lib/client.js，
        浏览器不刷新页面就地把本节换成新内容。
      </p>
    </div>
  )
}

export function apply(ctx: Context): void {
  console.log('[dsh-plugin-template] client half loaded (v1)')
  // settings.section 由设置域在运行时声明；slots.inject 等声明出现后注册，
  // 声明坍缩时自动撤下，重新声明时再注册。
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'dsh-plugin-template',
    order: 100,
    label: 'HMR 演示',
  }, TemplateSection))
}
