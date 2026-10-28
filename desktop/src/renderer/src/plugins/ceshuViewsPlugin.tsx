import type { ChapterKey } from '../../../shared/ceshuConstants'
import type { PluginManifest } from '../../../shared/plugin/types'
import FieldImpactPanel from '../components/ceshu/FieldImpactPanel'
import HealthPanel from '../components/ceshu/HealthPanel'
import RoutePanel from '../components/ceshu/RoutePanel'
import VersionDiffPanel from '../components/VersionDiffPanel'
import VersionTimelinePanel from '../components/VersionTimelinePanel'
import { CESHU_CONTENT_MOUNT, CESHU_VIEW_MOUNT, useCeshuView } from './ceshuViewContext'
import { registerReactBinding, type PanelBindingProps } from './reactBindings'

/**
 * 编辑器内视图插件化（B 方案 Slice 11）。
 *
 * 把 CeshuView 里原先「内联渲染 + 本地布尔 state」的 3 个只读浮层搬出来，改成 `view` 能力，
 * 挂在挂载点 `ceshu.overlay`（由 `ViewMount` 在编辑器内部渲染，**编辑器不卸载**）。
 *
 * 为什么不是 `panel`：`panel` 打开会替换 App 主区、把 CeshuView 卸载 → 丢草稿/编辑态；
 * 这 3 个浮层必须叠在编辑器之上，所以只能走 `view`。
 *
 * 文档来源：`useCeshuView()`（`ViewMount` 把 CeshuView 的 `doc` 放进 context）。
 * 影响面的 chapter/field 走**打开参数**（`host.openView('fieldImpact.view', {chapter, field})`）。
 */

/** 影响面视图的打开参数 */
interface FieldImpactTarget {
  chapter: ChapterKey
  field: string
}

export function defineCeshuViewsPlugin(): PluginManifest {
  function RoutePanelBound({ onClose }: PanelBindingProps) {
    const { doc } = useCeshuView()
    return <RoutePanel doc={doc} onClose={onClose} />
  }

  function HealthPanelBound({ onClose }: PanelBindingProps) {
    const { doc } = useCeshuView()
    return <HealthPanel doc={doc} onClose={onClose} />
  }

  function FieldImpactPanelBound({ params, onClose }: PanelBindingProps) {
    const { doc } = useCeshuView()
    const target = params as FieldImpactTarget | null | undefined
    // 无参数 = 没有「改哪个字段」的上下文：不渲染（正常流程总会带参数）
    if (target === null || target === undefined) return null
    return <FieldImpactPanel doc={doc} chapter={target.chapter} field={target.field} onClose={onClose} />
  }

  /** 内容槽视图：版本对比（替换 .content，非浮层；自带关闭按钮） */
  function DiffPanelBound({ onClose }: PanelBindingProps) {
    const { doc } = useCeshuView()
    return <VersionDiffPanel key={doc.ceshu_id} ceshuId={doc.ceshu_id} onClose={onClose} />
  }

  /** 内容槽视图：版本时间线（切版本走 context.onSelect） */
  function TimelinePanelBound({ onClose }: PanelBindingProps) {
    const { doc, onSelect } = useCeshuView()
    return (
      <VersionTimelinePanel
        key={doc.ceshu_id}
        ceshuId={doc.ceshu_id}
        currentId={doc.ceshu_id}
        onSelect={onSelect}
        onClose={onClose}
      />
    )
  }

  registerReactBinding('route.view', RoutePanelBound)
  registerReactBinding('health.view', HealthPanelBound)
  registerReactBinding('fieldImpact.view', FieldImpactPanelBound)
  registerReactBinding('diff.view', DiffPanelBound)
  registerReactBinding('timeline.view', TimelinePanelBound)

  return {
    id: 'ceshu-views',
    name: 'ceshu-views',
    version: '0.1.0',
    description: 'CeshuView 内部视图：浮层（ceshu.overlay）+ 内容槽（ceshu.content）',
    meta: {
      label: '编辑器内视图',
      icon: '🧱',
      description: '挂在编辑器内部、不卸载编辑器的浮层与内容视图'
    },
    capabilities: [
      // 浮层挂载点（叠在编辑器之上）
      { kind: 'view', id: 'route.view', label: '开发路线', mount: CESHU_VIEW_MOUNT, order: 10, ui: { type: 'text', text: '开发路线' } },
      { kind: 'view', id: 'health.view', label: '开发体检', mount: CESHU_VIEW_MOUNT, order: 20, ui: { type: 'text', text: '开发体检' } },
      { kind: 'view', id: 'fieldImpact.view', label: '字段影响面', mount: CESHU_VIEW_MOUNT, order: 30, ui: { type: 'text', text: '字段影响面' } },
      // 内容槽挂载点（替换编辑器内容区）
      { kind: 'view', id: 'diff.view', label: '版本对比', mount: CESHU_CONTENT_MOUNT, order: 10, ui: { type: 'text', text: '版本对比' } },
      { kind: 'view', id: 'timeline.view', label: '版本时间线', mount: CESHU_CONTENT_MOUNT, order: 20, ui: { type: 'text', text: '版本时间线' } }
    ]
  }
}
