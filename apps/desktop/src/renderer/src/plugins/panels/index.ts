/**
 * plugins/panels —— 内置面板插件集合：主区视图、数据浏览/录入/维护面板、MCP 配置、最近变更、引用、统计与工具面板。
 *
 * 外部一律从这里 import（`.../panels`），不要再深插目录内文件。
 */

export { defineCoreViewsPlugin } from './coreViewsPlugin'
export { defineDataPanelsPlugin } from './dataPanelsPlugin'
export { defineEntryPanelsPlugin } from './entryPanelsPlugin'
export { defineMaintenancePanelsPlugin } from './maintenancePanelsPlugin'
export { defineMcpConfigPlugin } from './mcpConfigPlugin'
export { defineRecentChangesPlugin } from './recentChangesPlugin'
export { defineReferencesPlugin } from './referencesPlugin'
export { defineShellPanelsPlugin } from './shellPanelsPlugin'
export { defineStatisticsPlugin } from './statisticsPlugin'
export { defineUtilityPanelsPlugin } from './utilityPanelsPlugin'
