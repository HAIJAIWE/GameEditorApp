/**
 * plugins/host 能力入口。
 *
 * 外部一律从这里 import（`.../host`），不要再深插目录内文件。
 */

export { getActiveCeshuId, notify, openPanel, setHomeVisible, setHostUi } from './hostBridge'
export type { HostUiBridge } from './hostBridge'
export { HostPanel } from './HostPanel'
export { MainViewMount } from './MainViewMount'
export type { AppMainTab } from './MainViewMount'
export { MenuMount } from './MenuMount'
export { ViewMount } from './ViewMount'
export { AppContextProvider, useAppContext } from './appContext'
export type { AppContextValue } from './appContext'
export { EMPTY_MAIN_VIEW_CONTEXT, MainViewProvider, useMainViewContext } from './mainViewContext'
export type { MainViewContextValue } from './mainViewContext'
export { getReactBinding, getSlotComponent, registerReactBinding, registerSlotComponent, renderUiNode, uiOf } from './reactBindings'
export type { PanelBindingProps } from './reactBindings'
export { SlotOutlet } from './slotOutlet'
export type { SlotOutletProps } from './slotOutlet'
