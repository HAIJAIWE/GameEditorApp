import { useEffect, useMemo, useState } from 'react'

import { suggestFieldIds, type FieldIdSuggestion, type SuggestFieldIdResult } from '../../../shared/fieldId'
import { chineseToPinyin, suggestPinyinFieldId } from '../../../shared/pinyinFieldId'
import {
  FIELD_ID_AI_ERROR_EMPTY_LABEL,
  FIELD_ID_AI_ERROR_NO_CANDIDATE
} from '../../../shared/fieldIdAi'
import { FIELD_TYPE_LABELS, FIELD_TYPES, validateTypeSchema } from '../../../shared/typeSchemaFile'
import { TYPE_TEMPLATE_NAMES, TYPE_TEMPLATES, buildNewTypeDraft } from '../../../shared/typeTemplates'
import type { DataTypeDef, FieldType, TypeFieldDef } from '../../../shared/types'

/**
 * 数据表字段结构编辑器（对应 Python type_editor_dialog 核心切片）：
 * - 类型：新建 / 删除 / 名称·复数键·颜色编辑（既有类型的 ID 锁定，避免存量条目失联）
 * - 字段：增删 / 排序 / 名称·标签·控件类型·可编辑·可选值·数值范围·引用类型
 * - 模板：7 套内置字段模板整体替换；保存前领域校验；保存走 IPC（主进程原子写 type_schema.json）
 * - 字段 ID 生成：两条独立路子 —— **英译**（术语表，`shared/fieldId.ts`）+ **拼音**（`shared/pinyinFieldId.ts`）
 * - 新建类型的 ID：随中文名自动填拼音（对齐 Python `type_editor_dialog.add_type`，仅当 ID 未被手改）
 * 明确未迁移：布局分区编辑、AI 推荐字段/分析数据/联网参考（属 AI 域，见 roadmap E42/E56）。
 */

interface TypeEditorPanelProps {
  /** 当前已保存的 schema（基线，用于重置/判断新类型） */
  types: DataTypeDef[]
  /** 打开时预选的类型 id（由条目表单的「编辑当前类型字段结构」传入）；不传则选第一个类型 */
  initialTypeId?: string
  onSaved: (types: DataTypeDef[]) => void
  onClose: () => void
}

/** 字段 ID 候选条的状态：规则层结果 + 拼音候选 + AI 追加的候选 */
interface IdSuggestState {
  index: number
  /** 规则层（术语表命中 + 标签内英文数字提取），「生成」按钮产生 */
  rule: SuggestFieldIdResult
  /** 拼音层（中文→拼音兜底），「拼音」按钮产生；未请求时为 null */
  pinyin: SuggestFieldIdResult | null
  /** AI 追加的候选（未请求时为空数组） */
  ai: FieldIdSuggestion[]
  aiLoading: boolean
  aiError: string | null
}

/** 取「AI 候选里不与规则候选重复」的部分 */
function aiOnlyOf(state: IdSuggestState): FieldIdSuggestion[] {
  return state.ai.filter(
    (candidate) => !state.rule.suggestions.some((rule) => rule.id === candidate.id)
  )
}

