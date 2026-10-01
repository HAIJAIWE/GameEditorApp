import { useState } from 'react'

import { CHAPTER_LABELS, type CeshuFieldDef, type ChapterData, type ChapterKey } from '../../../shared/ceshuConstants'
import { isPlainObject } from '../../../shared/ceshuModel'
import { CESHU_CHAPTER_FIELDS } from '../../../shared/ceshuFields'

import { CeshuFieldControl, fieldValueToInput, inputToFieldValue, type FieldInput } from './CeshuFieldControl'
import SystemsEditor from './SystemsEditor'

interface ChapterFormProps {
  chapter: ChapterKey
  data: ChapterData
  busy: boolean
  onSave: (chapter: ChapterKey, data: ChapterData) => Promise<void>
}

/**
 * 章节表单：由 CESHU_CHAPTER_FIELDS 驱动渲染；保存时在原始章节数据上合并字段值，
 * 未在 schema 中出现的扩展/未知字段原样保留（与旧数据兼容）。
 */
export default function ChapterForm({ chapter, data, busy, onSave }: ChapterFormProps) {
  const fields = CESHU_CHAPTER_FIELDS[chapter] ?? []
  const [inputs, setInputs] = useState<Record<string, FieldInput>>(() => buildInputs(fields, data))
  const [systemsDraft, setSystemsDraft] = useState<ChapterData>(() => structuredClone(data))
  const [formError, setFormError] = useState<string | null>(null)

  const handleSave = async (): Promise<void> => {
    setFormError(null)
    try {
      if (chapter === 'systems') {
        await onSave('systems', systemsDraft)
        return
      }
      const next: ChapterData = structuredClone(data)
      for (const field of fields) {
        setByPath(next, field.key, inputToFieldValue(field, inputs[field.key] ?? ''))
      }
      await onSave(chapter, next)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <div className="chapter-form" data-testid="chapter-form">
      <div className="chapter-form-title">{CHAPTER_LABELS[chapter]}</div>

      {chapter === 'systems' ? (
        <SystemsEditor systems={systemsDraft} onChange={setSystemsDraft} />
      ) : (
        fields.map((field) => (
          <CeshuFieldControl
            key={field.key}
            field={field}
            value={inputs[field.key] ?? ''}
            onChange={(next) => setInputs((prev) => ({ ...prev, [field.key]: next }))}
          />
        ))
      )}

      {formError && <div className="form-error">{formError}</div>}

      <div className="editor-actions">
        <button type="button" className="btn primary" data-testid="chapter-save" disabled={busy} onClick={() => void handleSave()}>
          保存本章
        </button>
      </div>
    </div>
  )
}

function buildInputs(fields: CeshuFieldDef[], data: ChapterData): Record<string, FieldInput> {
  const inputs: Record<string, FieldInput> = {}
  for (const field of fields) {
    inputs[field.key] = fieldValueToInput(field, getByPath(data, field.key))
  }
  return inputs
}

function getByPath(source: ChapterData, path: string): unknown {
  let node: unknown = source
  for (const part of path.split('.')) {
    if (!isPlainObject(node)) return undefined
    node = node[part]
  }
  return node
}

function setByPath(target: ChapterData, path: string, value: unknown): void {
  const parts = path.split('.')
  let node: ChapterData = target
  for (let index = 0; index < parts.length - 1; index++) {
    const key = parts[index]
    if (!isPlainObject(node[key])) {
      node[key] = {}
    }
    node = node[key] as ChapterData
  }
  node[parts[parts.length - 1]] = value
}