import { useT } from '@mobai/client-ui'
import type { FieldIdSuggestion } from '@mobai/shared/util/id'
import type { IdSuggestState } from '../ceshuType'

interface FieldIdSuggestProps {
  /** 当前展开「字段 ID 候选」的状态（调用方已保证 index 与本行一致） */
  suggest: IdSuggestState
  /** 行 index（仅用于 testid 锚定） */
  index: number
  /** 应用某个候选 ID：写入字段名并收起候选条 */
  onApplyName: (id: string) => void
  /** 让 AI 追加候选（仅提案，不写入） */
  onRequestAi: () => void
}

/** 取「AI 候选里不与规则候选重复」的部分 */
function aiOnlyOf(state: IdSuggestState): FieldIdSuggestion[] {
  return state.ai.filter((candidate) => !state.rule.suggestions.some((rule) => rule.id === candidate.id))
}

/**
 * 字段 ID 候选面板（规则层 + 拼音层 + AI 追加），挂载在字段行的「生成/拼音」按钮下方。
 * 单一职责：展示候选、让用户点选应用；所有状态变更都通过回调回传父组件。
 */
export default function FieldIdSuggest({ suggest, index, onApplyName, onRequestAi }: FieldIdSuggestProps) {
  const t = useT()
  const aiOnly = aiOnlyOf(suggest)
  return (
    <div className="te-id-suggest" data-testid={`te-id-suggest-${index}`}>
      {suggest.rule.suggestions.length > 0 && (
        <>
          <span className="te-id-suggest-label">{t('fieldId.candidates')}</span>
          {suggest.rule.suggestions.map((suggestion) => (
            <button
              type="button"
              className="btn slim te-id-suggest-apply"
              key={suggestion.id}
              data-source={suggestion.source}
              data-testid={`te-id-suggest-apply-${index}`}
              onClick={() => onApplyName(suggestion.id)}
            >
              {suggestion.id}
            </button>
          ))}
        </>
      )}

      {suggest.rule.error !== null && (
        <span className="te-id-suggest-error" data-testid={`te-id-suggest-error-${index}`}>
          {suggest.rule.error}
        </span>
      )}

      {suggest.pinyin !== null && suggest.pinyin.suggestions.length > 0 && (
        <>
          <span className="te-id-suggest-label">{t('fieldId.pinyin')}</span>
          {suggest.pinyin.suggestions.map((suggestion) => (
            <button
              type="button"
              className="btn slim te-id-suggest-apply"
              key={`pinyin-${suggestion.id}`}
              data-source={suggestion.source}
              data-testid={`te-id-suggest-apply-${index}`}
              onClick={() => onApplyName(suggestion.id)}
            >
              {suggestion.id}
            </button>
          ))}
        </>
      )}
      {suggest.pinyin !== null && suggest.pinyin.error !== null && (
        <span className="te-id-suggest-error" data-testid={`te-id-suggest-pinyin-error-${index}`}>
          {suggest.pinyin.error}
        </span>
      )}

      {aiOnly.map((suggestion) => (
        <button
          type="button"
          className="btn slim te-id-suggest-apply"
          key={suggestion.id}
          data-source={suggestion.source}
          data-testid={`te-id-suggest-apply-${index}`}
          onClick={() => onApplyName(suggestion.id)}
        >
          {suggestion.id}
        </button>
      ))}

      {suggest.rule.suggestions.some((s) => s.renamedFrom !== null) && (
        <span className="te-id-suggest-note" data-testid={`te-id-suggest-renamed-${index}`}>
          {t('fieldId.renamed', { name: suggest.rule.suggestions[0]?.renamedFrom ?? '' })}
        </span>
      )}
      {suggest.rule.suggestions[0]?.skipped.length ? (
        <span className="te-id-suggest-note" data-testid={`te-id-suggest-skipped-${index}`}>
          {t('fieldId.skippedLead')}
          {suggest.rule.suggestions[0]?.skipped.join('、')}
          {t('fieldId.skippedTail')}
        </span>
      ) : null}

      <button
        type="button"
        className="btn slim"
        data-testid={`te-id-suggest-ai-${index}`}
        disabled={suggest.aiLoading}
        title={t('fieldId.aiTitle')}
        onClick={onRequestAi}
      >
        {suggest.aiLoading ? t('fieldId.aiLoading') : t('fieldId.aiSuggest')}
      </button>
      {suggest.aiError !== null && (
        <span className="te-id-suggest-error" data-testid={`te-id-suggest-ai-error-${index}`}>
          {suggest.aiError}
        </span>
      )}
    </div>
  )
}
