import type { PluginHost } from '@mobai/shared/plugin/host'
import type { PluginManifest } from '@mobai/shared/plugin/types'
import { translate } from '@mobai/shared/i18n'
import { getLocalePreference } from '../../localePreference'
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
    description: 'Data browsing panels (advanced search / relation graph / attribute chart) with shared state via appContext',
    meta: {
      labelKey: 'dataPanels.metaLabel',
      icon: '🔍',
      descriptionKey: 'dataPanels.metaDescription'
    },
    capabilities: [
      {
        kind: 'command',
        id: 'advancedSearch.open',
        label: 'Advanced search',
        labelKey: 'dataPanels.advancedSearch',
        run: () => host.openPanel('advancedSearch.panel')
      },
      {
        kind: 'panel',
        id: 'advancedSearch.panel',
        title: 'Advanced search',
        titleKey: 'dataPanels.advancedSearch',
        ui: { type: 'text', text: translate(getLocalePreference(), 'dataPanels.advancedSearchUi') }
      },
      {
        kind: 'command',
        id: 'relationGraph.open',
        label: 'Relation graph',
        labelKey: 'dataPanels.relationGraph',
        run: () => host.openPanel('relationGraph.panel')
      },
      {
        kind: 'panel',
        id: 'relationGraph.panel',
        title: 'Relation graph',
        titleKey: 'dataPanels.relationGraph',
        ui: { type: 'text', text: translate(getLocalePreference(), 'dataPanels.relationGraphUi') }
      },
      {
        kind: 'command',
        id: 'attributeChart.open',
        label: 'Attribute chart',
        labelKey: 'dataPanels.attributeChart',
        run: () => host.openPanel('attributeChart.panel')
      },
      {
        kind: 'panel',
        id: 'attributeChart.panel',
        title: 'Attribute chart',
        titleKey: 'dataPanels.attributeChart',
        ui: { type: 'text', text: translate(getLocalePreference(), 'dataPanels.attributeChartUi') }
      }
    ]
  }
}
