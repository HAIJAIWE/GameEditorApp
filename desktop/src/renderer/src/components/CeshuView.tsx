import { useCallback, useEffect, useRef, useState } from 'react'

import {
  CESHU_EXPORT_FORMATS,
  CESHU_FORMAT_LABELS,
  CHAPTER_LABELS,
  visibleChapterKeys,
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
  resolveDocGameStyle
} from '../../../shared/ceshuModel'
import type { CeshuChangelog } from '../../../shared/ceshuDiff'
import {
  buildChangelogHtml,
  buildChangelogMarkdown,
  buildChangelogText,
  buildValidationReportMarkdown
} from '../../../shared/domain/ceshu/ceshuReports'
import { buildScoreReportMarkdown, type CeshuScoreReport } from '../../../shared/ceshuScorer'
import { clearAiGenerated, markAiGenerated, readAiGenerated } from '../../../shared/ceshuAiMark'
import { fieldStatusOf, setFieldStatuses, type FieldReviewStatus } from '../../../shared/ceshuFieldStatus'
import type { FieldAction } from '../../../shared/ceshuFieldAction'
import { clearFieldRequest } from '../ceshuFieldFocus'
import { CESHU_CHAPTER_FIELDS } from '../../../shared/ceshuFields'
import { migrationSplitTitle, pendingSplitCount, planCeshuMigration } from '../../../shared/ceshuMigrationPlan'
import type { CeshuAiGenerateResult } from '../../../shared/ceshuAi'
import type { DataTypeDef } from '../../../shared/types'

import AiDataGenPanel from './AiDataGenPanel'
import AiFullGeneratePanel from './AiFullGeneratePanel'
import AiReviewPanel from './AiReviewPanel'
import ChapterForm from './ChapterForm'
import ChapterNotesPanel from './ChapterNotesPanel'
import CeshuDataPreview, { type PreviewJumpTarget } from './ceshu/CeshuDataPreview'
import CeshuDataRefsPanel from './ceshu/CeshuDataRefsPanel'
import { ChangelogPanel, ScorePanel, ValidatePanel } from './ceshu/CeshuReportPanels'
import LucideIcon from './LucideIcon'
import PresetMarketPanel from './PresetMarketPanel'
import SystemConfirmPanel from './SystemConfirmPanel'
import TemplateEditorPanel from './TemplateEditorPanel'
import VersionDiffPanel from './VersionDiffPanel'
import VersionTimelinePanel from './VersionTimelinePanel'
import { toErrorMessage } from './ceshuViewUtils'

/** 数据栏展开状态的 localStorage 键（`'0'` = 收起，其它/缺失 = 展开） */
const PREVIEW_OPEN_KEY = 'mb.ceshu.previewOpen'

