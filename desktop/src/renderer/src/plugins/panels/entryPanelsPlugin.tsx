import type { PluginHost } from '../../../../shared/plugin/host'
import type { PluginManifest } from '../../../../shared/plugin/types'
import type { ImportPreview } from '../../../../shared/types'
import { formatImportSummary } from '../../appUtils'
import { BatchEditPanel } from '../../components/data'
import { ImportPreviewPanel } from '../../components/data'
import { QuickCreatePanel } from '../../components/common'
import { TypeEditorPanel } from '../../components/ceshuType'
import { useAppContext } from '../host'
import { registerReactBinding, type PanelBindingProps } from '../host'

/**
 * 数据录入/编辑面板 → 插件化第七切片（B 方案 Slice 7）。
 *
 * 这 4 个面板都要**打开参数**（要编辑哪个类型 / 新建哪个类型 / 批量改哪个类型 / 应用哪份预览），
 * 通路已由 Slice 3 打通，所以 App 里对应的 4 份 `useState` 全部删除，参数改由宿主携带。
 *
 * 三个约定（与 referencesPlugin 同一套）：
 * 1. 参数在绑定里断言，形状不对 `return null`（不画空壳、不抛错）；
 * 2. 「数据被改过」的收尾走 context 的 `afterMutation`，绑定自己负责关面板；
 * 3. `importPreview` 的参数是**整份预览数据**（一次性大对象），用完调 `close()` 清掉，不留在宿主内存。
 */

interface TypeEditorParams {
  initialTypeId?: string
}

interface TypeTargetParams {
  type?: string
}

interface ImportPreviewParams {
  previewId: string
  preview: ImportPreview
}

function asObject(params: unknown): Record<string, unknown> | null {
  return typeof params === 'object' && params !== null ? (params as Record<string, unknown>) : null
}

function asTypeEditorParams(params: unknown): TypeEditorParams {
  const raw = asObject(params)
  const id = raw?.initialTypeId
  return typeof id === 'string' && id !== '' ? { initialTypeId: id } : {}
}

function asTypeTargetParams(params: unknown): TypeTargetParams {
  const raw = asObject(params)
  const type = raw?.type
  return typeof type === 'string' && type !== '' ? { type } : {}
}

function asImportPreviewParams(params: unknown): ImportPreviewParams | null {
  const raw = asObject(params)
  const previewId = raw?.previewId
  const preview = raw?.preview
  if (typeof previewId !== 'string' || previewId === '') return null
  if (typeof preview !== 'object' || preview === null) return null
  return { previewId, preview: preview as ImportPreview }
}

function TypeEditorPanelBound({ onClose, params }: PanelBindingProps) {
  const { types, setTypes } = useAppContext()
  const { initialTypeId } = asTypeEditorParams(params)
  return (
    <TypeEditorPanel
      types={types}
      initialTypeId={initialTypeId}
      onSaved={setTypes}
      onClose={onClose}
    />
  )
}

function QuickCreatePanelBound({ onClose, params }: PanelBindingProps) {
  const { types, afterMutation } = useAppContext()
  // 无参数 = 菜单入口，用第一个类型（与迁移前 `quickCreateTarget ?? firstType` 的兜底一致）
  const type = asTypeTargetParams(params).type ?? types[0]?.id ?? ''
  return (
    <QuickCreatePanel
      // 换类型时重挂，避免上一次选的模板粘住
      key={type}
      type={type}
      types={types}
      onCreated={(message) => {
        afterMutation(message)
        onClose()
      }}
      onClose={onClose}
    />
  )
}

function BatchEditPanelBound({ onClose, params }: PanelBindingProps) {
  const { types, afterMutation } = useAppContext()
  const type = asTypeTargetParams(params).type ?? types[0]?.id ?? ''
  return (
    <BatchEditPanel
      key={type}
      type={type}
      typeDef={types.find((def) => def.id === type) ?? null}
      types={types}
      onApplied={(message) => {
        afterMutation(message)
        onClose()
      }}
      onClose={onClose}
    />
  )
}

function ImportPreviewPanelBound({ close, params }: PanelBindingProps) {
  const { types, afterMutation } = useAppContext()
  const target = asImportPreviewParams(params)
  // 没有预览数据就没什么可确认的（正常流程不会走到这里，防手滑）
  if (target === null) return null
  return (
    <ImportPreviewPanel
      previewId={target.previewId}
      preview={target.preview}
      types={types}
      onApplied={(summary) => {
        afterMutation(formatImportSummary(summary))
        // 参数是整份预览数据，用完必须清（close = 清参数 + 关面板）
        close()
      }}
      onCancel={close}
    />
  )
}

export function defineEntryPanelsPlugin(host: PluginHost): PluginManifest {
  registerReactBinding('typeEditor.panel', TypeEditorPanelBound)
  registerReactBinding('quickCreate.panel', QuickCreatePanelBound)
  registerReactBinding('batch.panel', BatchEditPanelBound)
  registerReactBinding('importPreview.panel', ImportPreviewPanelBound)

  return {
    id: 'entry-panels',
    name: 'entry-panels',
    version: '0.1.0',
    description: '数据录入/编辑面板包（字段结构 / 快速创建 / 批量编辑 / 导入预览），参数经宿主携带',
    meta: {
      label: '数据录入',
      icon: '✍️',
      description: '4 个带打开参数的面板，经宿主渲染 + 参数自供给（Slice 7）'
    },
    capabilities: [
      {
        kind: 'command',
        id: 'typeEditor.open',
        label: '字段结构编辑器',
        run: () => host.openPanel('typeEditor.panel')
      },
      {
        kind: 'panel',
        id: 'typeEditor.panel',
        title: '字段结构编辑器',
        ui: { type: 'text', text: '编辑各数据类型的字段结构' }
      },
      {
        kind: 'command',
        id: 'quickCreate.open',
        label: '快速创建',
        run: () => host.openPanel('quickCreate.panel')
      },
      {
        kind: 'panel',
        id: 'quickCreate.panel',
        title: '快速创建',
        ui: { type: 'text', text: '按模板快速新建条目' }
      },
      {
        kind: 'command',
        id: 'batch.open',
        label: '批量编辑',
        run: () => host.openPanel('batch.panel')
      },
      {
        kind: 'panel',
        id: 'batch.panel',
        title: '批量编辑',
        ui: { type: 'text', text: '批量改数值 / 批量删除' }
      },
      {
        kind: 'panel',
        id: 'importPreview.panel',
        title: '导入预览',
        ui: { type: 'text', text: '确认导入内容后再落盘' }
      }
    ]
  }
}
