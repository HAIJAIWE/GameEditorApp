import { useState } from 'react'

import { useT } from '@mobai/client-ui'
import {
  ADVERSARIAL_LEVEL_LABELS,
  buildReviewMarkdown,
  countFindings,
  type AdversarialFinding,
  type CeshuAiReviewResult
} from '@mobai/shared/ceshu/prompts'
import { formatLocalTimestamp } from '@mobai/shared/ceshu/model'
import { useStopIntent } from '../../hooks/useStopIntent'

/**
 * 成稿反审面板（2026-10-26 由「5 维度评分」改为「7 项反审核查清单」）：
 * - 7 项固定清单：每项显示 **判定徽章（阻塞/建议/通过）+ 该品类追问 + AI 依据**
 * - 顶部显示本次采用的品类档案与「阻塞 N / 建议 M」结论——评分换成判定，直接指向动作
 * - 解析失败时展示原始回复（保留原文便于排查）
 * - 导出 Markdown 反审报告（渲染层生成文本 → 主进程原子写盘）
 */

interface AiReviewPanelProps {
  ceshuId: string
  gameName: string
  onClose: () => void
}

/** 判定 → 徽章样式级别 */
function levelClass(level: AdversarialFinding['level']): string {
  if (level === 'blocker') return 'blocker'
  if (level === 'suggestion') return 'suggestion'
  return 'pass'
}

export default function AiReviewPanel({ ceshuId, gameName, onClose }: AiReviewPanelProps) {
  const t = useT()
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'failed'>('idle')
  const [result, setResult] = useState<CeshuAiReviewResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [stopped, setStopped] = useState(false)
  const stopIntent = useStopIntent()

  const handleStart = async (): Promise<void> => {
    setStatus('running')
    setError(null)
    setNotice(null)
    setStopped(false)
    try {
      const reviewed = await window.mbApi.ceshu.aiReview({ id: ceshuId })
      setResult(reviewed)
      setStatus('done')
    } catch (err) {
      // 用户点了停止 ⇒ 这是预期结果，不是故障（不弹红色错误、不把状态记成 failed）
      if (stopIntent.wasStopped()) {
        setStopped(true)
        setStatus('idle')
        return
      }
      setError(err instanceof Error ? err.message : String(err))
      setStatus('failed')
    } finally {
      stopIntent.settle()
    }
  }

  const handleExport = async (): Promise<void> => {
    if (!result) return
    try {
      setError(null)
      setNotice(null)
      const chosen = await window.mbApi.dialog.chooseCeshuExportFile({
        format: 'markdown',
        defaultName: t('aiReview.exportName', { game: gameName })
      })
      if (!chosen.path) return
      const markdown = buildReviewMarkdown(gameName, formatLocalTimestamp(), result)
      const exported = await window.mbApi.ceshu.exportReviewReport({ path: chosen.path, content: markdown })
      setNotice(t('aiReview.exported', { path: exported.filePath }))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const counts = countFindings(result?.findings ?? [])
  const verdict = result?.parsed
    ? counts.blockers > 0
      ? t('aiReview.verdictBlockers', { count: counts.blockers })
      : counts.suggestions > 0
        ? t('aiReview.verdictSuggestions', { count: counts.suggestions })
        : t('aiReview.verdictClean')
    : ''

  return (
    <div className="changelog-panel" data-testid="ai-review-panel">
      <div className="changelog-header">
        <span className="chapter-form-title">{t('aiReview.title')}</span>
        <div className="editor-actions">
          <button
            type="button"
            className="btn primary"
            data-testid="ai-review-start"
            disabled={status === 'running'}
            onClick={() => void handleStart()}
          >
            {status === 'running' ? t('aiReview.running') : t('aiReview.start')}
          </button>
          {status === 'running' && (
            <button type="button" className="btn" data-testid="ai-review-stop" onClick={stopIntent.markStop}>
              {t('aiReview.stop')}
            </button>
          )}
          <button
            type="button"
            className="btn"
            data-testid="ai-review-export"
            disabled={!result?.parsed}
            onClick={() => void handleExport()}
          >
            {t('aiReview.export')}
          </button>
          <button type="button" className="btn" data-testid="ai-review-close" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>

      <div className="item-meta" data-testid="ai-review-context">
        《{gameName}》
        {result?.genreLabel ? t('aiReview.genreSuffix', { label: result.genreLabel }) : ''}
        {result?.rulesetId ? t('aiReview.rulesetSuffix', { id: result.rulesetId }) : ''}
        {verdict ? ` · ${verdict}` : ''}
      </div>
      {status === 'running' && (
        <div className="changelog-entry" data-testid="ai-review-status">
          {t('aiReview.statusRunning')}
        </div>
      )}
      {status === 'done' && (
        <div className="changelog-entry" data-testid="ai-review-status">
          {t('aiReview.statusDone')}
        </div>
      )}
      {stopped && (
        <div className="notice-banner inline" data-testid="ai-review-stopped">
          {t('aiReview.stopped')}
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

      {result?.parsed && (
        <>
          <div className="changelog-entry">
            <div className="form-label">{t('aiReview.checksTitle')}</div>
            {result.findings.map((finding) => {
              const level = levelClass(finding.level)
              return (
                <div className="review-check-row" key={finding.key} data-testid={`ai-review-check-${finding.key}`}>
                  <span className={`review-check-badge ${level}`} data-testid={`ai-review-level-${finding.key}`}>
                    {ADVERSARIAL_LEVEL_LABELS[finding.level]}
                  </span>
                  <div className="review-check-body">
                    <span className="review-check-label">{finding.label}</span>
                    {finding.probe && (
                      <div className="review-check-probe">{t('aiReview.probe', { text: finding.probe })}</div>
                    )}
                    {finding.evidence && <div className="review-check-evidence">{finding.evidence}</div>}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="changelog-entry">
            <div className="form-label">{t('aiReview.overallTitle')}</div>
            <div data-testid="ai-review-overall">{result.overall || t('aiReview.none')}</div>
          </div>
          <div className="changelog-entry">
            <div className="form-label">{t('aiReview.suggestionsTitle')}</div>
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
            {t('aiReview.meta', {
              progress: Math.round(result.progressTotal * 100),
              count: result.validationCount,
              model: result.model || '—'
            })}
          </div>
        </>
      )}

      {result && !result.parsed && (
        <div className="changelog-entry" data-testid="ai-review-raw">
          <div className="form-label">{t('aiReview.rawTitle')}</div>
          <pre className="attr-live-process">{result.rawText}</pre>
        </div>
      )}
    </div>
  )
}
