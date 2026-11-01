/**
 * plugins/context —— 插件间上下文总线：代码视图请求、菜单禁用状态、命令面板总线、导入导出/撤销等应用动作、已装插件与可选插件市场。
 *
 * 外部一律从这里 import（`.../context`），不要再深插目录内文件。
 */

export { requestCodeView, subscribeCodeViewRequest, takeCodeViewRequest } from './codeViewRequest'
export { isMenuDisabled, setMenuStateProvider } from './menuState'
export type { MenuState } from './menuState'
export { openPalette, subscribePalette } from './paletteBus'
export { engineExport, exportCsv, exportExcel, exportJson, exportSnapshot, importCsv, importExcel, importJson, redo, setAppIoPort, undo } from './appActionsIo'
export type { AppIoPort } from './appActionsIo'
export { installedPluginStore, pluginHost } from './builtins'
export { createLocalStorageInstalledStore, pruneObsoleteSources } from './installedPluginStore'
export type { InstalledPluginStore } from './installedPluginStore'
export { marketRegistry } from './optionalPlugins'
