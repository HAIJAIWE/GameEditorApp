import {
  FIELD_TYPE_LABELS,
  FIELD_TYPES
} from '@mobai/shared/schema/adapters'
import type { DataTypeDef, FieldType, TypeFieldDef } from '@mobai/shared/types'

import { FieldIdSuggest } from '../ceshuField'
import { parseOptionalNumber, refOptions } from '../typeEditorUtils'
import type { IdSuggestState } from './TypeEditorPanel'

/**
 * 「字段列表」整块：每行的字段名 / 生成·拼音 / 显示名 / 控件类型 / 可编辑 /
 * 按类型分支的附加列（可选值 / 数值范围 / 引用类型）+ 行内操作与 ID 候选条。
 *
 * 从 `TypeEditorPanel.tsx` 原样抽出：这一段是编辑器里第二个大块内联 JSX（按字段类型
 * 分三种附加列、每行还挂候选条）。抽出来后父组件只保留草稿状态与「改一行」的动作。
 *
 * ⚠️ 纯展示 + 回调：所有改动都回调给父组件（草稿仍在父组件的 `draft` 里）。
 * DOM 与 `data-testid`（`te-field-${index}` / `te-field-name-*` / `te-field-generate-*` /
 * `te-field-pinyin-*` / `te-field-label-*` / `te-field-type-*` / `te-field-editable-*` /
 * `te-field-values-*` / `te-field-from-*` / `te-field-to-*` / `te-field-ref-*` /
 * `te-field-up-*` / `te-field-down-*` / `te-field-remove-*`）逐字保留。
 * 根元素仍是 `<div className="changelog-entry">`，不包额外 div；
 * `key`（含 `selectedId` / `resetToken`）原样保留 —— 它决定非受控输入何时重挂载。
 */
