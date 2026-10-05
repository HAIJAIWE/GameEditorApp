import { useEffect, useMemo, useRef, useState } from 'react'

import { attrListToRows, rowsToAttrList, type AttrRow } from '../../../shared/attrList'
import { attrPanelToRows, defaultAttrPanelRows, rowsToAttrPanel, type AttrPanelRow } from '../../../shared/attrPanel'
import type { AttrSystem } from '../../../shared/attrSystem'
import {
  canParseAsDropTable,
  normalizeDropEntries,
  serializeDropEntries,
  type DropEntry
} from '../../../shared/dropTable'
import { buildFormLayout, fieldLabelFor, isComplexFieldType } from '../../../shared/formSections'
import { imagePreviewUnavailableReason } from '../../../shared/imagePreview'
import { resolveFieldLabel } from '../../../shared/gameStyle'
import {
  canParseAsRefTable,
  normalizeRefEntries,
  serializeRefEntries,
  type ReferenceEntry
} from '../../../shared/refTable'
import type { DataTypeDef, ItemRecord, TypeFieldDef } from '../../../shared/types'

import AttrPanelEditor from './AttrPanelEditor'
import AttrTableEditor from './AttrTableEditor'
import DropTableEditor from './DropTableEditor'
import FormSectionCard from './FormSectionCard'
import LucideIcon from './LucideIcon'
import RefTableEditor from './RefTableEditor'

interface ItemFormProps {
  item: ItemRecord
  fields: TypeFieldDef[]
  /** 全部数据类型定义（引用类字段解析 refType → 单数 id + 中文名） */
  types: readonly DataTypeDef[]
  /**
   * 当前活跃的游戏风格 id（`game_styles.json` 的 id，如 `xianxia`）。
   * 用于按风格替换字段标签术语（对应 Python `style_manager.resolve_field_label`）；
   * `''` = 不启用，标签原样显示（与 Python 无活跃风格时等价）。
   */
  gameStyle?: string
  onSaved: (updated: ItemRecord) => void
  /**
   * 打开「字段结构编辑器」（App 级浮层 TypeEditorPanel）编辑当前条目所属类型。
   * 不提供则「更多 ▸」里不出现该项——本组件不自行造浮层，也不放点了没反应的按钮。
   */
  onEditType?: (typeId: string) => void
  /**
   * 打开「数据关联预览」（App 级浮层 ReferencesPanel）查看当前条目的引用关系。
   * 入参形状与 `ReferencesPanel` 的 `ReferenceTarget` 一致（type / id / name）。
   * 不提供则「更多 ▸」里不出现该项。
   */
  onShowReferences?: (target: { type: string; id: string; name: string }) => void
  /** 打开「AI 数据生成」面板（宿主编排书级浮层 AiDataGenPanel）；不提供则不渲染该按钮 */
  onAiGenerate?: (typeId: string) => void
  /**
   * 复制完成后回调（父级可据此选中副本并给出专门提示）。
   * 复制本身由本组件走既有 `data:createItem` 完成；未提供时回退 `onSaved` 触发列表刷新。
   */
  onDuplicated?: (created: ItemRecord) => void
}

/**
 * 该字段是否退化为 JSON 文本框（仅当值无法被专用编辑器无损表示时，保留原始数据防止丢失）。
 * - droptable：无法归一的（结构异常）走 JSON
 * - multiselect：无法归一的走 JSON
 */
function usesJsonEditor(field: TypeFieldDef, value: unknown): boolean {
  if (field.type === 'droptable') return !canParseAsDropTable(value)
  if (field.type === 'multiselect') return !canParseAsRefTable(value)
  return false
}

/** draft 中的 attrtable 值（始终为编辑行数组；防御异常数据） */
function asAttrRows(value: unknown): AttrRow[] {
  return Array.isArray(value) ? (value as AttrRow[]) : []
}

/** draft 中的 attrpanel 值（始终为编辑行数组；防御异常数据） */
function asAttrPanelRows(value: unknown): AttrPanelRow[] {
  return Array.isArray(value) ? (value as AttrPanelRow[]) : []
}

/** draft 中的 multiselect 值（已归一化；防御异常数据） */
function asRefEntries(value: unknown): ReferenceEntry[] {
  return Array.isArray(value) ? (value as ReferenceEntry[]) : []
}

