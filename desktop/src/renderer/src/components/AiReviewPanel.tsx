import { useState } from 'react'

import {
  buildReviewMarkdown,
  REVIEW_DIMENSION_KEYS,
  REVIEW_DIMENSION_LABELS,
  type CeshuAiReviewResult
} from '../../../shared/ceshu/ceshuAi'
import { formatLocalTimestamp } from '../../../shared/ceshu/ceshuModel'

/**
 * AI 智能审阅面板（对应 Python AIReviewDialog）：
 * - 5 维度评分条（≥8 绿 / ≥5 蓝 / ≥3 琥珀 / 其余红）+ 每维反馈 + 总体评价 + Top 3 建议
 * - 解析失败时展示原始回复（Python 仅提示「解析失败」，TS 保留原文便于排查）
 * - 导出 Markdown 审阅报告（渲染层生成文本 → 主进程原子写盘）
 */

interface AiReviewPanelProps {
  ceshuId: string
  gameName: string
  onClose: () => void
}

/** 分数着色级别（0 分未审阅 → 使用默认灰色） */
function scoreLevel(score: number): string {
  if (score <= 0) return ''
  if (score >= 8) return 'hi'
  if (score >= 5) return 'mid'
  if (score >= 3) return 'low'
  return 'fail'
}

export default function AiReviewPanel({ ceshuId, gameName, onClose }: AiReviewPanelProps) {
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'failed'>('idle')
  const [result, setResult] = useState<CeshuAiReviewResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const handleStart = async (): Promise<void> => {
    setStatus('running')
    setError(null)
    setNotice(null)
    try {
      const reviewed = await window.mbApi.ceshu.aiReview({ id: ceshuId })
      setResult(reviewed)
      setStatus('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('failed')
    }
  }

  const handleExport = async (): Promise<void> => {
    if (!result) return
    try {
      setError(null)
      setNotice(null)
      const chosen = await window.mbApi.dialog.chooseCeshuExportFile({
        format: 'markdown',
        defaultName: `${gameName}-AI审阅报告`
      })
      if (!chosen.path) return
      const markdown = buildReviewMarkdown(gameName, formatLocalTimestamp(), result)
      const exported = await window.mbApi.ceshu.exportReviewReport({ path: chosen.path, content: markdown })
      setNotice(`审阅报告已导出：${exported.filePath}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="changelog-panel" data-testid="ai-review-panel">
      <div className="changelog-header">
        <span className="chapter-form-title">AI 智能审阅（5 维度评分 + Top 3 建议）</span>
        <div className="editor-actions">
          <button
            type="button"
            className="btn primary"
            data-testid="ai-review-start"
            disabled={status === 'running'}
            onClick={() => void handleStart()}
          >
            {status === 'running' ? '审阅中…' : '开始 AI 审阅'}
          </button>
          <button
            type="button"
            className="btn"
            data-testid="ai-review-export"
            disabled={!result?.parsed}
            onClick={() => void handleExport()}
          >
            导出 Markdown
          </button>
          <button type="button" className="btn" data-testid="ai-review-close" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>

      <div className="item-meta">
        《{gameName}》 — 内容完整性 / 逻辑一致性 / 市场可行性 / 技术可行性 / 创意度
      </div>
      {status === 'running' && (
        <div className="changelog-entry" data-testid="ai-review-status">
          正在调用 AI 进行结构化审阅，请稍候…
        </div>
      )}
      {status === 'done' && (
        <div className="changelog-entry" data-testid="ai-review-status">
          ✅ 审阅完成
        </div>
      )}
      {status === 'failed' && (
        <div className="form-error" data-testid="ai-review-error">
          {error}
        </div>
      )}
      {notice && (
        <div className="notice-banner" data-testid="ai-review-notice">
          {notice}
        </div>
      )}

      <div className="changelog-entry">
        <div className="form-label">评分维度</div>
        {REVIEW_DIMENSION_KEYS.map((key) => {
          const dim = result?.dimensions.find((item) => item.key === key)
          const score = dim?.score ?? 0
          const level = scoreLevel(score)
          return (
            <div className="review-dim-row" key={key} data-testid={`ai-review-dim-${key}`}>
              <span className="review-dim-label">{REVIEW_DIMENSION_LABELS[key]}</span>
              <div className="review-dim-track">
                <div className={`review-dim-fill ${level}`} style={{ width: `${score * 10}%` }} />
              </div>
              <span className={`review-dim-score ${level}`} data-testid={`ai-review-score-${key}`}>
                {score} / 10
              </span>
              {dim?.feedback && <div className="review-dim-feedback">{dim.feedback}</div>}
            </div>
          )
        })}
      </div>

      {result?.parsed && (
        <>
          <div className="changelog-entry">
            <div className="form-label">总体评价</div>
            <div data-testid="ai-review-overall">{result.overall || '（无）'}</div>
          </div>
          <div className="changelog-entry">
            <div className="form-label">Top 3 改进建议</div>
            {result.suggestions.map((suggestion, index) => (
              <div
                className="score-suggestion"
                key={`${index}:${suggestion}`}
                data-testid={`ai-review-suggestion-${index}`}
              >
                {index + 1}. {suggestion}
              </div>
            ))}
          </div>
          <div className="item-meta" data-testid="ai-review-meta">
            完成进度 {Math.round(result.progressTotal * 100)}% · 内置校验问题 {result.validationCount} 个 · 模型{' '}
            {result.model || '—'}
          </div>
        </>
      )}

      {result && !result.parsed && (
        <div className="changelog-entry" data-testid="ai-review-raw">
          <div className="form-label">AI 返回内容解析失败，原始回复如下（可重试）：</div>
          <pre className="attr-live-process">{result.rawText}</pre>
        </div>
      )}
    </div>
  )
}