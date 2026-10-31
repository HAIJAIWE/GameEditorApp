/**
 * plugins/ux —— 交互体验插件：命令面板、菜单、导航、快捷键、引导、自动审阅、插件市场与演示。
 *
 * 外部一律从这里 import（`.../ux`），不要再深插目录内文件。
 */

export { defineAppActionsPlugin } from './appActionsPlugin'
export { defineAutoReviewPlugin } from './autoReviewPlugin'
export { CommandPalette, CommandPaletteView, defineCommandPalettePlugin } from './commandPalettePlugin'
export type { CommandPaletteViewProps } from './commandPalettePlugin'
export { defineDemoPlugin } from './demoPlugin'
export { defineMenusPlugin } from './menusPlugin'
export { defineNavigationPlugin } from './navigationPlugin'
export { defineOnboardingPlugin } from './onboardingPlugin'
export { definePluginMarketPlugin } from './pluginMarketPlugin'
export { defineShortcutsPlugin } from './shortcutsPlugin'
