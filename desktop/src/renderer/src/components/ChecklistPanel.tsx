import { useEffect, useState } from 'react'

import type { CeshuDocument } from '../../../shared/ceshuConstants'
import {
  ALL_CATEGORIES,
  STATUS_META,
  buildChecklistMarkdown,
  getChecklistItemsByCategory,
  type ChecklistReport,
  type ChecklistStatus
} from '../../../shared/ceshu/ceshuChecklist'
import { formatLocalTimestamp } from '../../../shared/ceshuModel'
import { toErrorMessage } from '../../../shared/util/errors'

/**
 * GDD 完备性检查清单面板（对应 Python ChecklistDialog）：
 * - 顶部：就绪度评分 + 就绪状态 + 进度条 + 通过/失败/警告/人工统计
 * - 左侧：6 大类导航（各类通过数 / 总数，含失败项标红）
 * - 右侧：选中类别的检查项卡片（状态图标 + 标题 + 描述 + 检查消息 + 必需/建议）
 * - 底部操作：导出 Markdown 报告 / 一键修复（自动填充空必填字段后重新检查）
 */

interface ChecklistPanelProps {
  ceshuId: string
  gameName: string
  /** 一键修复后回填更新后的文档与填充字段数（供上层刷新进度/列表） */
  onFilled: (doc: CeshuDocument, filled: number) => void
  onClose: () => void
}

/** 就绪度着色：已就绪绿 / ≥50 琥珀 / 其余红（与 Python ChecklistDialog 一致） */
function scoreClass(report: ChecklistReport): string {
  if (report.is_production_ready) return 'ready'
  return report.readiness_score >= 50 ? 'warn' : 'fail'
}

export default function ChecklistPanel({ ceshuId, gameName, onFilled, onClose }: ChecklistPanelProps) {
  const [report, setReport] = useState<ChecklistReport | null>(null)
  const [activeCategory, setActiveCategory] = useState<string>(ALL_CATEGORIES[0] ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    window.mbApi.ceshu
      .checklist({ id: ceshuId })
      .then((loaded) => {
        if (!cancelled) setReport(loaded)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toErrorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [ceshuId])

  /** 一键修复：主进程按规则填充空必填字段并落盘 → 重新运行检查刷新面板 */
  const handleAutoFill = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await window.mbApi.ceshu.autoFill({ id: ceshuId })
      const refreshed = await window.mbApi.ceshu.checklist({ id: ceshuId })
      setReport(refreshed)
      setNotice(
        result.filled > 0
          ? `已自动填充 ${result.filled} 个空必填字段，请人工复核填充内容的合理性`
          : '没有需要填充的空必填字段'
      )
      onFilled(result.doc, result.filled)
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const handleExport = async (): Promise<void> => {
    if (!report) return
    try {
      setError(null)
      setNotice(null)
      const chosen = await window.mbApi.dialog.chooseCeshuExportFile({
        format: 'markdown',
        defaultName: `${gameName}-GDD检查报告`
      })
      if (!chosen.path) return
      const markdown = buildChecklistMarkdown(gameName, report, formatLocalTimestamp())
      const exported = await window.mbApi.ceshu.exportChecklistReport({ path: chosen.path, content: markdown })
      setNotice(`检查报告已导出：${exported.filePath}`)
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }

  const resultMap = new Map((report?.results ?? []).map((item) => [item.item_id, item]))
  const activeItems = getChecklistItemsByCategory(activeCategory)

  return (
    <div className="changelog-panel" data-testid="checklist-panel">
      <div className="changelog-header">
        <span className="chapter-form-title">GDD 完备性检查清单（预制作就绪）</span>
        <div className="editor-actions">
          <button
            type="button"
            className="btn"
            data-testid="checklist-export"
            disabled={!report}
            onClick={() => void handleExport()}
          >
            导出报告
          </button>
          <button
            type="button"
            className="btn primary"
            data-testid="checklist-autofill"
            disabled={busy || !report}
            onClick={() => void handleAutoFill()}
          >
            {busy ? '处理中…' : '一键修复'}
          </button>
          <button type="button" className="btn" data-testid="checklist-close" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>

      {error && (
        <div className="form-error" data-testid="checklist-error">
          {error}
        </div>
      )}
      {notice && (
        <div className="notice-banner" data-testid="checklist-notice">
          {notice}
        </div>
      )}

      {!report ? (
        <div className="empty">正在运行完备性检查…</div>
      ) : (
        <>
          <div className="changelog-entry checklist-top" data-testid="checklist-summary">
            <div className={`checklist-score ${scoreClass(report)}`} data-testid="checklist-score">
              {Math.round(report.readiness_score)}
            </div>
            <div className="checklist-summary-body">
              <div className={`checklist-status ${scoreClass(report)}`} data-testid="checklist-status">
                {report.is_production_ready ? '✅ 制作就绪' : '❌ 未就绪'}
              </div>
              <div className="checklist-progress">
                <div
                  className={`checklist-progress-fill ${scoreClass(report)}`}
                  style={{ width: `${Math.min(Math.max(report.readiness_score, 0), 100)}%` }}
                />
              </div>
              <div className="item-meta" data-testid="checklist-stats">
                通过 {report.passed} · 失败 {report.failed} · 警告 {report.warnings} · 人工 {report.manual} · 共{' '}
                {report.total_items} 项
              </div>
            </div>
          </div>

          <div className="checklist-body">
            <div className="checklist-categories">
              {ALL_CATEGORIES.map((category) => {
                const items = getChecklistItemsByCategory(category)
                const results = items.map((item) => resultMap.get(item.id))
                const passed = results.filter((result) => result?.status === 'pass').length
                const failed = results.some((result) => result?.status === 'fail')
                return (
                  <button
                    key={category}
                    type="button"
                    data-testid="checklist-category"
                    className={`checklist-category${category === activeCategory ? ' active' : ''}${failed ? ' failed' : ''}`}
                    onClick={() => setActiveCategory(category)}
                  >
                    {category}（{passed}/{items.length}）
                  </button>
                )
              })}
            </div>

            <div className="checklist-items">
              {activeItems.map((item) => {
                const result = resultMap.get(item.id)
                const status: ChecklistStatus = result?.status ?? 'manual'
                const meta = STATUS_META[status]
                return (
                  <div className="checklist-item" data-testid="checklist-item" key={item.id}>
                    <div
                      className="checklist-item-icon"
                      style={{ background: `${meta.color}22`, color: meta.color }}
                      title={meta.label}
                    >
                      {meta.icon}
                    </div>
                    <div className="checklist-item-body">
                      <div className="checklist-item-title">
                        {item.required && <span className="checklist-required-mark">*</span>} {item.title}
                        <span className="item-meta"> [{item.id}]</span>
                      </div>
                      <div className="checklist-item-desc">{item.description}</div>
                      <div className="checklist-item-msg" style={{ color: meta.color }} data-testid="checklist-item-msg">
                        {result?.message ?? '未运行检查'}
                      </div>
                    </div>
                    <span className={`checklist-item-badge ${item.required ? 'required' : 'optional'}`}>
                      {item.required ? '必需' : '建议'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}