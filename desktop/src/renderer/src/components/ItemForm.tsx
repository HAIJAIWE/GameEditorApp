import { useState } from 'react'

import type { ItemRecord, TypeFieldDef } from '../../../shared/types'

interface ItemFormProps {
  item: ItemRecord
  fields: TypeFieldDef[]
  onSaved: (updated: ItemRecord) => void
}

/** 数组元素含对象（如 [{name,count}]）时改用 JSON 编辑器，避免破坏结构 */
function isObjectArray(value: unknown): boolean {
  return Array.isArray(value) && value.some((entry) => typeof entry === 'object' && entry !== null)
}

function usesJsonEditor(field: TypeFieldDef, value: unknown): boolean {
  if (field.type === 'attrtable' || field.type === 'droptable') return true
  if (field.type === 'multiselect') return isObjectArray(value)
  return false
}

function buildInitialDraft(data: Record<string, unknown>, fields: TypeFieldDef[]): Record<string, unknown> {
  const draft: Record<string, unknown> = { ...data }
  for (const field of fields) {
    const value = data[field.name]
    if (usesJsonEditor(field, value)) {
      draft[field.name] = value === undefined || value === null ? '' : JSON.stringify(value, null, 2)
    } else if (field.type === 'spinbox' || field.type === 'double_spin') {
      draft[field.name] = value === undefined || value === null ? '' : String(value)
    } else if (field.type === 'multiselect' || field.type === 'tags') {
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
    if (field.type === 'multiselect' && typeof raw === 'string') {
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
}

function FieldControl({ field, value, jsonMode, onChange }: FieldControlProps) {
  const testId = `field-${field.name}`

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
    case 'combobox':
    case 'template': {
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

export default function ItemForm({ item, fields, onSaved }: ItemFormProps) {
  const [draft, setDraft] = useState<Record<string, unknown>>(() => buildInitialDraft(item.data, fields))
  const [saving, setSaving] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const jsonFields = new Set(
    fields.filter((field) => usesJsonEditor(field, item.data[field.name])).map((field) => field.name)
  )

  const setValue = (name: string, value: unknown): void => {
    setDraft((current) => ({ ...current, [name]: value }))
  }

  const handleReset = (): void => {
    setDraft(buildInitialDraft(item.data, fields))
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
        {fields.map((field) => (
          <div className="form-row" key={field.name}>
            <label className="form-label" htmlFor={`field-${field.name}`}>
              {field.label}
            </label>
            <FieldControl
              field={field}
              value={draft[field.name]}
              jsonMode={jsonFields.has(field.name)}
              onChange={(value) => setValue(field.name, value)}
            />
          </div>
        ))}
      </div>

      <div className="editor-actions">
        <button type="button" className="btn" disabled={saving} onClick={handleReset}>
          重置
        </button>
        <button type="button" className="btn primary" disabled={saving} onClick={() => void handleSave()}>
          保存
        </button>
      </div>
    </aside>
  )
}