interface CeshuViewProps {
  ceshuId: string | null
  onChanged: () => void
  /** 切换当前策划书（派生新版本后自动切到新版本） */
  onSelect: (id: string) => void
  /**
   * 打开策划书时回填活跃术语风格（对应 Python `ceshu_controller.open_ceshu`：
   * 由 meta 推断风格后 `set_active_style`；本版优先采用用户显式选过的 `doc.style`）。
   */
  onGameStyleChange?: (styleId: string) => void
  /** 全部数据类型定义（内嵌数据编辑器标签页渲染条目表单用） */
  types: readonly DataTypeDef[]
  /** 活跃术语风格 id（透传给内嵌数据编辑器的字段标签术语替换） */
  gameStyle?: string
  /** 返回策划书首页（对齐 PyQt `editor_view.py::_on_back` 的 `back_requested`） */
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
  onShowReferences
}: CeshuViewProps) {
  const [doc, setDoc] = useState<CeshuDocument | null>(null)
  const [activeChapter, setActiveChapter] = useState<ChapterKey>('meta')
  /** 全局审阅队列（跨章列出 AI 草稿字段）是否展开 */
  const [reviewOpen, setReviewOpen] = useState(false)
  /** 迁移预览（只读）浮层是否展开 */
  const [migrationOpen, setMigrationOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [exportFormat, setExportFormat] = useState<CeshuExportFormat>('markdown')
  const [deriveOpen, setDeriveOpen] = useState(false)
  const [deriveNote, setDeriveNote] = useState('')
  const [panel, setPanel] = useState<
    | 'changelog'
    | 'validate'
    | 'score'
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
  const [score, setScore] = useState<CeshuScoreReport | null>(null)
  /** 「更多 ▸」下拉展开状态（对齐 PyQt `editor_view.py:154` 的 `_btn_more` 菜单） */
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
  /** 「AI 生成数据」的预选类型（由条目表单的「AI 生成」按钮指定；null = 面板默认全选） */
  const [aiGenTarget, setAiGenTarget] = useState<string | null>(null)
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
        // 对齐 PyQt `ceshu_controller.py:66-71`：打开策划书时，若**尚未确认过系统**且
        // 已有启用系统，则自动弹出「确认游戏系统」对话框（PyQt 无手动菜单项，TS 同步移除）。
        // 注意在 promise 回调里 setState —— react-hooks v7 禁止 effect 体内同步 setState。
        const alreadyConfirmed = loaded.meta?.system_confirmed === true
        if (!alreadyConfirmed && computeEnabledEditors(loaded).length > 0) {
          setPanel('systemConfirm')
        }
        // 打开策划书 → 回填活跃术语风格（Python 在 open_ceshu 里 set_active_style）
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
  const visible = visibleChapterKeys(scope)
  /**
   * 全局待审字段（跨章）：AI 草稿、尚未接受。
   * 按 `visible` 章节顺序 + 字段定义顺序排列，便于「一条队列」往下扫。
   */
  const pendingReviewFields: Array<{ chapter: ChapterKey; fieldKey: string; fieldLabel: string }> = []
  for (const chapter of visible) {
    const statuses = fieldStatusOf(doc.meta, chapter)
    for (const field of CESHU_CHAPTER_FIELDS[chapter] ?? []) {
      if (statuses[field.key]?.status === 'ai_draft') {
        pendingReviewFields.push({ chapter, fieldKey: field.key, fieldLabel: field.label })
      }
    }
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
  const progress = computeChapterProgress(doc)
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

  /** 质量评分：结构 30 + 质量 40 + 市场 30（含章节明细与改进建议） */
  const handleScore = async (): Promise<void> => {
    await runBusy(async () => {
      const report = await window.mbApi.ceshu.score({ id: doc.ceshu_id })
      setScore(report)
      setPanel('score')
    })
  }

  /** 导出评分报告：渲染层生成 Markdown → 主进程原子写盘（对齐 Python score_report_dialog._on_export_md） */
  const handleExportScore = async (): Promise<void> => {
    if (!score) return
    try {
      setError(null)
      setNotice(null)
      const chosen = await window.mbApi.dialog.chooseCeshuExportFile({
        format: 'markdown',
        defaultName: `${gameName}-GDD评分报告`
      })
      if (!chosen.path) return
      const markdown = buildScoreReportMarkdown(gameName, gameType, score, formatLocalTimestamp())
      const exported = await window.mbApi.ceshu.exportScoreReport({ path: chosen.path, content: markdown })
      setNotice(`评分报告已导出：${exported.filePath}`)
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }

  /** 导出校验报告：渲染层生成 Markdown → 主进程原子写盘（对齐 Python validation_dialog._on_export_md） */
  const handleExportValidation = async (): Promise<void> => {
    try {
      setError(null)
      setNotice(null)
      // 文件名安全化：保留字母/数字/._-（含 CJK，对齐 Python str.isalnum 语义）
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

  /** 导出变更日志：MD / HTML / Text 三格式（对齐 Python changelog_dialog._on_export） */
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
        // 跳到第一处变化：省得用户自己在 16 章里找
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
   * 「更多 ▸」菜单分组。骨架对齐 PyQt `editor_view.py:160-187` 的 `_more_menu` 顺序与分隔。
   *
   * **与 PyQt 菜单仍有差异（E30 审计确认，非笔误）**：PyQt 另有「档位切换（轻量 9 章 ↔
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
      { testid: 'ceshu-score', label: '评分', run: () => void handleScore() },
      { testid: 'ceshu-autofill', label: '补全空白字段', run: () => void handleAutoFill() },
      { testid: 'ceshu-diff', label: '版本对比', run: () => setPanel('diff') },
      { testid: 'ceshu-timeline', label: '版本时间线', run: () => setPanel('timeline') },
      { testid: 'ceshu-changelog', label: '变更记录', run: () => void handleShowChangelog() },
      { testid: 'ceshu-datarefs', label: '数据引用', run: () => setPanel('dataRefs') },
      { testid: 'ceshu-migration-preview', label: '迁移预览（只读）', run: () => setMigrationOpen(true) }
    ],
    // 「确认游戏系统」**不在菜单里**：PyQt 无此菜单项，改为打开策划书时自动弹窗
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
        <span className="item-meta">档位：{scope === 'lite' ? '标准版（9 章）' : '专业版（16 章）'}</span>
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
          onClick={() => setReviewOpen((open) => !open)}
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
        {/* 「更多 ▸」：对齐 PyQt `editor_view.py:154` —— 低频/高级功能收进下拉，
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
            initialTypeId={aiGenTarget ?? undefined}
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
          />
        ) : panel === 'score' ? (
          <ScorePanel score={score} onExport={() => void handleExportScore()} onClose={() => setPanel(null)} />
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
                      {pendingReviewFields.map((item) => (
                        <div className="review-row" key={`${item.chapter}:${item.fieldKey}`} data-testid="review-row">
                          <span className="review-chapter">{CHAPTER_LABELS[item.chapter]}</span>
                          <span className="review-field">{item.fieldLabel}</span>
                          <button
                            type="button"
                            className="btn slim"
                            data-testid="review-goto"
                            onClick={() => {
                              setActiveChapter(item.chapter)
                              setReviewOpen(false)
                            }}
                          >
                            查看
                          </button>
                          <button
                            type="button"
                            className="btn slim primary"
                            data-testid="review-accept"
                            onClick={() => void handleFieldStatus(item.chapter, { [item.fieldKey]: 'approved' })}
                          >
                            接受
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
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
            <div className="ceshu-pane-row">
            <div className="chapter-nav">
              {visible.map((key) => {
                const pct = Math.round((progress[key] ?? 0) * 100)
                // 完成度三色阈值与 PyQt `chapter_panel.py::set_progress` 一致（<50 / 50-79 / >=80）
                const level = pct >= 80 ? 'hi' : pct >= 50 ? 'mid' : 'low'
                return (
                  <button
                    key={key}
                    type="button"
                    data-testid="chapter-tab"
                    className={`chapter-tab${key === activeChapter ? ' active' : ''}`}
                    onClick={() => setActiveChapter(key)}
                  >
                    <span className="chapter-tab-label">{CHAPTER_LABELS[key]}</span>
                    {/*
                      「待核对」圆点：AI 刚生成、人还没看过。点了「保存本章」即消失。
                      视觉上不用文字 —— 16 章里多出的两个字会比圆点更吵。
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
                <div className="chapter-nav-hint">标准版仅含基础 9 章；在「文档信息」中可切换为专业版 16 章</div>
              )}
            </div>

            <div className="chapter-body">
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
              />
            </div>

            {/*
              数据栏属于**工作区**（左栏 + 中间），不是和右侧智能体并列的第四栏。
              收起时章节表单吃掉整段宽度；`jumpTarget` 有值时必须展开 ——
              否则「跳到引用」这类动作会静默失效（用户点了没反应）。

              ⚠️ 用 `!= null` 而不是 `!== null`：`jumpTarget` 是可选 prop，
              未传时是 `undefined`，而 `undefined !== null` 为真 ⇒ 数据栏会永远展开、
              开关形同虚设（组件测试抓到的）。
            */}
            {(previewOpen || jumpTarget != null) && <CeshuDataPreview
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
                setAiGenTarget(typeId)
                setPanel('aiDataGen')
              }}
              onJumpHandled={onJumpHandled}
              onJumpMissed={onJumpMissed}
            />}
          </div>
          </>
        )}
      </div>
    </div>
  )
}