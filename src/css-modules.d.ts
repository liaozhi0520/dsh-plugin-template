/** CSS Modules 导入声明：构建时由 tsdown.config.ts 的 css-modules-inline 插件展开。 */
declare module '*.module.css' {
  /** 本地类名 → 哈希类名 映射。 */
  const classes: Readonly<Record<string, string>>
  /** 编译（压缩）后的样式文本；注入生命周期由插件入口的 effect 管。 */
  export const cssText: string
  export default classes
}
