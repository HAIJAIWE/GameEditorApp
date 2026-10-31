import type { PluginHost } from '../../../../shared/plugin/host'
import type { PluginManifest } from '../../../../shared/plugin/types'
import { AdvancedSearchPanel } from '../../components/common'
import { AttributeChartPanel } from '../../components/attr'
import { RelationGraphPanel } from '../../components/ceshuField'
import { useAppContext } from '../host'
import { registerReactBinding, type PanelBindingProps } from '../host'

/**
 * 数据浏览面板 → 插件化第五切片（B 方案 Slice 5）。
 *
 * 这三个面板只依赖「共享状态」——`types` 与跳转动作 `handleJump`，正好是 `appContext` 的两项。
 * 所以绑定层用 `useAppContext()` 自取，App 不再逐个以 props 下发（Slice 2 那套自供给的直接受益处：
 * Slice 5 全是「纯配置迁移」，组件本身一行不改）。
 *
 * 注意绑定**用具名函数组件**而不是内联箭头：函数体里调 `useAppContext()`，
 * 内联箭头在 lint 眼里不算组件，`react-hooks/rules-of-hooks` 会报「hook 不在组件内」。
 */
function AdvancedSearchPanelBound({ onClose }: PanelBindingProps) {
  const { types, handleJump } = useAppContext()
  return <AdvancedSearchPanel types={types} onJump={handleJump} onClose={onClose} />
}

function RelationGraphPanelBound() {
  const { types, handleJump } = useAppContext()
  // 关系图面板不带 onClose：关闭由浮层统一处理
  return <RelationGraphPanel types={types} onJump={handleJump} />
}

function AttributeChartPanelBound() {
  const { types } = useAppContext()
  return <AttributeChartPanel types={types} />
}

export function defineDataPanelsPlugin(host: PluginHost): PluginManifest {
  registerReactBinding('advancedSearch.panel', AdvancedSearchPanelBound)
  registerReactBinding('relationGraph.panel', RelationGraphPanelBound)
  registerReactBinding('attributeChart.panel', AttributeChartPanelBound)

  return {
    id: 'data-panels',
    name: 'data-panels',
    version: '0.1.0',
    description: '数据浏览面板包（高级搜索 / 关系图 / 属性图表），共享状态经 appContext 自供给',
    meta: {
      label: '数据浏览',
      icon: '🔍',
      description: '3 个只依赖 types + handleJump 的面板，经宿主渲染 + appContext 自供给'
    },
    capabilities: [
      {
        kind: 'command',
        id: 'advancedSearch.open',
        label: '高级搜索',
        run: () => host.openPanel('advancedSearch.panel')
      },
      {
        kind: 'panel',
        id: 'advancedSearch.panel',
        title: '高级搜索',
        ui: { type: 'text', text: '跨类型按关键词/字段检索条目并跳转' }
      },
      {
        kind: 'command',
        id: 'relationGraph.open',
        label: '关系图',
        run: () => host.openPanel('relationGraph.panel')
      },
      {
        kind: 'panel',
        id: 'relationGraph.panel',
        title: '关系图',
        ui: { type: 'text', text: '以某条目为中心的引用关系图' }
      },
      {
        kind: 'command',
        id: 'attributeChart.open',
        label: '属性图表',
        run: () => host.openPanel('attributeChart.panel')
      },
      {
        kind: 'panel',
        id: 'attributeChart.panel',
        title: '属性图表',
        ui: { type: 'text', text: '各类型的数值字段分布' }
      }
    ]
  }
}