/** draft 中的 droptable 值（已归一化；防御异常数据） */
function asDropEntries(value: unknown): DropEntry[] {
  return Array.isArray(value) ? (value as DropEntry[]) : []
}

function buildInitialDraft(
  data: Record<string, unknown>,
  fields: TypeFieldDef[],
  typeId: string
): Record<string, unknown> {
  const draft: Record<string, unknown> = { ...data }
  for (const field of fields) {
    const value = data[field.name]
    if (field.type === 'attrtable') {
      draft[field.name] = attrListToRows(value)
    } else if (field.type === 'attrpanel') {
      // 对应 Python load_data：无有效数据时套用该类型的默认模板（role=新手 / monster=小怪）
      const rows = attrPanelToRows(value)
      draft[field.name] = rows.length > 0 ? rows : defaultAttrPanelRows(typeId)
    } else if (usesJsonEditor(field, value)) {
      draft[field.name] = value === undefined || value === null ? '' : JSON.stringify(value, null, 2)
    } else if (field.type === 'multiselect') {
      draft[field.name] = normalizeRefEntries(value)
    } else if (field.type === 'droptable') {
      draft[field.name] = normalizeDropEntries(value)
    } else if (field.type === 'spinbox' || field.type === 'double_spin') {
      draft[field.name] = value === undefined || value === null ? '' : String(value)
    } else if (field.type === 'tags') {
      draft[field.name] = Array.isArray(value) ? value.join(', ') : (value ?? '')
    }
  }
  return draft
}

function buildPayload(
  draft: Record<string, unknown>,
  fields: TypeFieldDef[],
  id: string,
  jsonFields: Set<string>
): Record<string, unknown> {
  // 以完整 draft 为底，保留 schema 未收录的扩展字段（导入数据可能携带）
  const payload: Record<string, unknown> = { ...draft }

  for (const field of fields) {
    const name = field.name
    const raw = draft[name]

    if (name === 'id') {
      payload.id = id
      continue
    }
    if (field.type === 'attrtable') {
      payload[name] = rowsToAttrList(asAttrRows(raw), field.label)
      continue
    }
    if (field.type === 'attrpanel') {
      payload[name] = rowsToAttrPanel(asAttrPanelRows(raw))
      continue
    }
    if (jsonFields.has(name)) {
      if (typeof raw !== 'string' || raw.trim() === '') {
        delete payload[name]
        continue
      }
      try {
        payload[name] = JSON.parse(raw)
      } catch {
        throw new Error(`字段「${field.label}」不是合法 JSON`)
      }
      continue
    }
    if (field.type === 'spinbox' || field.type === 'double_spin') {
      if (raw === '' || raw === null || raw === undefined) {
        delete payload[name]
        continue
      }
      const numeric = Number(raw)
      if (!Number.isFinite(numeric)) {
        throw new Error(`字段「${field.label}」需要数字`)
      }
      payload[name] = numeric
      continue
    }
    if (field.type === 'multiselect') {
      payload[name] = serializeRefEntries(asRefEntries(raw))
      continue
    }
    if (field.type === 'droptable') {
      payload[name] = serializeDropEntries(asDropEntries(raw))
      continue
    }
    if (field.type === 'tags' && typeof raw === 'string') {
      payload[name] = raw
        .split(/[,，]/)
        .map((part) => part.trim())
        .filter(Boolean)
    }
  }
  return payload
}

interface FieldControlProps {
  field: TypeFieldDef
  value: unknown
  jsonMode: boolean
  onChange: (value: unknown) => void
  /**
   * `template` 字段被选中/输入时回调（PyQt `dynamic_form.py::_on_template_changed`）。
   * 用来把模板文本联动写进同类型的 `desc` 字段 —— 语义由调用方决定，这里只负责传出来。
   */
  onTemplatePicked?: (templateText: string) => void
}

