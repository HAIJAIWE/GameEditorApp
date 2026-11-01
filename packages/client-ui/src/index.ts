/**
 * packages/client-ui —— 宿主无关的 UI 内核。
 *
 * ## 边界（A2 阶段 1）
 * 只收**不 import `renderer/src` 任何东西**的模块：插槽出口、React 组件绑定注册、
 * 应用级上下文。它们只依赖 `react` 与 `@mobai/shared/plugin/*` 的类型，
 * 因此可以搬到任何宿主（Electron 渲染层 / 未来的 Web 预览 / 测试夹具）而不改一行。
 *
 * ## 为什么先只搬这三个（224 行）
 * `plugins/host` 共 790 行 / 10 文件，其中 `ViewMount` 会 `import ../ceshu` 注入
 * 策划书视图上下文、`MainViewMount` 引 `components/ceshu` 的跳转类型、`HostPanel`
 * 直接读 `pluginHost` 单例——**这些是宿主的业务，不是 UI 内核**。硬搬只会造出
 * "仍依赖 app 的包"（A3 已验证过这条死路）。所以先搬零依赖的那层，把解析链
 * 与守卫立起来，挂载点/上下文留给阶段 2-3 逐个剥。
 *
 * ## 外部一律从这里 import
 * `apps/desktop/src/renderer/src/plugins/host/index.ts` 仍然 re-export 本包，
 * 故既有 `from '.../plugins/host'` 的调用点**一行不用改**。
 */

export {
  getReactBinding,
  getSlotComponent,
  registerReactBinding,
  registerSlotComponent,
  renderUiNode,
  uiOf
} from './reactBindings'
export type { PanelBindingProps } from './reactBindings'
export { SlotOutlet } from './slotOutlet'
export type { SlotOutletProps } from './slotOutlet'
export { AppContextProvider, useAppContext } from './appContext'
export type { AppContextValue } from './appContext'
