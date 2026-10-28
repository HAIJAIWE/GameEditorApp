import type { PluginSource } from '../../../shared/plugin/types'

/**
 * 已安装插件清单的持久化（类比 dsh 的 installed 记录）。
 * 仅记录「通过市场安装的 source」，重启后由 builtins 经 loader 重新加载。
 * 落地方式（localStorage / IPC / 文件）由宿主决定，此处给一个浏览器默认实现。
 */
export interface InstalledPluginStore {
  load(): PluginSource[]
  save(sources: PluginSource[]): void
}

/** 浏览器端实现：localStorage 持久化（非浏览器环境降级为空）。 */
export function createLocalStorageInstalledStore(key = 'mb.installedPlugins'): InstalledPluginStore {
  const read = (): PluginSource[] => {
    try {
      if (typeof localStorage === 'undefined') return []
      const raw = localStorage.getItem(key)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as PluginSource[]) : []
    } catch {
      return []
    }
  }
  return {
    load: read,
    save(sources) {
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(sources))
      } catch {
        // 持久化失败不阻塞安装
      }
    }
  }
}
