import { useCallback, useEffect, useState } from 'react'

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
import { computeChapterProgress, getGddScope } from '../../../shared/ceshuModel'
import type { CeshuChangeItem, CeshuChangelog } from '../../../shared/ceshuDiff'
import { gradeLabel, type CeshuScoreReport } from '../../../shared/ceshuScorer'
import type { CeshuAiGenerateResult } from '../../../shared/ceshuAi'

import AiFullGeneratePanel from './AiFullGeneratePanel'
import AiReviewPanel from './AiReviewPanel'
import ChapterForm from './ChapterForm'
import ChecklistPanel from './ChecklistPanel'

interface CeshuViewProps {
  ceshuId: string | null
  onChanged: () => void
  /** 切换当前策划书（派生新版本后自动切到新版本） */
  onSelect: (id: string) => void
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
export default function CeshuView({ ceshuId, onChanged, onSelect }: CeshuViewProps) {
  const [doc, setDoc] = useState<CeshuDocument | null>(null)
  const [activeChapter, setActiveChapter] = useState<ChapterKey>('meta')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [exportFormat, setExportFormat] = useState<CeshuExportFormat>('markdown')
  const [deriveOpen, setDeriveOpen] = useState(false)
  const [deriveNote, setDeriveNote] = useState('')
  const [panel, setPanel] = useState<'changelog' | 'validate' | 'score' | 'aiFull' | 'aiReview' | 'checklist' | null>(null)
  const [changelog, setChangelog] = useState<CeshuChangelog | null>(null)
  const [validateErrors, setValidateErrors] = useState<string[]>([])
  const [score, setScore] = useState<CeshuScoreReport | null>(null)

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
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toErrorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [ceshuId])

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
        <div className="empty">请在左侧选择或新建策划书</div>
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

  /** 一键修复应用完成：更新当前文档，有实际填充时刷新侧边栏进度 */
  const handleChecklistFilled = (updated: CeshuDocument, filled: number): void => {
    setDoc(updated)
    if (filled > 0) onChanged()
  }

  return (
    <div className="ceshu-view">
      <header className="toolbar">
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
        <button type="button" className="btn" data-testid="ceshu-derive" disabled={busy} onClick={() => setDeriveOpen((open) => !open)}>
          派生新版本
        </button>
        <button type="button" className="btn" data-testid="ceshu-changelog" disabled={busy} onClick={() => void handleShowChangelog()}>
          变更记录
        </button>
        <button type="button" className="btn" data-testid="ceshu-validate" disabled={busy} onClick={() => void handleValidate()}>
          校验
        </button>
        <button type="button" className="btn" data-testid="ceshu-score" disabled={busy} onClick={() => void handleScore()}>
          评分
        </button>
        <button type="button" className="btn" data-testid="ceshu-checklist" disabled={busy} onClick={() => setPanel('checklist')}>
          清单
        </button>
        <button type="button" className="btn" data-testid="ceshu-ai-review" disabled={busy} onClick={() => setPanel('aiReview')}>
          AI 审阅
        </button>
        <button type="button" className="btn" data-testid="ceshu-ai-full" disabled={busy} onClick={() => setPanel('aiFull')}>
          AI 一键生成
        </button>
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
          <>
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
                onSave={handleSave}
                onAiGenerate={handleAiGenerate}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}