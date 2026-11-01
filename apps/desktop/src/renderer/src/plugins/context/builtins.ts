import { PluginHost } from '@mobai/shared/plugin/host'
import { MAIN_VIEW_STORE_KEY, createMainViewStoreDecl } from '@mobai/shared/plugin/mainViewStore'
import { createLocalStorageInstalledStore } from './installedPluginStore'

/**
 * 宿主单例：整个渲染进程共享一个 PluginHost。
 *
 * 这是「万物插件化」的脊柱：未来任何新能力都走 `pluginHost.register(manifest)`，
 * 不再硬编码进 App/MenuBar/CeshuView。
 *
 * ⚠️ 本模块**只放单例本身**，不放内置插件的注册——注册在 `renderer/src/plugins/builtins.ts`
 * （组合根）。原因：注册要 import `../ux` `../panels` `../ceshu` `../session` 四个能力入口，
 * 而这四个目录里的模块（如 `ux/shortcutsPlugin`）又 import `../context`。把注册放在本模块，
 * 会形成「context → ux → context」的强连通分量，且注册在**模块顶层**执行，于是
 * `context` 被从 ux 侧首次进入时，ux 尚未求值完，`defineShortcutsPlugin` 等绑定是 undefined
 * （实测：`defineShortcutsPlugin is not a function`）。组合根放在 `plugins/` 根上就没有这条回边。
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
