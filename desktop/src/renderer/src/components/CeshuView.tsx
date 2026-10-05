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
import { computeChapterProgress, computeEnabledEditors, getGddScope, resolveDocGameStyle } from '../../../shared/ceshuModel'
import type { CeshuChangeItem, CeshuChangelog } from '../../../shared/ceshuDiff'
import { gradeLabel, type CeshuScoreReport } from '../../../shared/ceshuScorer'
import type { CeshuAiGenerateResult } from '../../../shared/ceshuAi'
import type { DataTypeDef } from '../../../shared/types'

import AiDataGenPanel from './AiDataGenPanel'
import AiFullGeneratePanel from './AiFullGeneratePanel'
import AiReviewPanel from './AiReviewPanel'
import ChapterForm from './ChapterForm'
import ChapterNotesPanel from './ChapterNotesPanel'
import CeshuDataPreview, { type PreviewJumpTarget } from './ceshu/CeshuDataPreview'
import ChecklistPanel from './ChecklistPanel'
import FieldDepsPanel from './FieldDepsPanel'
import PresetMarketPanel from './PresetMarketPanel'
import SystemConfirmPanel from './SystemConfirmPanel'
import TemplateEditorPanel from './TemplateEditorPanel'
import VersionDiffPanel from './VersionDiffPanel'
import VersionTimelinePanel from './VersionTimelinePanel'
import WordStatsPanel from './WordStatsPanel'

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
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 变更明细按章节分组（保持出现顺序） */
function groupByChapter(changes: CeshuChangeItem[]): Array<[string, CeshuChangeItem[]]> {
  const groups = new Map<string, CeshuChangeItem[]>()
  for (const change of changes) {
    const list = groups.get(change.chapter)
    if (list) list.push(change)
    else groups.set(change.chapter, [change])
  }
  return [...groups.entries()]
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
  onJumpHandled,
  onJumpMissed
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
    | null
  >(null)
  const [changelog, setChangelog] = useState<CeshuChangelog | null>(null)
  const [validateErrors, setValidateErrors] = useState<string[]>([])
  const [score, setScore] = useState<CeshuScoreReport | null>(null)
  /** 「更多 ▸」下拉展开状态（对齐 PyQt `editor_view.py:154` 的 `_btn_more` 菜单） */
  const [moreOpen, setMoreOpen] = useState(false)
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
  /** 由第五章游戏系统派生的启用编辑器（内嵌数据预览面板据此渲染标签页） */
  const enabledEditors = computeEnabledEditors(doc)
  const gameName = typeof doc.meta.game_name === 'string' && doc.meta.game_name ? doc.meta.game_name : '未命名策划书'

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
   * 「更多 ▸」菜单分组。对齐 PyQt `editor_view.py:160-187` 的 `_more_menu` 顺序与分隔。
   * **刻意不列** TS 尚无对应能力的三项（AI 整章 / AI 补全空白字段 / 档位切换）——
   * 宁缺勿错，不放点了没反应的装饰按钮。
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
      { testid: 'ceshu-fielddeps', label: '依赖检查', run: () => setPanel('fieldDeps') }
    ],
    [
      { testid: 'ceshu-notes', label: '笔记', run: () => setPanel('notes') },
      { testid: 'ceshu-system-confirm', label: '确认游戏系统', run: () => setPanel('systemConfirm') }
    ]
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
          返回
        </button>
        <h1>{gameName}</h1>
        <span className="item-meta" data-testid="ceshu-version">
          {doc.version_label}
          {doc.is_active ? ' ★ 激活' : ' · 未激活'}
        </span>
        <span className="item-meta">档位：{scope === 'lite' ? '轻量（9 章）' : '工业级（18 章）'}</span>
        <span className="item-meta" data-testid="ceshu-total-progress">
          总进度 {Math.round((progress.total ?? 0) * 100)}%
        </span>
        {!doc.is_active && (
          <button type="button" className="btn" data-testid="ceshu-set-active" disabled={busy} onClick={() => void handleSetActive()}>
            设为激活
          </button>
        )}
        <button type="button" className="btn" data-testid="ceshu-validate" disabled={busy} onClick={() => void handleValidate()}>
          校验
        </button>
        <button type="button" className="btn" data-testid="ceshu-ai-full" disabled={busy} onClick={() => setPanel('aiFull')}>
          AI 一键生成
        </button>
        <button
          type="button"
          className="btn"
          data-testid="ceshu-ai-datagen"
          disabled={busy}
          onClick={() => setPanel('aiDataGen')}
        >
          AI 生成数据
        </button>
        {/* 「更多 ▸」：对齐 PyQt `editor_view.py:154` —— 低频/高级功能收进下拉，
            工具栏只留高频操作（返回/保存/校验/AI/导出），避免「一屏 19 个按钮」的操作带过载
            （正是 docs/ux-simplification-plan.md 的 P3「操作带过多，层级重叠」） */}
        <div className="toolbar-more" ref={moreRef}>
          <button
            type="button"
            className="btn"
            data-testid="ceshu-more"
            disabled={busy}
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((open) => !open)}
          >
            更多 ▸
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
        <button type="button" className="btn" data-testid="ceshu-export" disabled={busy} onClick={() => void handleExport()}>
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
          <AiDataGenPanel key={doc.ceshu_id} ceshuId={doc.ceshu_id} onClose={() => setPanel(null)} />
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
        ) : panel === 'fieldDeps' ? (
          <FieldDepsPanel key={doc.ceshu_id} ceshuId={doc.ceshu_id} onClose={() => setPanel(null)} />
        ) : panel === 'changelog' && changelog ? (
          <div className="changelog-panel" data-testid="changelog-panel">
            <div className="changelog-header">
              <span className="chapter-form-title">变更记录（{changelog.entries.length} 次版本变更）</span>
              <button type="button" className="btn" data-testid="changelog-close" onClick={() => setPanel(null)}>
                关闭
              </button>
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
              <button type="button" className="btn" data-testid="validate-close" onClick={() => setPanel(null)}>
                关闭
              </button>
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
              <button type="button" className="btn" data-testid="score-close" onClick={() => setPanel(null)}>
                关闭
              </button>
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
              {visible.map((key) => (
                <button
                  key={key}
                  type="button"
                  data-testid="chapter-tab"
                  className={`chapter-tab${key === activeChapter ? ' active' : ''}`}
                  onClick={() => setActiveChapter(key)}
                >
                  <span className="chapter-tab-label">{CHAPTER_LABELS[key]}</span>
                  <span className="chapter-progress">{Math.round((progress[key] ?? 0) * 100)}%</span>
                </button>
              ))}
              {scope === 'lite' && (
                <div className="chapter-nav-hint">轻量档仅含基础 9 章；在「项目元信息」中可切换为工业级 18 章</div>
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
              />
            </div>

            <CeshuDataPreview
              enabledEditors={enabledEditors}
              types={types}
              gameStyle={gameStyle}
              onGotoSystems={() => setActiveChapter('systems')}
              onDataChanged={onChanged}
              jumpTarget={jumpTarget}
              onJumpHandled={onJumpHandled}
              onJumpMissed={onJumpMissed}
            />
          </div>
        )}
      </div>
    </div>
  )
}