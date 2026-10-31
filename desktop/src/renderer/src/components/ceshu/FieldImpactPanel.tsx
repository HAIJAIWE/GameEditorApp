import { useMemo, type ReactElement } from 'react'

import { CHAPTER_LABELS, type CeshuDocument, type ChapterKey } from '../../../../shared/ceshu/reference'
import { fieldLabelOf } from '../../../../shared/ceshu/fields'
import { analyzeFieldImpact } from '../../../../shared/ceshu/workflow'

/**
 * 字段变更影响面面板（「改这里会影响什么」）。
 *
 * 挂在字段头上的「影响面」按钮打开。回答的是**返工**问题：
 * 改 `combat.damage_formula` 时，哪几份交接文档引用了它、哪条数值断言会失效、
 * 同源的 `_points` / `_notes` 要不要一起改、会不会牵动数据侧。
 *
 * 数据全部来自 `analyzeFieldImpact`（反向索引 `HANDOFF_DOCS.fields`，不新增真源），
 * 本组件只负责呈现，不做任何推断。
 */

interface Props {
  doc: CeshuDocument
  chapter: ChapterKey
  field: string
  onClose: () => void
}

function Section({ title, children }: { title: string; children: React.ReactNode }): ReactElement {
  return (
    <div className="impact-section">
      <h4>{title}</h4>
      {children}
    </div>
  )
}

export default function FieldImpactPanel({ doc, chapter, field, onClose }: Props): ReactElement {
  const impact = useMemo(() => analyzeFieldImpact(doc, chapter, field), [doc, chapter, field])
  const direct = impact.docs.filter((item) => item.relation === 'direct')
  const downstream = impact.docs.filter((item) => item.relation === 'downstream')

  return (
    <div className="review-overlay" data-testid="field-impact-overlay" onClick={onClose}>
      <div className="review-panel" data-testid="field-impact-panel" onClick={(event) => event.stopPropagation()}>
        <div className="review-panel-header">
          <span>改「{impact.label}」会影响什么</span>
          <button type="button" className="btn slim" data-testid="field-impact-close" onClick={onClose}>
            关闭
          </button>
        </div>

        <div className="item-meta">
          {CHAPTER_LABELS[chapter]} · <code>{impact.field}</code>
        </div>

        <Section title="必须改（直接引用）">
          {direct.length === 0 ? (
            <div className="item-meta">没有交接文档直接引用这个字段。</div>
          ) : (
            <ul className="impact-list">
              {direct.map((item) => (
                <li key={item.id}>
                  <code>{item.path}</code> — {item.why}
                </li>
              ))}
            </ul>
          )}
        </Section>

        {downstream.length > 0 && (
          <Section title="复核即可（下游）">
            <ul className="impact-list">
              {downstream.map((item) => (
                <li key={item.id}>
                  <code>{item.path}</code> — {item.why}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {impact.assertions.length > 0 && (
          <Section title="会失效的数值断言">
            <ul className="impact-list">
              {impact.assertions.map((item) => (
                <li key={`${item.claim}-${item.expr}`}>
                  {item.claim}：<code>{item.expr}</code>（命中：{item.hit}）
                </li>
              ))}
            </ul>
          </Section>
        )}

        {impact.splitFields.length > 0 && (
          <Section title="同源字段（通常要一起改）">
            <ul className="impact-list">
              {impact.splitFields.map((key) => (
                <li key={key}>
                  {fieldLabelOf(chapter, key)} <code>{key}</code>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {impact.affectsData && (
          <Section title="数据侧">
            <div className="item-meta">会改变数据表结构：需要重新生成 schema.json 与 data/snapshot.json。</div>
          </Section>
        )}

        {impact.acceptance.length > 0 && (
          <Section title="会重新判定的验收条目">
            <ul className="impact-list">
              {impact.acceptance.map((item) => (
                <li key={`${item.docId}-${item.text}`}>
                  {item.text}
                  {item.check === 'assertion' && <span className="field-badge">断言</span>}
                  {item.check === 'test' && <span className="field-badge">自动测试</span>}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  )
}
