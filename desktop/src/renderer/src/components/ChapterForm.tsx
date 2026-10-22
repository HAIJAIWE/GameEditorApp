import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { CHAPTER_LABELS, type CeshuFieldDef, type ChapterData, type ChapterKey } from '../../../shared/ceshuConstants'
import type { CeshuAiGenerateResult } from '../../../shared/ceshuAi'
import { FIELD_ACTION_LABELS, type FieldAction } from '../../../shared/ceshuFieldAction'
import { isPlainObject } from '../../../shared/ceshuModel'
import { CESHU_CHAPTER_FIELDS, resolveFieldMeta } from '../../../shared/ceshuFields'
import type { ChapterFieldStatus, FieldReviewStatus } from '../../../shared/ceshuFieldStatus'
import { countFieldStatuses, formatFieldStatusSummary } from '../../../shared/ceshuFieldStatusStats'
import {
  clearActiveCeshuField,
  consumeFieldRequest,
  setActiveCeshuField,
  setCeshuFieldBusy,
  subscribeFieldRequest
} from '../ceshuFieldFocus'

import {
  TEMPLATE_APPLY_MODE_SHORT_LABELS,
  countTemplateFields,
  mergeTemplateByMode,
  type ChapterTemplate,
  type TemplateApplyMode
} from '../../../shared/ceshuTemplates'

import { CeshuFieldControl, fieldValueToInput, inputToFieldValue, type FieldInput } from './CeshuFieldControl'
import { AiFieldButton } from './AiFieldButton'
import CompetitiveChart from './CompetitiveChart'
import SystemsEditor from './SystemsEditor'
import TemplatePickerPanel from './TemplatePickerPanel'

interface ChapterFormProps {
  chapter: ChapterKey
  data: ChapterData
  busy: boolean
  /** 来源游戏名（自定义模板的 source_game） */
  gameName: string
  /**
   * 保存本章。`statusUpdates` 是保存时结算出的字段状态（AI 草稿未改→已批准、人改过→human_edited），
   * 由上层连同「清 ai_generated」一起合并进 meta，避免多次写盘。
   */
  onSave: (
    chapter: ChapterKey,
    data: ChapterData,
    statusUpdates?: Record<string, FieldReviewStatus>
  ) => Promise<void>
  /** 本章各字段的审核状态（来自 `meta.field_status`）；缺省视为无记录 */
  fieldStatus?: ChapterFieldStatus
  /** 写入字段状态（「接受」/ AI 草稿标记）；缺省不记录（纯表单模式） */
  onFieldStatus?: (chapter: ChapterKey, updates: Record<string, FieldReviewStatus>) => Promise<void>
  /** AI 生成本章（onlyEmpty=true 时仅补全空字段）；由上层走 IPC 调本地模型 */
  onAiGenerate: (chapter: ChapterKey, onlyEmpty: boolean) => Promise<CeshuAiGenerateResult>
  /** AI 生成单个字段（E62）；由上层走 IPC 调本地模型，返回清洗后的字段供回填。
   *  `action` 为局部重生成动作（停靠栏快捷操作发起），见 `ceshuFieldAction.ts` */
  onAiGenerateField: (chapter: ChapterKey, field: string, action?: FieldAction) => Promise<CeshuAiGenerateResult>
}

/**
 * 章节表单：由 CESHU_CHAPTER_FIELDS 驱动渲染；保存时在原始章节数据上合并字段值，
 * 未在 schema 中出现的扩展/未知字段原样保留（与旧数据兼容）。
 */
/** 单字段 AI 生成的 60 秒安全兜底（对齐 Python QTimer.singleShot）：IPC 挂住时强制解除 busy，避免按钮永久禁用 */
const AI_FIELD_SAFETY_MS = 60_000

