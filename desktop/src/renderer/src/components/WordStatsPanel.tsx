import { useEffect, useState } from 'react'

import type { CeshuWordStatsReport } from '../../../shared/ceshuWordStats'

/**
 * 字数统计面板（对应 Python WordStatsDialog）：
 * - 顶部总览：总字数 / 工业级 GDD 推荐总字数 / 整体完成度 + 进度条
 * - 章节表：章节 / 字数 / 工业级标准 / 完成度（着色）/ 建议（着色）
 * Python 该对话框只有「关闭」按钮，故本面板同样不导出。
 */

interface WordStatsPanelProps {
  ceshuId: string
  onClose: () => void
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export default function WordStatsPanel({ ceshuId, onClose }: WordStatsPanelProps) {
  const [report, setReport] = useState<CeshuWordStatsReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    window.mbApi.ceshu
      .wordStats({ id: ceshuId })
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

  return (
    <div className="changelog-panel" data-testid="wordstats-panel">
      <div className="changelog-header">
        <span className="chapter-form-title">字数统计与写作建议</span>
        <div className="editor-actions">
          <button type="button" className="btn" data-testid="wordstats-close" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>

      {error && (
        <div className="form-error" data-testid="wordstats-error">
          {error}
        </div>
      )}

      {!report ? (
        <div className="empty">正在统计字数…</div>
      ) : (
        <>
          <div className="changelog-entry" data-testid="wordstats-overview">
            <div className="wordstats-summary">
              总字数：<b>{report.total_words.toLocaleString()}</b> 字 · 工业级 GDD 推荐总字数：约{' '}
              <b>{report.total_target.toLocaleString()}</b> 字 · 整体完成度：<b>{report.overall_percent}%</b>
            </div>
            <div className="wordstats-progress">
              <div
                className={`wordstats-progress-fill ${report.overall_level}`}
                style={{ width: `${Math.min(Math.max(report.overall_percent, 0), 100)}%` }}
              />
            </div>
          </div>

          <div className="changelog-entry">
            <table className="score-table" data-testid="wordstats-table">
              <thead>
                <tr>
                  <th>章节</th>
                  <th>字数</th>
                  <th>工业级标准</th>
                  <th>完成度</th>
                  <th>建议</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => {
                  const [lo, hi] = row.benchmark
                  return (
                    <tr key={row.chapter_key} data-testid="wordstats-row">
                      <td>{row.chapter_label}</td>
                      <td data-testid="wordstats-words">{row.words}</td>
                      <td>
                        {lo}-{hi}
                      </td>
                      <td className={`wordstats-percent ${row.percent_level}`} data-testid="wordstats-percent">
                        {row.percent}%
                      </td>
                      <td style={{ color: row.advice_color }} data-testid="wordstats-advice">
                        {row.advice}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}