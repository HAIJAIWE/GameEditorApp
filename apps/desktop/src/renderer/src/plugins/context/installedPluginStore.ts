import type { PluginSource } from '@mobai/shared/plugin/types'

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

/**
 * 已下线的插件 source（合并 / 改名后不再存在）。
 *
 * `agent-team` 与 `trajectory` 在 Slice 51 合并为 `session`；它们曾经是「市场可安装」项，
 * 用户装过就会写进 localStorage。留着只会让启动时去加载一个不存在的 factory，
 * 在插件列表里留下一个 error 占位。
 */
const OBSOLETE_PLUGIN_SOURCES: ReadonlySet<string> = new Set(['factory:agent-team', 'factory:trajectory'])

/** 从持久化清单里剔除已下线的 source（纯函数，便于单测） */
export function pruneObsoleteSources(sources: PluginSource[]): PluginSource[] {
  return sources.filter((source) => !OBSOLETE_PLUGIN_SOURCES.has(source))
}
