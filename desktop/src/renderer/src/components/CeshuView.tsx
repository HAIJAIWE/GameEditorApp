import { useCallback, useEffect, useRef, useState } from 'react'

import {
  CESHU_EXPORT_FORMATS,
  CESHU_FORMAT_LABELS,
  CHAPTER_LABELS,
  MODULE_CHAPTERS,
  contentChapterCount,
  enabledModuleChapters,
  isChapterKey,
  type CeshuDocument,
  type CeshuExportFormat,
  type ChapterData,
  type ChapterKey
} from '../../../shared/ceshuConstants'
import {
  computeChapterProgress,
  computeEnabledEditors,
  formatLocalTimestamp,
  getGddScope,
  resolveDocGameStyle,
  visibleChaptersForDoc
} from '../../../shared/ceshuModel'
import type { CeshuChangelog } from '../../../shared/ceshuDiff'
import {
  CESHU_STAGE_LABELS,
  CESHU_STAGE_ORDER,
  isChapterVisibleInStage,
  type CeshuStage
} from '../../../shared/ceshuStages'
import {
  buildChangelogHtml,
  buildChangelogMarkdown,
  buildChangelogText,
  buildValidationReportMarkdown
} from '../../../shared/domain/ceshu/ceshuReports'
import { buildReadinessReportMarkdown, type CeshuReadinessReport } from '../../../shared/ceshuReadiness'
import { clearAiGenerated, markAiGenerated, readAiGenerated } from '../../../shared/ceshuAiMark'
import { fieldStatusOf, setFieldStatuses, type FieldReviewStatus } from '../../../shared/ceshuFieldStatus'
import type { FieldAction } from '../../../shared/ceshuFieldAction'
import { clearFieldRequest } from '../ceshuFieldFocus'
import { CESHU_CHAPTER_FIELDS } from '../../../shared/ceshuFields'
import { migrationSplitTitle, pendingSplitCount, planCeshuMigration } from '../../../shared/ceshuMigrationPlan'
import { REVIEW_QUEUE_KEY_HINT, resolveReviewQueueKey } from '../reviewQueueKeys'
import { buildCeshuBundle } from '../../../shared/ceshuBundle'
import {
  applyCeshuPatch,
  parseCeshuIssues,
  parseCeshuPatch,
  previewPatchValue,
  type CeshuIssueParseResult,
  type CeshuPatchItem,
  type CeshuPatchParseResult
} from '../../../shared/ceshuImportPatch'
import {
  BUNDLE_CONSUME_TASKS,
  BUNDLE_CONSUME_TASK_LABELS,
  BUNDLE_CONSUME_USAGE,
  buildBundleConsumePrompt,
  type BundleConsumeTask
} from '../../../shared/ceshuBundlePrompt'
import type { CeshuAiGenerateResult } from '../../../shared/ceshuAi'
import type { DataTypeDef } from '../../../shared/types'

import AiDataGenPanel from './AiDataGenPanel'
import AiFullGeneratePanel from './AiFullGeneratePanel'
import AiReviewPanel from './AiReviewPanel'
import ChapterForm from './ChapterForm'
import CeshuModulePicker from './CeshuModulePicker'
import CeshuOverview from './CeshuOverview'
import CeshuPrototypePanel from './CeshuPrototypePanel'
import CeshuAgentPanel from './CeshuAgentPanel'
import CeshuTasksPanel from './CeshuTasksPanel'
import CeshuMachineDataPanel from './CeshuMachineDataPanel'
import ChapterNotesPanel from './ChapterNotesPanel'
import CeshuDataPreview, { type PreviewJumpTarget } from './ceshu/CeshuDataPreview'
import CeshuDataRefsPanel from './ceshu/CeshuDataRefsPanel'
import FieldImpactPanel from './ceshu/FieldImpactPanel'
import HealthPanel from './ceshu/HealthPanel'
import RoutePanel from './ceshu/RoutePanel'
import { ChangelogPanel, ReadinessPanel, ValidatePanel } from './ceshu/CeshuReportPanels'
import { cursorAfterAccept } from './ceshu/reviewQueueAdvance'
import { groupReviewQueue } from './ceshu/reviewQueueGroups'
import { previewFieldValue, readFieldValue } from './ceshu/reviewPreview'
import LucideIcon from './LucideIcon'
import PresetMarketPanel from './PresetMarketPanel'
import SystemConfirmPanel from './SystemConfirmPanel'
import TemplateEditorPanel from './TemplateEditorPanel'
import VersionDiffPanel from './VersionDiffPanel'
import VersionTimelinePanel from './VersionTimelinePanel'
import { toErrorMessage } from './ceshuViewUtils'

/** 数据栏展开状态的 localStorage 键（`'0'` = 收起，其它/缺失 = 展开） */
const PREVIEW_OPEN_KEY = 'mb.ceshu.previewOpen'

/** 全局待审字段（跨章）：AI 草稿、尚未接受。按档位可见章节顺序 + 字段定义顺序排列 */
function collectPendingReviewFields(doc: CeshuDocument): Array<{
  chapter: ChapterKey
  fieldKey: string
  fieldLabel: string
}> {
  const pending: Array<{ chapter: ChapterKey; fieldKey: string; fieldLabel: string }> = []
  for (const chapter of visibleChaptersForDoc(doc)) {
    const statuses = fieldStatusOf(doc.meta, chapter)
    for (const field of CESHU_CHAPTER_FIELDS[chapter] ?? []) {
      if (statuses[field.key]?.status === 'ai_draft') {
        pending.push({ chapter, fieldKey: field.key, fieldLabel: field.label })
      }
    }
  }
  return pending
}

/** 左栏「产出物」切换（2026-10-26 三栏布局：左=产出物+大纲，中=工作区，右=智能体） */
const ARTIFACTS = [
  { key: 'doc', label: '设计文档' },
  { key: 'prototype', label: '原型预览' },
  { key: 'data', label: '数据 / 机读' },
  { key: 'tasks', label: '岗位任务' }
] as const
type ArtifactKey = (typeof ARTIFACTS)[number]['key']

interface CeshuViewProps {
  ceshuId: string | null
  onChanged: () => void
  /** 切换当前策划书（派生新版本后自动切到新版本） */
  onSelect: (id: string) => void
  /**
   * 打开策划书时回填活跃术语风格（对应 旧版 `ceshu_controller.open_ceshu`：
   * 由 meta 推断风格后 `set_active_style`；本版优先采用用户显式选过的 `doc.style`）。
   */
  onGameStyleChange?: (styleId: string) => void
  /** 全部数据类型定义（内嵌数据编辑器标签页渲染条目表单用） */
  types: readonly DataTypeDef[]
  /** 活跃术语风格 id（透传给内嵌数据编辑器的字段标签术语替换） */
  gameStyle?: string
  /** 返回策划书首页 */
  onBack: () => void
  /** 跳转定位目标（透传给内嵌数据预览面板，命中启用编辑器时定位到对应条目） */
  jumpTarget?: PreviewJumpTarget | null
  /** 跳转已处理（透传；宿主据此清空 jumpTarget） */
  onJumpHandled?: () => void
  /** 跳转未命中（透传；宿主据此提示目标类型未被启用系统覆盖） */
  onJumpMissed?: (name: string) => void
  /** 数据纪元（App 在「清空所有数据」成功后递增）：并入内嵌数据编辑器的 key 强制重挂载刷新 */
  dataEpoch?: number
  /** 打开「字段结构编辑器」编辑指定类型（由条目表单的「更多 ▸」触发，宿主负责开面板） */
  onEditType?: (typeId: string) => void
  /** 类型 schema 被改动（数据表补齐会新建类型/字段）：宿主刷新类型列表 */
  onTypesChanged?: (types: DataTypeDef[]) => void
  /** 打开「数据关联预览」查看某条目引用关系（由条目表单的「更多 ▸」触发，宿主负责开面板） */
  onShowReferences?: (target: { type: string; id: string; name: string }) => void
}