export function TypeFieldList({
  current,
  draft,
  selectedId,
  resetToken,
  idSuggest,
  onUpdateField,
  onGenerate,
  onPinyin,
  onClearSuggest,
  onRequestAiSuggestions,
  onMoveField,
  onRemoveField
}: {
  /** 当前选中的类型（草稿态） */
  current: DataTypeDef
  /** 全部草稿类型：引用类型下拉的候选来源 */
  draft: DataTypeDef[]
  /** 当前选中类型 id（参与非受控输入的 `key`，切类型时重挂载） */
  selectedId: string
  /** 重置计数（重置 / 新建 / 删除类型时递增，同样参与 `key`） */
  resetToken: number
  /** 当前展开的 ID 候选条（同一时刻只开一行） */
  idSuggest: IdSuggestState | null
  onUpdateField: (index: number, patch: Partial<TypeFieldDef>) => void
  /** 「生成」：术语表/字面量候选（规则层） */
  onGenerate: (index: number) => void
  /** 「拼音」：中文→拼音兜底候选 */
  onPinyin: (index: number) => void
  /** 收起候选条（应用候选后调用） */
  onClearSuggest: () => void
  /** 让 AI 追加候选（只提案不写入） */
  onRequestAiSuggestions: (index: number) => void
  onMoveField: (index: number, delta: -1 | 1) => void
  onRemoveField: (index: number) => void
}) {
  return (
    <div className="changelog-entry">
      <div className="form-label">字段列表（{current.formFields.length}）</div>
      {current.formFields.map((field, index) => {
        const isIdField = field.name === 'id'
        return (
          <div className={`te-field-row${isIdField ? ' locked' : ''}`} key={index} data-testid={`te-field-${index}`}>
            <input
              className="form-input te-col-name"
              data-testid={`te-field-name-${index}`}
              value={field.name}
              readOnly={isIdField}
              title={isIdField ? 'id 字段为系统字段，不可改名/删除' : '字段名（英文/数字/下划线）'}
              onChange={(event) => onUpdateField(index, { name: event.target.value })}
            />
            <button
              type="button"
              className="btn slim"
              data-testid={`te-field-generate-${index}`}
              disabled={isIdField}
              title="由中文显示名生成字段 ID（不覆盖已填内容，先给候选）"
              onClick={() => onGenerate(index)}
            >
              生成
            </button>
            <button
              type="button"
              className="btn slim"
              data-testid={`te-field-pinyin-${index}`}
              disabled={isIdField}
              title="中文→拼音（如「攻击力」→ gong_ji_li），任意汉字可用；不覆盖已填内容"
              onClick={() => onPinyin(index)}
            >
              拼音
            </button>
            <input
              className="form-input te-col-label"
              data-testid={`te-field-label-${index}`}
              value={field.label}
              onChange={(event) => onUpdateField(index, { label: event.target.value })}
            />
            <select
              className="form-select te-col-type"
              data-testid={`te-field-type-${index}`}
              value={field.type}
              disabled={isIdField}
              onChange={(event) => onUpdateField(index, { type: event.target.value as FieldType })}
            >
              {FIELD_TYPES.map((type) => (
                <option key={type} value={type}>
                  {FIELD_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
            <label className="ai-gen-check">
              <input
                type="checkbox"
                data-testid={`te-field-editable-${index}`}
                checked={field.editable}
                disabled={isIdField}
                onChange={(event) => onUpdateField(index, { editable: event.target.checked })}
              />
              可编辑
            </label>

            {(field.type === 'combobox' || field.type === 'template') && (
              <input
                className="form-input te-col-values"
                data-testid={`te-field-values-${index}`}
                key={`values-${selectedId}-${index}-${resetToken}`}
                defaultValue={(field.values ?? []).join(', ')}
                placeholder="可选值（逗号分隔）"
                onChange={(event) =>
                  onUpdateField(index, {
                    values: event.target.value
                      .split(/[,，]/)
                      .map((part) => part.trim())
                      .filter(Boolean)
                  })
                }
              />
            )}

            {(field.type === 'spinbox' || field.type === 'double_spin') && (
              <span className="te-col-range">
                <input
                  className="form-input te-col-num"
                  data-testid={`te-field-from-${index}`}
                  key={`from-${selectedId}-${index}-${resetToken}`}
                  defaultValue={field.from ?? ''}
                  placeholder="下限"
                  onChange={(event) => onUpdateField(index, { from: parseOptionalNumber(event.target.value) })}
                />
                <input
                  className="form-input te-col-num"
                  data-testid={`te-field-to-${index}`}
                  key={`to-${selectedId}-${index}-${resetToken}`}
                  defaultValue={field.to ?? ''}
                  placeholder="上限"
                  onChange={(event) => onUpdateField(index, { to: parseOptionalNumber(event.target.value) })}
                />
              </span>
            )}

            {field.type === 'multiselect' && (
              <select
                className="form-select te-col-ref"
                data-testid={`te-field-ref-${index}`}
                value={field.refType ?? ''}
                onChange={(event) => onUpdateField(index, { refType: event.target.value || undefined })}
              >
                <option value="">（无引用）</option>
                {refOptions(draft, field.refType).map((type) => (
                  <option key={type.id} value={type.pluralKey}>
                    {type.name}（{type.pluralKey}）
                  </option>
                ))}
              </select>
            )}

            <span className="te-field-buttons">
              <button
                type="button"
                className="btn slim"
                data-testid={`te-field-up-${index}`}
                disabled={index === 0 || isIdField}
                title="上移"
                onClick={() => onMoveField(index, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="btn slim"
                data-testid={`te-field-down-${index}`}
                disabled={index === current.formFields.length - 1 || field.name === 'id'}
                title="下移"
                onClick={() => onMoveField(index, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                className="btn slim danger"
                data-testid={`te-field-remove-${index}`}
                disabled={isIdField}
                title={isIdField ? 'id 字段不可删除' : '删除字段'}
                onClick={() => onRemoveField(index)}
              >
                ✕
              </button>
            </span>
            {idSuggest?.index === index && (
              <FieldIdSuggest
                suggest={idSuggest}
                index={index}
                onApplyName={(id) => {
                  onUpdateField(index, { name: id })
                  onClearSuggest()
                }}
                onRequestAi={() => onRequestAiSuggestions(index)}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
