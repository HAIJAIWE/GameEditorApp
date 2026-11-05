import type { PluginHost } from '@mobai/shared/plugin/host'
import type { PluginManifest } from '@mobai/shared/plugin/types'
import { registerReactBinding, type PanelBindingProps } from '../host'
import { StatisticsPanel } from '../../components/ceshuType'

/**
 * 数据统计面板 → 插件化第二切片（B 方案 Slice 2）。
 *
 * 与 Slice 1（快捷键参考，纯静态）不同，本面板**依赖应用级数据**（types）。
 * 它经 `useAppContext()` 自供给，而非由 App 以 props 下发——这正是 dsh 式
 * 「插件自供给」的解耦点：面板与 App 之间只剩面板生命周期契约（`onClose`）。
 */
export function defineStatisticsPlugin(host: PluginHost): PluginManifest {
  // 富 UI 作为可选绑定外置（宿主侧）；CLI / 引擎宿主回退到声明式 ui。
  // onClose 由宿主 `HostPanel` 下发（面板生命周期契约），绑定负责转发
  registerReactBinding('statistics.panel', ({ onClose, params }: PanelBindingProps) => {
    const raw = typeof params === 'object' && params !== null ? (params as { tab?: unknown }) : {}
    const initialTab = raw.tab === 'balance' ? 'balance' : 'overview'
    // key：两个菜单入口（游戏数据统计 / 平衡性分析工具）切换时强制重挂，
    // 否则已挂载的实例会保留上一次的页签，「平衡性分析」就又变成假入口。
    return <StatisticsPanel key={initialTab} onClose={onClose} initialTab={initialTab} />
  })
  return {
    id: 'statistics',
    name: 'statistics',
    version: '0.1.0',
    description: 'Statistics',
    meta: {
      label: 'Statistics',
      labelKey: 'plugin.statistics.label',
      icon: '📊',
      description: 'Statistics & balance analysis (host-rendered + appContext supplies types)',
      descriptionKey: 'plugin.statistics.desc'
    },
    capabilities: [
      {
        kind: 'command',
        id: 'statistics.open',
        label: 'Statistics',
        labelKey: 'plugin.statistics.label',
        run: () => host.openPanel('statistics.panel')
      },
      {
        kind: 'command',
        id: 'statistics.openBalance',
        label: 'Balance analysis',
        labelKey: 'menu.tools.balance',
        // 与 `statistics.open` 区分：带 tab 参数直接落到「平衡性」页签
        run: () => host.openPanel('statistics.panel', { tab: 'balance' })
      },
      {
        kind: 'panel',
        id: 'statistics.panel',
        title: 'Statistics',
        titleKey: 'plugin.statistics.label',
        ui: { type: 'text', text: 'Statistics' }
      }
    ]
  }
}
