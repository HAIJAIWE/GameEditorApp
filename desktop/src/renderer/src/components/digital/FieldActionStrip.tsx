import { CHAPTER_LABELS } from '../../../../shared/ceshu/reference'
import {
  FIELD_ACTIONS,
  FIELD_ACTION_LABELS,
  FIELD_ACTION_TITLES
} from '../../../../shared/ceshu/fields'
import type { FieldReviewStatus } from '../../../../shared/ceshu/fields'
import {
  requestFieldAction,
  useCeshuFieldFocus,
  type ActiveCeshuField
} from '../../ceshuFieldFocus'

/** 字段审核状态徽标（与 ChapterForm 的徽标同词） */
const STATUS_BADGES: Record<FieldReviewStatus, string> = {
  ai_draft: 'AI 草稿',
  human_edited: '人改',
  approved: '已批准'
}

/**
 * 停靠栏顶部的「当前字段」动作条（人机协作的右半环）。
 *
 * 左边编辑器聚焦某个字段 → 这里显示该字段与四个局部重生成动作；
 * 点击动作 → 经 `ceshuFieldFocus` 桥接到 ChapterForm 执行单字段生成，
 * 结果回填到表单草稿（标记 AI 草稿待审），人核对后保存。
 */
export default function FieldActionStrip() {
  const { active, busy } = useCeshuFieldFocus()

  if (active === null) {
    return (
      <div className="field-action-strip empty" data-testid="field-action-strip-empty">
        <span className="item-meta">点击中间编辑器的任意字段，可在这里对它局部重生成</span>
      </div>
    )
  }

  return (
    <div className="field-action-strip" data-testid="field-action-strip" data-busy={busy ? 'true' : 'false'}>
      <div className="field-action-strip-head">
        <span className="field-action-strip-name" data-testid="field-action-strip-name">
          {fieldTitle(active)}
        </span>
        {active.status !== undefined && (
          <span className={`field-badge ${active.status}`} data-testid="field-action-strip-status">
            {STATUS_BADGES[active.status]}
          </span>
        )}
        {busy && <span className="item-meta">生成中…</span>}
      </div>
      <div className="field-action-strip-actions">
        {FIELD_ACTIONS.map((action) => (
          <button
            key={action}
            type="button"
            className="btn slim"
            data-testid={`field-action-${action}`}
            disabled={busy}
            title={FIELD_ACTION_TITLES[action]}
            onClick={() => requestFieldAction(action)}
          >
            {FIELD_ACTION_LABELS[action]}
          </button>
        ))}
      </div>
    </div>
  )
}

/** 「章节 · 字段」标题（章节标签缺失时退回 key，保证总有可读名称） */
function fieldTitle(field: ActiveCeshuField): string {
  const chapter = CHAPTER_LABELS[field.chapter] ?? field.chapter
  return `${chapter} · ${field.label}`
}
