import { useMemo, useState } from 'react'

import { FIELD_TYPE_LABELS, FIELD_TYPES, validateTypeSchema } from '../../../shared/typeSchemaFile'
import { TYPE_TEMPLATE_NAMES, TYPE_TEMPLATES, buildNewTypeDraft } from '../../../shared/typeTemplates'
import type { DataTypeDef, FieldType, TypeFieldDef } from '../../../shared/types'

/**
 * 数据表字段结构编辑器（对应 Python type_editor_dialog 核心切片）：
 * - 类型：新建 / 删除 / 名称·复数键·颜色编辑（既有类型的 ID 锁定，避免存量条目失联）
 * - 字段：增删 / 排序 / 名称·标签·控件类型·可编辑·可选值·数值范围·引用类型
 * - 模板：7 套内置字段模板整体替换；保存前领域校验；保存走 IPC（主进程原子写 type_schema.json）
 * 明确未迁移：布局分区编辑、AI 推荐字段、拼音/英译辅助（后续切片）。
 */

interface TypeEditorPanelProps {
  /** 当前已保存的 schema（基线，用于重置/判断新类型） */
  types: DataTypeDef[]
  onSaved: (types: DataTypeDef[]) => void
  onClose: () => void
}

export default function TypeEditorPanel({ types, onSaved, onClose }: TypeEditorPanelProps) {
  const [draft, setDraft] = useState<DataTypeDef[]>(() => structuredClone(types))
  const [selectedId, setSelectedId] = useState<string>(() => types[0]?.id ?? '')
  const [templateName, setTemplateName] = useState(TYPE_TEMPLATE_NAMES[0] ?? '')
  const [errors, setErrors] = useState<string[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [resetToken, setResetToken] = useState(0)

  const baseIds = useMemo(() => new Set(types.map((def) => def.id)), [types])
  const current = draft.find((def) => def.id === selectedId) ?? null

  const bumpReset = (): void => setResetToken((token) => token + 1)

  const updateType = (patch: Partial<DataTypeDef>): void => {
    if (!current) return
    setDraft((prev) => prev.map((def) => (def.id === current.id ? { ...def, ...patch } : def)))
  }

  /** 新建类型支持改 ID：同步更新选中项 */
  const renameType = (newId: string): void => {
    if (!current) return
    const oldId = current.id
    setDraft((prev) => prev.map((def) => (def.id === oldId ? { ...def, id: newId } : def)))
    setSelectedId(newId)
  }

  const updateField = (index: number, patch: Partial<TypeFieldDef>): void => {
    if (!current) return
    const fields = current.formFields.map((field, i) => (i === index ? { ...field, ...patch } : field))
    updateType({ formFields: fields })
  }

  const addField = (): void => {
    if (!current) return
    const used = new Set(current.formFields.map((field) => field.name))
    let index = 1
    while (used.has(`field_${index}`)) index++
    updateType({
      formFields: [...current.formFields, { name: `field_${index}`, label: '新字段:', type: 'entry', editable: true }]
    })
  }

  const removeField = (index: number): void => {
    if (!current) return
    if (current.formFields[index]?.name === 'id') return
    updateType({ formFields: current.formFields.filter((_, i) => i !== index) })
  }

  const moveField = (index: number, delta: -1 | 1): void => {
    if (!current) return
    const fields = [...current.formFields]
    const target = index + delta
    if (target < 0 || target >= fields.length) return
    if (fields[index].name === 'id' || fields[target].name === 'id') return
    const [moved] = fields.splice(index, 1)
    fields.splice(target, 0, moved)
    updateType({ formFields: fields })
  }

  /** 应用模板：整体替换字段（含 id 字段，与 Python 导入模板行为一致） */
  const applyTemplate = (): void => {
    if (!current) return
    const fields = TYPE_TEMPLATES[templateName]
    if (!fields) return
    updateType({ formFields: structuredClone(fields) })
    bumpReset()
    setNotice(`已应用模板「${templateName}」（尚未保存）`)
  }

  const addType = (): void => {
    const created = buildNewTypeDraft(draft.map((def) => def.id))
    setDraft((prev) => [...prev, created])
    setSelectedId(created.id)
    bumpReset()
    setNotice('已新建类型，请修改类型 ID 与名称后保存')
  }

  const removeType = (): void => {
    if (!current || draft.length <= 1) return
    const next = draft.filter((def) => def.id !== current.id)
    setDraft(next)
    setSelectedId(next[0]?.id ?? '')
    setErrors([])
    setNotice(null)
    bumpReset()
  }

  const handleSave = async (): Promise<void> => {
    setErrors([])
    setNotice(null)
    const messages = validateTypeSchema(draft)
    if (messages.length > 0) {
      setErrors(messages)
      return
    }
    setSaving(true)
    try {
      const saved = await window.mbApi.schema.save({ types: draft })
      setDraft(structuredClone(saved))
      bumpReset()
      setNotice('字段结构已保存，数据表表单已同步更新')
      onSaved(saved)
    } catch (error) {
      setErrors([error instanceof Error ? error.message : String(error)])
    } finally {
      setSaving(false)
    }
  }

  const handleReset = (): void => {
    setDraft(structuredClone(types))
    setSelectedId((currentId) => (types.some((def) => def.id === currentId) ? currentId : (types[0]?.id ?? '')))
    setErrors([])
    setNotice(null)
    bumpReset()
  }

  return (
    <div className="te-layout" data-testid="type-editor-panel">
      <aside className="te-side">
        <div className="form-label">数据类型（{draft.length}）</div>
        <button type="button" className="btn" data-testid="te-new-type" onClick={addType}>
          新建类型
        </button>
        <div className="te-type-list">
          {draft.map((def, index) => (
            <button
              key={index}
              type="button"
              className={`type-tab${def.id === selectedId ? ' active' : ''}`}
              data-testid="te-type-tab"
              onClick={() => setSelectedId(def.id)}
            >
              <span className="type-dot" style={{ background: def.color || '#607D8B' }} />
              <span className="item-name">{def.name || def.id || '未命名类型'}</span>
              <span className="item-meta">{def.formFields.length} 字段</span>
            </button>
          ))}
        </div>
      </aside>

      <div className="te-main">
        <div className="changelog-header">
          <span className="chapter-form-title">字段结构编辑器</span>
          <div className="editor-actions">
            <button type="button" className="btn" data-testid="te-reset" disabled={saving} onClick={handleReset}>
              重置
            </button>
            <button
              type="button"
              className="btn primary"
              data-testid="te-save"
              disabled={saving || !current}
              onClick={() => void handleSave()}
            >
              保存结构
            </button>
            <button type="button" className="btn" data-testid="te-close" disabled={saving} onClick={onClose}>
              关闭
            </button>
          </div>
        </div>

        {current ? (
          <>
            <div className="changelog-entry">
              <div className="form-label">类型属性</div>
              <div className="ai-gen-row">
                <span className="form-label">类型 ID</span>
                <input
                  className="form-input"
                  data-testid="te-type-id"
                  value={current.id}
                  readOnly={baseIds.has(current.id)}
                  title={baseIds.has(current.id) ? '既有类型的 ID 不可修改（存量条目按 ID 关联）' : ''}
                  onChange={(event) => renameType(event.target.value)}
                />
                <span className="form-label">中文名</span>
                <input
                  className="form-input"
                  data-testid="te-type-name"
                  value={current.name}
                  onChange={(event) => updateType({ name: event.target.value })}
                />
              </div>
              <div className="ai-gen-row">
                <span className="form-label">复数键</span>
                <input
                  className="form-input"
                  data-testid="te-type-plural"
                  value={current.pluralKey}
                  onChange={(event) => updateType({ pluralKey: event.target.value })}
                />
                <span className="form-label">颜色</span>
                <input
                  className="form-input te-col-color"
                  data-testid="te-type-color"
                  value={current.color}
                  maxLength={40}
                  placeholder="#RRGGBB"
                  onChange={(event) => updateType({ color: event.target.value })}
                />
                <span className="type-dot" style={{ background: current.color || '#607D8B' }} />
                <button
                  type="button"
                  className="btn danger"
                  data-testid="te-delete-type"
                  disabled={draft.length <= 1}
                  onClick={removeType}
                >
                  删除类型
                </button>
              </div>
              <div className="ai-gen-row">
                <span className="form-label">字段模板</span>
                <select
                  className="form-select"
                  data-testid="te-template"
                  value={templateName}
                  onChange={(event) => setTemplateName(event.target.value)}
                >
                  {TYPE_TEMPLATE_NAMES.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn" data-testid="te-apply-template" onClick={applyTemplate}>
                  应用模板（替换全部字段）
                </button>
                <button type="button" className="btn" data-testid="te-add-field" onClick={addField}>
                  添加字段
                </button>
              </div>
            </div>

            <div className="changelog-entry">
              <div className="form-label">字段列表（{current.formFields.length}）</div>
              {current.formFields.map((field, index) => {
                const isIdField = field.name === 'id'
                return (
                  <div className={`te-field-row${isIdField ? ' locked' : ''}`} key={index} data-testid={`te-field-${index}`}>
                    <input
                      className="form-input te-col-name"
                      data-testid={`te-field-name-${index}`}
                      value={field.name}
                      readOnly={isIdField}
                      title={isIdField ? 'id 字段为系统字段，不可改名/删除' : '字段名（英文/数字/下划线）'}
                      onChange={(event) => updateField(index, { name: event.target.value })}
                    />
                    <input
                      className="form-input te-col-label"
                      data-testid={`te-field-label-${index}`}
                      value={field.label}
                      onChange={(event) => updateField(index, { label: event.target.value })}
                    />
                    <select
                      className="form-select te-col-type"
                      data-testid={`te-field-type-${index}`}
                      value={field.type}
                      disabled={isIdField}
                      onChange={(event) => updateField(index, { type: event.target.value as FieldType })}
                    >
                      {FIELD_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {FIELD_TYPE_LABELS[type]}
                        </option>
                      ))}
                    </select>
                    <label className="ai-gen-check">
                      <input
                        type="checkbox"
                        data-testid={`te-field-editable-${index}`}
                        checked={field.editable}
                        disabled={isIdField}
                        onChange={(event) => updateField(index, { editable: event.target.checked })}
                      />
                      可编辑
                    </label>

                    {(field.type === 'combobox' || field.type === 'template') && (
                      <input
                        className="form-input te-col-values"
                        data-testid={`te-field-values-${index}`}
                        key={`values-${selectedId}-${index}-${resetToken}`}
                        defaultValue={(field.values ?? []).join(', ')}
                        placeholder="可选值（逗号分隔）"
                        onChange={(event) =>
                          updateField(index, {
                            values: event.target.value
                              .split(/[,，]/)
                              .map((part) => part.trim())
                              .filter(Boolean)
                          })
                        }
                      />
                    )}

                    {(field.type === 'spinbox' || field.type === 'double_spin') && (
                      <span className="te-col-range">
                        <input
                          className="form-input te-col-num"
                          data-testid={`te-field-from-${index}`}
                          key={`from-${selectedId}-${index}-${resetToken}`}
                          defaultValue={field.from ?? ''}
                          placeholder="下限"
                          onChange={(event) => updateField(index, { from: parseOptionalNumber(event.target.value) })}
                        />
                        <input
                          className="form-input te-col-num"
                          data-testid={`te-field-to-${index}`}
                          key={`to-${selectedId}-${index}-${resetToken}`}
                          defaultValue={field.to ?? ''}
                          placeholder="上限"
                          onChange={(event) => updateField(index, { to: parseOptionalNumber(event.target.value) })}
                        />
                      </span>
                    )}

                    {field.type === 'multiselect' && (
                      <select
                        className="form-select te-col-ref"
                        data-testid={`te-field-ref-${index}`}
                        value={field.refType ?? ''}
                        onChange={(event) => updateField(index, { refType: event.target.value || undefined })}
                      >
                        <option value="">（无引用）</option>
                        {refOptions(draft, field.refType).map((type) => (
                          <option key={type.id} value={type.pluralKey}>
                            {type.name}（{type.pluralKey}）
                          </option>
                        ))}
                      </select>
                    )}

                    <span className="te-field-buttons">
                      <button
                        type="button"
                        className="btn slim"
                        data-testid={`te-field-up-${index}`}
                        disabled={index === 0 || isIdField}
                        title="上移"
                        onClick={() => moveField(index, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn slim"
                        data-testid={`te-field-down-${index}`}
                        disabled={index === current.formFields.length - 1 || field.name === 'id'}
                        title="下移"
                        onClick={() => moveField(index, 1)}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="btn slim danger"
                        data-testid={`te-field-remove-${index}`}
                        disabled={isIdField}
                        title={isIdField ? 'id 字段不可删除' : '删除字段'}
                        onClick={() => removeField(index)}
                      >
                        ✕
                      </button>
                    </span>
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <div className="empty">请在左侧选择类型，或点「新建类型」</div>
        )}

        {errors.length > 0 && (
          <div className="error-banner" data-testid="te-errors">
            {errors.map((message, index) => (
              <div key={index}>{message}</div>
            ))}
          </div>
        )}
        {notice && (
          <div className="notice-banner" data-testid="te-notice">
            {notice}
          </div>
        )}
      </div>
    </div>
  )
}

/** 引用类型下拉：列出现有类型（值为复数键，与内置 schema refType 语义一致），并保留当前未知值 */
function refOptions(types: DataTypeDef[], currentRef: string | undefined): DataTypeDef[] {
  if (!currentRef) return types
  if (types.some((def) => def.pluralKey === currentRef || def.id === currentRef)) return types
  return [...types, { id: currentRef, name: currentRef, pluralKey: currentRef, color: '#607D8B', formFields: [] }]
}

function parseOptionalNumber(raw: string): number | undefined {
  if (raw.trim() === '') return undefined
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}