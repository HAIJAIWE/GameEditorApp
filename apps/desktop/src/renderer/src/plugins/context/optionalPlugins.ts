import type { PluginMarketEntry } from '@mobai/shared/plugin/types'

/**
 * 插件市场元数据（展示层清单，类比 dsh 的 plugin-manager / plugin-recommendations）。
 *
 * 当前 `ready:true` 仅 plugin-market 自身——它由 builtins 经 `PluginLoader` 加载，
 * 作为市场入口。其余 3 个 dsh 有用实验能力的插槽先占位、标 `ready:false`（即将推出），
 * 各自探路验证通过后再翻 `ready:true` 并补上对应 `factory:<id>`。
 *
 * 文案走 `descriptionKey`（渲染层 `t(key)` 翻译），`description` 仅作英文回退。
 */
export const marketRegistry: PluginMarketEntry[] = [
  {
    id: 'plugin-market',
    name: 'plugin-market',
    version: '0.1.0',
    description: 'Plugin market: browse, enable/disable, install optional capabilities on demand',
    descriptionKey: 'pluginMarket.description',
    source: 'factory:plugin-market',
    tier: 'core',
    ready: true,
    recommended: true,
    icon: '🧩'
  },
  {
    id: 'session-history',
    name: 'session-history',
    version: '0.1.0',
    description: 'Session history search: list drafts/history events, search by content',
    descriptionKey: 'pluginMarket.entry.sessionHistory',
    source: 'factory:session-history',
    tier: 'optional',
    ready: true,
    recommended: true,
    icon: '🕘'
  },
  {
    id: 'auto-review',
    name: 'auto-review',
    version: '0.1.0',
    description: 'Pre-execution review: model pre-judges risk before a tool runs (approve/reject/reason)',
    descriptionKey: 'pluginMarket.entry.autoReview',
    source: 'factory:auto-review',
    tier: 'experimental',
    ready: true,
    icon: '🛡️'
  },
  {
    id: 'recent-changes',
    name: 'recent-changes',
    version: '0.1.0',
    description: 'Recent changes: view data the agent recently modified (from the operation log)',
    descriptionKey: 'pluginMarket.entry.recentChanges',
    source: 'factory:recent-changes',
    tier: 'optional',
    ready: true,
    icon: '📝'
  },
  {
    id: 'command-palette',
    name: 'command-palette',
    version: '0.1.0',
    description: 'Command palette: ⌘K to search and run commands / open panels',
    descriptionKey: 'pluginMarket.entry.commandPalette',
    source: 'factory:command-palette',
    tier: 'core',
    ready: true,
    icon: '⌘'
  },
  {
    id: 'session',
    name: 'session',
    version: '0.1.0',
    description: 'Session: main conversation summary, sub-agent board and session trajectory (same state)',
    descriptionKey: 'pluginMarket.entry.session',
    source: 'factory:session',
    tier: 'core',
    ready: true,
    icon: '💬'
  }
]
