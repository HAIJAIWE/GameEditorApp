/**
 * shared/config/settings —— 统一设置基座：localStorage 键值读写/导入导出、主题、中间页签、引导进度、字号与删除确认等偏好。
 *
 * 外部一律从这里 import（`.../settings`），不要再深插目录内文件。
 */

export * from './settingsStore'
export * from './middleTab'
export * from './onboarding'
export * from './theme'
export * from './settingsPreferences'
