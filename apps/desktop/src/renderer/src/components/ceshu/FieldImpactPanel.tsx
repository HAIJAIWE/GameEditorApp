import { useMemo, type ReactElement } from 'react'

import { useT } from '@mobai/client-ui'

import { CHAPTER_LABELS, type CeshuDocument, type ChapterKey } from '@mobai/shared/ceshu/reference'
import { fieldLabelOf } from '@mobai/shared/ceshu/fields'
import { analyzeFieldImpact } from '@mobai/shared/ceshu/workflow'

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
  const t = useT()
  const impact = useMemo(() => analyzeFieldImpact(doc, chapter, field), [doc, chapter, field])
  const direct = impact.docs.filter((item) => item.relation === 'direct')
  const downstream = impact.docs.filter((item) => item.relation === 'downstream')

  return (
    <div className="review-overlay" data-testid="field-impact-overlay" onClick={onClose}>
      <div className="review-panel" data-testid="field-impact-panel" onClick={(event) => event.stopPropagation()}>
        <div className="review-panel-header">
          <span>{t('fieldImpact.title', { label: impact.label })}</span>
          <button type="button" className="btn slim" data-testid="field-impact-close" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>

        <div className="item-meta">
          {CHAPTER_LABELS[chapter]} · <code>{impact.field}</code>
        </div>

        <Section title={t('fieldImpact.mustChange')}>
          {direct.length === 0 ? (
            <div className="item-meta">{t('fieldImpact.noneDirect')}</div>
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
          <Section title={t('fieldImpact.reviewOnly')}>
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
          <Section title={t('fieldImpact.brokenAssertions')}>
            <ul className="impact-list">
              {impact.assertions.map((item) => (
                <li key={`${item.claim}-${item.expr}`}>
                  {t('fieldImpact.assertionClaim', { claim: item.claim })}
                  <code>{item.expr}</code>
                  {t('fieldImpact.assertionHit', { hit: item.hit })}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {impact.splitFields.length > 0 && (
          <Section title={t('fieldImpact.siblingFields')}>
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
          <Section title={t('fieldImpact.dataSide')}>
            <div className="item-meta">{t('fieldImpact.dataSideHint')}</div>
          </Section>
        )}

        {impact.acceptance.length > 0 && (
          <Section title={t('fieldImpact.acceptance')}>
            <ul className="impact-list">
              {impact.acceptance.map((item) => (
                <li key={`${item.docId}-${item.text}`}>
                  {item.text}
                  {item.check === 'assertion' && <span className="field-badge">{t('fieldImpact.badgeAssertion')}</span>}
                  {item.check === 'test' && <span className="field-badge">{t('fieldImpact.badgeTest')}</span>}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  )
}
