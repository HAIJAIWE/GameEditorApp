import { PluginHost } from '../../../shared/plugin/host'
import { createPluginLoader } from '../../../shared/plugin/loader'
import { MAIN_VIEW_STORE_KEY, createMainViewStoreDecl } from '../../../shared/plugin/mainViewStore'
import { defineAppActionsPlugin } from './appActionsPlugin'
import { defineCeshuMenusPlugin } from './ceshuMenusPlugin'
import { defineCeshuPlugin } from './ceshuPlugin'
import { defineCeshuViewsPlugin } from './ceshuViewsPlugin'
import { defineCommandPalettePlugin } from './commandPalettePlugin'
import { defineCoreViewsPlugin } from './coreViewsPlugin'
import { defineDataPanelsPlugin } from './dataPanelsPlugin'
import { defineDemoPlugin } from './demoPlugin'
import { defineEntryPanelsPlugin } from './entryPanelsPlugin'
import { defineMaintenancePanelsPlugin } from './maintenancePanelsPlugin'
import { defineMcpConfigPlugin } from './mcpConfigPlugin'
import { defineMenusPlugin } from './menusPlugin'
import { defineNavigationPlugin } from './navigationPlugin'
import { defineOnboardingPlugin } from './onboardingPlugin'
import { definePluginMarketPlugin } from './pluginMarketPlugin'
import { defineSessionPlugin } from './sessionPlugin'
import { defineSessionHistoryPlugin } from './sessionHistoryPlugin'
import { defineAutoReviewPlugin } from './autoReviewPlugin'
import { defineRecentChangesPlugin } from './recentChangesPlugin'
import { defineReferencesPlugin } from './referencesPlugin'
import { defineShellPanelsPlugin } from './shellPanelsPlugin'
import { defineShortcutsPlugin } from './shortcutsPlugin'
import { defineStatisticsPlugin } from './statisticsPlugin'
import { defineUtilityPanelsPlugin } from './utilityPanelsPlugin'
import { createLocalStorageInstalledStore, pruneObsoleteSources } from './installedPluginStore'

/**
 * 宿主单例：整个渲染进程共享一个 PluginHost。
 * 模块加载即幂等注册内置插件（ceshu 受保护核心 + demo 示例），App 只需 import 本模块。
 *
 * 这是「万物插件化」的脊柱：未来任何新能力都走 `pluginHost.register(manifest)`，
 * 不再硬编码进 App/MenuBar/CeshuView。
 */
export const pluginHost = new PluginHost()

/*
 * 主区页签激活态的根级 store：**在这里声明**（而不是等 `MainViewMount` 挂载时），
 * 因为 `host.openMainView(id)` 可能先于挂载被调用（命令面板刚打开就点页签、
 * 或引导脚本在首帧前跳页）。声明在宿主单例创建之后、任何消费方渲染之前，顺序最稳。
 */
pluginHost.declareStore(MAIN_VIEW_STORE_KEY, createMainViewStoreDecl())

/**
 * 插件市场持久化（已安装 source 清单）。浏览器端落地 localStorage，非浏览器降级为空。
 * 重启后由 `autoLoadInstalled()` 经 loader 重新加载。
 */
export const installedPluginStore = createLocalStorageInstalledStore()

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
