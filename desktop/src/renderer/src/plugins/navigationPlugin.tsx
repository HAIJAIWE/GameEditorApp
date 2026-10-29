import type { PluginHost } from '../../../shared/plugin/host'
import type { PluginManifest, PluginSidebarItem } from '../../../shared/plugin/types'
import { notify, setHomeVisible } from './hostBridge'

/**
 * 左侧主导航栏插件化（B 方案 Slice 10）。
 *
 * 把 `App.tsx` 里那张写死的 `SIDEBAR_ITEMS` 常量搬到这里，改由 `sidebar` 能力声明。
 * 侧栏条目有三类动作，统一收编成「能力 id」语义：
 * - **home**：回策划书首页 = 命令 `nav.home`（`setHomeVisible(true)` + 关浮层）；
 * - **agent**：聚焦右侧智能体输入框 = 命令 `nav.agent`（DOM focus 或提示）；
 * - **其余**：打开对应 panel 能力（如 `statistics.panel`），高亮靠 `item.panel===activePanel`。
 *
 * home/agent 之所以能收编成命令，是因为它们需要的界面能力（`setHomeVisible` / `notify`）
 * 都在 `hostBridge` 上、由 App 注入——和 `onboardingPlugin` 的 `nav.*` 命令同源。
 *
 * 于是 `App` 不再持有侧栏条目表，也不再写 `handleSidebar` 的三分支；加侧栏项只改本插件。
 */
export function defineNavigationPlugin(host: PluginHost): PluginManifest {
  /** 侧栏条目：key 固定（E2E 锚点 `sidebar-<key>`），结构全部来自插件 */
  const SIDEBAR_ITEMS: PluginSidebarItem[] = [
    { key: 'home', label: '策划书', icon: 'book-open', command: 'nav.home' },
    { key: 'plugins', label: '插件中心', icon: 'package', panel: 'plugins.panel' },
    { key: 'relationGraph', label: '关系图', icon: 'link', panel: 'relationGraph.panel' },
    { key: 'advancedSearch', label: '高级搜索', icon: 'search', panel: 'advancedSearch.panel' },
    { key: 'stats', label: '统计', icon: 'target', panel: 'statistics.panel' },
    { key: 'settings', label: '设置', icon: 'settings', panel: 'settings.panel' },
    { key: 'about', label: '关于', icon: 'info', panel: 'about.panel' },
    { key: 'agent', label: '智能体', icon: 'bot', command: 'nav.agent' }
  ]

  return {
    id: 'navigation',
    name: 'navigation',
    version: '0.1.0',
    description: '左侧主导航栏（侧栏条目由插件声明）+ 首页/智能体导航命令',
    meta: {
      label: '主导航',
      icon: '🧭',
      description: '侧栏条目与首页/智能体导航命令'
    },
    capabilities: [
      {
        kind: 'command',
        id: 'nav.home',
        label: '回策划书首页',
        // 与旧 handleSidebar 的 home 分支完全一致：显首页 + 关浮层
        run: () => {
          setHomeVisible(true)
          host.closePanel()
        }
      },
      {
        kind: 'command',
        id: 'nav.agent',
        label: '聚焦智能体',
        // 与旧 handleSidebar 的 agent 分支一致：可用则聚焦输入框，否则提示
        run: () => {
          const input = document.querySelector<HTMLInputElement>('[data-testid="digital-input"]')
          if (input !== null && !input.disabled) {
            input.scrollIntoView({ block: 'nearest' })
            input.focus()
            return
          }
          notify('智能体在右侧常驻；当前对话运行中，输入框暂不可用')
        }
      },
      {
        kind: 'sidebar',
        id: 'navigation.sidebar',
        order: 10,
        items: SIDEBAR_ITEMS
      }
    ]
  }
}
