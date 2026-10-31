import { createPluginLoader } from '../../../shared/plugin/loader'
import { installedPluginStore, pluginHost, pruneObsoleteSources } from './context'
import { defineCeshuMenusPlugin, defineCeshuPlugin, defineCeshuViewsPlugin } from './ceshu'
import {
  defineCoreViewsPlugin,
  defineDataPanelsPlugin,
  defineEntryPanelsPlugin,
  defineMaintenancePanelsPlugin,
  defineMcpConfigPlugin,
  defineRecentChangesPlugin,
  defineReferencesPlugin,
  defineShellPanelsPlugin,
  defineStatisticsPlugin,
  defineUtilityPanelsPlugin
} from './panels'
import { defineSessionHistoryPlugin, defineSessionPlugin } from './session'
import {
  defineAppActionsPlugin,
  defineAutoReviewPlugin,
  defineCommandPalettePlugin,
  defineDemoPlugin,
  defineMenusPlugin,
  defineNavigationPlugin,
  defineOnboardingPlugin,
  definePluginMarketPlugin,
  defineShortcutsPlugin
} from './ux'

/**
 * 内置插件的**组合根**（composition root）。
 *
 * 为什么不放在 `plugins/context/builtins.ts`：注册要 import `./ux` `./panels` `./ceshu` `./session`
 * 四个能力入口，而这些目录里的模块（`ux/shortcutsPlugin`、`ux/appActionsPlugin`、
 * `ux/commandPalettePlugin`、`ux/pluginMarketPlugin`）又 import `../context`。
 * 注册一旦写在 context 里，`context → ux → context` 成环，且注册在模块顶层执行：
 * 从 ux 侧首次进入 context 时 ux 尚未求值完，`defineShortcutsPlugin` 等绑定还是 undefined
 * （实测 `defineShortcutsPlugin is not a function`）。放在 `plugins/` 根上，本文件不属于
 * 任何能力文件夹，没有任何能力文件夹反向 import 它，环即断开。
 *
 * 副作用时机不变：`App.tsx` 顶部 `import './plugins/builtins'` 触发，仍在 App 读取
 * `pluginHost.get('digital-panel')` 之前（ES import 先于模块体执行）。
 */

/**
 * cordis 式运行时加载器（Slice 44）。静态打包的可选插件走 `factory:` 映射；
 * 未来外部 bundle 走 `link:/file:/registry:`。
 */
export const pluginLoader = createPluginLoader({
  'plugin-market': () => definePluginMarketPlugin(pluginHost, pluginLoader, installedPluginStore),
  'session': () => defineSessionPlugin(pluginHost),
  'session-history': () => defineSessionHistoryPlugin(pluginHost),
  'auto-review': () => defineAutoReviewPlugin(pluginHost),
  'recent-changes': () => defineRecentChangesPlugin(pluginHost),
  'command-palette': () => defineCommandPalettePlugin(pluginHost)
})

let registered = false

export function registerBuiltinPlugins(): void {
  if (registered) return
  registered = true
  pluginHost.register(defineCeshuPlugin())
  pluginHost.register(defineDemoPlugin(pluginHost))
  pluginHost.register(defineShortcutsPlugin(pluginHost))
  pluginHost.register(defineStatisticsPlugin(pluginHost))
  pluginHost.register(defineReferencesPlugin(pluginHost))
  pluginHost.register(defineUtilityPanelsPlugin(pluginHost))
  pluginHost.register(defineDataPanelsPlugin(pluginHost))
  pluginHost.register(defineMaintenancePanelsPlugin(pluginHost))
  pluginHost.register(defineEntryPanelsPlugin(pluginHost))
  pluginHost.register(defineShellPanelsPlugin(pluginHost))
  pluginHost.register(defineOnboardingPlugin(pluginHost))
  pluginHost.register(defineAppActionsPlugin(pluginHost))
  pluginHost.register(defineMenusPlugin(pluginHost))
  pluginHost.register(defineNavigationPlugin(pluginHost))
  pluginHost.register(defineCeshuViewsPlugin())
  pluginHost.register(defineCeshuMenusPlugin(pluginHost))
  pluginHost.register(defineMcpConfigPlugin(pluginHost))
  pluginHost.register(defineCoreViewsPlugin())
}

registerBuiltinPlugins()

/**
 * 插件市场入口经 `PluginLoader` 异步加载（验证 cordis 式运行时加载路径），
 * 同时重新加载上次通过市场安装的插件（installedPluginStore 记录的 source）。
 * 失败仅把对应占位标 `status:'error'`，不阻塞宿主。
 */
void pluginHost.loadPlugin(pluginLoader, 'factory:plugin-market')
void pluginHost.loadPlugin(pluginLoader, 'factory:session')
void pluginHost.loadPlugin(pluginLoader, 'factory:session-history')
void pluginHost.loadPlugin(pluginLoader, 'factory:auto-review')
void pluginHost.loadPlugin(pluginLoader, 'factory:recent-changes')
void pluginHost.loadPlugin(pluginLoader, 'factory:command-palette')

/**
 * 迁移（Slice 51）：`agent-team` / `trajectory` 已合并为 `session`。
 * 清掉可能残留在 localStorage 的旧 source——否则启动时加载一个已不存在的 factory，
 * 会在插件列表里留下一个无意义的 error 占位（`loadPlugin` 不抛，但状态是 error）。
 */
const installedSources = installedPluginStore.load()
const liveSources = pruneObsoleteSources(installedSources)
if (liveSources.length !== installedSources.length) installedPluginStore.save(liveSources)
for (const source of liveSources) {
  void pluginHost.loadPlugin(pluginLoader, source)
}
