import type { PluginHost } from '@mobai/shared/plugin/host'
import type { PluginManifest } from '@mobai/shared/plugin/types'
import { ReferencesPanel, type ReferenceTarget } from '../../components/ceshuField'
import { useAppContext } from '../host'
import { registerReactBinding, type PanelBindingProps } from '../host'

/**
 * 数据关联预览 → 插件化第三切片（B 方案 Slice 3）。
 *
 * 与前两切片的差别：本面板**需要打开参数**（要看哪一条的引用关系）。参数由宿主携带
 * （`host.openPanel('references.panel', target)` / `setPanelParams`），不再由 App 用
 * `refTarget` state 记着再当 props 传——App 因此少一份与面板强耦合的状态。
 *
 * 契约侧只认 `unknown`：断言成业务类型这件事留在渲染层（非 React 宿主解析同构 JSON 即可）。
 */

/** 把宿主下发的 `unknown` 参数断言成引用目标；形状不对返回 null（不画空壳、不崩） */
function asReferenceTarget(params: unknown): ReferenceTarget | null {
  if (typeof params !== 'object' || params === null) return null
  const candidate = params as Partial<ReferenceTarget>
  const { type, id, name } = candidate
  if (typeof type !== 'string' || type === '' || typeof id !== 'string' || id === '') return null
  return { type, id, name: typeof name === 'string' ? name : id }
}

/** 绑定组件：types / 跳转动作走 appContext 自供给，目标条目走宿主下发的 params */
function ReferencesPanelBound({ onClose, params }: PanelBindingProps) {
  const { types, handleJump } = useAppContext()
  const target = asReferenceTarget(params)
  // 无有效目标就不渲染（正常流程由「高级搜索跳转 / 条目更多菜单」保证有目标）
  if (target === null) return null
  return <ReferencesPanel target={target} types={types} onJump={handleJump} onClose={onClose} />
}

export function defineReferencesPlugin(host: PluginHost): PluginManifest {
  registerReactBinding('references.panel', ReferencesPanelBound)
  return {
    id: 'references',
    name: 'references',
    version: '0.1.0',
    description: 'Data references: referenced by / references / similar data',
    meta: {
      label: 'Data references',
      labelKey: 'plugin.references.label',
      icon: '🔗',
      description: 'Host-rendered; the opened target comes from panel params (Slice 3 sample)',
      descriptionKey: 'plugin.references.desc'
    },
    capabilities: [
      {
        kind: 'command',
        id: 'references.open',
        label: 'Data references',
        labelKey: 'plugin.references.label',
        // 沿用已预置的参数（最近一次定位到的条目）；无参数时面板自身不渲染空壳
        run: () => host.openPanel('references.panel')
      },
      {
        kind: 'panel',
        id: 'references.panel',
        title: 'Data references',
        titleKey: 'plugin.references.label',
        ui: { type: 'text', text: 'Referenced by / references / similar data' }
      }
    ]
  }
}
