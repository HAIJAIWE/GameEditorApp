import type { ChapterKey } from '../../../shared/ceshuConstants'
import type { PluginManifest } from '../../../shared/plugin/types'
import AiDataGenPanel from '../components/AiDataGenPanel'
import AiFullGeneratePanel from '../components/AiFullGeneratePanel'
import AiReviewPanel from '../components/AiReviewPanel'
import CeshuMachineDataPanel from '../components/CeshuMachineDataPanel'
import CeshuPrototypePanel from '../components/CeshuPrototypePanel'
import CeshuTasksPanel from '../components/CeshuTasksPanel'
import ChapterNotesPanel from '../components/ChapterNotesPanel'
import CeshuDataRefsPanel from '../components/ceshu/CeshuDataRefsPanel'
import { ChangelogPanel, ReadinessPanel, ValidatePanel } from '../components/ceshu/CeshuReportPanels'
import {
  ConsumePromptOverlay,
  DeriveOverlay,
  ImportOverlay,
  MigrationOverlay,
  ModulePickerOverlay,
  ReviewQueueOverlay
} from '../components/ceshu/EditorOverlays'
import FieldImpactPanel from '../components/ceshu/FieldImpactPanel'
import HealthPanel from '../components/ceshu/HealthPanel'
import RoutePanel from '../components/ceshu/RoutePanel'
import PresetMarketPanel from '../components/PresetMarketPanel'
import SystemConfirmPanel from '../components/SystemConfirmPanel'
import TemplateEditorPanel from '../components/TemplateEditorPanel'
import VersionDiffPanel from '../components/VersionDiffPanel'
import VersionTimelinePanel from '../components/VersionTimelinePanel'
import {
  CESHU_ARTIFACT_MOUNT,
  CESHU_CHAPTERNAV_MOUNT,
  CESHU_CONTENT_MOUNT,
  CESHU_TOOLBAR_MOUNT,
  CESHU_VIEW_MOUNT,
  useCeshuView
} from './ceshuViewContext'
import { registerReactBinding, type PanelBindingProps } from './reactBindings'

/**
 * 编辑器内视图插件化（B 方案 Slice 11/12/13）。
 *
 * 两个挂载点，对应两种「打开语义」：
 * - `ceshu.overlay`：**浮层**，叠在编辑器之上（编辑器不卸载）——路线 / 体检 / 影响面；
 * - `ceshu.content`：**内容槽**，激活时替换编辑器内容区——版本对比 / 时间线 / 各报告面板。
 *
 * 文档与编辑器级能力都从 `useCeshuView()`（ViewMount 下发的上下文）取；
 * 影响面 / AI 数据生成的 chapter/field、typeId 等走**打开参数**。
 */

/** 影响面视图的打开参数 */
interface FieldImpactTarget {
  chapter: ChapterKey
  field: string
}

/** AI 数据生成视图的打开参数 */
interface AiDataGenParams {
  typeId?: string | null
  count?: number
  instruction?: string
}