export default function ChapterForm({
  chapter,
  data,
  busy,
  gameName,
  onSave,
  onAiGenerate,
  onAiGenerateField,
  fieldStatus,
  onFieldStatus
}: ChapterFormProps) {
  /** 本章字段定义（useMemo：`CESHU_CHAPTER_FIELDS[chapter]` 每次渲染都是新数组，
   *  不进 memo 会让下游 useCallback 的依赖每渲染都变，告警 + 回调失效） */
  const fields = useMemo(() => CESHU_CHAPTER_FIELDS[chapter] ?? [], [chapter])
  /** 本章待审（AI 草稿）字段数：用于顶部审阅提示 */
  const pendingCount = fields.filter((field) => fieldStatus?.[field.key]?.status === 'ai_draft').length
  /** 顶部「本章字段状态」摘要（普通 const：本组件 hook 顺序敏感，纯计算不引入 useMemo） */
  const statusSummary = formatFieldStatusSummary(countFieldStatuses(fieldStatus, fields))
  const [inputs, setInputs] = useState<Record<string, FieldInput>>(() => buildInputs(fields, data))
  const [systemsDraft, setSystemsDraft] = useState<ChapterData>(() => structuredClone(data))
  const [formError, setFormError] = useState<string | null>(null)
  const [formNotice, setFormNotice] = useState<string | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  /** 当前正在 AI 生成的字段 key（null 表示空闲），用于驱动 AiFieldButton 的 busy 态 */
  const [fieldBusy, setFieldBusy] = useState<string | null>(null)
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

  /**
   * 保存时结算字段状态：
   * - 原本 `ai_draft` 且人没改 → `approved`（看过并认可）；
   * - 原本 `ai_draft` 且人改了 → `human_edited`；
   * - 原本无状态但人改了 → `human_edited`。
   * 状态是辅助信息，结算失败不影响本章保存。
   */
  const buildStatusUpdates = (): Record<string, FieldReviewStatus> => {
    const original = buildInputs(fields, data)
    const updates: Record<string, FieldReviewStatus> = {}
    for (const field of fields) {
      const current = fieldStatus?.[field.key]?.status
      const changed = !sameInput(inputs[field.key], original[field.key])
      if (current === 'ai_draft') {
        updates[field.key] = changed ? 'human_edited' : 'approved'
      } else if (changed) {
        updates[field.key] = 'human_edited'
      }
    }
    return updates
  }

  const handleSave = async (): Promise<void> => {
    setFormError(null)
    try {
      await onSave(chapter, collectChapterData(), buildStatusUpdates())
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error))
    }
  }

  /** 一键接受本章所有 AI 草稿字段 */
  const approveAllPending = async (): Promise<void> => {
    if (onFieldStatus === undefined) return
    const updates: Record<string, FieldReviewStatus> = {}
    for (const field of fields) {
      if (fieldStatus?.[field.key]?.status === 'ai_draft') updates[field.key] = 'approved'
    }
    if (Object.keys(updates).length > 0) {
      await onFieldStatus(chapter, updates)
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
      // 标记为 AI 草稿（待审）：状态是辅助信息，写失败不影响已回填的内容
      if (onFieldStatus !== undefined) {
        const updates: Record<string, FieldReviewStatus> = {}
        for (const key of Object.keys(patch)) updates[key] = 'ai_draft'
        try {
          await onFieldStatus(chapter, updates)
        } catch {
          /* 忽略 */
        }
      }
      setFormNotice(`AI 已生成 ${count} 个字段${result.model ? `（模型 ${result.model}）` : ''}，请检查后点「保存本章」`)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error))
    } finally {
      setAiBusy(false)
    }
  }

  /**
   * AI 生成单个字段（E62）：结果按字段 schema 转为编辑值填入该字段，由用户检查后手动保存。
   * `action` 为局部重生成动作（停靠栏快捷操作）：改写/展开/精简/通俗化，注入提示词让模型
   * 按人的诉求重写，而不是重新起草。60 秒安全兜底（对齐 Python QTimer.singleShot）：
   * IPC 挂住时强制解除 busy，避免按钮永久禁用。
   */
  const handleAiFillField = useCallback(
    async (fieldKey: string, action?: FieldAction): Promise<void> => {
      setFormError(null)
      setFormNotice(null)
      setFieldBusy(fieldKey)
      setCeshuFieldBusy(true)
      const safety = setTimeout(() => {
        setFieldBusy((current) => (current === fieldKey ? null : current))
        setCeshuFieldBusy(false)
      }, AI_FIELD_SAFETY_MS)
      try {
        const result = await onAiGenerateField(chapter, fieldKey, action)
        const def = fields.find((field) => field.key === fieldKey)
        const raw = result.fields[fieldKey]
        if (
          def === undefined ||
          raw === undefined ||
          raw === null ||
          raw === '' ||
          (Array.isArray(raw) && raw.length === 0)
        ) {
          setFormError(`AI 未返回「${def?.label ?? fieldKey}」的可应用内容（请检查本地模型输出）`)
          return
        }
        setInputs((prev) => ({ ...prev, [fieldKey]: fieldValueToInput(def, raw) }))
        if (onFieldStatus !== undefined) {
          try {
            await onFieldStatus(chapter, { [fieldKey]: 'ai_draft' })
          } catch {
            /* 状态是辅助信息，失败不影响回填 */
          }
        }
        const actionLabel = action !== undefined ? FIELD_ACTION_LABELS[action] : 'AI'
        setFormNotice(
          `AI 已${actionLabel}「${def.label}」${result.model ? `（模型 ${result.model}）` : ''}，请检查后点「保存本章」`
        )
      } catch (error) {
        setFormError(error instanceof Error ? error.message : String(error))
      } finally {
        clearTimeout(safety)
        setFieldBusy((current) => (current === fieldKey ? null : current))
        setCeshuFieldBusy(false)
      }
    },
    [chapter, fields, onAiGenerateField, onFieldStatus]
  )

  /*
   * 人机协作·右半环：停靠栏对「当前字段」的局部重生成请求。
   * 走**存储订阅**而非 effect 派生：请求由停靠栏点击（外部事件）产生，
   * 在订阅回调里执行生成，避免 effect 体内同步 setState 的级联渲染。
   * `fillFieldRef` 保证回调里用的是最新闭包（handleAiFillField 依赖 fields 会变）。
   */
  const fillFieldRef = useRef(handleAiFillField)
  useEffect(() => {
    fillFieldRef.current = handleAiFillField
  }, [handleAiFillField])
  useEffect(
    () =>
      subscribeFieldRequest((request) => {
        if (request.chapter !== chapter) return // 不匹配本章：留给 CeshuView 切章时清理
        consumeFieldRequest()
        void fillFieldRef.current(request.key, request.action)
      }),
    [chapter]
  )

  // 表单卸载（切章 / 离开策划书）：清理当前字段，停靠栏动作条回到空态
  useEffect(() => clearActiveCeshuField, [])

  return (
    <div className="chapter-form" data-testid="chapter-form">
      <div className="chapter-form-title">
        <span>{CHAPTER_LABELS[chapter]}</span>
        {/* 审核进展一眼可见：不必逐字段往下翻徽标（全零时 statusSummary 为空串，不渲染） */}
        {statusSummary !== '' && (
          <>
            本章：
            <span className="item-meta" data-testid="field-status-summary">
              {statusSummary}
            </span>
          </>
        )}
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

      {/* 审阅提示：本章有 AI 草稿待审时出现，可逐字段接受或一键全接受 */}
      {pendingCount > 0 && onFieldStatus !== undefined && (
        <div className="form-hint-row" data-testid="field-review-banner">
          <span>
            本章有 <b>{pendingCount}</b> 个字段是 AI 草稿：逐字段点「接受」，或直接改完保存（保存即视为核对过）。
          </span>
          <button type="button" className="btn slim" data-testid="field-accept-all" onClick={() => void approveAllPending()}>
            全部接受
          </button>
        </div>
      )}

      {formNotice && <div className="notice-banner inline">{formNotice}</div>}

      {pickerOpen ? (
        <TemplatePickerPanel
          chapter={chapter}
          gameName={gameName}
          onCaptureChapter={collectChapterData}
          onApply={handleApplyTemplate}
          onClose={() => setPickerOpen(false)}
        />
      ) : chapter === 'systems' ? (
        <SystemsEditor systems={systemsDraft} onChange={setSystemsDraft} />
      ) : (
        fields.map((field) => {
          const meta = resolveFieldMeta(chapter, field)
          const status = fieldStatus?.[field.key]?.status
          return (
            <div
              className="field-block"
              key={field.key}
              /* 焦点进入字段内任意控件即「选中该字段」：上报给停靠栏动作条。
                 focus 事件不冒泡但 capture 阶段能收到，故用 onFocusCapture 包一层 */
              onFocusCapture={() =>
                setActiveCeshuField({
                  chapter,
                  key: field.key,
                  label: field.label,
                  ...(status !== undefined ? { status } : {})
                })
              }
            >
              <div className="field-with-ai">
                <CeshuFieldControl
                  field={field}
                  value={inputs[field.key] ?? ''}
                  onChange={(next) => setInputs((prev) => ({ ...prev, [field.key]: next }))}
                />
                <AiFieldButton
                  busy={fieldBusy === field.key}
                  fieldLabel={field.label}
                  disabled={!meta.aiDraftable}
                  disabledHint="该字段由人确定，不交给 AI 起草"
                  onFill={() => void handleAiFillField(field.key)}
                />
              </div>
              {/* 协作契约：必填 / 人定 / 人审要点 —— 只在有信息时出现，不打扰默认字段 */}
              {(meta.required || !meta.aiDraftable || meta.reviewHint !== '' || status !== undefined) && (
                <div className="field-contract" data-testid="field-contract">
                  {status === 'ai_draft' && <span className="field-badge ai-draft">AI 草稿</span>}
                  {status === 'human_edited' && <span className="field-badge human-edited">人改</span>}
                  {status === 'approved' && <span className="field-badge approved">已批准</span>}
                  {meta.required && <span className="field-badge required">必填</span>}
                  {!meta.aiDraftable && <span className="field-badge human">人定</span>}
                  {meta.reviewHint !== '' && <span className="item-meta">{meta.reviewHint}</span>}
                  {status === 'ai_draft' && onFieldStatus !== undefined && (
                    <button
                      type="button"
                      className="btn slim"
                      data-testid="field-accept"
                      onClick={() => void onFieldStatus(chapter, { [field.key]: 'approved' })}
                    >
                      接受
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })
      )}

      {/* 第二章：竞品象限图（对应 Python ChapterPanel 在 vision 章附加 CompetitiveChart） */}
      {chapter === 'vision' && !pickerOpen && (
        <div className="competitive-chart-block">
          <span className="form-label">竞品象限图（横轴=创新度，纵轴=完成度）</span>
          <CompetitiveChart competitors={(draftData ?? data).competitive_analysis} />
        </div>
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

/** 表单值是否相等（用于「人有没有改过这个字段」判定；对象/数组按 JSON 比较） */
function sameInput(a: FieldInput | undefined, b: FieldInput | undefined): boolean {
  if (a === b) return true
  if (a === undefined || b === undefined) return false
  return JSON.stringify(a) === JSON.stringify(b)
}