export default function TypeEditorPanel({ types, initialTypeId, onSaved, onClose }: TypeEditorPanelProps) {
  const [draft, setDraft] = useState<DataTypeDef[]>(() => structuredClone(types))
  const [selectedId, setSelectedId] = useState<string>(() =>
    initialTypeId !== undefined && types.some((def) => def.id === initialTypeId)
      ? initialTypeId
      : (types[0]?.id ?? '')
  )
  const [templateName, setTemplateName] = useState(TYPE_TEMPLATE_NAMES[0] ?? '')
  const [errors, setErrors] = useState<string[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [resetToken, setResetToken] = useState(0)
  /** 当前展开「字段 ID 候选」的行及状态（同一时刻只开一个） */
  const [idSuggest, setIdSuggest] = useState<IdSuggestState | null>(null)
  /** 用户自定义字段模板名（内置模板在 `TYPE_TEMPLATES` 常量里，自定义需读盘） */
  const [customTemplates, setCustomTemplates] = useState<string[]>([])
  const [newTemplateName, setNewTemplateName] = useState('')
  /**
   * 被用户**手动改过 ID** 的类型（用于抑制「中文名 → 拼音 ID」自动填充，
   * 对齐 Python `add_type` 里的 `tid_edit.isModified()` 判定）。
   */
  const [manualTypeIds, setManualTypeIds] = useState<readonly string[]>([])

  useEffect(() => {
    let alive = true
    window.mbApi.schema
      .listFieldTemplates()
      .then((result) => {
        if (alive) setCustomTemplates(result.custom)
      })
      .catch(() => undefined) // 拉取失败不阻塞编辑器（模板是辅助功能）
    return () => {
      alive = false
    }
  }, [])

  const isBuiltinTemplate = TYPE_TEMPLATE_NAMES.includes(templateName)

  const baseIds = useMemo(() => new Set(types.map((def) => def.id)), [types])
  const current = draft.find((def) => def.id === selectedId) ?? null

  const bumpReset = (): void => setResetToken((token) => token + 1)

  const updateType = (patch: Partial<DataTypeDef>): void => {
    if (!current) return
    setDraft((prev) => prev.map((def) => (def.id === current.id ? { ...def, ...patch } : def)))
  }

  /** 新建类型支持改 ID：同步更新选中项 */
  const renameType = (newId: string): void => {
    if (!current) return
    const oldId = current.id
    setDraft((prev) => prev.map((def) => (def.id === oldId ? { ...def, id: newId } : def)))
    setSelectedId(newId)
  }

  /** 用户手动编辑类型 ID：记「已手改」，此后中文名不再自动覆盖它 */
  const editTypeId = (newId: string): void => {
    if (!current) return
    setManualTypeIds((prev) => (prev.includes(newId) ? prev : [...prev, newId]))
    renameType(newId)
  }

  /**
   * 编辑中文名：**新建类型**（尚未保存进 `types` 基线）且其 ID 未被手改时，
   * 同步把 ID 填成拼音，对齐 Python `type_editor_dialog.add_type` 的
   * `tname_edit.textChanged → tid_edit.setText(_chinese_to_pinyin(...))`。
   * 既有类型的 ID 已锁定（输入框 readOnly），绝不自动改。
   */
  const updateTypeName = (name: string): void => {
    if (!current) return
    const canAutofill = !baseIds.has(current.id) && !manualTypeIds.includes(current.id)
    const autoId = canAutofill ? chineseToPinyin(name) : ''
    if (autoId !== '' && autoId !== current.id) {
      const oldId = current.id
      setDraft((prev) => prev.map((def) => (def.id === oldId ? { ...def, name, id: autoId } : def)))
      setSelectedId(autoId)
      return
    }
    updateType({ name })
  }

  const updateField = (index: number, patch: Partial<TypeFieldDef>): void => {
    if (!current) return
    const fields = current.formFields.map((field, i) => (i === index ? { ...field, ...patch } : field))
    updateType({ formFields: fields })
  }

  const addField = (): void => {
    if (!current) return
    const used = new Set(current.formFields.map((field) => field.name))
    let index = 1
    while (used.has(`field_${index}`)) index++
    updateType({
      formFields: [...current.formFields, { name: `field_${index}`, label: '新字段:', type: 'entry', editable: true }]
    })
  }

  const removeField = (index: number): void => {
    if (!current) return
    if (current.formFields[index]?.name === 'id') return
    updateType({ formFields: current.formFields.filter((_, i) => i !== index) })
  }

  /**
   * 由该行的中文显示名生成字段 ID 候选。
   * 现有字段名用于避开重名，**排除本行自身**（否则把「保持原名」误判为重名）。
   */
  /** 该行的「显示名 + 其它字段名」，供两层候选共用 */
  const fieldIdContext = (index: number): { label: string; others: string[] } => {
    const fields = current?.formFields ?? []
    return {
      label: fields[index]?.label ?? '',
      others: fields.filter((_, i) => i !== index).map((field) => field.name)
    }
  }

  /** 打开/更新候选条：同一行则合并状态，换行则重置 */
  const patchSuggest = (index: number, patch: Partial<IdSuggestState>): void => {
    setIdSuggest((prev) => {
      const base: IdSuggestState =
        prev !== null && prev.index === index
          ? prev
          : {
              index,
              rule: { suggestions: [], error: null },
              pinyin: null,
              ai: [],
              aiLoading: false,
              aiError: null
            }
      return { ...base, ...patch }
    })
  }

  /**
   * 「生成」：术语表/字面量候选（规则层）。
   * 再点一次收起 —— 但若候选条是由「拼音」打开的，则改为把规则层候选并入同一面板。
   */
  const requestIdSuggestions = (index: number): void => {
    if (!current) return
    if (idSuggest?.index === index && idSuggest.pinyin === null) {
      setIdSuggest(null)
      return
    }
    const { label, others } = fieldIdContext(index)
    patchSuggest(index, { rule: suggestFieldIds(label, others) })
  }

  /**
   * 「拼音」：中文→拼音兜底候选（对齐 Python `_auto_pinyin`）。
   * 同步纯计算；开启时一并带上规则层候选，便于对照（术语语义 vs 拼音音节）。
   */
  const requestPinyinSuggestions = (index: number): void => {
    if (!current) return
    const { label, others } = fieldIdContext(index)
    patchSuggest(index, {
      rule: suggestFieldIds(label, others),
      pinyin: suggestPinyinFieldId(label, others)
    })
  }

  /**
   * 让 AI 给几个候选（术语表未收录时的第二级兜底）。
   * **只提案不写入**：候选项要用户点选后才落到字段名上。
   */
  const requestAiSuggestions = async (index: number): Promise<void> => {
    if (!current) return
    const field = current.formFields[index]
    const label = String(field?.label ?? '').trim()
    if (label === '') {
      setIdSuggest((prev) => (prev === null ? prev : { ...prev, aiError: FIELD_ID_AI_ERROR_EMPTY_LABEL }))
      return
    }
    const others = current.formFields.filter((_, i) => i !== index).map((item) => item.name)
    setIdSuggest((prev) => (prev === null ? prev : { ...prev, aiLoading: true, aiError: null }))
    try {
      const result = await window.mbApi.schema.suggestFieldIds({
        label,
        existingNames: others,
        typeName: current.name,
        fieldType: field?.type
      })
      setIdSuggest((prev) => {
        if (prev === null || prev.index !== index) return prev
        return {
          ...prev,
          aiLoading: false,
          ai: result.candidates,
          aiError: result.candidates.length === 0 ? FIELD_ID_AI_ERROR_NO_CANDIDATE : null
        }
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setIdSuggest((prev) => (prev === null || prev.index !== index ? prev : { ...prev, aiLoading: false, aiError: message }))
    }
  }

  const moveField = (index: number, delta: -1 | 1): void => {
    if (!current) return
    const fields = [...current.formFields]
    const target = index + delta
    if (target < 0 || target >= fields.length) return
    if (fields[index].name === 'id' || fields[target].name === 'id') return
    const [moved] = fields.splice(index, 1)
    fields.splice(target, 0, moved)
    updateType({ formFields: fields })
  }

  /** 应用模板：整体替换字段（含 id 字段，与 Python 导入模板行为一致） */
  const applyTemplate = async (): Promise<void> => {
    if (!current) return
    // 内置模板在 shared 常量里直接取；自定义模板需向主进程要完整字段定义
    const builtin = TYPE_TEMPLATES[templateName]
    if (builtin) {
      updateType({ formFields: structuredClone(builtin) })
      bumpReset()
      setNotice(`已应用模板「${templateName}」（尚未保存）`)
      return
    }
    try {
      const { fields } = await window.mbApi.schema.getFieldTemplate({ name: templateName })
      if (fields === null) {
        setErrors([`模板「${templateName}」不存在`])
        return
      }
      updateType({ formFields: fields })
      bumpReset()
      setNotice(`已应用模板「${templateName}」（尚未保存）`)
    } catch (error) {
      setErrors([error instanceof Error ? error.message : String(error)])
    }
  }

  /** 把当前类型的字段存为自定义模板（存完整定义，非 Python 那样只存标签） */
  const saveAsTemplate = async (): Promise<void> => {
    if (!current) return
    const name = newTemplateName.trim()
    if (name === '') {
      setErrors(['请填写模板名称'])
      return
    }
    try {
      await window.mbApi.schema.saveFieldTemplate({ name, fields: current.formFields })
      setCustomTemplates((prev) => (prev.includes(name) ? prev : [...prev, name].sort((a, b) => a.localeCompare(b, 'zh-CN'))))
      setNewTemplateName('')
      setNotice(`模板「${name}」已保存`)
    } catch (error) {
      setErrors([error instanceof Error ? error.message : String(error)])
    }
  }

  /** 删除自定义模板（内置模板不允许删除） */
  const deleteTemplate = async (): Promise<void> => {
    if (isBuiltinTemplate) return
    try {
      const { deleted } = await window.mbApi.schema.deleteFieldTemplate({ name: templateName })
      if (!deleted) {
        setErrors([`模板「${templateName}」不存在`])
        return
      }
      setCustomTemplates((prev) => prev.filter((name) => name !== templateName))
      setTemplateName(TYPE_TEMPLATE_NAMES[0] ?? '')
      setNotice(`模板「${templateName}」已删除`)
    } catch (error) {
      setErrors([error instanceof Error ? error.message : String(error)])
    }
  }

  const addType = (): void => {
    const created = buildNewTypeDraft(draft.map((def) => def.id))
    setDraft((prev) => [...prev, created])
    setSelectedId(created.id)
    bumpReset()
    setNotice('已新建类型，请修改类型 ID 与名称后保存')
  }

  const removeType = (): void => {
    if (!current || draft.length <= 1) return
    const next = draft.filter((def) => def.id !== current.id)
    setDraft(next)
    setSelectedId(next[0]?.id ?? '')
    setErrors([])
    setNotice(null)
    bumpReset()
  }

  const handleSave = async (): Promise<void> => {
    setErrors([])
    setNotice(null)
    const messages = validateTypeSchema(draft)
    if (messages.length > 0) {
      setErrors(messages)
      return
    }
    setSaving(true)
    try {
      const saved = await window.mbApi.schema.save({ types: draft })
      setDraft(structuredClone(saved))
      bumpReset()
      setNotice('字段结构已保存，数据表表单已同步更新')
      onSaved(saved)
    } catch (error) {
      setErrors([error instanceof Error ? error.message : String(error)])
    } finally {
      setSaving(false)
    }
  }

  const handleReset = (): void => {
    setDraft(structuredClone(types))
    setSelectedId((currentId) => (types.some((def) => def.id === currentId) ? currentId : (types[0]?.id ?? '')))
    setErrors([])
    setNotice(null)
    bumpReset()
  }

  return (
    <div className="te-layout" data-testid="type-editor-panel">
      <aside className="te-side">
        <div className="form-label">数据类型（{draft.length}）</div>
        <button type="button" className="btn" data-testid="te-new-type" onClick={addType}>
          新建类型
        </button>
        <div className="te-type-list">
          {draft.map((def, index) => (
            <button
              key={index}
              type="button"
              className={`type-tab${def.id === selectedId ? ' active' : ''}`}
              data-testid="te-type-tab"
              onClick={() => setSelectedId(def.id)}
            >
              <span className="type-dot" style={{ background: def.color || '#607D8B' }} />
              <span className="item-name">{def.name || def.id || '未命名类型'}</span>
              <span className="item-meta">{def.formFields.length} 字段</span>
            </button>
          ))}
        </div>
      </aside>

      <div className="te-main">
        <div className="changelog-header">
          <span className="chapter-form-title">字段结构编辑器</span>
          <div className="editor-actions">
            <button type="button" className="btn" data-testid="te-reset" disabled={saving} onClick={handleReset}>
              重置
            </button>
            <button
              type="button"
              className="btn primary"
              data-testid="te-save"
              disabled={saving || !current}
              onClick={() => void handleSave()}
            >
              保存结构
            </button>
            <button type="button" className="btn" data-testid="te-close" disabled={saving} onClick={onClose}>
              关闭
            </button>
          </div>
        </div>

        {current ? (
          <>
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
                  onChange={(event) => editTypeId(event.target.value)}
                />
                <span className="form-label">中文名</span>
                <input
                  className="form-input"
                  data-testid="te-type-name"
                  value={current.name}
                  onChange={(event) => updateTypeName(event.target.value)}
                />
              </div>
              <div className="ai-gen-row">
                <span className="form-label">复数键</span>
                <input
                  className="form-input"
                  data-testid="te-type-plural"
                  value={current.pluralKey}
                  onChange={(event) => updateType({ pluralKey: event.target.value })}
                />
                <span className="form-label">颜色</span>
                <input
                  className="form-input te-col-color"
                  data-testid="te-type-color"
                  value={current.color}
                  maxLength={40}
                  placeholder="#RRGGBB"
                  onChange={(event) => updateType({ color: event.target.value })}
                />
                <span className="type-dot" style={{ background: current.color || '#607D8B' }} />
                <button
                  type="button"
                  className="btn danger"
                  data-testid="te-delete-type"
                  disabled={draft.length <= 1}
                  onClick={removeType}
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
                  onChange={(event) => setTemplateName(event.target.value)}
                >
                  <optgroup label="内置模板">
                    {TYPE_TEMPLATE_NAMES.map((name) => (
                      <option key={name} value={name}>
                        {name}
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
                <button
                  type="button"
                  className="btn"
                  data-testid="te-apply-template"
                  onClick={() => void applyTemplate()}
                >
                  应用模板（替换全部字段）
                </button>
                <button type="button" className="btn" data-testid="te-add-field" onClick={addField}>
                  添加字段
                </button>
              </div>
              <div className="ai-gen-row">
                <input
                  className="form-input"
                  data-testid="te-template-name"
                  value={newTemplateName}
                  placeholder="模板名称"
                  onChange={(event) => setNewTemplateName(event.target.value)}
                />
                <button
                  type="button"
                  className="btn"
                  data-testid="te-save-template"
                  onClick={() => void saveAsTemplate()}
                >
                  保存当前为模板
                </button>
                <button
                  type="button"
                  className="btn danger"
                  data-testid="te-delete-template"
                  disabled={isBuiltinTemplate}
                  title={isBuiltinTemplate ? '内置模板不允许删除' : undefined}
                  onClick={() => void deleteTemplate()}
                >
                  删除模板
                </button>
              </div>
            </div>

            <div className="changelog-entry">
              <div className="form-label">字段列表（{current.formFields.length}）</div>
              {current.formFields.map((field, index) => {
                const isIdField = field.name === 'id'
                const aiOnly = idSuggest?.index === index ? aiOnlyOf(idSuggest) : []
                return (
                  <div className={`te-field-row${isIdField ? ' locked' : ''}`} key={index} data-testid={`te-field-${index}`}>
                    <input
                      className="form-input te-col-name"
                      data-testid={`te-field-name-${index}`}
                      value={field.name}
                      readOnly={isIdField}
                      title={isIdField ? 'id 字段为系统字段，不可改名/删除' : '字段名（英文/数字/下划线）'}
                      onChange={(event) => updateField(index, { name: event.target.value })}
                    />
                    <button
                      type="button"
                      className="btn slim"
                      data-testid={`te-field-generate-${index}`}
                      disabled={isIdField}
                      title="由中文显示名生成字段 ID（不覆盖已填内容，先给候选）"
                      onClick={() => requestIdSuggestions(index)}
                    >
                      生成
                    </button>
                    <button
                      type="button"
                      className="btn slim"
                      data-testid={`te-field-pinyin-${index}`}
                      disabled={isIdField}
                      title="中文→拼音（如「攻击力」→ gong_ji_li），任意汉字可用；不覆盖已填内容"
                      onClick={() => requestPinyinSuggestions(index)}
                    >
                      拼音
                    </button>
                    <input
                      className="form-input te-col-label"
                      data-testid={`te-field-label-${index}`}
                      value={field.label}
                      onChange={(event) => updateField(index, { label: event.target.value })}
                    />
                    <select
                      className="form-select te-col-type"
                      data-testid={`te-field-type-${index}`}
                      value={field.type}
                      disabled={isIdField}
                      onChange={(event) => updateField(index, { type: event.target.value as FieldType })}
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
                        onChange={(event) => updateField(index, { editable: event.target.checked })}
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
                          updateField(index, {
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
                          onChange={(event) => updateField(index, { from: parseOptionalNumber(event.target.value) })}
                        />
                        <input
                          className="form-input te-col-num"
                          data-testid={`te-field-to-${index}`}
                          key={`to-${selectedId}-${index}-${resetToken}`}
                          defaultValue={field.to ?? ''}
                          placeholder="上限"
                          onChange={(event) => updateField(index, { to: parseOptionalNumber(event.target.value) })}
                        />
                      </span>
                    )}

                    {field.type === 'multiselect' && (
                      <select
                        className="form-select te-col-ref"
                        data-testid={`te-field-ref-${index}`}
                        value={field.refType ?? ''}
                        onChange={(event) => updateField(index, { refType: event.target.value || undefined })}
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
                        onClick={() => moveField(index, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn slim"
                        data-testid={`te-field-down-${index}`}
                        disabled={index === current.formFields.length - 1 || field.name === 'id'}
                        title="下移"
                        onClick={() => moveField(index, 1)}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="btn slim danger"
                        data-testid={`te-field-remove-${index}`}
                        disabled={isIdField}
                        title={isIdField ? 'id 字段不可删除' : '删除字段'}
                        onClick={() => removeField(index)}
                      >
                        ✕
                      </button>
                    </span>
                    {idSuggest?.index === index && (
                      <div className="te-id-suggest" data-testid={`te-id-suggest-${index}`}>
                        {idSuggest.rule.suggestions.length > 0 && (
                          <>
                            <span className="te-id-suggest-label">候选：</span>
                            {idSuggest.rule.suggestions.map((suggestion) => (
                              <button
                                type="button"
                                className="btn slim te-id-suggest-apply"
                                key={suggestion.id}
                                data-source={suggestion.source}
                                data-testid={`te-id-suggest-apply-${index}`}
                                onClick={() => {
                                  updateField(index, { name: suggestion.id })
                                  setIdSuggest(null)
                                }}
                              >
                                {suggestion.id}
                              </button>
                            ))}
                          </>
                        )}
                        {idSuggest.rule.error !== null && (
                          <span className="te-id-suggest-error" data-testid={`te-id-suggest-error-${index}`}>
                            {idSuggest.rule.error}
                          </span>
                        )}

                        {idSuggest.pinyin !== null && idSuggest.pinyin.suggestions.length > 0 && (
                          <>
                            <span className="te-id-suggest-label">拼音：</span>
                            {idSuggest.pinyin.suggestions.map((suggestion) => (
                              <button
                                type="button"
                                className="btn slim te-id-suggest-apply"
                                key={`pinyin-${suggestion.id}`}
                                data-source={suggestion.source}
                                data-testid={`te-id-suggest-apply-${index}`}
                                onClick={() => {
                                  updateField(index, { name: suggestion.id })
                                  setIdSuggest(null)
                                }}
                              >
                                {suggestion.id}
                              </button>
                            ))}
                          </>
                        )}
                        {idSuggest.pinyin !== null && idSuggest.pinyin.error !== null && (
                          <span className="te-id-suggest-error" data-testid={`te-id-suggest-pinyin-error-${index}`}>
                            {idSuggest.pinyin.error}
                          </span>
                        )}

                        {aiOnly.map((suggestion) => (
                          <button
                            type="button"
                            className="btn slim te-id-suggest-apply"
                            key={suggestion.id}
                            data-source={suggestion.source}
                            data-testid={`te-id-suggest-apply-${index}`}
                            onClick={() => {
                              updateField(index, { name: suggestion.id })
                              setIdSuggest(null)
                            }}
                          >
                            {suggestion.id}
                          </button>
                        ))}

                        {idSuggest.rule.suggestions.some((s) => s.renamedFrom !== null) && (
                          <span className="te-id-suggest-note" data-testid={`te-id-suggest-renamed-${index}`}>
                            （原为 {idSuggest.rule.suggestions[0]?.renamedFrom}，已重名故加后缀）
                          </span>
                        )}
                        {idSuggest.rule.suggestions[0]?.skipped.length ? (
                          <span className="te-id-suggest-note" data-testid={`te-id-suggest-skipped-${index}`}>
                            术语表未收录：
                            {idSuggest.rule.suggestions[0]?.skipped.join('、')}
                            （可点「拼音」或手动补全）
                          </span>
                        ) : null}

                        <button
                          type="button"
                          className="btn slim"
                          data-testid={`te-id-suggest-ai-${index}`}
                          disabled={idSuggest.aiLoading}
                          title="让 AI 给几个候选（需本地 Ollama；AI 只提案，点选后才写入）"
                          onClick={() => void requestAiSuggestions(index)}
                        >
                          {idSuggest.aiLoading ? 'AI 生成中…' : 'AI 候选'}
                        </button>
                        {idSuggest.aiError !== null && (
                          <span className="te-id-suggest-error" data-testid={`te-id-suggest-ai-error-${index}`}>
                            {idSuggest.aiError}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <div className="empty">请在左侧选择类型，或点「新建类型」</div>
        )}

        {errors.length > 0 && (
          <div className="error-banner" data-testid="te-errors">
            {errors.map((message, index) => (
              <div key={index}>{message}</div>
            ))}
          </div>
        )}
        {notice && (
          <div className="notice-banner" data-testid="te-notice">
            {notice}
          </div>
        )}
      </div>
    </div>
  )
}

/** 引用类型下拉：列出现有类型（值为复数键，与内置 schema refType 语义一致），并保留当前未知值 */
function refOptions(types: DataTypeDef[], currentRef: string | undefined): DataTypeDef[] {
  if (!currentRef) return types
  if (types.some((def) => def.pluralKey === currentRef || def.id === currentRef)) return types
  return [...types, { id: currentRef, name: currentRef, pluralKey: currentRef, color: '#607D8B', formFields: [] }]
}

function parseOptionalNumber(raw: string): number | undefined {
  if (raw.trim() === '') return undefined
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}