/** 策划书编辑器：章节导航（含进度）+ 章节表单 + 版本链操作 */
export default function CeshuView({
  ceshuId,
  onChanged,
  onSelect,
  onGameStyleChange,
  types,
  gameStyle,
  onBack,
  jumpTarget,
  dataEpoch = 0,
  onJumpHandled,
  onJumpMissed,
  onEditType,
  onTypesChanged,
  onShowReferences
}: CeshuViewProps) {
  const [doc, setDoc] = useState<CeshuDocument | null>(null)
  const [activeChapter, setActiveChapter] = useState<ChapterKey>('meta')
  /**
   * 阶段筛选（2026-10-26，反向验证后的入口分层）：
   * **默认 'concept'（立项 7 章）**——24 章全平铺会把策划书变成 checklist（「不像设计文档」）。
   * 要扩展再切「研发 / 发行 / 全部」；发行阶段的章不会真丢：校验跳转、评审队列会把
   * activeChapter 带过去，而当前章永远参与渲染，避免「筛掉自己」导致右侧面板空白。
   */
  const [stageFilter, setStageFilter] = useState<CeshuStage | 'all'>('concept')
  /** 一页总览（2026 对齐）：把当前阶段压成一页只读摘要；默认仍是逐章编辑 */
  const [viewMode, setViewMode] = useState<'edit' | 'overview'>('edit')
  /** 系统模块勾选面板是否展开 */
  const [modulePickerOpen, setModulePickerOpen] = useState(false)
  /** 左栏产出物：设计文档 / 原型 / 数据 / 任务 */
  const [artifact, setArtifact] = useState<ArtifactKey>('doc')
  /** 全局审阅队列（跨章列出 AI 草稿字段）是否展开 */
  const [reviewOpen, setReviewOpen] = useState(false)
  /** 字段影响面面板的目标（null = 关闭）；由字段头上的「影响面」按钮打开 */
  const [impactTarget, setImpactTarget] = useState<{ chapter: ChapterKey; field: string } | null>(null)
  /** 开发路线面板：几波、每波能并行做什么、门禁过没过 */
  const [routeOpen, setRouteOpen] = useState(false)
  const [healthOpen, setHealthOpen] = useState(false)
  /** 迁移预览（只读）浮层是否展开 */
  const [migrationOpen, setMigrationOpen] = useState(false)
  /** AI 消费提示词浮层是否展开，以及当前任务（draft=按契约起草 / review=审阅找问题） */
  const [consumeOpen, setConsumeOpen] = useState(false)
  const [consumeTask, setConsumeTask] = useState<BundleConsumeTask>('draft')
  /** 审阅队列键盘光标（第几条待审）；打开队列时归零，列表变化时渲染期夹取，不写 effect */
  const [reviewCursor, setReviewCursor] = useState(0)
  /**
   * 审阅队列里被折叠的章节。用**数组**而不是 Set：Set 是可变对象，setState 传同一实例
   * 会被 React 判为无变化而不重渲染；数组每次增删都产生新引用，语义也更直白。
   * 默认空数组 = 全部展开（扫队列时先看全貌）。
   */
  const [collapsedChapters, setCollapsedChapters] = useState<ChapterKey[]>([])
  /** 导入 AI 结果：浮层开关、粘贴原文、解析结果（null = 尚未解析） */
  const [importOpen, setImportOpen] = useState(false)
  const [importRaw, setImportRaw] = useState('')
  const [importResult, setImportResult] = useState<CeshuPatchParseResult | null>(null)
  /** 审阅结果（issues 清单，只读）：与 importResult 互斥，避免把问题清单当补丁应用 */
  const [issueResult, setIssueResult] = useState<CeshuIssueParseResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [exportFormat, setExportFormat] = useState<CeshuExportFormat>('markdown')
  const [deriveOpen, setDeriveOpen] = useState(false)
  const [deriveNote, setDeriveNote] = useState('')
  const [panel, setPanel] = useState<
    | 'changelog'
    | 'validate'
    | 'readiness'
    | 'aiFull'
    | 'aiReview'
    | 'diff'
    | 'notes'
    | 'timeline'
    | 'templateEditor'
    | 'aiDataGen'
    | 'presetMarket'
    | 'systemConfirm'
    | 'dataRefs'
    | null
  >(null)
  const [changelog, setChangelog] = useState<CeshuChangelog | null>(null)
  const [validateErrors, setValidateErrors] = useState<string[]>([])
  const [readiness, setReadiness] = useState<CeshuReadinessReport | null>(null)
  /**
   * 「跳到某章的某个字段」目标（校验面板的必填缺失 / 完备度面板的逐章缺口 / 审阅队列的「查看」）。
   * 与数据栏的 `jumpTarget`（跳到引用）无关：那个跳数据、这个跳表单字段。
   * 消费方是 `ChapterForm` 的 `focusField`：滚过去 + 高亮，然后回调清空（见其注释）。
   */
  const [fieldJump, setFieldJump] = useState<{ chapter: ChapterKey; field: string } | null>(null)
  /** 「更多 ▸」下拉展开状态 */
  const [moreOpen, setMoreOpen] = useState(false)
  /**
   * 数据栏是否展开（左栏 + 中间 = 工作区，右栏 = 智能体）。
   *
   * **默认收起**：本项目的实际工作流是「AI 生成 → 人扫一遍」，审阅时数据栏通常是空的，
   * 却把正文挤到每行十来个字（实测开栏时表单 345px、收起后 820px）。
   * 需要对照数据时一键展开；状态存 localStorage，记住用户的姿势。
   */
  const [previewOpen, setPreviewOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(PREVIEW_OPEN_KEY) === '1'
    } catch {
      return false // 隐私模式/存储被禁：按默认（收起）
    }
  })

  const togglePreview = (): void => {
    setPreviewOpen((open) => {
      const next = !open
      try {
        localStorage.setItem(PREVIEW_OPEN_KEY, next ? '1' : '0')
      } catch {
        // 存储不可用不影响本次会话内的开关
      }
      return next
    })
  }
  /** 「AI 生成数据」的预选目标（由条目表单 / 设计↔数据表核对的「AI 生成缺失数据」指定） */
  interface AiGenTarget {
    /** 预选的数据类型 id；null = 面板默认全选 */
    typeId: string | null
    /** 预填的每类生成数量（核对缺口传入） */
    count?: number
    /** 预填的补充要求（核对缺口传入，说明要补齐的表与缺口） */
    instruction?: string
  }
  const [aiGenTarget, setAiGenTarget] = useState<AiGenTarget | null>(null)
  const moreRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!moreOpen) return undefined
    const onDocClick = (event: MouseEvent): void => {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) {
        setMoreOpen(false)
      }
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMoreOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [moreOpen])

  useEffect(() => {
    if (!ceshuId) return
    let cancelled = false
    window.mbApi.ceshu
      .get({ id: ceshuId })
      .then((loaded) => {
        if (cancelled) return
        setDoc(loaded)
        setActiveChapter('meta')
        setError(null)
        setPanel(null)
        setDeriveOpen(false)
        // 对齐 旧版 `ceshu_controller:66-71`：打开策划书时，若**尚未确认过系统**且
        // 已有启用系统，则自动弹出「确认游戏系统」对话框。
        // 注意在 promise 回调里 setState —— react-hooks v7 禁止 effect 体内同步 setState。
        const alreadyConfirmed = loaded.meta?.system_confirmed === true
        if (!alreadyConfirmed && computeEnabledEditors(loaded).length > 0) {
          setPanel('systemConfirm')
        }
        // 打开策划书 → 回填活跃术语风格
        onGameStyleChange?.(resolveDocGameStyle(loaded))
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toErrorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [ceshuId, onGameStyleChange])

  /** AI 生成本章：走 IPC 调本地模型（ollama），返回清洗后的字段供表单填入草稿 */
  const handleAiGenerate = useCallback(
    async (chapter: ChapterKey, onlyEmpty: boolean): Promise<CeshuAiGenerateResult> => {
      if (!ceshuId) throw new Error('未选择策划书')
      return window.mbApi.ceshu.aiGenerateChapter({ id: ceshuId, chapter, onlyEmpty })
    },
    [ceshuId]
  )

  /** AI 生成单个字段（E62）：走 IPC 调本地模型，返回清洗后的字段供表单回填。
   *  `action` 为局部重生成动作（停靠栏快捷操作），透传给主进程注入提示词 */
  const handleAiGenerateField = useCallback(
    async (chapter: ChapterKey, field: string, action?: FieldAction): Promise<CeshuAiGenerateResult> => {
      if (!ceshuId) throw new Error('未选择策划书')
      return window.mbApi.ceshu.aiGenerateField({ id: ceshuId, chapter, field, action })
    },
    [ceshuId]
  )

  /** 保存章节：同时清除该章的「待核对」标记（人已经动过这一章了） */
  const handleSave = useCallback(
    async (
      chapter: ChapterKey,
      data: ChapterData,
      statusUpdates?: Record<string, FieldReviewStatus>
    ): Promise<void> => {
      if (!ceshuId) return
      setBusy(true)
      try {
        const updated = await window.mbApi.ceshu.saveChapter({ id: ceshuId, chapter, data })
        setDoc(updated)
        setNotice(`已保存：${CHAPTER_LABELS[chapter]}`)
        setError(null)
        /*
         * 一次 meta 写盘同时完成两件事：
         * 1) 清掉「按章待核对」点（人工保存过 = 核对过了）；
         * 2) 结算「字段级状态」（AI 草稿未改→已批准、人改过→human_edited）。
         * 任一没变化就不写盘（clearAiGenerated 无标记时返回原对象）。
         */
        let nextMeta = clearAiGenerated(updated.meta, chapter)
        if (statusUpdates !== undefined && Object.keys(statusUpdates).length > 0) {
          nextMeta = setFieldStatuses(nextMeta, chapter, statusUpdates, new Date().toISOString())
        }
        if (nextMeta !== updated.meta) {
          setDoc(await window.mbApi.ceshu.saveChapter({ id: ceshuId, chapter: 'meta', data: nextMeta }))
        }
        onChanged()
      } catch (err) {
        setError(toErrorMessage(err))
      } finally {
        setBusy(false)
      }
    },
    [ceshuId, onChanged]
  )

  /** 字段级状态写入（「接受」/ AI 草稿标记）：单独走一次 meta 保存 */
  const handleFieldStatus = useCallback(
    async (chapter: ChapterKey, updates: Record<string, FieldReviewStatus>): Promise<void> => {
      if (!ceshuId || doc === null) return
      const nextMeta = setFieldStatuses(doc.meta, chapter, updates, new Date().toISOString())
      if (nextMeta === doc.meta) return
      setDoc(await window.mbApi.ceshu.saveChapter({ id: ceshuId, chapter: 'meta', data: nextMeta }))
    },
    [ceshuId, doc]
  )

  /** 勾选/取消系统模块：写进 meta.enabled_modules（随「文档信息」保存） */
  const handleToggleModule = useCallback(
    async (module: ChapterKey, enabled: boolean): Promise<void> => {
      if (doc === null) return
      const current = new Set(enabledModuleChapters(doc))
      if (enabled) current.add(module)
      else current.delete(module)
      const nextModules = MODULE_CHAPTERS.filter((item) => current.has(item))
      await handleSave('meta', { ...doc.meta, enabled_modules: nextModules })
    },
    [doc, handleSave]
  )

  /*
   * 审阅队列快捷键（浮层打开时生效）：j/k 上下、a 接受、v 查看跳转、Esc 关闭。
   * 放在早退之前：effect 必须无条件执行。待审列表在 effect 内现算（doc 可能为 null），
   * 与渲染期同一函数出口，保证两处看到同一条队列。监听器属「订阅外部系统、回调里
   * setState」的合规模式；可编辑焦点与组合键由 resolveReviewQueueKey 放行。
   */
  useEffect(() => {
    if (!reviewOpen || doc === null) return undefined
    const pending = collectPendingReviewFields(doc)
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target
      const editable =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      const action = resolveReviewQueueKey({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        editable,
        queueLength: pending.length
      })
      if (action === null) return
      event.preventDefault()
      if (action === 'close') {
        setReviewOpen(false)
        return
      }
      if (pending.length === 0) return
      if (action === 'next') {
        setReviewCursor((cursor) => Math.min(cursor + 1, pending.length - 1))
        return
      }
      if (action === 'prev') {
        setReviewCursor((cursor) => Math.max(cursor - 1, 0))
        return
      }
      /*
       * 光标在**扁平列表**里的实际下标：渲染期已夹取过一次，但 effect 闭包里可能持有
       * 上一轮的 reviewCursor，这里再夹一次，避免 pending 刚变短时取到 undefined。
       */
      const cursorIndex = Math.min(reviewCursor, pending.length - 1)
      const current = pending[cursorIndex]
      if (current === undefined) return
      if (action === 'accept') {
        // 先算后写：状态写入后 pending 会变短，届时再算就晚了
        setReviewCursor(cursorAfterAccept(cursorIndex, pending.length - 1))
        void handleFieldStatus(current.chapter, { [current.fieldKey]: 'approved' })
        return
      }
      // goto：跳到该字段所在章并收起队列
      setActiveChapter(current.chapter)
      setReviewOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [reviewOpen, doc, reviewCursor, handleFieldStatus])

  /*
   * 切章兜底：停靠栏可能刚发起针对旧章字段的局部重生成请求，而新章的表单不会消费它
   * （请求按 chapter 匹配）。这里直接丢弃，避免请求烂在桥里、下次聚焦同章字段时被误执行。
   */
  useEffect(() => {
    clearFieldRequest()
  }, [activeChapter])

  if (!ceshuId) {
    return (
      <div className="ceshu-view">
        <div className="empty">请选择或新建策划书</div>
      </div>
    )
  }

  // 切换策划书时旧文档仍在 state 中，id 不匹配则视为加载中
  if (!doc || doc.ceshu_id !== ceshuId) {
    /*
     * 加载失败必须**在这里**给出口：`error` 的横幅渲染在下方主界面里，而主界面
     * 要求 `doc` 已就位 —— 于是 `get` 抛错时旧实现会永久停在「正在加载策划书…」，
     * 用户既看不到原因也点不到返回（W2 组件测试发现的实际缺陷）。
     * 只在 `doc` 为空时展示错误：`doc` 存在但 id 不匹配是「切换文档」的瞬态，
     * 此时残留的旧错误会误导用户。
     */
    if (doc === null && error !== null) {
      return (
        <div className="ceshu-view">
          <div className="error-banner" data-testid="ceshu-load-error">
            {error}
          </div>
          <button type="button" className="btn" data-testid="ceshu-load-error-back" onClick={onBack}>
            返回
          </button>
        </div>
      )
    }
    return (
      <div className="ceshu-view">
        <div className="empty">正在加载策划书…</div>
      </div>
    )
  }

  /** 「AI 生成、待核对」的章节集合 —— 章节列表据此画小圆点 */
  const aiMarks = readAiGenerated(doc.meta)
  const scope = getGddScope(doc)
  const visible = visibleChaptersForDoc(doc)
  /**
   * 阶段筛选后的章节列表：`all` 为原行为；选了阶段则只留「截至该阶段」的章，
   * 但**始终保留当前章**——否则从校验报告/评审队列跳过来时右侧会空白。
   */
  const visibleByStage =
    stageFilter === 'all'
      ? visible
      : visible.filter((key) => isChapterVisibleInStage(key, stageFilter) || key === activeChapter)
  /**
   * 全局待审字段（跨章）：AI 草稿、尚未接受。
   * 按 `visible` 章节顺序 + 字段定义顺序排列，便于「一条队列」往下扫。
   */
  const pendingReviewFields = collectPendingReviewFields(doc)
  /** 键盘光标（渲染期夹取）：列表变短（接受后）不越界，免用 effect 纠正状态 */
  const reviewCursorSafe = Math.min(reviewCursor, Math.max(0, pendingReviewFields.length - 1))
  /*
   * 分组只影响渲染，不影响光标：组内仍带扁平下标，`data-current` 与 j/k 一律按扁平序。
   * 普通 const 而非 useMemo —— 待审字段通常个位数，且本组件 hook 顺序敏感，
   * 多挂一个 hook 得不偿失（位置也必须在 `if (!ceshuId)` 早退之后）。
   */
  const reviewGroups = groupReviewQueue(pendingReviewFields)
  /** 折叠/展开某章：只动 UI 可见性，不碰 reviewCursor（折叠组里的光标行只是不渲染） */
  const toggleGroup = (chapter: ChapterKey): void => {
    setCollapsedChapters((chapters) =>
      chapters.includes(chapter) ? chapters.filter((key) => key !== chapter) : [...chapters, chapter]
    )
  }

  /** 一键接受所有待审字段：按章合并后一次 meta 写盘 */
  const handleApproveAllPending = async (): Promise<void> => {
    if (!ceshuId || pendingReviewFields.length === 0) return
    const now = new Date().toISOString()
    let meta = doc.meta
    for (const chapter of visible) {
      const statuses = fieldStatusOf(doc.meta, chapter)
      const updates: Record<string, FieldReviewStatus> = {}
      for (const field of CESHU_CHAPTER_FIELDS[chapter] ?? []) {
        if (statuses[field.key]?.status === 'ai_draft') updates[field.key] = 'approved'
      }
      if (Object.keys(updates).length > 0) {
        meta = setFieldStatuses(meta, chapter, updates, now)
      }
    }
    if (meta !== doc.meta) {
      setDoc(await window.mbApi.ceshu.saveChapter({ id: ceshuId, chapter: 'meta', data: meta }))
    }
  }

  /** 迁移预览（只读）：大 textarea 会怎么拆 / 哪些字段语义重叠 */
  const migrationPlan = planCeshuMigration(doc)
  /** AI 消费提示词（双轨 JSON 的配套）：按任务生成可粘贴给外部 AI 的提示词 */
  const consumePrompt = buildBundleConsumePrompt(buildCeshuBundle(doc), consumeTask)
  const progress = computeChapterProgress(doc, stageFilter === 'all' ? undefined : stageFilter)
  /** 由第四章游戏系统派生的启用编辑器（内嵌数据预览面板据此渲染标签页） */
  const enabledEditors = computeEnabledEditors(doc)
  const gameName = typeof doc.meta.game_name === 'string' && doc.meta.game_name ? doc.meta.game_name : '未命名策划书'
  const gameType = typeof doc.meta.game_type === 'string' && doc.meta.game_type ? doc.meta.game_type : '未知'

  /**
   * 标准「忙碌动作」模板：清错 → 置忙 → 执行 → 失败转中文错误 → 解忙。
   *
   * 本组件 12 处 `try/catch` 动作**并非逐字同构**，实测 5 种形态，只有 S1 用本函数：
   * - **S1**：`derive` / `setActive` / `showChangelog` / `validate` / `score`
   * - **S2** 保留显式：`save` / `autoFill` —— `busy` 在 try 外，**成功时**才 `setError(null)`
   * - **S3** 保留显式：三个导出报告 —— 不占 `busy`，套进来会凭空让按钮变灰
   * - **S4** 保留显式：`handleExport` —— 选完文件才置忙，不在系统对话框期间灰界面
   * - **S5** 保留显式：两个 AI 单发生成 —— 不捕获，直接 throw 给表单
   *
   * 收益不在行数（本函数含注释是净增），而在 **`finally` 不会再被漏写** ——
   * 漏写的后果是按钮永久变灰且无任何提示。故 S2–S5 刻意保持显式，别「顺手」并进来。
   */
  const runBusy = async (
    action: () => Promise<void>,
    options: { clearNotice?: boolean } = {}
  ): Promise<void> => {
    setError(null)
    if (options.clearNotice === true) setNotice(null)
    setBusy(true)
    try {
      await action()
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  /** 导出当前策划书：选择保存路径 → 主进程按格式渲染并原子写盘 */
  const handleExport = async (): Promise<void> => {
    try {
      setError(null)
      setNotice(null)
      const chosen = await window.mbApi.dialog.chooseCeshuExportFile({ format: exportFormat, defaultName: gameName })
      if (!chosen.path) return
      setBusy(true)
      const result = await window.mbApi.ceshu.export({ id: doc.ceshu_id, format: exportFormat, path: chosen.path })
      if (result.files !== undefined && result.files.length > 1) {
        // 双轨：一次导出多份产物，逐条列出路径
        setNotice(`已导出${result.files.length} 份产物：${result.files.map((file) => file.path).join(' + ')}`)
      } else {
        setNotice(`已导出（${CESHU_FORMAT_LABELS[result.format]}）：${result.filePath}`)
      }
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  /** 导出项目文件夹：config.json + design/*.md + tasks/*.md（一个可交付的项目目录） */
  const handleExportProject = async (): Promise<void> => {
    try {
      setError(null)
      setNotice(null)
      const chosen = await window.mbApi.dialog.chooseExportDir()
      if (chosen.path === null) return
      setBusy(true)
      const result = await window.mbApi.ceshu.exportProjectFolder({ id: doc.ceshu_id, path: chosen.path })
      setNotice(`已导出项目文件夹：${result.dir}（${result.files.length} 个文件）`)
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  /**
   * 导出**开发交接包**：分卷施工图（架构→玩法→内容→系统→界面→打磨）+ 机读包 + 契约
   * + 数据表 schema/快照 + 原型。与「项目文件夹」的区别：那份是**给人看的项目资料**，
   * 这份是**给编码智能体按卷施工**的规格（每卷有门禁与验收）。
   */
  const handleExportHandoff = async (): Promise<void> => {
    try {
      setError(null)
      setNotice(null)
      const chosen = await window.mbApi.dialog.chooseExportDir()
      if (chosen.path === null) return
      setBusy(true)
      const result = await window.mbApi.ceshu.exportHandoff({ id: doc.ceshu_id, path: chosen.path })
      setNotice(
        `已导出开发交接包：${result.dir}（${result.files.length} 个文件，先看 README.md 的分卷顺序）`
      )
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  /** 派生新版本：复制当前版本内容，版本号自动递增，默认未激活 */
  const handleDerive = async (): Promise<void> => {
    await runBusy(
      async () => {
        const created = await window.mbApi.ceshu.derive({ id: doc.ceshu_id, note: deriveNote })
        setDeriveOpen(false)
        setDeriveNote('')
        setNotice(`已派生新版本 ${created.version_label}（默认未激活，可点「设为激活」）`)
        onChanged()
        onSelect(created.ceshu_id)
      },
      { clearNotice: true }
    )
  }

  /** 将当前文档设为激活版本（同链其他版本自动取消激活） */
  const handleSetActive = async (): Promise<void> => {
    await runBusy(
      async () => {
        const updated = await window.mbApi.ceshu.setActive({ id: doc.ceshu_id })
        setDoc(updated)
        setNotice(`已激活版本：${updated.version_label}`)
        onChanged()
      },
      { clearNotice: true }
    )
  }

  /** 查看版本链变更记录（同链版本按时间逐对 diff） */
  const handleShowChangelog = async (): Promise<void> => {
    await runBusy(async () => {
      const log = await window.mbApi.ceshu.changelog({ id: doc.ceshu_id })
      setChangelog(log)
      setPanel('changelog')
    })
  }

  /** 数据校验：必填字段 + 章节间一致性检查 */
  const handleValidate = async (): Promise<void> => {
    await runBusy(async () => {
      const errors = await window.mbApi.ceshu.validate({ id: doc.ceshu_id })
      setValidateErrors(errors)
      setPanel('validate')
    })
  }

  /** 完备度：各阶段必填覆盖 + 逐章缺口 + 有出处的参照对比（替代旧的 100 分制评分） */
  const handleReadiness = async (): Promise<void> => {
    await runBusy(async () => {
      const report = await window.mbApi.ceshu.readiness({ id: doc.ceshu_id })
      setReadiness(report)
      setPanel('readiness')
    })
  }

  /**
   * 跳到某章的某个字段：切章 + 交给 `ChapterForm` 滚过去高亮，并关掉当前报告面板。
   *
   * 三处入口共用（校验面板的必填缺失、完备度面板的逐章缺口、审阅队列的「查看」）——
   * 只跳章等于让人在 32 个字段里再翻一遍，而这三处本来就知道具体是哪个字段。
   */
  const jumpToField = (chapter: ChapterKey, field: string): void => {
    setActiveChapter(chapter)
    setFieldJump({ chapter, field })
    setPanel(null)
  }

  /** 导出完备度报告：渲染层生成 Markdown → 主进程原子写盘 */
  const handleExportReadiness = async (): Promise<void> => {
    if (!readiness) return
    try {
      setError(null)
      setNotice(null)
      const chosen = await window.mbApi.dialog.chooseCeshuExportFile({
        format: 'markdown',
        defaultName: `${gameName}-完备度报告`
      })
      if (!chosen.path) return
      const markdown = buildReadinessReportMarkdown(gameName, gameType, readiness, formatLocalTimestamp())
      const exported = await window.mbApi.ceshu.exportReadinessReport({ path: chosen.path, content: markdown })
      setNotice(`完备度报告已导出：${exported.filePath}`)
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }

  /** 导出校验报告：渲染层生成 Markdown → 主进程原子写盘 */
  const handleExportValidation = async (): Promise<void> => {
    try {
      setError(null)
      setNotice(null)
      // 文件名安全化：保留字母/数字/._-
      const safeName = [...gameName].filter((ch) => /[\p{L}\p{N}._-]/u.test(ch)).join('') || 'ceshu'
      const chosen = await window.mbApi.dialog.chooseReportFile({
        defaultName: `${safeName}_${doc.version_label || 'v1.0'}_校验报告`,
        extension: '.md',
        label: 'Markdown 文件'
      })
      if (!chosen.path) return
      const markdown = buildValidationReportMarkdown(
        gameName,
        doc.version_label || 'v1.0',
        formatLocalTimestamp(),
        validateErrors,
        progress
      )
      const exported = await window.mbApi.ceshu.exportValidationReport({ path: chosen.path, content: markdown })
      setNotice(`校验报告已导出：${exported.filePath}`)
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }

  /** 导出变更日志：MD / HTML / Text 三格式 */
  const handleExportChangelog = async (format: 'md' | 'html' | 'text'): Promise<void> => {
    if (!changelog) return
    try {
      setError(null)
      setNotice(null)
      const spec =
        format === 'html'
          ? { content: buildChangelogHtml(changelog), extension: '.html', label: 'HTML 文件' }
          : format === 'text'
            ? { content: buildChangelogText(changelog), extension: '.txt', label: '文本文件' }
            : { content: buildChangelogMarkdown(changelog), extension: '.md', label: 'Markdown 文件' }
      const chosen = await window.mbApi.dialog.chooseReportFile({
        defaultName: 'changelog',
        extension: spec.extension,
        label: spec.label
      })
      if (!chosen.path) return
      const exported = await window.mbApi.ceshu.exportChangelogReport({ path: chosen.path, content: spec.content })
      setNotice(`变更日志已导出：${exported.filePath}`)
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }

  /** AI 一键生成应用完成：更新当前文档并刷新列表 */
  /**
   * AI 一键生成应用完成：把这几章标成「待核对」，并跳到第一章开始扫读。
   *
   * 标记写进 `meta.ai_generated`（见 `shared/ceshuAiMark.ts`）。人点「保存本章」
   * 或「已核对」即清除该章标记 —— 这正是「AI 生成 → 人扫一遍」工作流的进度。
   */
  const handleAiApplied = async (updated: CeshuDocument, chapters: readonly ChapterKey[]): Promise<void> => {
    setDoc(updated)
    const names = chapters.map((chapter) => CHAPTER_LABELS[chapter]).join('、')
    setNotice(`AI 生成内容已保存：${chapters.length} 章（${names}）。已标记为待核对，逐章看过即可。`)
    onChanged()

    // 标记要落盘：只用组件内 state 的话，重开应用就丢了，那「待核对」就没意义
    if (ceshuId !== null && chapters.length > 0) {
      try {
        const marked = markAiGenerated(updated.meta, chapters, new Date().toISOString())
        const saved = await window.mbApi.ceshu.saveChapter({ id: ceshuId, chapter: 'meta', data: marked })
        setDoc(saved)
        // 跳到第一处变化：省得用户自己在整份文档里找
        setActiveChapter(chapters[0])
      } catch (err) {
        // 标记失败不该让用户以为生成失败了 —— 内容已经写进去了
        setError(toErrorMessage(err))
      }
    }
  }

  /** 模板编辑器「应用到该章节」完成：更新当前文档并刷新列表（进度可能变化） */
  const handleTemplateApplied = (updated: CeshuDocument, chapter: ChapterKey): void => {
    setDoc(updated)
    setNotice(`模板数据已应用到「${CHAPTER_LABELS[chapter]}」`)
    onChanged()
  }

  /**
   * 补全空白字段：原「完备性清单」面板的「一键修复」入口。
   * 清单/字数/依赖三项旁路报告已移除（见架构评估 W0），但**补全能力保留**，
   * 否则 `ceshu:autoFill` 会变成没有 UI 入口的死通道。
   */
  const handleAutoFill = async (): Promise<void> => {
    if (!ceshuId) return
    setBusy(true)
    try {
      const result = await window.mbApi.ceshu.autoFill({ id: ceshuId })
      setDoc(result.doc)
      setNotice(result.filled > 0 ? `已补全 ${result.filled} 个空白字段` : '没有需要补全的空白字段')
      if (result.filled > 0) onChanged()
      setError(null)
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  /** 执行字段拆分迁移：幂等、非破坏（原文保留），迁完刷新文档。
   *  注意：这是**普通函数**而不是 useCallback —— 它位于 `if (!doc) return` 之后，
   *  在那里调 hook 会违反 Rules of Hooks（与 handleAutoFill 同一处理）。 */
  const handleRunMigration = async (): Promise<void> => {
    if (!ceshuId) return
    setBusy(true)
    try {
      const result = await window.mbApi.ceshu.migrateFieldSplits({ id: ceshuId })
      setDoc(result.doc)
      setError(null)
      if (result.migrated.length > 0) {
        const names = result.migrated
          .map((item) => `${CHAPTER_LABELS[item.chapter]}·${item.fieldKey}`)
          .join('、')
        setNotice(
          `已迁移 ${result.migrated.length} 个字段（${names}）。原文已保留，确认新字段无误后可清空旧字段。`
        )
        onChanged()
      } else {
        setNotice('没有需要迁移的字段')
      }
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  /** 解析粘贴的 AI 结果（只读预览，不写盘） */
  const handleParseImport = (): void => {
    // 先试审阅结果：外部 AI 的「审阅」任务返回 issues 清单，能展示但不能应用；
    // 只有一条都没解析出来时才回落到字段增量，两种结果互斥（清空另一方）
    const parsedIssues = parseCeshuIssues(importRaw)
    if (parsedIssues.issues.length > 0) {
      setIssueResult(parsedIssues)
      setImportResult(null)
      return
    }
    setIssueResult(null)
    setImportResult(parseCeshuPatch(importRaw, doc))
  }

  /**
   * 应用导入补丁：按章写盘（只写有变化的字段），再一次性把涉及字段标为 AI 草稿。
   * 走既有 saveChapter 通道，不新增 IPC——导入与手工保存共用同一条写入路径。
   */
  const handleApplyImport = async (): Promise<void> => {
    if (!ceshuId || importResult === null) return
    const changed = importResult.items.filter((item) => item.changed)
    if (changed.length === 0) return
    await runBusy(
      async () => {
        const { doc: next, chapters, applied } = applyCeshuPatch(doc, changed)
        let latest = doc
        for (const chapter of chapters) {
          latest = await window.mbApi.ceshu.saveChapter({ id: ceshuId, chapter, data: next[chapter] })
        }
        // 导入内容一律视为 AI 草稿待审（与站内 AI 生成同口径）
        const now = new Date().toISOString()
        let meta = latest.meta
        for (const chapter of chapters) {
          const updates: Record<string, FieldReviewStatus> = {}
          for (const item of changed) {
            if (item.chapter === chapter) updates[item.fieldKey] = 'ai_draft'
          }
          if (Object.keys(updates).length > 0) meta = setFieldStatuses(meta, chapter, updates, now)
        }
        if (meta !== latest.meta) {
          latest = await window.mbApi.ceshu.saveChapter({ id: ceshuId, chapter: 'meta', data: meta })
        }
        setDoc(latest)
        setImportOpen(false)
        setImportRaw('')
        setImportResult(null)
        setNotice(`已导入 ${applied} 个字段（标记为 AI 草稿，待审）`)
        onChanged()
      },
      { clearNotice: true }
    )
  }

  /** 智能体「改文档」应用：按章写盘 + 标记 AI 草稿（与导入补丁同一条写入路径） */
  const handleApplyAgentPatch = async (items: CeshuPatchItem[]): Promise<void> => {
    if (!ceshuId) return
    const changed = items.filter((item) => item.changed)
    if (changed.length === 0) return
    const { doc: next, chapters } = applyCeshuPatch(doc, changed)
    let latest = doc
    for (const chapter of chapters) {
      latest = await window.mbApi.ceshu.saveChapter({ id: ceshuId, chapter, data: next[chapter] })
    }
    const now = new Date().toISOString()
    let meta = latest.meta
    for (const chapter of chapters) {
      const updates: Record<string, FieldReviewStatus> = {}
      for (const item of changed) {
        if (item.chapter === chapter) updates[item.fieldKey] = 'ai_draft'
      }
      if (Object.keys(updates).length > 0) meta = setFieldStatuses(meta, chapter, updates, now)
    }
    if (meta !== latest.meta) {
      latest = await window.mbApi.ceshu.saveChapter({ id: ceshuId, chapter: 'meta', data: meta })
    }
    setDoc(latest)
    setNotice(`智能体已改 ${changed.length} 个字段（标记为 AI 草稿，待审）`)
    onChanged()
  }

  /** 预设市场应用完成：systems/meta 已在主进程写盘，更新文档并刷新侧边栏 */
  const handlePresetApplied = (updated: CeshuDocument, enabledCount: number, presetLabel: string): void => {
    setDoc(updated)
    setNotice(`已应用预设【${presetLabel}】，新启用 ${enabledCount} 个游戏系统`)
    onChanged()
  }

  /** 系统确认完成：systems 已写盘 + 数据同步已触发，更新文档并刷新侧边栏 */
  const handleSystemConfirmed = (updated: CeshuDocument, enabledCount: number, addedCustom: number): void => {
    setDoc(updated)
    setNotice(`已确认游戏系统：启用 ${enabledCount} 个${addedCustom > 0 ? `（新增自定义 ${addedCustom} 个）` : ''}`)
    onChanged()
  }

  /**
   * 「更多 ▸」菜单分组。骨架对齐 旧版 `editor_view:160-187` 的 `_more_menu` 顺序与分隔。
   *
   * **与 旧版 菜单仍有差异（E30 审计确认，非笔误）**：旧版 另有「档位切换（轻量 9 章 ↔
   * 工业级 18 章）、更多模板、导出 AI 报告」三项，TS 侧**没有对应入口**（不是按钮失效，是真没有）。
   *
   * 「补全空白字段」已于 W0 收口：它原先只挂在 `ChecklistPanel` 的「一键修复」上，
   * 该面板随字数 / 清单 / 字段依赖三项旁路报告一并移除后，能力改由本菜单承载
   * （见下方 `ceshu-autofill`），否则 `ceshu:autoFill` 会变成没有 UI 入口的死通道。
   *
   * 每项 testid 保持与改造前平铺按钮**逐一同名**，既有 E2E 只需补一步展开即可继续命中。
   */
  const moreMenuGroups: { testid: string; label: string; run: () => void }[][] = [
    [
      { testid: 'ceshu-derive', label: '派生新版本', run: () => setDeriveOpen((open) => !open) },
      { testid: 'ceshu-ai-review', label: 'AI 审阅', run: () => setPanel('aiReview') }
    ],
    [
      { testid: 'ceshu-preset-market', label: '预设市场', run: () => setPanel('presetMarket') },
      { testid: 'ceshu-template-editor', label: '模板编辑器', run: () => setPanel('templateEditor') }
    ],
    [
      { testid: 'ceshu-route', label: '开发路线', run: () => setRouteOpen(true) },
      { testid: 'ceshu-health', label: '开发体检', run: () => setHealthOpen(true) },
      { testid: 'ceshu-readiness', label: '完备度', run: () => void handleReadiness() },
      { testid: 'ceshu-autofill', label: '补全空白字段', run: () => void handleAutoFill() },
      { testid: 'ceshu-diff', label: '版本对比', run: () => setPanel('diff') },
      { testid: 'ceshu-timeline', label: '版本时间线', run: () => setPanel('timeline') },
      { testid: 'ceshu-changelog', label: '变更记录', run: () => void handleShowChangelog() },
      { testid: 'ceshu-datarefs', label: '数据引用', run: () => setPanel('dataRefs') },
      { testid: 'ceshu-migration-preview', label: '迁移预览（只读）', run: () => setMigrationOpen(true) },
      { testid: 'ceshu-consume-prompt', label: 'AI 消费提示词', run: () => setConsumeOpen(true) },
      { testid: 'ceshu-import-patch', label: '导入 AI 结果', run: () => setImportOpen(true) },
      { testid: 'ceshu-export-project', label: '导出项目文件夹', run: () => void handleExportProject() },
      { testid: 'ceshu-export-handoff', label: '导出开发交接包', run: () => void handleExportHandoff() }
    ],
    // 「确认游戏系统」**不在菜单里**：旧版 无此菜单项，改为打开策划书时自动弹窗
    // （见上方加载回调；条件 = 未确认过 且 已有启用系统）
    [{ testid: 'ceshu-notes', label: '笔记', run: () => setPanel('notes') }]
  ]

  return (
    <div className="ceshu-view">
      <header className="toolbar">
        <button
          type="button"
          className="btn"
          data-testid="ceshu-back"
          title="返回策划书首页"
          onClick={onBack}
        >
          <LucideIcon name="chevron-left" size={18} />
          返回
        </button>
        <h1>{gameName}</h1>
        <span className="item-meta" data-testid="ceshu-version">
          {doc.version_label}
          {doc.is_active ? ' ★ 激活' : ' · 未激活'}
        </span>
        <span className="item-meta">
          档位：
          {scope === 'lite'
            ? `标准版（${contentChapterCount('lite')} 章）`
            : `专业版（${contentChapterCount('full')} 章）`}
        </span>
        <span className="item-meta" data-testid="ceshu-total-progress">
          总进度 {Math.round((progress.total ?? 0) * 100)}%
        </span>
        {!doc.is_active && (
          <button type="button" className="btn" data-testid="ceshu-set-active" disabled={busy} onClick={() => void handleSetActive()}>
            设为激活
          </button>
        )}
        <button type="button" className="btn accent-outline" data-testid="ceshu-validate" disabled={busy} onClick={() => void handleValidate()}>
          校验
        </button>
        {/* 全局审阅入口：跨章列出 AI 草稿字段，逐条接受 / 跳转 */}
        <button
          type="button"
          className={`btn${pendingReviewFields.length > 0 ? ' accent-outline' : ''}`}
          data-testid="ceshu-review-toggle"
          aria-pressed={reviewOpen}
          disabled={busy}
          title="跨章列出 AI 草稿字段，逐条接受"
          onClick={() => {
            // 打开队列时键盘光标归零（从第一条开始扫）；关闭不动光标
            if (!reviewOpen) setReviewCursor(0)
            setReviewOpen((open) => !open)
          }}
        >
          待审 {pendingReviewFields.length}
        </button>
        {/*
          数据栏开关。布局心智：**左栏 + 中间 = 工作区，右栏 = 智能体**。
          数据预览属于工作区的一部分（写文档时要对照数据），但它不该和智能体并排抢宽度 ——
          写正文时把它收起来，表单立刻拿回 44% 的宽度。
          状态持久化：这是「工作姿势」偏好，每次重开都要重新点会很烦。
        */}
        <button
          type="button"
          className="btn"
          data-testid="ceshu-preview-toggle"
          aria-pressed={previewOpen}
          title={previewOpen ? '收起数据栏，让章节表单占满工作区' : '展开数据栏（对照角色/技能等数据）'}
          onClick={togglePreview}
        >
          {previewOpen ? '收起数据' : '数据栏'}
        </button>
        <button type="button" className="btn accent-outline" data-testid="ceshu-ai-full" disabled={busy} onClick={() => setPanel('aiFull')}>
          AI 一键生成
        </button>
        <button
          type="button"
          className="btn accent-outline"
          data-testid="ceshu-ai-datagen"
          disabled={busy}
          onClick={() => {
            // 工具栏入口是「全局生成」：清掉条目表单可能留下的预选类型，回到默认全选
            setAiGenTarget(null)
            setPanel('aiDataGen')
          }}
        >
          AI 生成数据
        </button>
        {/* 「更多 ▸」：对齐 旧版 `editor_view:154` —— 低频/高级功能收进下拉，
            工具栏只留高频操作（返回/保存/校验/AI/导出），避免「一屏 19 个按钮」的操作带过载
            （正是 docs/ux-simplification-plan.md 的 P3「操作带过多，层级重叠」） */}
        <div className="toolbar-more" ref={moreRef}>
          <button
            type="button"
            className="btn accent-outline"
            data-testid="ceshu-more"
            disabled={busy}
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((open) => !open)}
          >
            更多
            <LucideIcon name="chevron-down" size={14} />
          </button>
          {moreOpen && (
            <div className="toolbar-more-menu" role="menu" data-testid="ceshu-more-menu">
              {moreMenuGroups.map((group, groupIndex) => (
                <div className="toolbar-more-group" key={groupIndex}>
                  {group.map((item) => (
                    <button
                      key={item.testid}
                      type="button"
                      role="menuitem"
                      className="toolbar-more-item"
                      data-testid={item.testid}
                      disabled={busy}
                      onClick={() => {
                        setMoreOpen(false)
                        item.run()
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
        <select
          className="form-select export-format"
          data-testid="export-format"
          value={exportFormat}
          onChange={(event) => setExportFormat(event.target.value as CeshuExportFormat)}
        >
          {CESHU_EXPORT_FORMATS.map((format) => (
            <option key={format} value={format}>
              {CESHU_FORMAT_LABELS[format]}
            </option>
          ))}
        </select>
        <button type="button" className="btn accent-outline" data-testid="ceshu-export" disabled={busy} onClick={() => void handleExport()}>
          导出
        </button>
      </header>

      {deriveOpen && (
        <div className="derive-panel">
          <span className="form-label">新版本说明（可留空）</span>
          <input
            className="form-input"
            data-testid="derive-note"
            value={deriveNote}
            placeholder="本次迭代改了什么"
            onChange={(event) => setDeriveNote(event.target.value)}
          />
          <button type="button" className="btn primary" data-testid="derive-confirm" disabled={busy} onClick={() => void handleDerive()}>
            确认派生
          </button>
          <button type="button" className="btn" onClick={() => setDeriveOpen(false)}>
            取消
          </button>
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="notice-banner">{notice}</div>}

      <div className="content">
        {panel === 'aiReview' ? (
          <AiReviewPanel
            key={doc.ceshu_id}
            ceshuId={doc.ceshu_id}
            gameName={gameName}
            onClose={() => setPanel(null)}
          />
        ) : panel === 'aiFull' ? (
          <AiFullGeneratePanel
            key={doc.ceshu_id}
            ceshuId={doc.ceshu_id}
            doc={doc}
            onApplied={handleAiApplied}
            onClose={() => setPanel(null)}
          />
        ) : panel === 'diff' ? (
          <VersionDiffPanel key={doc.ceshu_id} ceshuId={doc.ceshu_id} onClose={() => setPanel(null)} />
        ) : panel === 'timeline' ? (
          <VersionTimelinePanel
            key={doc.ceshu_id}
            ceshuId={doc.ceshu_id}
            currentId={doc.ceshu_id}
            onSelect={onSelect}
            onClose={() => setPanel(null)}
          />
        ) : panel === 'aiDataGen' ? (
          <AiDataGenPanel
            key={doc.ceshu_id}
            ceshuId={doc.ceshu_id}
            initialTypeId={aiGenTarget?.typeId ?? undefined}
            initialCount={aiGenTarget?.count}
            initialInstruction={aiGenTarget?.instruction}
            onClose={() => setPanel(null)}
          />
        ) : panel === 'presetMarket' ? (
          <PresetMarketPanel
            key={doc.ceshu_id}
            ceshuId={doc.ceshu_id}
            onApplied={handlePresetApplied}
            onClose={() => setPanel(null)}
          />
        ) : panel === 'systemConfirm' ? (
          <SystemConfirmPanel
            key={doc.ceshu_id}
            ceshuId={doc.ceshu_id}
            onApplied={handleSystemConfirmed}
            onClose={() => setPanel(null)}
          />
        ) : panel === 'templateEditor' ? (
          <TemplateEditorPanel
            key={doc.ceshu_id}
            ceshuId={doc.ceshu_id}
            doc={doc}
            currentChapter={activeChapter}
            gameName={gameName}
            onApplied={handleTemplateApplied}
            onClose={() => setPanel(null)}
          />
        ) : panel === 'notes' ? (
          <ChapterNotesPanel key={doc.ceshu_id} ceshuId={doc.ceshu_id} onClose={() => setPanel(null)} />
        ) : panel === 'dataRefs' ? (
          <CeshuDataRefsPanel key={doc.ceshu_id} chapters={doc} types={types} />
        ) : panel === 'changelog' && changelog ? (
          <ChangelogPanel
            changelog={changelog}
            onExport={(format) => void handleExportChangelog(format)}
            onClose={() => setPanel(null)}
          />
        ) : panel === 'validate' ? (
          <ValidatePanel
            validateErrors={validateErrors}
            onExport={() => void handleExportValidation()}
            onClose={() => setPanel(null)}
            onJumpChapter={(chapter) => {
              // 跳转即回到表单视图：留着校验面板会挡住刚切过去的章节表单
              setActiveChapter(chapter)
              setPanel(null)
            }}
            onJumpField={jumpToField}
          />
        ) : panel === 'readiness' ? (
          <ReadinessPanel
            readiness={readiness}
            onExport={() => void handleExportReadiness()}
            onClose={() => setPanel(null)}
            onJumpField={jumpToField}
          />
        ) : (
          <>
            {/* 全局审阅队列（浮层）：跨章列出 ai_draft 字段，逐条接受 / 跳转 */}
            {reviewOpen && (
              <div className="review-overlay" data-testid="review-overlay" onClick={() => setReviewOpen(false)}>
                <div className="review-panel" data-testid="review-panel" onClick={(event) => event.stopPropagation()}>
                  <div className="review-panel-header">
                    <span>待审字段：{pendingReviewFields.length} 个</span>
                    <button
                      type="button"
                      className="btn primary slim"
                      data-testid="review-accept-all"
                      disabled={pendingReviewFields.length === 0}
                      onClick={() => void handleApproveAllPending()}
                    >
                      全部接受
                    </button>
                    <button type="button" className="btn slim" onClick={() => setReviewOpen(false)}>
                      关闭
                    </button>
                  </div>
                  {pendingReviewFields.length === 0 ? (
                    <div className="item-meta">没有待审字段。AI 生成后会出现在这里。</div>
                  ) : (
                    <div className="review-list">
                      {reviewGroups.map((group) => {
                        const collapsed = collapsedChapters.includes(group.chapter)
                        return (
                          <div
                            className="review-group"
                            key={`group:${group.chapter}:${group.startIndex}`}
                            data-testid="review-group"
                            data-chapter={group.chapter}
                          >
                            <button
                              type="button"
                              className="review-group-head"
                              data-testid="review-group-head"
                              onClick={() => toggleGroup(group.chapter)}
                            >
                              {CHAPTER_LABELS[group.chapter]}（{group.items.length}）
                              <span className="review-group-caret">{collapsed ? '▸' : '▾'}</span>
                            </button>
                            {!collapsed &&
                              group.items.map(({ item, flatIndex }) => (
                                <div
                                  className={`review-row${flatIndex === reviewCursorSafe ? ' current' : ''}`}
                                  key={`${item.chapter}:${item.fieldKey}`}
                                  data-testid="review-row"
                                  data-current={flatIndex === reviewCursorSafe ? 'true' : 'false'}
                                >
                                  <span className="review-chapter">{CHAPTER_LABELS[item.chapter]}</span>
                                  <span className="review-field">{item.fieldLabel}</span>
                                  {/* 内联预览：审核人不必点「查看」跳章，先扫一眼 AI 写了什么 */}
                                  <span className="review-preview" data-testid="review-preview">
                                    {previewFieldValue(readFieldValue(doc[item.chapter], item.fieldKey))}
                                  </span>
                                  <button
                                    type="button"
                                    className="btn slim"
                                    data-testid="review-goto"
                                    onClick={() => {
                                      // 审阅队列本来就知道是哪个字段：直接跳过去，省掉二次翻找
                                      jumpToField(item.chapter, item.fieldKey)
                                      setReviewOpen(false)
                                    }}
                                  >
                                    查看
                                  </button>
                                  <button
                                    type="button"
                                    className="btn slim primary"
                                    data-testid="review-accept"
                                    onClick={() => {
                                      // 先算后写：状态写入后 pendingReviewFields 会变短，届时再算就晚了
                                      setReviewCursor(cursorAfterAccept(flatIndex, pendingReviewFields.length - 1))
                                      void handleFieldStatus(item.chapter, { [item.fieldKey]: 'approved' })
                                    }}
                                  >
                                    接受
                                  </button>
                                </div>
                              ))}
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {pendingReviewFields.length > 0 && (
                    <div className="review-key-hint item-meta" data-testid="review-key-hint">
                      {REVIEW_QUEUE_KEY_HINT}
                    </div>
                  )}
                </div>
              </div>
            )}
            {/* 开发路线：并行波次 + 每份文档的门禁状态 */}
            {routeOpen && <RoutePanel doc={doc} onClose={() => setRouteOpen(false)} />}
            {/* 开发交接体检：完成度 + 门禁 + 并行 + 可开发性缺口 一张快照 */}
            {healthOpen && <HealthPanel doc={doc} onClose={() => setHealthOpen(false)} />}
            {/* 字段影响面：改一个字段会波及哪些文档 / 断言 / 同源字段 / 数据侧 */}
            {impactTarget !== null && (
              <FieldImpactPanel
                doc={doc}
                chapter={impactTarget.chapter}
                field={impactTarget.field}
                onClose={() => setImpactTarget(null)}
              />
            )}
            {/* 迁移预览（只读）：只展示「会怎么拆 / 哪些重叠」，不改文档 */}
            {migrationOpen && (
              <div className="review-overlay" data-testid="migration-overlay" onClick={() => setMigrationOpen(false)}>
                <div className="review-panel" data-testid="migration-panel" onClick={(event) => event.stopPropagation()}>
                  <div className="review-panel-header">
                    <span>迁移预览</span>
                    <button
                      type="button"
                      className="btn primary slim"
                      data-testid="migration-run"
                      disabled={busy || pendingSplitCount(doc) === 0}
                      onClick={() => void handleRunMigration()}
                    >
                      执行迁移（{pendingSplitCount(doc)}）
                    </button>
                    <button type="button" className="btn slim" onClick={() => setMigrationOpen(false)}>
                      关闭
                    </button>
                  </div>
                  <div className="item-meta">
                    迁移**幂等且非破坏**：把大段文本拆成「要点 + 补充」，原文保留，确认无误后可手动清空旧字段。
                  </div>
                  {migrationPlan.splits.length === 0 && migrationPlan.overlaps.length === 0 ? (
                    <div className="item-meta">没有需要迁移的字段。</div>
                  ) : (
                    <div className="review-list">
                      {migrationPlan.splits.map((item) => (
                        <div
                          className="migration-item"
                          key={`split:${item.chapter}:${item.fieldKey}`}
                          data-testid="migration-split"
                        >
                          <div className="migration-title">{migrationSplitTitle(item)}</div>
                          <div className="item-meta">
                            拆成：要点列表（{item.points.length} 条）+ 补充说明
                          </div>
                          <ul className="migration-points">
                            {item.points.map((point, index) => (
                              <li key={index}>{point}</li>
                            ))}
                          </ul>
                          {item.notes !== '' && (
                            <div className="item-meta">
                              补充：{item.notes.slice(0, 120)}
                              {item.notes.length > 120 ? '…' : ''}
                            </div>
                          )}
                        </div>
                      ))}
                      {migrationPlan.overlaps.map((item) => (
                        <div className="migration-item" key={`overlap:${item.chapter}`} data-testid="migration-overlap">
                          <div className="migration-title">
                            {CHAPTER_LABELS[item.chapter]} · 重叠字段
                            {item.duplicated && (
                              <span className="field-badge duplicate" data-testid="migration-overlap-duplicated">
                                已重复 {Math.round(item.similarity * 100)}%
                              </span>
                            )}
                          </div>
                          <div className="item-meta">{item.fieldLabels.join(' / ')}</div>
                          <div className="item-meta">{item.note}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            {/* 导入 AI 结果：把外部 AI 的增量 JSON 粘回来，预览后按章写盘 */}
            {importOpen && (
              <div className="review-overlay" data-testid="import-overlay" onClick={() => setImportOpen(false)}>
                <div className="review-panel" data-testid="import-panel" onClick={(event) => event.stopPropagation()}>
                  <div className="review-panel-header">
                    <span>导入 AI 结果</span>
                    <button
                      type="button"
                      className="btn primary slim"
                      data-testid="import-apply"
                      disabled={busy || importResult === null || importResult.items.filter((item) => item.changed).length === 0}
                      onClick={() => void handleApplyImport()}
                    >
                      应用（{importResult === null ? 0 : importResult.items.filter((item) => item.changed).length}）
                    </button>
                    <button type="button" className="btn slim" onClick={() => setImportOpen(false)}>
                      关闭
                    </button>
                  </div>
                  <div className="item-meta">
                    粘贴外部 AI 返回的字段增量（形如 {'{"章节": {"字段": 值}}'}，允许带 markdown 代码块）。
                    空值不会覆盖已有内容；应用后这些字段标为「AI 草稿」待审。
                  </div>
                  <textarea
                    className="form-textarea"
                    data-testid="import-raw"
                    rows={8}
                    placeholder='{"meta": {"positioning": "一句话定位"}}'
                    value={importRaw}
                    onChange={(event) => {
                      setImportRaw(event.target.value)
                      setImportResult(null)
                      setIssueResult(null)
                    }}
                  />
                  <div className="field-action-strip-actions">
                    <button type="button" className="btn slim" data-testid="import-parse" disabled={busy} onClick={handleParseImport}>
                      解析预览
                    </button>
                  </div>
                  {importResult !== null && (
                    <>
                      {importResult.errors.length > 0 && (
                        <div className="form-error" data-testid="import-errors">
                          {importResult.errors.map((message, index) => (
                            <div key={index}>{message}</div>
                          ))}
                        </div>
                      )}
                      {importResult.items.length > 0 && (
                        <div className="review-list">
                          {importResult.items.map((item) => (
                            <div
                              className="review-row"
                              key={`${item.chapter}:${item.fieldKey}`}
                              data-testid="import-item"
                              data-changed={item.changed ? 'true' : 'false'}
                            >
                              <span className="review-chapter">{CHAPTER_LABELS[item.chapter]}</span>
                              <span className="review-field">{item.fieldLabel}</span>
                              <span className="item-meta">
                                {item.changed
                                  ? `${previewPatchValue(item.previous, 30)} → ${previewPatchValue(item.value, 30)}`
                                  : '（无变化）'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  {issueResult !== null && (
                    <>
                      <div className="item-meta">
                        这是审阅结果：共 {issueResult.issues.length} 条问题，逐条修改即可（本面板不自动改文档）
                      </div>
                      <div className="review-list" data-testid="import-issues">
                        {issueResult.issues.map((issue, index) => {
                          /*
                           * 只有合法章节 key 才可定位：外部 AI 写错章节时保留原文（不猜），
                           * 并退回不可点的 div —— 点了没反应的按钮比不可点更让人困惑。
                           */
                          const chapter = isChapterKey(issue.chapter) ? issue.chapter : null
                          const rowBody = (
                            <>
                              <span className="review-chapter">
                                {chapter === null ? issue.chapter : CHAPTER_LABELS[chapter]}
                              </span>
                              <span className="review-field">{issue.field}</span>
                              <span className="item-meta">
                                [{issue.severity}] {issue.message} —— 建议：{issue.suggestion}
                              </span>
                            </>
                          )
                          if (chapter === null) {
                            return (
                              <div
                                className="review-row"
                                key={index}
                                data-testid="import-issue"
                                data-severity={issue.severity}
                              >
                                {rowBody}
                              </div>
                            )
                          }
                          return (
                            <button
                              type="button"
                              className="review-row review-row-link"
                              key={index}
                              data-testid="import-issue"
                              data-severity={issue.severity}
                              data-chapter={chapter}
                              onClick={() => {
                                // 一键定位：切到该章并关掉浮层，用户落地即可改这个字段
                                setActiveChapter(chapter)
                                setImportOpen(false)
                                setPanel(null)
                              }}
                            >
                              {rowBody}
                            </button>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
            {/* AI 消费提示词：双轨 JSON 的配套——生成可粘贴给任意外部 AI 的提示词 */}
            {consumeOpen && (
              <div className="review-overlay" data-testid="consume-overlay" onClick={() => setConsumeOpen(false)}>
                <div className="review-panel" data-testid="consume-panel" onClick={(event) => event.stopPropagation()}>
                  <div className="review-panel-header">
                    <span>AI 消费提示词</span>
                    <button type="button" className="btn slim" onClick={() => setConsumeOpen(false)}>
                      关闭
                    </button>
                  </div>
                  <div className="item-meta">{BUNDLE_CONSUME_USAGE}</div>
                  <div className="field-action-strip-actions">
                    {BUNDLE_CONSUME_TASKS.map((task) => (
                      <button
                        key={task}
                        type="button"
                        className={`btn slim${consumeTask === task ? ' accent-outline' : ''}`}
                        data-testid={`consume-task-${task}`}
                        onClick={() => setConsumeTask(task)}
                      >
                        {BUNDLE_CONSUME_TASK_LABELS[task]}
                      </button>
                    ))}
                  </div>
                  <textarea
                    className="form-textarea"
                    data-testid="consume-prompt"
                    readOnly
                    rows={16}
                    value={consumePrompt}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                </div>
              </div>
            )}
            <div className="ceshu-pane-row">
            <div className="chapter-nav">
              {/* 产出物切换：设计文档 / 原型预览 / 数据·机读 / 岗位任务 */}
              <div className="artifact-switch" role="group" aria-label="产出物">
                {ARTIFACTS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    data-testid={`artifact-${item.key}`}
                    className={`artifact-btn${artifact === item.key ? ' active' : ''}`}
                    onClick={() => setArtifact(item.key)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              {artifact === 'doc' ? (
                <>
              {/*
                阶段筛选（默认「全部」= 原行为）。用途：立项阶段只需要 7 章，
                24 章全铺开是劝退主因（库内文档填写率 1%–13%，见
                docs/ceshu-field-necessity.md）。这里只做筛选，不隐藏数据。
              */}
              <div className="chapter-stage-filter" role="group" aria-label="按阶段筛选章节">
                <button
                  type="button"
                  data-testid="stage-filter-all"
                  className={`chapter-stage-btn${stageFilter === 'all' ? ' active' : ''}`}
                  onClick={() => setStageFilter('all')}
                >
                  全部
                </button>
                {CESHU_STAGE_ORDER.map((stage) => (
                  <button
                    key={stage}
                    type="button"
                    data-testid={`stage-filter-${stage}`}
                    className={`chapter-stage-btn${stageFilter === stage ? ' active' : ''}`}
                    title={`只看「${CESHU_STAGE_LABELS[stage]}」阶段及更早的章节`}
                    onClick={() => setStageFilter(stage)}
                  >
                    {CESHU_STAGE_LABELS[stage]}
                  </button>
                ))}
              </div>
              <button
                type="button"
                data-testid="module-picker-toggle"
                className={`chapter-stage-btn module-picker-toggle${modulePickerOpen ? ' active' : ''}`}
                title="勾选要做的系统模块（通用底座恒有）"
                onClick={() => setModulePickerOpen((open) => !open)}
              >
                系统模块 {enabledModuleChapters(doc).length}/{MODULE_CHAPTERS.length}
              </button>
              {modulePickerOpen && <CeshuModulePicker doc={doc} onToggle={handleToggleModule} />}
              <button
                type="button"
                data-testid="view-mode-toggle"
                className={`chapter-stage-btn overview-toggle${viewMode === 'overview' ? ' active' : ''}`}
                title="把当前阶段压成一页只读摘要（2026 主流：一页讲清 → 分层展开）"
                onClick={() => setViewMode((mode) => (mode === 'overview' ? 'edit' : 'overview'))}
              >
                {viewMode === 'overview' ? '返回编辑' : '一页总览'}
              </button>
              {visibleByStage.map((key) => {
                const pct = Math.round((progress[key] ?? 0) * 100)
                // 完成度三色阈值与 旧版 `chapter_panel::set_progress` 一致（<50 / 50-79 / >=80）
                const level = pct >= 80 ? 'hi' : pct >= 50 ? 'mid' : 'low'
                return (
                  <button
                    key={key}
                    type="button"
                    data-testid="chapter-tab"
                    className={`chapter-tab${key === activeChapter ? ' active' : ''}`}
                    onClick={() => {
                      setActiveChapter(key)
                      setViewMode('edit')
                    }}
                  >
                    <span className="chapter-tab-label">{CHAPTER_LABELS[key]}</span>
                    {/*
                      「待核对」圆点：AI 刚生成、人还没看过。点了「保存本章」即消失。
                      视觉上不用文字 —— 章节导航里多出的两个字会比圆点更吵。
                    */}
                    {aiMarks[key] !== undefined && (
                      <span className="chapter-tab-ai" title="AI 生成，待核对" data-testid={`chapter-ai-${key}`} />
                    )}
                    <span
                      className="chapter-progress"
                      title={`完成度 ${pct}%`}
                      role="progressbar"
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <span className={`chapter-progress-fill ${level}`} style={{ width: `${pct}%` }} />
                      {/* 视觉隐藏但保留在文本里：E2E `ceshu.spec.ts:63` 断言 toContainText('50%') */}
                      <span className="sr-only">{pct}%</span>
                    </span>
                  </button>
                )
              })}
              {scope === 'lite' && (
                <div className="chapter-nav-hint">
                  标准版仅含基础 {contentChapterCount('lite')} 章；在「文档信息」中可切换为专业版{' '}
                  {contentChapterCount('full')} 章
                </div>
              )}
                </>
              ) : (
                <div className="chapter-nav-hint" data-testid="artifact-nav-hint">
                  「{ARTIFACTS.find((item) => item.key === artifact)?.label}」的目录将在这里
                </div>
              )}
            </div>

            <div className="chapter-body">
              {artifact === 'prototype' ? (
                <CeshuPrototypePanel
                  doc={doc}
                  onDocUpdated={(next) => {
                    setDoc(next)
                    onChanged()
                  }}
                />
              ) : artifact === 'data' ? (
                <CeshuMachineDataPanel
                  doc={doc}
                  onTypesChanged={onTypesChanged}
                  onGenerateData={(target) => {
                    setAiGenTarget(target)
                    setPanel('aiDataGen')
                  }}
                />
              ) : artifact === 'tasks' ? (
                <CeshuTasksPanel
                  doc={doc}
                  onDocUpdated={(next) => {
                    setDoc(next)
                    onChanged()
                  }}
                />
              ) : artifact !== 'doc' ? (
                <div className="artifact-placeholder" data-testid={`artifact-placeholder-${artifact}`}>
                  <div className="artifact-placeholder-title">
                    {ARTIFACTS.find((item) => item.key === artifact)?.label}
                  </div>
                  <p>这里将显示「{ARTIFACTS.find((item) => item.key === artifact)?.label}」（下一步接入）。</p>
                </div>
              ) : viewMode === 'overview' ? (
                <CeshuOverview
                  doc={doc}
                  stage={stageFilter === 'all' ? 'concept' : stageFilter}
                  progress={progress}
                />
              ) : (
                <ChapterForm
                  key={`${doc.ceshu_id}:${activeChapter}`}
                  chapter={activeChapter}
                  data={doc[activeChapter]}
                  busy={busy}
                  gameName={gameName}
                  onSave={handleSave}
                  onAiGenerate={handleAiGenerate}
                  onAiGenerateField={handleAiGenerateField}
                  fieldStatus={fieldStatusOf(doc.meta, activeChapter)}
                  onFieldStatus={handleFieldStatus}
                  /* 只在目标章与当前章一致时下发：切章后 ChapterForm 会重挂，目标必须跟着换 */
                  focusField={fieldJump?.chapter === activeChapter ? fieldJump.field : undefined}
                  onFocusConsumed={() => setFieldJump(null)}
                  /* 「改这里会影响什么」：面板在宿主渲染，ChapterForm 只负责发信号 */
                  onShowImpact={(chapter, field) => setImpactTarget({ chapter, field })}
                />
              )}
            </div>

            {/*
              数据栏属于**工作区**（左栏 + 中间），不是和右侧智能体并列的第四栏。
              收起时章节表单吃掉整段宽度；`jumpTarget` 有值时必须展开 ——
              否则「跳到引用」这类动作会静默失效（用户点了没反应）。

              ⚠️ 用 `!= null` 而不是 `!== null`：`jumpTarget` 是可选 prop，
              未传时是 `undefined`，而 `undefined !== null` 为真 ⇒ 数据栏会永远展开、
              开关形同虚设（组件测试抓到的）。
            */}
            {previewOpen || jumpTarget != null ? (
              <CeshuDataPreview
                enabledEditors={enabledEditors}
                types={types}
                chapters={doc}
                gameStyle={gameStyle}
                dataEpoch={dataEpoch}
                onGotoSystems={() => setActiveChapter('systems')}
                onDataChanged={onChanged}
                jumpTarget={jumpTarget}
                onEditType={onEditType}
                onShowReferences={onShowReferences}
                onAiGenerate={(typeId) => {
                  setAiGenTarget({ typeId })
                  setPanel('aiDataGen')
                }}
                onJumpHandled={onJumpHandled}
                onJumpMissed={onJumpMissed}
              />
            ) : (
              <CeshuAgentPanel doc={doc} onApplyPatch={handleApplyAgentPatch} />
            )}
          </div>
          </>
        )}
      </div>
    </div>
  )
}