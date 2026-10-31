/**
 * plugins/ceshu 能力入口。
 *
 * 外部一律从这里 import（`.../ceshu`），不要再深插目录内文件。
 */

export { editorAutoFill, editorExportHandoff, editorExportProject, editorShowChangelog, editorShowReadiness, setCeshuEditorBridge } from './ceshuEditorBridge'
export type { CeshuEditorBridge } from './ceshuEditorBridge'
export { defineCeshuMenusPlugin } from './ceshuMenusPlugin'
export { defineCeshuPlugin } from './ceshuPlugin'
export { CESHU_ARTIFACT_MOUNT, CESHU_CHAPTERNAV_MOUNT, CESHU_CONTENT_MOUNT, CESHU_TOOLBAR_MOUNT, CESHU_VIEW_MOUNT, CeshuViewProvider, useCeshuView } from './ceshuViewContext'
export type { CeshuViewContextValue } from './ceshuViewContext'
export { defineCeshuViewsPlugin } from './ceshuViewsPlugin'
