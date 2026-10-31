/**
 * plugins/context 能力入口。
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