export function defineCeshuViewsPlugin(): PluginManifest {
  /* ---------------- 浮层挂载点（ceshu.overlay） ---------------- */
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
    if (target === null || target === undefined) return null
    return <FieldImpactPanel doc={doc} chapter={target.chapter} field={target.field} onClose={onClose} />
  }
  function MigrationOverlayBound({ onClose }: PanelBindingProps) {
    const { doc, busy, onRunMigration } = useCeshuView()
    return <MigrationOverlay doc={doc} busy={busy} onRun={onRunMigration} onClose={onClose} />
  }
  function ConsumePromptOverlayBound({ onClose }: PanelBindingProps) {
    const { doc } = useCeshuView()
    return <ConsumePromptOverlay doc={doc} onClose={onClose} />
  }
  function ReviewQueueOverlayBound({ onClose }: PanelBindingProps) {
    const { doc, onFieldStatus, onApproveAllPending, onJumpField } = useCeshuView()
    return (
      <ReviewQueueOverlay
        doc={doc}
        onFieldStatus={onFieldStatus}
        onApproveAllPending={onApproveAllPending}
        onJumpField={onJumpField}
        onClose={onClose}
      />
    )
  }
  function ImportOverlayBound({ onClose }: PanelBindingProps) {
    const { doc, busy, onApplyImport, onJumpChapter } = useCeshuView()
    return (
      <ImportOverlay
        doc={doc}
        busy={busy}
        onApplyImport={onApplyImport}
        onJumpChapter={onJumpChapter}
        onClose={onClose}
      />
    )
  }
  function DeriveOverlayBound({ onClose }: PanelBindingProps) {
    const { busy, onDerive } = useCeshuView()
    return <DeriveOverlay busy={busy} onDerive={onDerive} onClose={onClose} />
  }
  function ModulePickerOverlayBound({ onClose }: PanelBindingProps) {
    const { doc, onToggleModule } = useCeshuView()
    return <ModulePickerOverlay doc={doc} onToggle={onToggleModule} onClose={onClose} />
  }

  /* ---------------- 产出物页签挂载点（ceshu.artifact） ---------------- */
  function PrototypePanelBound() {
    const { doc, onDocUpdated } = useCeshuView()
    return <CeshuPrototypePanel doc={doc} onDocUpdated={onDocUpdated} />
  }
  function MachineDataPanelBound() {
    const { doc, onTypesChanged, onGenerateData } = useCeshuView()
    return <CeshuMachineDataPanel doc={doc} onTypesChanged={onTypesChanged} onGenerateData={onGenerateData} />
  }
  function TasksPanelBound() {
    const { doc, onDocUpdated } = useCeshuView()
    return <CeshuTasksPanel doc={doc} onDocUpdated={onDocUpdated} />
  }

  /* ---------------- 内容槽挂载点（ceshu.content） ---------------- */
  function DiffPanelBound({ onClose }: PanelBindingProps) {
    const { doc } = useCeshuView()
    return <VersionDiffPanel key={doc.ceshu_id} ceshuId={doc.ceshu_id} onClose={onClose} />
  }
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
  function ChangelogPanelBound({ onClose }: PanelBindingProps) {
    const { changelog, onExportChangelog } = useCeshuView()
    if (changelog === null) return null
    return (
      <ChangelogPanel
        changelog={changelog}
        onExport={(format) => onExportChangelog(format)}
        onClose={onClose}
      />
    )
  }
  function ValidatePanelBound({ onClose }: PanelBindingProps) {
    const { validateErrors, onExportValidation, onJumpChapter, onJumpField } = useCeshuView()
    return (
      <ValidatePanel
        validateErrors={validateErrors}
        onExport={() => onExportValidation()}
        onClose={onClose}
        onJumpChapter={onJumpChapter}
        onJumpField={onJumpField}
      />
    )
  }
  function ReadinessPanelBound({ onClose }: PanelBindingProps) {
    const { readiness, onExportReadiness, onJumpField } = useCeshuView()
    if (readiness === null) return null
    return (
      <ReadinessPanel
        readiness={readiness}
        onExport={() => onExportReadiness()}
        onClose={onClose}
        onJumpField={onJumpField}
      />
    )
  }
  function NotesPanelBound({ onClose }: PanelBindingProps) {
    const { doc } = useCeshuView()
    return <ChapterNotesPanel key={doc.ceshu_id} ceshuId={doc.ceshu_id} onClose={onClose} />
  }
  function DataRefsPanelBound({ onClose }: PanelBindingProps) {
    const { doc, types } = useCeshuView()
    return <CeshuDataRefsPanel key={doc.ceshu_id} chapters={doc} types={types} onClose={onClose} />
  }
  function AiReviewPanelBound({ onClose }: PanelBindingProps) {
    const { doc, gameName } = useCeshuView()
    return <AiReviewPanel key={doc.ceshu_id} ceshuId={doc.ceshu_id} gameName={gameName} onClose={onClose} />
  }
  function AiFullPanelBound({ onClose }: PanelBindingProps) {
    const { doc, onAiApplied } = useCeshuView()
    return (
      <AiFullGeneratePanel
        key={doc.ceshu_id}
        ceshuId={doc.ceshu_id}
        doc={doc}
        onApplied={onAiApplied}
        onClose={onClose}
      />
    )
  }
  function AiDataGenPanelBound({ params, onClose }: PanelBindingProps) {
    const { doc } = useCeshuView()
    const target = params as AiDataGenParams | null | undefined
    return (
      <AiDataGenPanel
        key={doc.ceshu_id}
        ceshuId={doc.ceshu_id}
        initialTypeId={target?.typeId ?? undefined}
        initialCount={target?.count}
        initialInstruction={target?.instruction}
        onClose={onClose}
      />
    )
  }
  function PresetMarketPanelBound({ onClose }: PanelBindingProps) {
    const { doc, onPresetApplied } = useCeshuView()
    return (
      <PresetMarketPanel
        key={doc.ceshu_id}
        ceshuId={doc.ceshu_id}
        onApplied={onPresetApplied}
        onClose={onClose}
      />
    )
  }
  function SystemConfirmPanelBound({ onClose }: PanelBindingProps) {
    const { doc, onSystemConfirmed } = useCeshuView()
    return (
      <SystemConfirmPanel
        key={doc.ceshu_id}
        ceshuId={doc.ceshu_id}
        onApplied={onSystemConfirmed}
        onClose={onClose}
      />
    )
  }
  function TemplateEditorPanelBound({ onClose }: PanelBindingProps) {
    const { doc, currentChapter, gameName, onTemplateApplied } = useCeshuView()
    return (
      <TemplateEditorPanel
        key={doc.ceshu_id}
        ceshuId={doc.ceshu_id}
        doc={doc}
        currentChapter={currentChapter}
        gameName={gameName}
        onApplied={onTemplateApplied}
        onClose={onClose}
      />
    )
  }

  registerReactBinding('route.view', RoutePanelBound)
  registerReactBinding('health.view', HealthPanelBound)
  registerReactBinding('fieldImpact.view', FieldImpactPanelBound)
  registerReactBinding('migration.view', MigrationOverlayBound)
  registerReactBinding('consume.view', ConsumePromptOverlayBound)
  registerReactBinding('review.view', ReviewQueueOverlayBound)
  registerReactBinding('import.view', ImportOverlayBound)
  registerReactBinding('derive.view', DeriveOverlayBound)
  registerReactBinding('modulePicker.view', ModulePickerOverlayBound)
  registerReactBinding('prototype.view', PrototypePanelBound)
  registerReactBinding('data.view', MachineDataPanelBound)
  registerReactBinding('tasks.view', TasksPanelBound)
  registerReactBinding('diff.view', DiffPanelBound)
  registerReactBinding('timeline.view', TimelinePanelBound)
  registerReactBinding('changelog.view', ChangelogPanelBound)
  registerReactBinding('validate.view', ValidatePanelBound)
  registerReactBinding('readiness.view', ReadinessPanelBound)
  registerReactBinding('notes.view', NotesPanelBound)
  registerReactBinding('dataRefs.view', DataRefsPanelBound)
  registerReactBinding('aiReview.view', AiReviewPanelBound)
  registerReactBinding('aiFull.view', AiFullPanelBound)
  registerReactBinding('aiDataGen.view', AiDataGenPanelBound)
  registerReactBinding('presetMarket.view', PresetMarketPanelBound)
  registerReactBinding('systemConfirm.view', SystemConfirmPanelBound)
  registerReactBinding('templateEditor.view', TemplateEditorPanelBound)

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
      { kind: 'view', id: 'migration.view', label: '迁移预览', mount: CESHU_VIEW_MOUNT, order: 40, ui: { type: 'text', text: '迁移预览' } },
      { kind: 'view', id: 'consume.view', label: 'AI 消费提示词', mount: CESHU_VIEW_MOUNT, order: 50, ui: { type: 'text', text: 'AI 消费提示词' } },
      { kind: 'view', id: 'review.view', label: '全局审阅队列', mount: CESHU_VIEW_MOUNT, order: 60, ui: { type: 'text', text: '全局审阅队列' } },
      { kind: 'view', id: 'import.view', label: '导入 AI 结果', mount: CESHU_VIEW_MOUNT, order: 70, ui: { type: 'text', text: '导入 AI 结果' } },
      // 内联弹层 / 气泡挂载点（保持原有定位）
      { kind: 'view', id: 'derive.view', label: '派生新版本', mount: CESHU_TOOLBAR_MOUNT, order: 10, ui: { type: 'text', text: '派生新版本' } },
      { kind: 'view', id: 'modulePicker.view', label: '系统模块', mount: CESHU_CHAPTERNAV_MOUNT, order: 10, ui: { type: 'text', text: '系统模块' } },
      // 产出物页签挂载点
      { kind: 'view', id: 'prototype.view', label: '原型预览', mount: CESHU_ARTIFACT_MOUNT, order: 10, ui: { type: 'text', text: '原型预览' } },
      { kind: 'view', id: 'data.view', label: '数据/机读', mount: CESHU_ARTIFACT_MOUNT, order: 20, ui: { type: 'text', text: '数据/机读' } },
      { kind: 'view', id: 'tasks.view', label: '岗位任务', mount: CESHU_ARTIFACT_MOUNT, order: 30, ui: { type: 'text', text: '岗位任务' } },
      // 内容槽挂载点（替换编辑器内容区）
      { kind: 'view', id: 'diff.view', label: '版本对比', mount: CESHU_CONTENT_MOUNT, order: 10, ui: { type: 'text', text: '版本对比' } },
      { kind: 'view', id: 'timeline.view', label: '版本时间线', mount: CESHU_CONTENT_MOUNT, order: 20, ui: { type: 'text', text: '版本时间线' } },
      { kind: 'view', id: 'changelog.view', label: '变更记录', mount: CESHU_CONTENT_MOUNT, order: 30, ui: { type: 'text', text: '变更记录' } },
      { kind: 'view', id: 'validate.view', label: '校验', mount: CESHU_CONTENT_MOUNT, order: 40, ui: { type: 'text', text: '校验' } },
      { kind: 'view', id: 'readiness.view', label: '完备度', mount: CESHU_CONTENT_MOUNT, order: 50, ui: { type: 'text', text: '完备度' } },
      { kind: 'view', id: 'notes.view', label: '笔记', mount: CESHU_CONTENT_MOUNT, order: 60, ui: { type: 'text', text: '笔记' } },
      { kind: 'view', id: 'dataRefs.view', label: '数据引用', mount: CESHU_CONTENT_MOUNT, order: 70, ui: { type: 'text', text: '数据引用' } },
      { kind: 'view', id: 'aiReview.view', label: 'AI 审阅', mount: CESHU_CONTENT_MOUNT, order: 80, ui: { type: 'text', text: 'AI 审阅' } },
      { kind: 'view', id: 'aiFull.view', label: 'AI 全文生成', mount: CESHU_CONTENT_MOUNT, order: 90, ui: { type: 'text', text: 'AI 全文生成' } },
      { kind: 'view', id: 'aiDataGen.view', label: 'AI 数据生成', mount: CESHU_CONTENT_MOUNT, order: 100, ui: { type: 'text', text: 'AI 数据生成' } },
      { kind: 'view', id: 'presetMarket.view', label: '预设市场', mount: CESHU_CONTENT_MOUNT, order: 110, ui: { type: 'text', text: '预设市场' } },
      { kind: 'view', id: 'systemConfirm.view', label: '系统确认', mount: CESHU_CONTENT_MOUNT, order: 120, ui: { type: 'text', text: '系统确认' } },
      { kind: 'view', id: 'templateEditor.view', label: '模板编辑器', mount: CESHU_CONTENT_MOUNT, order: 130, ui: { type: 'text', text: '模板编辑器' } }
    ]
  }
}
