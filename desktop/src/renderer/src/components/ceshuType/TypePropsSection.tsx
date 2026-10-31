import {
  TYPE_TEMPLATE_NAMES,
  TYPE_TEMPLATES,
  type TemplateSectionSuggestion
} from '../../../../shared/schema/core/typeTemplates'
import type { DataTypeDef, TypeFieldDef } from '../../../../shared/types'

/**
 * 「类型属性」整块（类型 ID / 中文名 / 复数键 / 颜色 / 字段模板 / 模板确认条 / 自定义模板）。
 *
 * 从 `TypeEditorPanel.tsx` 原样抽出：这一块是编辑器里最长的一段内联 JSX（模板下拉、
 * 建议分区预览、失联确认条、模板存删），抽出来后主组件只剩状态与动作的编排。
 *
 * ⚠️ 纯展示 + 回调：草稿的增删改仍全部发生在父组件（`draft` / `setDraft` 不进来）。
 * DOM 与 `data-testid`（`te-type-id` / `te-type-name` / `te-type-plural` / `te-type-color` /
 * `te-delete-type` / `te-template` / `te-apply-template` / `te-add-field` / `te-template-sections` /
 * `te-template-confirm*` / `te-template-name` / `te-save-template` / `te-delete-template`）
 * 逐字保留；根元素仍是 `<div className="changelog-entry">`，不包额外 div。
 */
