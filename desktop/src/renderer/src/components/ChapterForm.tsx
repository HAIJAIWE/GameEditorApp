import { useState } from 'react'

import { CHAPTER_LABELS, type CeshuFieldDef, type ChapterData, type ChapterKey } from '../../../shared/ceshuConstants'
import type { CeshuAiGenerateResult } from '../../../shared/ceshuAi'
import { isPlainObject } from '../../../shared/ceshuModel'
import { CESHU_CHAPTER_FIELDS } from '../../../shared/ceshuFields'

import {
  TEMPLATE_APPLY_MODE_SHORT_LABELS,
  countTemplateFields,
  mergeTemplateByMode,
  type ChapterTemplate,
  type TemplateApplyMode
} from '../../../shared/ceshuTemplates'

import { CeshuFieldControl, fieldValueToInput, inputToFieldValue, type FieldInput } from './CeshuFieldControl'
import SystemsEditor from './SystemsEditor'
import TemplatePickerPanel from './TemplatePickerPanel'

interface ChapterFormProps {
  chapter: ChapterKey
  data: ChapterData
  busy: boolean
  onSave: (chapter: ChapterKey, data: ChapterData) => Promise<void>
  /** AI 生成本章（onlyEmpty=true 时仅补全空字段）；由上层走 IPC 调本地模型 */
  onAiGenerate: (chapter: ChapterKey, onlyEmpty: boolean) => Promise<CeshuAiGenerateResult>
}

/**
 * 章节表单：由 CESHU_CHAPTER_FIELDS 驱动渲染；保存时在原始章节数据上合并字段值，
 * 未在 schema 中出现的扩展/未知字段原样保留（与旧数据兼容）。
 */
export default function ChapterForm({ chapter, data, busy, onSave, onAiGenerate }: ChapterFormProps) {
  const fields = CESHU_CHAPTER_FIELDS[chapter] ?? []
  const [inputs, setInputs] = useState<Record<string, FieldInput>>(() => buildInputs(fields, data))
  const [systemsDraft, setSystemsDraft] = useState<ChapterData>(() => structuredClone(data))
  const [formError, setFormError] = useState<string | null>(null)
  const [formNotice, setFormNotice] = useState<string | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  /** 应用模板后的章节草稿（含模板带来的扩展字段）；为 null 时以 data 为准 */
  const [draftData, setDraftData] = useState<ChapterData | null>(null)

  /** 汇总当前表单数据：systems 用系统草稿，其余在 data（或模板草稿）上按 schema 覆盖字段 */
  const collectChapterData = (): ChapterData => {
    if (chapter === 'systems') return systemsDraft
    const next: ChapterData = structuredClone(draftData ?? data)
    for (const field of fields) {
      setByPath(next, field.key, inputToFieldValue(field, inputs[field.key] ?? ''))
    }
    return next
  }

  const handleSave = async (): Promise<void> => {
    setFormError(null)
    try {
      await onSave(chapter, collectChapterData())
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error))
    }
  }

  /** 应用模板：按模式合并到当前草稿并回填表单（不落盘，仍需点「保存本章」） */
  const handleApplyTemplate = (template: ChapterTemplate, mode: TemplateApplyMode): void => {
    setFormError(null)
    setFormNotice(null)
    let existing: ChapterData
    try {
      existing = collectChapterData()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error))
      return
    }
    const merged = mergeTemplateByMode(existing, template.data, mode)
    if (chapter === 'systems') {
      setSystemsDraft(merged)
    } else {
      setDraftData(merged)
      setInputs(buildInputs(fields, merged))
    }
    setPickerOpen(false)
    setFormNotice(
      `已应用模板「${template.name}」（${TEMPLATE_APPLY_MODE_SHORT_LABELS[mode]}）：共 ${countTemplateFields(merged)} 个字段，请检查后点「保存本章」`
    )
  }

  /** AI 生成：结果按字段 schema 转为编辑值填入草稿，由用户检查后手动保存 */
  const handleAiGenerate = async (onlyEmpty: boolean): Promise<void> => {
    setFormError(null)
    setFormNotice(null)
    setAiBusy(true)
    try {
      const result = await onAiGenerate(chapter, onlyEmpty)
      const patch: Record<string, FieldInput> = {}
      for (const field of fields) {
        const parts = field.key.split('.')
        let value: unknown
        if (parts.length === 1) {
          if (!(parts[0] in result.fields)) continue
          value = result.fields[parts[0]]
        } else {
          const parent = result.fields[parts[0]]
          if (!isPlainObject(parent)) continue
          value = parent[parts.slice(1).join('.')]
          if (value === undefined) continue
        }
        patch[field.key] = fieldValueToInput(field, value)
      }
      const count = Object.keys(patch).length
      if (count === 0) {
        setFormError(
          onlyEmpty ? '本章没有可补全的空字段（或 AI 输出无法解析）' : 'AI 未返回可应用的字段（请检查本地模型输出）'
        )
        return
      }
      setInputs((prev) => ({ ...prev, ...patch }))
      setFormNotice(`AI 已生成 ${count} 个字段${result.model ? `（模型 ${result.model}）` : ''}，请检查后点「保存本章」`)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error))
    } finally {
      setAiBusy(false)
    }
  }

  return (
    <div className="chapter-form" data-testid="chapter-form">
      <div className="chapter-form-title">
        <span>{CHAPTER_LABELS[chapter]}</span>
        <span className="chapter-form-ai">
          {aiBusy && <span className="item-meta">AI 生成中…</span>}
          {chapter !== 'systems' && (
            <>
              <button
                type="button"
                className="btn"
                data-testid="ai-generate-chapter"
                disabled={aiBusy}
                onClick={() => void handleAiGenerate(false)}
              >
                AI 生成本章
              </button>
              <button
                type="button"
                className="btn"
                data-testid="ai-fill-empty"
                disabled={aiBusy}
                onClick={() => void handleAiGenerate(true)}
              >
                AI 补全空白
              </button>
            </>
          )}
          <button
            type="button"
            className="btn"
            data-testid="template-picker-open"
            disabled={aiBusy}
            onClick={() => setPickerOpen((open) => !open)}
          >
            {pickerOpen ? '返回表单' : '模板库'}
          </button>
        </span>
      </div>

      {formNotice && <div className="notice-banner inline">{formNotice}</div>}

      {pickerOpen ? (
        <TemplatePickerPanel chapter={chapter} onApply={handleApplyTemplate} onClose={() => setPickerOpen(false)} />
      ) : chapter === 'systems' ? (
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

      {formError && (
        <div className="form-error" data-testid="chapter-form-error">
          {formError}
        </div>
      )}

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