function FieldControl({ field, value, jsonMode, onChange, onTemplatePicked }: FieldControlProps) {
  const testId = `field-${field.name}`
  /**
   * 本次会话里刚选中的图片（路径 + 主进程回传的 data URL）。
   * **刻意用派生判断而非 effect 同步**：预览只在 `picked.path === 当前字段值` 时显示，
   * 字段被别处改掉就自动不匹配 → 预览消失。react-hooks v7 把「effect 内同步 setState」
   * 判为 error，且这里也确实不需要 effect。
   */
  const [picked, setPicked] = useState<{ path: string; dataUrl: string; bytes: number } | null>(null)
  const [picking, setPicking] = useState(false)

  if (jsonMode) {
    return (
      <textarea
        id={testId}
        className="form-textarea"
        data-testid={testId}
        rows={4}
        value={String(value ?? '')}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  }

  switch (field.type) {
    case 'spinbox':
    case 'double_spin':
      return (
        <input
          id={testId}
          type="number"
          className="form-input"
          data-testid={testId}
          min={field.from}
          max={field.to}
          step={field.type === 'double_spin' ? 'any' : undefined}
          value={String(value ?? '')}
          readOnly={!field.editable}
          onChange={(event) => onChange(event.target.value)}
        />
      )
    case 'combobox': {
      const options = field.values ?? []
      const current = value === null || value === undefined ? '' : String(value)
      const extras = current !== '' && !options.includes(current) ? [current] : []
      return (
        <select
          id={testId}
          className="form-select"
          data-testid={testId}
          value={current}
          disabled={!field.editable}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">（空）</option>
          {[...extras, ...options].map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )
    }
    /*
     * `template`：**可编辑**的模板框（对齐 PyQt `dynamic_form.py::_create_template_widget`
     * 的 `combo.setEditable(True)`）。TS 原用不可编辑 `<select>`，用户既不能从预置模板里
     * 微调，也没法手写自己的模板 —— 而模板本身就是「描述的骨架」，必须能改。
     * 用 `<input list>` 实现原生可编辑下拉：既能选也能填，零依赖。
     */
    case 'template': {
      const options = field.values ?? []
      const current = value === null || value === undefined ? '' : String(value)
      const listId = `${testId}-options`
      return (
        <>
          <input
            id={testId}
            className="form-input"
            data-testid={testId}
            list={listId}
            placeholder="从模板里挑一个，或直接写自己的"
            value={current}
            readOnly={!field.editable}
            onChange={(event) => {
              onChange(event.target.value)
              // PyQt：模板文本变化即联动写入 desc（清空不算，避免误清描述）
              if (event.target.value !== '') onTemplatePicked?.(event.target.value)
            }}
          />
          <datalist id={listId}>
            {options.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </>
      )
    }
    /*
     * `tags`：PyQt `dynamic_form.py` 的 tags 分支是 QLineEdit + placeholder
     * 「多个标签用逗号分隔」，值按**原始字符串**存。TS 侧刻意存**字符串数组**
     * （`buildPayload` 按 `/[,，]/` 拆分后过滤空串）。
     *
     * 两条路径都要接住（别以为只有一条）：
     * - 常见路径：`buildInitialDraft` 已把数组 `join(', ')` 成**字符串**放进草稿；
     * - 防御路径：字段值仍为数组时（外部直接塞进来的数据）自己拼。
     * 原先落到 `default` 分支靠 `String(array)` 隐式拼逗号 —— 能显示，但没 placeholder，
     * 且数组带空元素时会多出连续逗号。
     */
    case 'tags': {
      const current = Array.isArray(value) ? value.map((part) => String(part)).join(',') : String(value ?? '')
      return (
        <input
          id={testId}
          type="text"
          className="form-input"
          data-testid={testId}
          placeholder="多个标签用逗号分隔"
          value={current}
          readOnly={!field.editable}
          onChange={(event) => onChange(event.target.value)}
        />
      )
    }
    /*
     * `image`：**只读路径框 + 「选择图片」按钮 + 实时预览**
     * （对齐 PyQt `dynamic_form.py::_create_image_widget` 的三件套：只读 QLineEdit +
     * 选择按钮 + `LazyImageLabel` 预览）。TS 原先落到 `default` 分支是**可编辑**单行框 ——
     * 路径得手打、且看不到图对不对。
     *
     * 预览图用主进程回传的 `data:` URL（`dialog:chooseImageFile`）：
     * 渲染层直接引用 `C://...` 会被 `webSecurity` 拦，打包后更读不到任意本地路径。
     */
    case 'image': {
      const current = value === null || value === undefined ? '' : String(value)
      const preview = picked !== null && picked.path === current ? picked : null
      const previewReason = preview === null ? null : imagePreviewUnavailableReason(preview.path, preview.bytes)
      return (
        <div className="image-field" data-testid={`${testId}-wrap`}>
          <div className="image-field-row">
            <input
              id={testId}
              type="text"
              className="form-input"
              data-testid={testId}
              placeholder="尚未选择图片"
              value={current}
              readOnly
            />
            <button
              type="button"
              className="btn slim"
              data-testid={`${testId}-pick`}
              disabled={picking || !field.editable}
              onClick={() => {
                setPicking(true)
                const api = window.mbApi as unknown as {
                  dialog: {
                    chooseImageFile: () => Promise<{ path: string | null; dataUrl: string; bytes: number }>
                  }
                }
                void api.dialog
                  .chooseImageFile()
                  .then((pickedFile) => {
                    if (pickedFile.path === null) return
                    setPicked({ path: pickedFile.path, dataUrl: pickedFile.dataUrl, bytes: pickedFile.bytes })
                    onChange(pickedFile.path)
                  })
                  .catch(() => undefined) // 取消/读失败都不打断表单
                  .finally(() => setPicking(false))
              }}
            >
              选择图片
            </button>
          </div>
          {preview !== null && preview.dataUrl !== '' && <img className="image-field-preview" data-testid={`${testId}-preview`} src={preview.dataUrl} alt="图片预览" />}
          {preview !== null && previewReason !== null && (
            <div className="form-hint" data-testid={`${testId}-preview-hint`}>
              {previewReason}
            </div>
          )}
        </div>
      )
    }
    /*
     * `image_desc`：PyQt 是 QTextEdit 且 `setMaximumHeight(60)`（多行但比 desc 矮）。
     * TS 原先落到 `default` 单行输入框 —— 字段名带「描述」却是单行，长描述没法看全。
     */
    case 'image_desc':
      return (
        <textarea
          id={testId}
          className="form-textarea image-desc-textarea"
          data-testid={testId}
          rows={2}
          value={String(value ?? '')}
          readOnly={!field.editable}
          onChange={(event) => onChange(event.target.value)}
        />
      )
    case 'desc':
    case 'content':
    case 'achievement_desc':
      return (
        <textarea
          id={testId}
          className="form-textarea"
          data-testid={testId}
          rows={4}
          value={String(value ?? '')}
          readOnly={!field.editable}
          onChange={(event) => onChange(event.target.value)}
        />
      )
    default:
      return (
        <input
          id={testId}
          type="text"
          className="form-input"
          data-testid={testId}
          value={String(value ?? '')}
          readOnly={!field.editable}
          onChange={(event) => onChange(event.target.value)}
        />
      )
  }
}

export default function ItemForm({
  item,
  fields,
  types,
  gameStyle = '',
  onSaved,
  onEditType,
  onShowReferences,
  onAiGenerate,
  onDuplicated
}: ItemFormProps) {
  const [draft, setDraft] = useState<Record<string, unknown>>(() => buildInitialDraft(item.data, fields, item.type))
  const [saving, setSaving] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement | null>(null)
  const hasAttrTable = fields.some((field) => field.type === 'attrtable')
  const [attrSystem, setAttrSystem] = useState<AttrSystem | null>(null)
  const [attrSystemError, setAttrSystemError] = useState<string | null>(null)

  // 属性系统懒加载（仅含 attrtable 字段的表单需要，用于计算预览）
  useEffect(() => {
    if (!hasAttrTable) return
    let cancelled = false
    window.mbApi.attrSystem
      .get()
      .then((system) => {
        if (!cancelled) setAttrSystem(system)
      })
      .catch((error: unknown) => {
        if (!cancelled) setAttrSystemError(error instanceof Error ? error.message : String(error))
      })
    return () => {
      cancelled = true
    }
  }, [hasAttrTable])

  // 「更多 ▸」下拉：点击别处关闭（对齐工具栏下拉的常规行为）
  useEffect(() => {
    if (!moreOpen) return
    const handleOutside = (event: MouseEvent): void => {
      const node = event.target
      if (moreRef.current !== null && node instanceof Node && !moreRef.current.contains(node)) {
        setMoreOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [moreOpen])

  const jsonFields = new Set(
    fields.filter((field) => usesJsonEditor(field, item.data[field.name])).map((field) => field.name)
  )

  /** 条目编辑器分区布局（分区/折叠/双列；未归组字段走兜底，一个都不丢） */
  const layout = useMemo(() => buildFormLayout(item.type, fields), [item.type, fields])

  const setValue = (name: string, value: unknown): void => {
    setDraft((current) => ({ ...current, [name]: value }))
  }

  /**
   * 模板联动：把选中的模板文本写进同类型的 `desc` 字段
   * （对齐 PyQt `dynamic_form.py::_on_template_changed` —— 它也是写进名为 `desc` 的 QTextEdit）。
   *
   * 两处刻意的收敛（都与 PyQt 不同，理由写明）：
   * - 只在**存在可编辑的 `desc` 字段**时才写；没有就只更新 template 本身，不凭空造字段。
   * - PyQt 的 `_apply_desc_template` 实际是 `return template_text`（**没有做 `{职业}` 占位符替换**，
   *   是留给子类实现的钩子）。TS 侧同样**不猜占位符语义**，只做原文写入 —— 免得替换错了
   *   悄悄改掉用户的数据。
   */
  const handleTemplatePicked = (templateText: string): void => {
    const descField = fields.find((item) => item.name === 'desc' && item.editable)
    if (descField === undefined) return
    setDraft((current) => ({ ...current, desc: templateText }))
  }

  const handleReset = (): void => {
    setDraft(buildInitialDraft(item.data, fields, item.type))
    setLocalError(null)
  }

  const handleSave = async (): Promise<void> => {
    setLocalError(null)
    try {
      const payload = buildPayload(draft, fields, item.id, jsonFields)
      setSaving(true)
      const updated = await window.mbApi.data.updateItem({ id: item.id, data: payload })
      onSaved(updated)
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  /**
   * 复制当前条目为独立副本（对应 PyQt `data_tab._on_copy_clicked`）：
   * 沿用当前表单内容 + 新 id（主进程 `createItem` 生成，对应 Python `generate_id`）。
   * 副本不带原 id——`DataService.updateItem` 会在下次保存时把 data.id 与记录 id 对齐。
   */
  const handleDuplicate = async (): Promise<void> => {
    setLocalError(null)
    try {
      const payload = buildPayload(draft, fields, item.id, jsonFields)
      delete payload.id
      setSaving(true)
      const created = await window.mbApi.data.createItem({ type: item.type, data: payload })
      if (onDuplicated) {
        onDuplicated(created)
      } else {
        onSaved(created)
      }
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  /** 单个字段的编辑控件（不含标签；标签由分区分发处负责） */
  const renderFieldControl = (field: TypeFieldDef): React.ReactElement => {
    if (field.type === 'attrtable') {
      return (
        <AttrTableEditor
          fieldName={field.name}
          rows={asAttrRows(draft[field.name])}
          attrSystem={attrSystem}
          systemError={attrSystemError}
          onChange={(rows) => setValue(field.name, rows)}
        />
      )
    }
    if (field.type === 'attrpanel') {
      return (
        <AttrPanelEditor
          fieldName={field.name}
          typeId={item.type}
          rows={asAttrPanelRows(draft[field.name])}
          onChange={(rows) => setValue(field.name, rows)}
        />
      )
    }
    if (field.type === 'multiselect' && !jsonFields.has(field.name)) {
      return (
        <RefTableEditor
          fieldName={field.name}
          refType={field.refType ?? ''}
          types={types}
          entries={asRefEntries(draft[field.name])}
          onChange={(entries) => setValue(field.name, entries)}
        />
      )
    }
    if (field.type === 'droptable' && !jsonFields.has(field.name)) {
      return (
        <DropTableEditor
          fieldName={field.name}
          entries={asDropEntries(draft[field.name])}
          onChange={(entries) => setValue(field.name, entries)}
        />
      )
    }
    return (
      <FieldControl
        field={field}
        value={draft[field.name]}
        jsonMode={jsonFields.has(field.name)}
        onChange={(value) => setValue(field.name, value)}
        onTemplatePicked={handleTemplatePicked}
      />
    )
  }

  /** 普通字段行（标签 + 控件） */
  const renderFieldRow = (field: TypeFieldDef, label: string): React.ReactElement => (
    <div className="form-row" key={field.name}>
      <label className="form-label" htmlFor={`field-${field.name}`}>
        {label}
      </label>
      {renderFieldControl(field)}
    </div>
  )

  return (
    <aside className="editor" data-testid="item-editor">
      <div className="editor-header">
        <div className="editor-title">
          {String(item.data.name ?? item.id)}
          <small>{item.id}</small>
        </div>
      </div>

      <div className="editor-body">
        {localError && <div className="form-error">{localError}</div>}
        {layout.sections.map((section, index) => (
          <FormSectionCard
            key={`${section.title}-${index}`}
            title={section.title}
            icon={section.icon}
            collapsed={section.collapsed}
            testId={`form-section-${index}`}
          >
            {section.panelField !== null ? (
              (() => {
                const panel = fields.find((field) => field.name === section.panelField)
                return panel ? renderFieldControl(panel) : null
              })()
            ) : section.layout === 'grid' ? (
              <div className="form-grid" data-testid={`form-section-${index}-grid`}>
                {section.fields.map((field) => renderFieldRow(field, fieldLabelFor(field, 'grid', gameStyle)))}
              </div>
            ) : (
              section.fields.map((field) => renderFieldRow(field, fieldLabelFor(field, 'form', gameStyle)))
            )}
          </FormSectionCard>
        ))}
        {layout.ungrouped.map((field) =>
          isComplexFieldType(field.type) ? (
            // 兜底：复杂控件单独成区（对应 Python P0-2），避免与普通字段混排
            <FormSectionCard
              key={field.name}
              title={resolveFieldLabel(field.label, gameStyle)}
              icon="📋"
              collapsed={false}
              testId={`form-section-ungrouped-${field.name}`}
            >
              {renderFieldControl(field)}
            </FormSectionCard>
          ) : (
            renderFieldRow(field, fieldLabelFor(field, 'form', gameStyle))
          )
        )}
      </div>

      <div className="editor-actions">
        <button type="button" className="btn" disabled={saving} onClick={handleReset}>
          重置
        </button>
        <button type="button" className="btn primary" disabled={saving} onClick={() => void handleSave()}>
          保存
        </button>
        <button
          type="button"
          className="btn"
          data-testid="item-form-duplicate"
          disabled={saving}
          onClick={() => void handleDuplicate()}
        >
          复制
        </button>
        {onAiGenerate !== undefined && (
          <button
            type="button"
            className="btn"
            data-testid="item-form-ai-generate"
            onClick={() => onAiGenerate(item.type)}
          >
            <LucideIcon name="bot" size={14} />
            AI 生成
          </button>
        )}
        {/*
          「更多 ▸」收纳低频项（对应 PyQt data_tab 的 more_btn 菜单）。
          每一项仅在父级确实传入了回调时才渲染，保证菜单里不存在点了没反应的死控件。
          新建 / 删除按既有约定留在左栏（DataEditorTab），此处不再重复。
        */}
        {(onEditType !== undefined || onShowReferences !== undefined) && (
          <div className="toolbar-more" ref={moreRef}>
            <button
              type="button"
              className="btn"
              data-testid="item-form-more"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((open) => !open)}
            >
              更多
              <LucideIcon name="chevron-down" size={14} />
            </button>
            {moreOpen && (
              <div className="toolbar-more-menu" data-testid="item-form-more-menu">
                {onEditType !== undefined && (
                  <div className="toolbar-more-group">
                    <button
                      type="button"
                      className="toolbar-more-item"
                      data-testid="item-form-more-edit-type"
                      onClick={() => {
                        setMoreOpen(false)
                        onEditType(item.type)
                      }}
                    >
                      <LucideIcon name="settings" size={14} />
                      编辑当前类型字段结构
                    </button>
                  </div>
                )}
                {onShowReferences !== undefined && (
                  <div className="toolbar-more-group">
                    <button
                      type="button"
                      className="toolbar-more-item"
                      data-testid="item-form-more-references"
                      onClick={() => {
                        setMoreOpen(false)
                        onShowReferences({
                          type: item.type,
                          id: item.id,
                          name: String(item.data.name ?? item.id)
                        })
                      }}
                    >
                      <LucideIcon name="link" size={14} />
                      查看此项的引用关系
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}