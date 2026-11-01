/**
 * plugins/host —— 插件宿主运行时：宿主 UI 桥、面板/菜单/视图挂载点、插槽出口、React 组件绑定注册与应用上下文。
 *
 * 外部一律从这里 import（`.../host`），不要再深插目录内文件。
 */

export { getActiveCeshuId, notify, openPanel, setHomeVisible, setHostUi } from './hostBridge'
export type { HostUiBridge } from './hostBridge'
// 三个挂载点已下沉到 `packages/client-ui`（只认 `PluginHost` 接口，不读单例）。
// 这里保留 re-export，既有 `from '.../plugins/host'` 的调用点不用改。
export { HostPanel, MenuMount, ViewMount } from '@mobai/client-ui'
export { MainViewMount } from './MainViewMount'
export type { AppMainTab } from './MainViewMount'
export { AppContextProvider, useAppContext } from '@mobai/client-ui'
export type { AppContextValue } from '@mobai/client-ui'
export { EMPTY_MAIN_VIEW_CONTEXT, MainViewProvider, useMainViewContext } from './mainViewContext'
export type { MainViewContextValue } from './mainViewContext'
export {
  getReactBinding,
  getSlotComponent,
  registerReactBinding,
  registerSlotComponent,
  renderUiNode,
  uiOf
} from '@mobai/client-ui'
export type { PanelBindingProps } from '@mobai/client-ui'
export { SlotOutlet } from '@mobai/client-ui'
export type { SlotOutletProps } from '@mobai/client-ui'
