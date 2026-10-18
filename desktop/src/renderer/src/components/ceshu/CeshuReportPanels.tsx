import type { CeshuChangelog } from '../../../../shared/ceshuDiff'
import { gradeLabel, type CeshuScoreReport } from '../../../../shared/ceshuScorer'
import { groupByChapter } from '../ceshuViewUtils'

/**
 * 策划书编辑器的三块「报告」视图（变更记录 / 数据校验 / 质量评分）。
 *
 * 从 `CeshuView.tsx` 原样抽出：三者都是**自足的只读报告 UI**——只依赖各自的数据对象与
 * 「导出 / 关闭」两个回调，不碰编辑器的章节/表单状态。原先它们以大段内联 JSX 混在
 * `CeshuView` 的面板三元链里，把编辑器主体撑到近千行；抽出后 `CeshuView` 回到「导航 + 表单 + 数据预览」的编排角色。
 *
 * ⚠️ className / data-testid / disabled 判定全部**原样保留** —— 有既有 E2E 直接命中
 * （`ceshu.spec.ts` 等）。改这些等于改测试契约，不是本次重构范围。
 */

/** 变更记录（同链版本按时间逐对 diff）；导出格式 MD / HTML / Text */
export function ChangelogPanel({
  changelog,
  onExport,
  onClose
}: {
  changelog: CeshuChangelog
  onExport: (format: 'md' | 'html' | 'text') => void
  onClose: () => void
}) {
  return (
    <div className="changelog-panel" data-testid="changelog-panel">
      <div className="changelog-header">
        <span className="chapter-form-title">变更记录（{changelog.entries.length} 次版本变更）</span>
        <div className="editor-actions">
          <button
            type="button"
            className="btn"
            data-testid="changelog-export-md"
            disabled={changelog.entries.length === 0}
            onClick={() => onExport('md')}
          >
            导出 Markdown
          </button>
          <button
            type="button"
            className="btn"
            data-testid="changelog-export-html"
            disabled={changelog.entries.length === 0}
            onClick={() => onExport('html')}
          >
            导出 HTML
          </button>
          <button
            type="button"
            className="btn"
            data-testid="changelog-export-text"
            disabled={changelog.entries.length === 0}
            onClick={() => onExport('text')}
          >
            导出 Text
          </button>
          <button type="button" className="btn" data-testid="changelog-close" onClick={onClose}>
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
  )
}

/** 数据校验：必填字段 + 章节间一致性检查的问题清单 */
export function ValidatePanel({
  validateErrors,
  onExport,
  onClose
}: {
  validateErrors: string[]
  onExport: () => void
  onClose: () => void
}) {
  return (
    <div className="changelog-panel" data-testid="validate-panel">
      <div className="changelog-header">
        <span className="chapter-form-title">
          数据校验{validateErrors.length > 0 ? `（${validateErrors.length} 个问题）` : ''}
        </span>
        <div className="editor-actions">
          <button type="button" className="btn" data-testid="validate-export" onClick={onExport}>
            导出校验报告
          </button>
          <button type="button" className="btn" data-testid="validate-close" onClick={onClose}>
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
  )
}

/** 质量评分：结构 30 + 质量 40 + 市场 30（含总分、行业对比与改进建议） */
export function ScorePanel({
  score,
  onExport,
  onClose
}: {
  score: CeshuScoreReport | null
  onExport: () => void
  onClose: () => void
}) {
  return (
    <div className="changelog-panel" data-testid="score-panel">
      <div className="changelog-header">
        <span className="chapter-form-title">质量评分</span>
        <div className="editor-actions">
          <button type="button" className="btn" data-testid="score-export" disabled={!score} onClick={onExport}>
            导出评分报告
          </button>
          <button type="button" className="btn" data-testid="score-close" onClick={onClose}>
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
  )
}