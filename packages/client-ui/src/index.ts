/**
 * packages/client-ui —— 宿主无关的 UI 内核。
 *
 * ## 边界
 * 只收**不 import `renderer/src` 任何东西**的模块。它们只依赖 `react` 与
 * `@mobai/shared/*` 的类型，因此可以搬到任何宿主（Electron 渲染层 / 未来的 Web
 * 预览 / 测试夹具）而不改一行。守卫见 `apps/desktop/tests/unit/clientUiBoundary.test.ts`。
 *
 * ## 收进来的东西（按依赖方向自下而上）
 * - `LucideIcon`：内嵌 SVG path 的图标渲染（数据来自 `shared/util/ui`，零依赖）。
 * - `reactBindings`：React 组件绑定注册表（插件声明 → 渲染层组件）。
 * - `slotOutlet`：插槽出口（按 slot 声明渲染注册的条目）。
 * - `appContext`：应用级共享状态（类型表 / 跳转 / 撤销刷新）。
 * - `HostPanel` / `MenuMount` / `ViewMount`：三个挂载点。它们**只认 `PluginHost` 接口**，
 *   宿主实例由调用方作为 prop 传入——不读任何单例。
 *
 * ## 为什么挂载点能进来（A2 阶段 2 的关键）
 * `HostPanel`/`MenuMount` 原本就吃 `host` prop，天然宿主无关；`ViewMount` 唯一的
 * 业务耦合是硬 import 了 `CeshuViewProvider`，已改成 `provider` / `context` 两个 prop
 * （宿主把"当前文档"这类上下文包在外面，本包不认识它的形状）。
 *
 * ## 还没进来的（阶段 3）
 * `MainViewMount`：它 import 的 `mainViewContext` 引了 `components/ceshu` 的
 * `PreviewJumpTarget` / `ReferenceTarget`——那是业务类型，要先挪进 `shared` 才能搬。
 *
 * ## 外部一律从这里 import
 * app 侧的 `plugins/host/index.ts` 与 `components/common/index.ts` 仍然 re-export
 * 本包对应条目，故既有 `from '.../plugins/host'` / `from '.../common'` 的调用点不用改。
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
export { default as LucideIcon } from './LucideIcon'
export type { LucideIconProps } from './LucideIcon'
export { LocaleProvider, useLocale, useT } from './i18n'
export { ShortcutKeys } from './ShortcutKeys'
export type { ShortcutKeysProps } from './ShortcutKeys'
export { useModalLayer } from './useModalLayer'
export type { ModalLayerOptions } from './useModalLayer'
export { HostPanel } from './HostPanel'
export { MenuMount } from './MenuMount'
export { ViewMount } from './ViewMount'
