import type { PluginMarketEntry } from '../../../shared/plugin/types'

/**
 * 插件市场元数据（展示层清单，类比 dsh 的 plugin-manager / plugin-recommendations）。
 *
 * 当前 `ready:true` 仅 plugin-market 自身——它由 builtins 经 `PluginLoader` 加载，
 * 作为市场入口。其余 3 个 dsh 有用实验能力的插槽先占位、标 `ready:false`（即将推出），
 * 各自探路验证通过后再翻 `ready:true` 并补上对应 `factory:<id>`。
 */
export const marketRegistry: PluginMarketEntry[] = [
  {
    id: 'plugin-market',
    name: 'plugin-market',
    version: '0.1.0',
    description: '插件市场：浏览、启用/禁用、按需安装可选能力',
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
    description: '会话历史检索：列出草稿/历史事件，按内容搜索',
    source: 'factory:session-history',
    tier: 'optional',
    ready: true,
    recommended: true,
    icon: '🕘'
  },
  {
    id: 'agent-team',
    name: 'agent-team',
    version: '0.1.0',
    description: '智能体协作：展示运行中的子智能体 + 共享任务看板',
    source: 'factory:agent-team',
    tier: 'optional',
    ready: true,
    icon: '🤝'
  },
  {
    id: 'auto-review',
    name: 'auto-review',
    version: '0.1.0',
    description: '执行预审：工具执行前由模型做风险预审（approve/reject/reason）',
    source: 'factory:auto-review',
    tier: 'experimental',
    ready: true,
    icon: '🛡️'
  },
  {
    id: 'recent-changes',
    name: 'recent-changes',
    version: '0.1.0',
    description: '最近改动：查看智能体最近修改的数据（来自操作日志）',
    source: 'factory:recent-changes',
    tier: 'optional',
    ready: true,
    icon: '📝'
  },
  {
    id: 'command-palette',
    name: 'command-palette',
    version: '0.1.0',
    description: '命令面板：⌘K 搜索并执行命令 / 打开面板',
    source: 'factory:command-palette',
    tier: 'core',
    ready: true,
    icon: '⌘'
  },
  {
    id: 'trajectory',
    name: 'trajectory',
    version: '0.1.0',
    description: '会话轨迹：按轮次查看执行步骤、消息与运行成本',
    source: 'factory:trajectory',
    tier: 'optional',
    ready: true,
    icon: '🧭'
  }
]
