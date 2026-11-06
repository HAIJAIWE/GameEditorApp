import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useT } from '@mobai/client-ui'

import { type CeshuDocument, type CeshuFieldDef, type ChapterData } from '@mobai/shared/ceshu/reference'
import type { CeshuAiGenerateResult } from '@mobai/shared/ceshu/prompts'
import { FIELD_ACTION_LABELS, type FieldAction } from '@mobai/shared/ceshu/fields'
import {
  chapterFieldsForDoc,
  chapterLabelForDoc,
  createDefaultCeshu,
  isPlainObject,
  requiredFieldsForDoc
} from '@mobai/shared/ceshu/model'

/**
 * 纯表单模式（未传 doc：单测 / 独立挂载）按游戏档查表，保持既有调用方零改动。
 * 生产路径一律由 CeshuChapterBody 显式传整份文档，按 docKind 分派规格。
 */
const FALLBACK_DOC: CeshuDocument = createDefaultCeshu({ scope: 'full' })
import { resolveFieldMeta } from '@mobai/shared/ceshu/fields'
import { isMachineDataField } from '@mobai/shared/ceshu/workflow'
import { HANDOFF_DOCS } from '@mobai/shared/ceshu/workflow'
import type { ChapterFieldStatus, FieldReviewStatus } from '@mobai/shared/ceshu/fields'
import { countFieldStatuses, formatFieldStatusSummary } from '@mobai/shared/ceshu/fields'
import {
  clearActiveCeshuField,
  consumeFieldRequest,
  setActiveCeshuField,
  setCeshuFieldBusy,
  subscribeFieldRequest
} from '../../ceshuFieldFocus'

import {
  TEMPLATE_APPLY_MODE_SHORT_LABELS,
  countTemplateFields,
  mergeTemplateByMode,
  type ChapterTemplate,
  type TemplateApplyMode
} from '@mobai/shared/ceshu/reference'

import { CeshuFieldControl, fieldValueToInput, inputToFieldValue, type FieldInput } from './CeshuFieldControl'
import { AiFieldButton } from '../agent'
import { CompetitiveChart } from '../ceshuType'
import SystemsEditor from './SystemsEditor'
import { TemplatePickerPanel } from '../ceshuType'

interface ChapterFormProps {
  /** 整份文档：字段表/标签/必填按 docKind 分派，应用档走 SDD 规格；缺省按游戏档 */
  doc?: CeshuDocument
  chapter: string
  data: ChapterData
  busy: boolean
  /** 来源游戏名（自定义模板的 source_game） */
  gameName: string
  /**
   * 保存本章。`statusUpdates` 是保存时结算出的字段状态（AI 草稿未改→已批准、人改过→human_edited），
   * 由上层连同「清 ai_generated」一起合并进 meta，避免多次写盘。
   */
  onSave: (
    chapter: string,
    data: ChapterData,
    statusUpdates?: Record<string, FieldReviewStatus>
  ) => Promise<void>
  /** 本章各字段的审核状态（来自 `meta.field_status`）；缺省视为无记录 */
  fieldStatus?: ChapterFieldStatus
  /** 写入字段状态（「接受」/ AI 草稿标记）；缺省不记录（纯表单模式） */
  onFieldStatus?: (chapter: string, updates: Record<string, FieldReviewStatus>) => Promise<void>
  /** AI 生成本章（onlyEmpty=true 时仅补全空字段）；由上层走 IPC 调本地模型 */
  onAiGenerate: (chapter: string, onlyEmpty: boolean) => Promise<CeshuAiGenerateResult>
  /** AI 生成单个字段（E62）；由上层走 IPC 调本地模型，返回清洗后的字段供回填。
   *  `action` 为局部重生成动作（停靠栏快捷操作发起），见 `ceshuFieldAction.ts` */
  onAiGenerateField: (chapter: string, field: string, action?: FieldAction) => Promise<CeshuAiGenerateResult>
  /**
   * 外部要求聚焦的字段 key（校验 / 完备度面板的「跳到字段」）：
   * 挂载或变化时滚到该字段块并短暂高亮，然后由 `onFocusConsumed` 让宿主清掉目标。
   */
  focusField?: string
  /** 聚焦已消费（宿主据此清空目标，否则同字段第二次点击不会再触发） */
  onFocusConsumed?: () => void
  /**
   * 查看字段影响面（「改这里会影响什么」）。面板在宿主渲染——本组件拿不到整份文档，
   * 只负责发信号；缺省则不显示「影响面」按钮（纯表单模式）。
   */
  onShowImpact?: (chapter: string, field: string) => void
}

