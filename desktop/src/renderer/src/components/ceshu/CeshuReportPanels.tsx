import type { ChapterKey } from '../../../../shared/ceshu/reference/ceshuConstants'
import type { CeshuChangelog } from '../../../../shared/ceshu/workflow/ceshuDiff'
import { fieldLabelOf } from '../../../../shared/ceshu/fields/ceshuFields'
import type { CeshuReadinessReport } from '../../../../shared/ceshu/readiness/ceshuReadiness'
import {
  VALIDATION_SEVERITY_LABELS,
  groupValidationMessages,
  summarizeValidation
} from '../../../../shared/ceshu/validation/ceshuValidationGroups'
import { resolveValidationTarget } from '../../../../shared/ceshu/validation/ceshuValidationJump'
import { groupByChapter } from '../ceshuViewUtils'

/**
 * 策划书编辑器的三块「报告」视图（变更记录 / 数据校验 / 完备度）。
 *
 * 从 `CeshuView.tsx` 原样抽出：三者都是**自足的只读报告 UI**——只依赖各自的数据对象与
 * 「导出 / 关闭」两个回调，不碰编辑器的章节/表单状态。原先它们以大段内联 JSX 混在
 * `CeshuView` 的面板三元链里，把编辑器主体撑到近千行；抽出后 `CeshuView` 回到「导航 + 表单 + 数据预览」的编排角色。
 *
 * ⚠️ className / data-testid / disabled 判定全部**原样保留** —— 有既有 E2E 直接命中
 * （`ceshu.spec.ts` 等）。改这些等于改测试契约，不是本次重构范围。
 * 例外：`ValidatePanel` 的可跳转问题行是 `<button data-testid="validate-jump">`，
 * 与纯文本行的 `validate-item` 靠共同的 `data-validate-item` 属性统一计数；
 * 能定位到字段的行额外带 `data-field`（宿主据此切章 + 表单聚焦）。
 *
 * 2026-10-27：`ScorePanel`（结构 30+质量 40+市场 30+总分+等级+编造的行业均值）
 * 整体替换为 `ReadinessPanel`（必填覆盖 + 逐章缺口 + **有出处**的参照对比）。
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

/** 数据校验：按「必须修复 / 建议检查」分组展示（必填、格式、冲突、依赖、不一致、重复、术语） */
export function ValidatePanel({
  validateErrors,
  onExport,
  onClose,
  onJumpChapter,
  onJumpField
}: {
  validateErrors: string[]
  onExport: () => void
  onClose: () => void
  /**
   * 点击「能定位到章节」的问题行时回调章节 key（由宿主负责切章 + 关面板）。
   * 可选：不传则所有问题行退化为纯文本，保持只读语义。
   */
  onJumpChapter?: (chapter: ChapterKey) => void
  /**
   * 点击「能定位到字段」的问题行时回调（章 + 字段 key）：宿主切章后还应把表单滚到该字段。
   * 比 `onJumpChapter` 更精确——`必填缺失` 这类问题本来就指向单个字段，只跳章等于让人再翻一遍。
   * 可选：不传则退化成章节级跳转（若 `onJumpChapter` 也没传，则整行不可点）。
   */
  onJumpField?: (chapter: ChapterKey, field: string) => void
}) {
  const groups = groupValidationMessages(validateErrors)
  const summary = summarizeValidation(validateErrors)
  return (
    <div className="changelog-panel" data-testid="validate-panel">
      <div className="changelog-header">
        <span className="chapter-form-title">
          {/* 标题保留「个问题」字样：既有 e2e（ceshu-validate-readiness.spec.ts）以此断言面板已出结果 */}
          数据校验{validateErrors.length > 0 ? `（${validateErrors.length} 个问题：${summary}）` : ''}
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
          {groups.map((group) => (
            <div
              key={`${group.severity}:${group.kind}`}
              className={`validate-group ${group.severity}`}
              data-testid="validate-group"
              data-severity={group.severity}
              data-kind={group.kind}
            >
              <div className="validate-group-title">
                {group.severity === 'error' ? '⛔' : '⚠'} {VALIDATION_SEVERITY_LABELS[group.severity]} · {group.label}（
                {group.items.length}）
              </div>
              {group.items.map((item, index) => {
                // 先解析出「章 + 字段」：能定位到字段就跳字段（更省事），否则退化成只跳章；
                // 两者都定位不到才渲染纯文本（点了没反应的链接比不可点更误导）
                const target =
                  onJumpChapter !== undefined || onJumpField !== undefined
                    ? resolveValidationTarget(item.message)
                    : null
                if (target !== null && target.field !== null && onJumpField !== undefined) {
                  const field = target.field
                  return (
                    <button
                      key={`${index}:${item.message}`}
                      type="button"
                      className="validate-line validate-line-link"
                      data-testid="validate-jump"
                      data-chapter={target.chapter}
                      data-field={field}
                      data-validate-item="true"
                      onClick={() => onJumpField(target.chapter, field)}
                    >
                      · {item.message}
                    </button>
                  )
                }
                const chapter = target !== null ? target.chapter : null
                if (chapter !== null && onJumpChapter !== undefined) {
                  return (
                    <button
                      key={`${index}:${item.message}`}
                      type="button"
                      className="validate-line validate-line-link"
                      data-testid="validate-jump"
                      data-chapter={chapter}
                      data-validate-item="true"
                      onClick={() => onJumpChapter(chapter)}
                    >
                      · {item.message}
                    </button>
                  )
                }
                return (
                  <div
                    key={`${index}:${item.message}`}
                    className="validate-line"
                    data-testid="validate-item"
                    data-validate-item="true"
                  >
                    · {item.message}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * 策划书完备度：必填覆盖（立项 / 研发 / 发行）+ 逐章缺口 + 有出处的参照对比。
 *
 * 替代旧的「质量评分」面板（结构 30 + 质量 40 + 市场 30 + 总分 + 等级 + 行业均值）。
 * 改动理由：100 分制是三个拍出来的权重，既无行动力、其「行业均值」还属编造；
 * 完备度用**有明确分母**的必填覆盖说话，且每个缺口都能定位到章节。
 */
export function ReadinessPanel({
  readiness,
  onExport,
  onClose,
  onJumpField
}: {
  readiness: CeshuReadinessReport | null
  onExport: () => void
  onClose: () => void
  /**
   * 点「缺失必填」里的字段名 → 切到该章并把表单滚到该字段。
   * 可选：不传则缺失字段退化为纯文本（只读报告）。
   */
  onJumpField?: (chapter: ChapterKey, field: string) => void
}) {
  const pct = (value: number): string => `${Math.round(value * 100)}%`
  return (
    <div className="changelog-panel" data-testid="readiness-panel">
      <div className="changelog-header">
        <span className="chapter-form-title">完备度</span>
        <div className="editor-actions">
          <button
            type="button"
            className="btn"
            data-testid="readiness-export"
            disabled={!readiness}
            onClick={onExport}
          >
            导出完备度报告
          </button>
          <button type="button" className="btn" data-testid="readiness-close" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
      {!readiness ? (
        <div className="empty">正在统计…</div>
      ) : (
        <>
          <div className="changelog-entry">
            <div className="score-total">
              <span className="score-total-value">{pct(readiness.concept.ratio)}</span>
              <span className="score-total-grade">
                立项必填 {readiness.concept.required_filled}/{readiness.concept.required_total}
              </span>
            </div>
            <div className="score-dimensions">
              <span>
                立项 {readiness.concept.required_filled}/{readiness.concept.required_total}
              </span>
              <span>
                研发 {readiness.production.required_filled}/{readiness.production.required_total}
              </span>
              <span>
                发行 {readiness.release.required_filled}/{readiness.release.required_total}
              </span>
            </div>
            <div className="item-meta">
              全文必填 {readiness.total_required - readiness.total_missing}/{readiness.total_required}（
              {pct(readiness.total_ratio)}），还差 {readiness.total_missing} 项
            </div>
          </div>

          <div className="changelog-entry">
            <div className="form-label">下一步</div>
            {readiness.next_steps.map((step, index) => (
              <div key={`${index}:${step}`} className="score-suggestion">
                {step}
              </div>
            ))}
          </div>

          <div className="changelog-entry">
            <div className="form-label">
              逐章缺口（按缺口数降序，优先补多的{onJumpField !== undefined ? '；点字段名直接跳过去' : ''}）
            </div>
            <table className="score-table">
              <thead>
                <tr>
                  <th>章节</th>
                  <th>必填</th>
                  <th>字数</th>
                  <th>完成度</th>
                  <th>缺失必填</th>
                </tr>
              </thead>
              <tbody>
                {[...readiness.chapters]
                  .sort((a, b) => b.missing_required.length - a.missing_required.length)
                  .map((chapter) => (
                    <tr key={chapter.chapter_key}>
                      <td>{chapter.chapter_label}</td>
                      <td>
                        {chapter.required_filled}/{chapter.required_total}
                      </td>
                      <td>{chapter.word_count}</td>
                      <td>{pct(chapter.completion)}</td>
                      <td>
                        {chapter.missing_required.length === 0
                          ? '—'
                          : chapter.missing_required.map((field, index) => (
                              <span key={field}>
                                {index > 0 && '、'}
                                {onJumpField === undefined ? (
                                  /* 中文标签优先：裸 key（positioning / core_fantasy）人读起来要二次翻译 */
                                  fieldLabelOf(chapter.chapter_key, field)
                                ) : (
                                  <button
                                    type="button"
                                    className="btn-link"
                                    data-testid="readiness-missing-field"
                                    data-chapter={chapter.chapter_key}
                                    data-field={field}
                                    onClick={() => onJumpField(chapter.chapter_key, field)}
                                  >
                                    {fieldLabelOf(chapter.chapter_key, field)}
                                  </button>
                                )}
                              </span>
                            ))}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {readiness.references.length > 0 && (
            <div className="changelog-entry" data-testid="readiness-references">
              <div className="form-label">参照文档对比（有出处）</div>
              <div className="item-meta">只比立项阶段同一批必填字段；合成样例已标注，不可当行业基准</div>
              <table className="score-table">
                <thead>
                  <tr>
                    <th>参照文档</th>
                    <th>出处类型</th>
                    <th>覆盖</th>
                    <th>你的覆盖</th>
                    <th>差距</th>
                  </tr>
                </thead>
                <tbody>
                  {readiness.references.map((reference) => (
                    <tr key={reference.id}>
                      <td>{reference.title}</td>
                      <td>{reference.kindLabel}</td>
                      <td>
                        {reference.covered}/{reference.total}（{pct(reference.ratio)}）
                      </td>
                      <td>{reference.docCovered}</td>
                      <td>
                        {reference.delta >= 0 ? '+' : ''}
                        {reference.delta}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="item-meta">
                {readiness.references.map((reference) => (
                  <div key={`src:${reference.id}`}>
                    {reference.title}：{reference.attribution}
                    {reference.url ? ` — ${reference.url}` : reference.path ? ` — ${reference.path}` : ''}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
