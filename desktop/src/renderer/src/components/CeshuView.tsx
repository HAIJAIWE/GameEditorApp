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
import { buildScoreReportMarkdown, gradeLabel, type CeshuScoreReport } from '../../../shared/ceshuScorer'
import type { CeshuAiGenerateResult } from '../../../shared/ceshuAi'
import type { DataTypeDef } from '../../../shared/types'

import AiDataGenPanel from './AiDataGenPanel'
import AiFullGeneratePanel from './AiFullGeneratePanel'
import AiReviewPanel from './AiReviewPanel'
import ChapterForm from './ChapterForm'
import ChapterNotesPanel from './ChapterNotesPanel'
import CeshuDataPreview, { type PreviewJumpTarget } from './ceshu/CeshuDataPreview'
import CeshuDataRefsPanel from './ceshu/CeshuDataRefsPanel'
import ChecklistPanel from './ChecklistPanel'
import FieldDepsPanel from './FieldDepsPanel'
import LucideIcon from './LucideIcon'
import PresetMarketPanel from './PresetMarketPanel'
import SystemConfirmPanel from './SystemConfirmPanel'
import TemplateEditorPanel from './TemplateEditorPanel'
import VersionDiffPanel from './VersionDiffPanel'
import VersionTimelinePanel from './VersionTimelinePanel'
import WordStatsPanel from './WordStatsPanel'
import { groupByChapter, toErrorMessage } from './ceshuViewUtils'

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
    | 'checklist'
    | 'diff'
    | 'notes'
    | 'wordStats'
    | 'fieldDeps'
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

  const handleSave = useCallback(
    async (chapter: ChapterKey, data: ChapterData): Promise<void> => {
      if (!ceshuId) return
      setBusy(true)
      try {
        const updated = await window.mbApi.ceshu.saveChapter({ id: ceshuId, chapter, data })
        setDoc(updated)
        setNotice(`已保存：${CHAPTER_LABELS[chapter]}`)
        setError(null)
        onChanged()
      } catch (err) {
        setError(toErrorMessage(err))
      } finally {
        setBusy(false)
      }
    },
    [ceshuId, onChanged]
  )

  /** AI 生成本章：走 IPC 调本地模型（ollama），返回清洗后的字段供表单填入草稿 */
  const handleAiGenerate = useCallback(
    async (chapter: ChapterKey, onlyEmpty: boolean): Promise<CeshuAiGenerateResult> => {
      if (!ceshuId) throw new Error('未选择策划书')
      return window.mbApi.ceshu.aiGenerateChapter({ id: ceshuId, chapter, onlyEmpty })
    },
    [ceshuId]
  )

  /** AI 生成单个字段（E62）：走 IPC 调本地模型，返回清洗后的字段供表单回填 */
  const handleAiGenerateField = useCallback(
    async (chapter: ChapterKey, field: string): Promise<CeshuAiGenerateResult> => {
      if (!ceshuId) throw new Error('未选择策划书')
      return window.mbApi.ceshu.aiGenerateField({ id: ceshuId, chapter, field })
    },
    [ceshuId]
  )

  if (!ceshuId) {
    return (
      <div className="ceshu-view">
        <div className="empty">请选择或新建策划书</div>
      </div>
    )
  }

  // 切换策划书时旧文档仍在 state 中，id 不匹配则视为加载中
  if (!doc || doc.ceshu_id !== ceshuId) {
    return (
      <div className="ceshu-view">
        <div className="empty">正在加载策划书…</div>
      </div>
    )
  }

  const scope = getGddScope(doc)
  const visible = visibleChapterKeys(scope)
  const progress = computeChapterProgress(doc)
  /** 由第四章游戏系统派生的启用编辑器（内嵌数据预览面板据此渲染标签页） */
  const enabledEditors = computeEnabledEditors(doc)
  const gameName = typeof doc.meta.game_name === 'string' && doc.meta.game_name ? doc.meta.game_name : '未命名策划书'
  const gameType = typeof doc.meta.game_type === 'string' && doc.meta.game_type ? doc.meta.game_type : '未知'

  /** 导出当前策划书：选择保存路径 → 主进程按格式渲染并原子写盘 */
  const handleExport = async (): Promise<void> => {
    try {
      setError(null)
      setNotice(null)
      const chosen = await window.mbApi.dialog.chooseCeshuExportFile({ format: exportFormat, defaultName: gameName })
      if (!chosen.path) return
      setBusy(true)
      const result = await window.mbApi.ceshu.export({ id: doc.ceshu_id, format: exportFormat, path: chosen.path })
      setNotice(`已导出（${CESHU_FORMAT_LABELS[result.format]}）：${result.filePath}`)
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  /** 派生新版本：复制当前版本内容，版本号自动递增，默认未激活 */
  const handleDerive = async (): Promise<void> => {
    try {
      setError(null)
      setNotice(null)
      setBusy(true)
      const created = await window.mbApi.ceshu.derive({ id: doc.ceshu_id, note: deriveNote })
      setDeriveOpen(false)
      setDeriveNote('')
      setNotice(`已派生新版本 ${created.version_label}（默认未激活，可点「设为激活」）`)
      onChanged()
      onSelect(created.ceshu_id)
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  /** 将当前文档设为激活版本（同链其他版本自动取消激活） */
  const handleSetActive = async (): Promise<void> => {
    try {
      setError(null)
      setNotice(null)
      setBusy(true)
      const updated = await window.mbApi.ceshu.setActive({ id: doc.ceshu_id })
      setDoc(updated)
      setNotice(`已激活版本：${updated.version_label}`)
      onChanged()
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  /** 查看版本链变更记录（同链版本按时间逐对 diff） */
  const handleShowChangelog = async (): Promise<void> => {
    try {
      setError(null)
      setBusy(true)
      const log = await window.mbApi.ceshu.changelog({ id: doc.ceshu_id })
      setChangelog(log)
      setPanel('changelog')
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  /** 数据校验：必填字段 + 章节间一致性检查 */
  const handleValidate = async (): Promise<void> => {
    try {
      setError(null)
      setBusy(true)
      const errors = await window.mbApi.ceshu.validate({ id: doc.ceshu_id })
      setValidateErrors(errors)
      setPanel('validate')
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  /** 质量评分：结构 30 + 质量 40 + 市场 30（含章节明细与改进建议） */
  const handleScore = async (): Promise<void> => {
    try {
      setError(null)
      setBusy(true)
      const report = await window.mbApi.ceshu.score({ id: doc.ceshu_id })
      setScore(report)
      setPanel('score')
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
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
  const handleAiApplied = (updated: CeshuDocument, appliedChapters: number): void => {
    setDoc(updated)
    setNotice(`AI 生成内容已保存：${appliedChapters} 章`)
    onChanged()
  }

  /** 模板编辑器「应用到该章节」完成：更新当前文档并刷新列表（进度可能变化） */
  const handleTemplateApplied = (updated: CeshuDocument, chapter: ChapterKey): void => {
    setDoc(updated)
    setNotice(`模板数据已应用到「${CHAPTER_LABELS[chapter]}」`)
    onChanged()
  }

  /** 一键修复应用完成：更新当前文档，有实际填充时刷新侧边栏进度 */
  const handleChecklistFilled = (updated: CeshuDocument, filled: number): void => {
    setDoc(updated)
    if (filled > 0) onChanged()
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
   * **与 PyQt 菜单仍有差异（E30 审计确认，非笔误）**：PyQt 另有「档位切换（轻量 9 章 ↔ 工业级 18 章）、
   * 补全空白字段、更多模板、导出 AI 报告」四项，TS 侧**没有对应入口**（不是按钮失效，是真没有）。
   * 其中「补全空白字段」的能力其实**已实现**（`ChecklistPanel` 的自动填充 + 清单面板入口），
   * 只是没有挂进这个菜单 —— 属**待收口**而非「无能力」，注释勿再写成「无能力」。
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
      { testid: 'ceshu-wordstats', label: '字数统计', run: () => setPanel('wordStats') },
      { testid: 'ceshu-diff', label: '版本对比', run: () => setPanel('diff') },
      { testid: 'ceshu-timeline', label: '版本时间线', run: () => setPanel('timeline') },
      { testid: 'ceshu-checklist', label: '清单', run: () => setPanel('checklist') },
      { testid: 'ceshu-changelog', label: '变更记录', run: () => void handleShowChangelog() },
      { testid: 'ceshu-fielddeps', label: '依赖检查', run: () => setPanel('fieldDeps') },
      { testid: 'ceshu-datarefs', label: '数据引用', run: () => setPanel('dataRefs') }
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
        ) : panel === 'checklist' ? (
          <ChecklistPanel
            key={doc.ceshu_id}
            ceshuId={doc.ceshu_id}
            gameName={gameName}
            onFilled={handleChecklistFilled}
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
        ) : panel === 'wordStats' ? (
          <WordStatsPanel key={doc.ceshu_id} ceshuId={doc.ceshu_id} onClose={() => setPanel(null)} />
        ) : panel === 'dataRefs' ? (
          <CeshuDataRefsPanel key={doc.ceshu_id} chapters={doc} types={types} />
        ) : panel === 'fieldDeps' ? (
          <FieldDepsPanel key={doc.ceshu_id} ceshuId={doc.ceshu_id} onClose={() => setPanel(null)} />
        ) : panel === 'changelog' && changelog ? (
          <div className="changelog-panel" data-testid="changelog-panel">
            <div className="changelog-header">
              <span className="chapter-form-title">变更记录（{changelog.entries.length} 次版本变更）</span>
              <div className="editor-actions">
                <button
                  type="button"
                  className="btn"
                  data-testid="changelog-export-md"
                  disabled={changelog.entries.length === 0}
                  onClick={() => void handleExportChangelog('md')}
                >
                  导出 Markdown
                </button>
                <button
                  type="button"
                  className="btn"
                  data-testid="changelog-export-html"
                  disabled={changelog.entries.length === 0}
                  onClick={() => void handleExportChangelog('html')}
                >
                  导出 HTML
                </button>
                <button
                  type="button"
                  className="btn"
                  data-testid="changelog-export-text"
                  disabled={changelog.entries.length === 0}
                  onClick={() => void handleExportChangelog('text')}
                >
                  导出 Text
                </button>
                <button type="button" className="btn" data-testid="changelog-close" onClick={() => setPanel(null)}>
                  关闭
                </button>
              </div>
            </div>
            {changelog.entries.length === 0 ? (
              <div className="empty">暂无变更记录（版本链只有一份文档时无对比对象）</div>
            ) : (
              changelog.entries.map((entry) => (
                <div className="changelog-entry" key={`${entry.version}:${entry.date}`}>
                  <div className="changelog-entry-title">
                    {entry.version} — {entry.summary}
                  </div>
                  <div className="item-meta">{entry.date}</div>
                  {groupByChapter(entry.changes).map(([chapter, changes]) => (
                    <div className="changelog-chapter" key={chapter}>
                      <div className="form-label">{chapter}</div>
                      {changes.map((change, index) => (
                        <div key={`${change.field}:${index}`} className={`changelog-line ${change.type}`}>
                          {change.description}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        ) : panel === 'validate' ? (
          <div className="changelog-panel" data-testid="validate-panel">
            <div className="changelog-header">
              <span className="chapter-form-title">
                数据校验{validateErrors.length > 0 ? `（${validateErrors.length} 个问题）` : ''}
              </span>
              <div className="editor-actions">
                <button
                  type="button"
                  className="btn"
                  data-testid="validate-export"
                  onClick={() => void handleExportValidation()}
                >
                  导出校验报告
                </button>
                <button type="button" className="btn" data-testid="validate-close" onClick={() => setPanel(null)}>
                  关闭
                </button>
              </div>
            </div>
            {validateErrors.length === 0 ? (
              <div className="empty">✅ 所有校验通过，未发现错误</div>
            ) : (
              <div className="changelog-entry">
                {validateErrors.map((item, index) => (
                  <div key={`${index}:${item}`} className="validate-line">
                    {index + 1}. {item}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : panel === 'score' ? (
          <div className="changelog-panel" data-testid="score-panel">
            <div className="changelog-header">
              <span className="chapter-form-title">质量评分</span>
              <div className="editor-actions">
                <button
                  type="button"
                  className="btn"
                  data-testid="score-export"
                  disabled={!score}
                  onClick={() => void handleExportScore()}
                >
                  导出评分报告
                </button>
                <button type="button" className="btn" data-testid="score-close" onClick={() => setPanel(null)}>
                  关闭
                </button>
              </div>
            </div>
            {!score ? (
              <div className="empty">正在评分…</div>
            ) : (
              <>
                <div className="changelog-entry">
                  <div className="score-total">
                    <span className="score-total-value">{score.total_score}</span>
                    <span className="score-total-grade">
                      {score.grade} · {gradeLabel(score.grade)}
                    </span>
                  </div>
                  <div className="score-dimensions">
                    <span>
                      结构 {score.structure_score}/30 {score.pass_status.structure ? '✅' : '⚠️'}
                    </span>
                    <span>
                      质量 {score.content_quality_score}/40 {score.pass_status.quality ? '✅' : '⚠️'}
                    </span>
                    <span>
                      市场 {score.market_potential_score}/30 {score.pass_status.market ? '✅' : '⚠️'}
                    </span>
                  </div>
                  <div className="item-meta">
                    行业对比（{score.industry_benchmark.label}）：总分 {score.total_score} vs 行业均值{' '}
                    {score.industry_benchmark.total_avg}（{score.industry_benchmark.vs_total >= 0 ? '+' : ''}
                    {score.industry_benchmark.vs_total}）
                  </div>
                </div>

                <div className="changelog-entry">
                  <div className="form-label">改进建议</div>
                  {score.suggestions.map((suggestion, index) => (
                    <div key={`${index}:${suggestion}`} className="score-suggestion">
                      {suggestion}
                    </div>
                  ))}
                </div>

                <div className="changelog-entry">
                  <div className="form-label">章节明细（按得分升序，优先补强弱项）</div>
                  <table className="score-table">
                    <thead>
                      <tr>
                        <th>章节</th>
                        <th>得分</th>
                        <th>字数</th>
                        <th>完成度</th>
                        <th>缺失必填</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...score.chapter_scores]
                        .sort((a, b) => a.score - b.score)
                        .map((chapter) => (
                          <tr key={chapter.chapter_key}>
                            <td>{chapter.chapter_label}</td>
                            <td>{chapter.score}</td>
                            <td>{chapter.word_count}</td>
                            <td>{Math.round(chapter.completion * 100)}%</td>
                            <td>{chapter.missing_required.length > 0 ? chapter.missing_required.join('、') : '—'}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        ) : (
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
              />
            </div>

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
                setAiGenTarget(typeId)
                setPanel('aiDataGen')
              }}
              onJumpHandled={onJumpHandled}
              onJumpMissed={onJumpMissed}
            />
          </div>
        )}
      </div>
    </div>
  )
}