/**
 * 章节表单：由 CESHU_CHAPTER_FIELDS 驱动渲染；保存时在原始章节数据上合并字段值，
 * 未在 schema 中出现的扩展/未知字段原样保留（与旧数据兼容）。
 */
/** 单字段 AI 生成的 60 秒安全兜底：IPC 挂住时强制解除 busy，避免按钮永久禁用 */
const AI_FIELD_SAFETY_MS = 60_000

export default function ChapterForm({
  doc,
  chapter,
  data,
  busy,
  gameName,
  onSave,
  onAiGenerate,
  onAiGenerateField,
  fieldStatus,
  onFieldStatus,
  focusField,
  onFocusConsumed,
  onShowImpact
}: ChapterFormProps) {
  const t = useT()
  const spec = doc ?? FALLBACK_DOC
  /** 本章字段定义：按 docKind 取（游戏 CESHU_CHAPTER_FIELDS / 应用 APP_CHAPTER_FIELDS）。
   *  不进 memo 会让下游 useCallback 的依赖每渲染都变，告警 + 回调失效 */
  // 规格化函数返回 readonly；本组件下游多处接收 CeshuFieldDef[]（可变），这里做一层浅拷贝。
  const fields = useMemo<CeshuFieldDef[]>(() => [...chapterFieldsForDoc(spec, chapter)], [spec, chapter])
  /**
   * 只有**被交接文档引用**的字段才显示「影响面」按钮。
   * 没被引用的字段点开只会看到「没有交接文档直接引用」——那是噪音，不如不显示。
   * 集合按章算一次（不是每个字段扫一遍 HANDOFF_DOCS）。
   */
  const impactableFields = useMemo(() => {
    const keys = new Set<string>()
    for (const def of HANDOFF_DOCS) {
      for (const item of def.fields) {
        if (item.chapter === chapter) keys.add(item.field)
      }
    }
    return keys
  }, [chapter])
  /**
   * 字段分两段渲染（2026-10-26，反向验证后）：
   * 「验收 / 机读数据」类字段（对账账本、数值断言、证据核对、用例清单…）存在价值是
   * 让机器能判，不是让人写散文。混在正文里会让人以为立项就得写一份经济账本，
   * 所以排到末尾单独成组，并说明「不计入完成度」（完成度只统计必填字段，
   * 这些字段都不是必填，天然不影响）。
   */
  const { bodyFields, machineFields } = useMemo(() => {
    const body: CeshuFieldDef[] = []
    const machine: CeshuFieldDef[] = []
    for (const field of fields) {
      if (isMachineDataField(chapter, field.key)) machine.push(field)
      else body.push(field)
    }
    return { bodyFields: body, machineFields: machine }
  }, [fields, chapter])
  /**
   * 字段搜索（长章必备：combat 32 个字段，靠滚动找「伤害公式」要翻很久）。
   * 只影响**渲染**，不影响保存——`collectChapterData` 始终遍历完整 `fields`，
   * 被过滤掉的字段值仍在 `inputs` 里，保存不会丢内容。
   */
  const [fieldQuery, setFieldQuery] = useState('')
  /** 字段少时不出搜索框：8 个字段一眼看完，多个输入框只是噪音 */
  const searchable = fields.length >= 10
  const visibleFields = useMemo(() => {
    const query = fieldQuery.trim().toLowerCase()
    if (query === '') return { body: bodyFields, machine: machineFields, matched: fields.length }
    const hit = (field: CeshuFieldDef): boolean =>
      `${field.label} ${field.key} ${field.placeholder ?? ''}`.toLowerCase().includes(query)
    const body = bodyFields.filter(hit)
    const machine = machineFields.filter(hit)
    return { body, machine, matched: body.length + machine.length }
  }, [bodyFields, machineFields, fieldQuery, fields.length])
  /** 本章待审（AI 草稿）字段数：用于顶部审阅提示 */
  const pendingCount = fields.filter((field) => fieldStatus?.[field.key]?.status === 'ai_draft').length
  /** 顶部「本章字段状态」摘要（普通 const：本组件 hook 顺序敏感，纯计算不引入 useMemo） */
  const statusSummary = formatFieldStatusSummary(countFieldStatuses(fieldStatus, fields))
  /** 首个待审（AI 草稿）字段：顶部摘要的点击入口就指向它（普通 const，理由同上） */
  const firstPendingField = fields.find((field) => fieldStatus?.[field.key]?.status === 'ai_draft')?.key ?? null
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
  /** 字段块的 DOM 表：摘要点击后要按 key 找到对应块才能滚动过去 */
  const fieldBlockRefs = useRef<Record<string, HTMLDivElement | null>>({})
  /** 刚跳转到的字段 key：短暂高亮，帮人从长表单里定位（定时自动清除） */
  const [flashField, setFlashField] = useState<string | null>(null)
  /** 高亮定时器 id：卸载时清掉，避免对已卸载组件调用 setState 的告警 */
  const flashTimerRef = useRef<number | null>(null)

  /**
   * 「有未保存修改」：与保存时同一判据（`sameInput` 比字段输入 + 系统草稿 + 模板草稿）。
   * 用户改完不保存就切章，回来能一眼看出哪些章还没落盘 —— 此前只有点「保存本章」
   * 才知道有没有存，切走再回来完全看不出来。
   */
  const baselineInputs = useMemo(() => buildInputs(fields, data), [fields, data])
  const fieldDirty = useMemo(
    () => fields.some((field) => !sameInput(inputs[field.key], baselineInputs[field.key])),
    [fields, inputs, baselineInputs]
  )
  const systemsDirty = chapter === 'systems' && JSON.stringify(systemsDraft) !== JSON.stringify(data)
  const dirty = draftData !== null || fieldDirty || systemsDirty

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

  /**
   * 滚动到指定字段块并短暂高亮；连点先清旧定时器，卸载时由 effect 清理。
   * `useCallback([])`：只碰 ref 与 setState（都稳定），稳定引用才能让下面
   * 「外部跳字段」的 effect 不因每次渲染新建函数而反复重跑。
   */
  const focusFieldBlock = useCallback((fieldKey: string): void => {
    const el = fieldBlockRefs.current[fieldKey]
    // jsdom 未实现 scrollIntoView：可选调用，测试环境不抛错
    el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    setFlashField(fieldKey)
    // 连点时先清旧定时器，否则旧回调会把新高亮提前抹掉
    if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current)
    flashTimerRef.current = window.setTimeout(() => {
      flashTimerRef.current = null
      setFlashField(null)
    }, 1200)
  }, [])

  /** 摘要点击：滚到首个待审字段并短暂高亮，省掉人工往下翻找 */
  const jumpToFirstPending = (): void => {
    if (firstPendingField === null) return
    focusFieldBlock(firstPendingField)
  }

  /**
   * 外部「跳到某字段」请求（校验面板 / 完备度面板）：滚过去 + 高亮，再让宿主清掉目标。
   *
   * 用 ref 记「已处理过的 key」而不是只靠依赖数组：宿主传的 `onFocusConsumed` 是每次渲染
   * 新建的闭包，effect 会跟着重跑；没有这层去重，人正在打字时表单会被反复滚走。
   * 宿主清空目标（`focusField` 变 undefined）时把 ref 也清掉，同一个字段才能再跳一次。
   */
  /*
   * 跳转请求到达时先清空搜索。
   *
   * 为什么在**渲染期**调整而不是 effect 里：搜索过滤会把目标字段藏起来，不清空就滚不到
   * （表现为「点了没反应」）。但 effect 里 setState 会多跑一轮提交，React 的
   * `set-state-in-effect` 规则也会报错；「prop 变了就调整 state」是 React 官方认可的模式——
   * 同一轮内立即重渲染，DOM 提交时字段已经回到列表里，effect 再去滚就是有效目标。
   */
  const [lastFocusRequest, setLastFocusRequest] = useState<string | undefined>(undefined)
  if (focusField !== lastFocusRequest) {
    setLastFocusRequest(focusField)
    if (focusField !== undefined && fieldQuery !== '') setFieldQuery('')
  }

  const consumedFocusRef = useRef<string | null>(null)
  useEffect(() => {
    if (focusField === undefined) {
      consumedFocusRef.current = null
      return
    }
    if (consumedFocusRef.current === focusField) return
    consumedFocusRef.current = focusField
    focusFieldBlock(focusField)
    onFocusConsumed?.()
  }, [focusField, onFocusConsumed, focusFieldBlock])

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
      t('chapterForm.templateApplied', {
        name: template.name,
        mode: TEMPLATE_APPLY_MODE_SHORT_LABELS[mode],
        count: countTemplateFields(merged)
      })
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
          onlyEmpty ? t('chapterForm.noEmptyFields') : t('chapterForm.aiNoFields')
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
      setFormNotice(t('chapterForm.aiGenerated', { count, model: result.model ? t('chapterForm.modelSuffix', { model: result.model }) : '' }))
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error))
    } finally {
      setAiBusy(false)
    }
  }

  /**
   * AI 生成单个字段（E62）：结果按字段 schema 转为编辑值填入该字段，由用户检查后手动保存。
   * `action` 为局部重生成动作（停靠栏快捷操作）：改写/展开/精简/通俗化，注入提示词让模型
   * 按人的诉求重写，而不是重新起草。60 秒安全兜底：
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
          setFormError(t('chapterForm.aiFieldEmpty', { label: def?.label ?? fieldKey }))
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
        setFormNotice(t('chapterForm.aiFieldDone', { action: actionLabel, label: def.label, model: result.model ? t('chapterForm.modelSuffix', { model: result.model }) : '' }))
      } catch (error) {
        setFormError(error instanceof Error ? error.message : String(error))
      } finally {
        clearTimeout(safety)
        setFieldBusy((current) => (current === fieldKey ? null : current))
        setCeshuFieldBusy(false)
      }
    },
    [chapter, fields, onAiGenerateField, onFieldStatus, t]
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

  // 卸载时清掉高亮定时器：切章后即便回调触发也只会 setState 到已卸载组件
  useEffect(
    () => () => {
      if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current)
    },
    []
  )

  /**
   * 单个字段块（控件 + AI 按钮 + 契约徽标）。
   * 抽成函数是为了让「正文 / 验收机读数据」两段能各自 map 一次，
   * 而不必把整块 JSX 写两遍（分组头渲染在两次 map 之间）。
   */
  const renderFieldBlock = (field: CeshuFieldDef) => {
    const meta = resolveFieldMeta(chapter, field, requiredFieldsForDoc(spec, chapter))
    const status = fieldStatus?.[field.key]?.status
    const showImpact = onShowImpact !== undefined && impactableFields.has(field.key)
    return (
      <div
        className={`field-block${flashField === field.key ? ' field-block-flash' : ''}`}
        key={field.key}
        ref={(el) => {
          fieldBlockRefs.current[field.key] = el
        }}
        /* 跳转高亮的钩子：样式由 CSS 侧按 [data-flash="true"] 或 .field-block-flash 补 */
        data-flash={flashField === field.key ? 'true' : 'false'}
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
            disabledHint={t('chapterForm.humanOnlyHint')}
            onFill={() => void handleAiFillField(field.key)}
          />
        </div>
        {/* 协作契约：必填 / 人定 / 人审要点 —— 只在有信息时出现，不打扰默认字段 */}
        {(meta.required || !meta.aiDraftable || meta.reviewHint !== '' || status !== undefined || showImpact) && (
          <div className="field-contract" data-testid="field-contract">
            {status === 'ai_draft' && <span className="field-badge ai-draft">{t('chapterForm.badgeAiDraft')}</span>}
            {status === 'human_edited' && <span className="field-badge human-edited">{t('chapterForm.badgeHumanEdited')}</span>}
            {status === 'approved' && <span className="field-badge approved">{t('chapterForm.badgeApproved')}</span>}
            {meta.required && <span className="field-badge required">{t('chapterForm.badgeRequired')}</span>}
            {!meta.aiDraftable && <span className="field-badge human">{t('chapterForm.badgeHuman')}</span>}
            {meta.reviewHint !== '' && <span className="item-meta">{meta.reviewHint}</span>}
            {showImpact && (
              <button
                type="button"
                className="btn slim"
                data-testid="field-impact"
                title={t('chapterForm.impactTitle')}
                onClick={() => onShowImpact?.(chapter, field.key)}
              >
                {t('chapterForm.impact')}
              </button>
            )}
            {status === 'ai_draft' && onFieldStatus !== undefined && (
              <button
                type="button"
                className="btn slim"
                data-testid="field-accept"
                onClick={() => {
                  // 必须先算下一个：onFieldStatus 之后本章状态会把当前字段从 ai_draft 移走，
                  // 而 fieldStatus 这个 prop 的刷新是异步的，顺序写反就会拿旧值算错
                  const next = nextPendingFieldKey(fields, fieldStatus, field.key)
                  void onFieldStatus(chapter, { [field.key]: 'approved' })
                  if (next !== null) focusFieldBlock(next)
                }}
              >
                {t('chapterForm.accept')}
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="chapter-form" data-testid="chapter-form">
      <div className="chapter-form-title">
        <span>{chapterLabelForDoc(spec, chapter)}</span>
        {/* 审核进展一眼可见：不必逐字段往下翻徽标（全零时 statusSummary 为空串，不渲染） */}
        {statusSummary !== '' && (
          <>
            {t('chapterForm.thisChapter')}
            {firstPendingField !== null ? (
              /* 有 AI 草稿时摘要即入口：点一下直接到第一个待审字段 */
              <button type="button" className="btn-link" data-testid="field-status-summary" onClick={jumpToFirstPending}>
                {statusSummary}
              </button>
            ) : (
              <span className="item-meta" data-testid="field-status-summary">
                {statusSummary}
              </span>
            )}
          </>
        )}
        <span className="chapter-form-ai">
          {aiBusy && <span className="item-meta">{t('chapterForm.aiBusy')}</span>}
          {chapter !== 'systems' && (
            <>
              <button
                type="button"
                className="btn"
                data-testid="ai-generate-chapter"
                disabled={aiBusy}
                onClick={() => void handleAiGenerate(false)}
              >
                {t('chapterForm.aiGenerateChapter')}
              </button>
              <button
                type="button"
                className="btn"
                data-testid="ai-fill-empty"
                disabled={aiBusy}
                onClick={() => void handleAiGenerate(true)}
              >
                {t('chapterForm.aiFillEmpty')}
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
            {pickerOpen ? t('chapterForm.backToForm') : t('chapterForm.templateLibrary')}
          </button>
        </span>
      </div>

      {/* 审阅提示：本章有 AI 草稿待审时出现，可逐字段接受或一键全接受 */}
      {pendingCount > 0 && onFieldStatus !== undefined && (
        <div className="form-hint-row" data-testid="field-review-banner">
          <span>
            {t('chapterForm.reviewBanner', { n: pendingCount })}
          </span>
          <button type="button" className="btn slim" data-testid="field-accept-all" onClick={() => void approveAllPending()}>
            {t('chapterForm.acceptAll')}
          </button>
        </div>
      )}

      {formNotice && <div className="notice-banner inline">{formNotice}</div>}

      {/* 字段搜索：只对长章出现（见 `searchable`）；过滤只影响渲染，不影响保存 */}
      {searchable && !pickerOpen && chapter !== 'systems' && (
        <div className="field-search-row" data-testid="field-search-row">
          <input
            type="search"
            className="field-search-input"
            data-testid="field-search"
            placeholder={t('chapterForm.searchPlaceholder', { n: fields.length })}
            value={fieldQuery}
            onChange={(event) => setFieldQuery(event.target.value)}
          />
          {fieldQuery.trim() !== '' && (
            <>
              <span className="item-meta" data-testid="field-search-count">
                {t('chapterForm.searchCount', { matched: visibleFields.matched, total: fields.length })}
              </span>
              <button
                type="button"
                className="btn slim"
                data-testid="field-search-clear"
                onClick={() => setFieldQuery('')}
              >
                {t('chapterForm.searchClear')}
              </button>
            </>
          )}
        </div>
      )}

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
      ) : visibleFields.matched === 0 ? (
        /* 搜不到时给明确出口：不然看起来像「这一章没字段」 */
        <div className="empty" data-testid="field-search-empty">
          {t('chapterForm.searchEmpty', { query: fieldQuery.trim() })}
          <button type="button" className="btn slim" data-testid="field-search-empty-clear" onClick={() => setFieldQuery('')}>
            {t('chapterForm.searchEmptyClear')}
          </button>
        </div>
      ) : (
        <>
          {visibleFields.body.map(renderFieldBlock)}
          {visibleFields.machine.length > 0 && (
            <div className="field-group-head" data-testid="machine-data-group">
              <div className="field-group-title">{t('chapterForm.machineGroup')}</div>
              <div className="field-group-hint">
                {t('chapterForm.machineGroupHint')}
              </div>
            </div>
          )}
          {visibleFields.machine.map(renderFieldBlock)}
        </>
      )}

      {/* 第二章：竞品象限图 */}
      {chapter === 'vision' && !pickerOpen && (
        <div className="competitive-chart-block">
          <span className="form-label">{t('chapterForm.competitiveChart')}</span>
          <CompetitiveChart competitors={(draftData ?? data).competitive_analysis} />
        </div>
      )}

      {formError && (
        <div className="form-error" data-testid="chapter-form-error">
          {formError}
        </div>
      )}

      <div className="editor-actions">
        <span
          className={`item-meta chapter-save-state${dirty ? ' is-dirty' : ''}`}
          data-testid="chapter-save-state"
          data-dirty={dirty ? 'true' : 'false'}
        >
          {busy ? t('chapterForm.saving') : dirty ? t('chapterForm.unsaved') : t('chapterForm.saved')}
        </span>
        <button type="button" className="btn primary" data-testid="chapter-save" disabled={busy} onClick={() => void handleSave()}>
          {t('chapterForm.saveChapter')}
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

/** 在字段定义顺序里，找 currentKey 之后第一个 ai_draft 字段；没有则回绕到之前第一个；都没有返回 null */
export function nextPendingFieldKey(
  fields: readonly CeshuFieldDef[],
  fieldStatus: ChapterFieldStatus | undefined,
  currentKey: string
): string | null {
  const isPending = (key: string): boolean => fieldStatus?.[key]?.status === 'ai_draft'
  const index = fields.findIndex((field) => field.key === currentKey)
  // 当前字段不在 schema 里时 index 为 -1：此时按「整章向后找」处理，避免直接判空
  const from = index === -1 ? 0 : index + 1
  // 先向后：连续审阅时人往下走是主路径，回绕只作为收尾兜底
  for (let i = from; i < fields.length; i++) {
    const key = fields[i].key
    if (isPending(key)) return key
  }
  // 向后没有了再回绕到前面（含当前字段之前的所有字段）
  const end = index === -1 ? fields.length : index
  for (let i = 0; i < end; i++) {
    const key = fields[i].key
    if (isPending(key)) return key
  }
  return null
}