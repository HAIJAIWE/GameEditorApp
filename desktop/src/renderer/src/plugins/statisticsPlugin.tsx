import type { PluginHost } from '../../../shared/plugin/host'
import type { PluginManifest } from '../../../shared/plugin/types'
import { registerReactBinding } from './reactBindings'
import StatisticsPanel from '../components/StatisticsPanel'

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
  registerReactBinding('statistics.panel', ({ onClose }) => <StatisticsPanel onClose={onClose} />)
  return {
    id: 'statistics',
    name: 'statistics',
    version: '0.1.0',
    description: '数据统计与平衡性分析',
    meta: {
      label: '数据统计',
      icon: '📊',
      description: '数据统计与平衡性分析（经宿主渲染 + appContext 自供给 types）'
    },
    capabilities: [
      { kind: 'command', id: 'statistics.open', label: '数据统计', run: () => host.openPanel('statistics.panel') },
      { kind: 'panel', id: 'statistics.panel', title: '数据统计', ui: { type: 'text', text: '数据统计与平衡性分析' } }
    ]
  }
}