export function TypePropsSection({
  current,
  draft,
  baseIds,
  templateName,
  templateSections,
  customTemplates,
  newTemplateName,
  pendingTemplate,
  isBuiltinTemplate,
  onEditTypeId,
  onUpdateName,
  onUpdate,
  onRemoveType,
  onTemplateNameChange,
  onApplyTemplate,
  onAddField,
  onConfirmTemplate,
  onCancelTemplate,
  onNewTemplateNameChange,
  onSaveAsTemplate,
  onDeleteTemplate
}: {
  /** 当前选中的类型（草稿态） */
  current: DataTypeDef
  /** 全部草稿类型：用于「只剩一个类型时禁止删除」 */
  draft: DataTypeDef[]
  /** 已保存进基线的类型 id：既有类型 ID 锁定（存量条目按 ID 关联） */
  baseIds: ReadonlySet<string>
  /** 模板下拉的当前值 */
  templateName: string
  /** 内置模板的建议分区（自定义模板无此数据 ⇒ null） */
  templateSections: readonly TemplateSectionSuggestion[] | null
  /** 自定义模板名（需读盘，来自主进程） */
  customTemplates: string[]
  /** 「保存当前为模板」的输入框 */
  newTemplateName: string
  /** 待确认的模板替换（有字段会失联时先问一句） */
  pendingTemplate: { name: string; fields: TypeFieldDef[] } | null
  /** 下拉选中的是不是内置模板（内置不允许删除） */
  isBuiltinTemplate: boolean
  /** 手动改类型 ID（记「已手改」，此后中文名不再自动覆盖） */
  onEditTypeId: (newId: string) => void
  /** 改中文名（新建类型且未手改 ID 时顺带填拼音 ID） */
  onUpdateName: (name: string) => void
  /** 改其它属性（复数键 / 颜色） */
  onUpdate: (patch: Partial<DataTypeDef>) => void
  onRemoveType: () => void
  onTemplateNameChange: (name: string) => void
  onApplyTemplate: () => void
  onAddField: () => void
  /** 确认替换（有失联字段时由确认条触发） */
  onConfirmTemplate: (name: string, fields: TypeFieldDef[]) => void
  onCancelTemplate: () => void
  onNewTemplateNameChange: (name: string) => void
  onSaveAsTemplate: () => void
  onDeleteTemplate: () => void
}) {
  return (
    <div className="changelog-entry">
      <div className="form-label">类型属性</div>
      <div className="ai-gen-row">
        <span className="form-label">类型 ID</span>
        <input
          className="form-input"
          data-testid="te-type-id"
          value={current.id}
          readOnly={baseIds.has(current.id)}
          title={baseIds.has(current.id) ? '既有类型的 ID 不可修改（存量条目按 ID 关联）' : ''}
          onChange={(event) => onEditTypeId(event.target.value)}
        />
        <span className="form-label">中文名</span>
        <input
          className="form-input"
          data-testid="te-type-name"
          value={current.name}
          onChange={(event) => onUpdateName(event.target.value)}
        />
      </div>
      <div className="ai-gen-row">
        <span className="form-label">复数键</span>
        <input
          className="form-input"
          data-testid="te-type-plural"
          value={current.pluralKey}
          onChange={(event) => onUpdate({ pluralKey: event.target.value })}
        />
        <span className="form-label">颜色</span>
        <input
          className="form-input te-col-color"
          data-testid="te-type-color"
          value={current.color}
          maxLength={40}
          placeholder="#RRGGBB"
          onChange={(event) => onUpdate({ color: event.target.value })}
        />
        <span className="type-dot" style={{ background: current.color || '#607D8B' }} />
        <button
          type="button"
          className="btn danger"
          data-testid="te-delete-type"
          disabled={draft.length <= 1}
          onClick={onRemoveType}
        >
          删除类型
        </button>
      </div>
      <div className="ai-gen-row">
        <span className="form-label">字段模板</span>
        <select
          className="form-select"
          data-testid="te-template"
          value={templateName}
          onChange={(event) => onTemplateNameChange(event.target.value)}
        >
          <optgroup label="内置模板">
            {TYPE_TEMPLATE_NAMES.map((name) => (
              <option key={name} value={name}>
                {/* 带字段数：光看名字不知道会得到多少字段，也就无法判断是否值得替换 */}
                {name}（{TYPE_TEMPLATES[name]?.length ?? 0} 字段）
              </option>
            ))}
          </optgroup>
          {customTemplates.length > 0 && (
            <optgroup label="自定义模板">
              {customTemplates.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <button type="button" className="btn" data-testid="te-apply-template" onClick={onApplyTemplate}>
          应用模板（替换全部字段）
        </button>
        <button type="button" className="btn" data-testid="te-add-field" onClick={onAddField}>
          添加字段
        </button>
      </div>
      {/*
        建议分区：套用模板后字段会变长，尤其 hp/atk/def 这类战斗数值很容易被并进「基础信息」。
        这里预览模板建议的分组；**应用模板时会把它们写进类型的 `sections`**，
        保存后条目表单即按此分区渲染（优先级高于内置 FORM_GROUPS）。
      */}
      {templateSections !== null && (
        <div className="form-hint-row" data-testid="te-template-sections">
          <span>
            建议分区：
            {templateSections
              .map((section) => `${section.icon} ${section.title}（${section.fields.join(' / ')}）`)
              .join(' ｜ ')}
            <span className="item-meta"> （应用模板后条目表单将按此分区渲染）</span>
          </span>
        </div>
      )}
      {/*
        替换确认：列出会被「藏起来」的字段（数据仍在文件里，只是界面上不再显示）。
        这不是删数据，但用户视角等同于数据消失，所以必须先讲清楚再动手。
      */}
      {pendingTemplate !== null && (
        <div className="form-hint-row" data-testid="te-template-confirm">
          <span>
            模板「{pendingTemplate.name}」不含当前类型的{' '}
            {current.formFields
              .filter((field) => !new Set(pendingTemplate.fields.map((next) => next.name)).has(field.name))
              .map((field) => field.label.replace(/:?\s*$/, ''))
              .join('、')}
            {' '}字段。这些字段已填的数据**仍保存在文件里**，但界面上不再显示，也无法再编辑。
          </span>
          <div className="form-hint-actions">
            <button
              type="button"
              className="btn danger"
              data-testid="te-template-confirm-apply"
              onClick={() => onConfirmTemplate(pendingTemplate.name, pendingTemplate.fields)}
            >
              确认替换
            </button>
            <button type="button" className="btn" data-testid="te-template-confirm-cancel" onClick={onCancelTemplate}>
              取消
            </button>
          </div>
        </div>
      )}
      <div className="ai-gen-row">
        <input
          className="form-input"
          data-testid="te-template-name"
          value={newTemplateName}
          placeholder="模板名称"
          onChange={(event) => onNewTemplateNameChange(event.target.value)}
        />
        <button type="button" className="btn" data-testid="te-save-template" onClick={onSaveAsTemplate}>
          保存当前为模板
        </button>
        <button
          type="button"
          className="btn danger"
          data-testid="te-delete-template"
          disabled={isBuiltinTemplate}
          title={isBuiltinTemplate ? '内置模板不允许删除' : undefined}
          onClick={onDeleteTemplate}
        >
          删除模板
        </button>
      </div>
    </div>
  )
}
