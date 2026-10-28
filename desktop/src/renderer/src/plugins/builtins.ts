import { PluginHost } from '../../../shared/plugin/host'
import { defineCeshuPlugin } from './ceshuPlugin'
import { defineDataPanelsPlugin } from './dataPanelsPlugin'
import { defineDemoPlugin } from './demoPlugin'
import { defineEntryPanelsPlugin } from './entryPanelsPlugin'
import { defineMaintenancePanelsPlugin } from './maintenancePanelsPlugin'
import { defineReferencesPlugin } from './referencesPlugin'
import { defineShellPanelsPlugin } from './shellPanelsPlugin'
import { defineShortcutsPlugin } from './shortcutsPlugin'
import { defineStatisticsPlugin } from './statisticsPlugin'
import { defineUtilityPanelsPlugin } from './utilityPanelsPlugin'

/**
 * 宿主单例：整个渲染进程共享一个 PluginHost。
 * 模块加载即幂等注册内置插件（ceshu 受保护核心 + demo 示例），App 只需 import 本模块。
 *
 * 这是「万物插件化」的脊柱：未来任何新能力都走 `pluginHost.register(manifest)`，
 * 不再硬编码进 App/MenuBar/CeshuView。
 */
export const pluginHost = new PluginHost()

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
}

registerBuiltinPlugins()
