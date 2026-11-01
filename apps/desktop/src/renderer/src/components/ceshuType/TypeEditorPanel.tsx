import { useEffect, useMemo, useState } from 'react'

import { suggestFieldIds, type FieldIdSuggestion, type SuggestFieldIdResult } from '@mobai/shared/util/id'
import { chineseToPinyin, suggestPinyinFieldId } from '@mobai/shared/util/id'
import {
  FIELD_ID_AI_ERROR_EMPTY_LABEL,
  FIELD_ID_AI_ERROR_NO_CANDIDATE
} from '@mobai/shared/util/id'
import { validateTypeSchema } from '@mobai/shared/schema/adapters'
import {
  TYPE_TEMPLATE_NAMES,
  TYPE_TEMPLATE_SECTIONS,
  TYPE_TEMPLATES,
  buildNewTypeDraft
} from '@mobai/shared/schema/core'
import type { DataTypeDef, TypeFieldDef, TypeSectionDef } from '@mobai/shared/types'

import { TypeSideList, TypeEditorHeader } from './TypeEditorChrome'
import { TypePropsSection } from './TypePropsSection'
import { TypeFieldList } from './TypeFieldList'

/**
 * 数据表字段结构编辑器：
 * - 类型：新建 / 删除 / 名称·复数键·颜色编辑（既有类型的 ID 锁定，避免存量条目失联）
 * - 字段：增删 / 排序 / 名称·标签·控件类型·可编辑·可选值·数值范围·引用类型
 * - 模板：7 套内置字段模板整体替换；保存前领域校验；保存走 IPC（主进程原子写 type_schema.json）
 * - 字段 ID 生成：两条独立路子 —— **英译**（术语表，`shared/fieldId.ts`）+ **拼音**（`shared/pinyinFieldId.ts`）
 * - 新建类型的 ID：随中文名自动填拼音
 * 明确未迁移：布局分区编辑、AI 推荐字段/分析数据/联网参考（属 AI 域，见 roadmap E42/E56）。
 *
 * 展示层已拆成三块独立组件（本文件只留草稿状态与动作编排）：
 * - `TypeEditorChrome`：左栏类型列表 + 顶部动作条；
 * - `TypePropsSection`：类型属性（ID/名称/颜色/模板/确认条）；
 * - `TypeFieldList`：字段列表（按字段类型分支的附加列 + ID 候选条）。
 * 拆的是 JSX 结构，DOM / className / data-testid / 非受控输入的 `key` 全部原样保留。
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
export interface IdSuggestState {
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
  /**
   * 待确认的模板替换：模板里有字段名不在当前类型中时，先问一句再换。
   *
   * 为什么需要：应用模板**不删数据**（`schema:save` 只写 type_schema.json，条目的
   * `data` 原样保留），但旧字段名一旦不在 schema 里就**不再显示** —— 用户会以为
   * 「22 条角色的描述全没了」。这是静默失联，比报错更糟。
   */
  const [pendingTemplate, setPendingTemplate] = useState<{ name: string; fields: TypeFieldDef[] } | null>(null)
  /** 当前展开「字段 ID 候选」的行及状态（同一时刻只开一个） */
  const [idSuggest, setIdSuggest] = useState<IdSuggestState | null>(null)
  /** 用户自定义字段模板名（内置模板在 `TYPE_TEMPLATES` 常量里，自定义需读盘） */
  const [customTemplates, setCustomTemplates] = useState<string[]>([])
  const [newTemplateName, setNewTemplateName] = useState('')
  /**
   * 被用户**手动改过 ID** 的类型（用于抑制「中文名 → 拼音 ID」自动填充，
   * 对齐 旧版 `add_type` 里的 `tid_edit.isModified()` 判定）。
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
  /** 当前下拉选中的内置模板的建议分区（自定义模板无此数据 ⇒ null） */
  const templateSections = TYPE_TEMPLATE_SECTIONS[templateName] ?? null

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
   * 同步把 ID 填成拼音，对齐 旧版 `type_editor_dialog.add_type` 的
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
   * 「拼音」：中文→拼音兜底候选。
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

  /** 应用模板：整体替换字段 */
  const applyTemplate = async (): Promise<void> => {
    if (!current) return
    // 内置模板在 shared 常量里直接取；自定义模板需向主进程要完整字段定义
    const builtin = TYPE_TEMPLATES[templateName]
    if (builtin) {
      requestTemplateReplace(templateName, structuredClone(builtin))
      return
    }
    try {
      const { fields } = await window.mbApi.schema.getFieldTemplate({ name: templateName })
      if (fields === null) {
        setErrors([`模板「${templateName}」不存在`])
        return
      }
      requestTemplateReplace(templateName, fields)
    } catch (error) {
      setErrors([error instanceof Error ? error.message : String(error)])
    }
  }

  /**
   * 替换前先判断「会不会让已有数据失联」：
   * 当前字段名不在新模板里的那些，条目里已填的值会保留在文件中但不再显示。
   * 有失联风险就进确认态，否则直接替换。
   */
  const requestTemplateReplace = (name: string, fields: TypeFieldDef[]): void => {
    if (!current) return
    const nextNames = new Set(fields.map((field) => field.name))
    const orphaned = current.formFields.filter((field) => !nextNames.has(field.name))
    if (orphaned.length > 0) {
      setPendingTemplate({ name, fields })
      setErrors([])
      return
    }
    commitTemplateReplace(name, fields)
  }

  const commitTemplateReplace = (name: string, fields: TypeFieldDef[]): void => {
    /*
     * 套用内置模板时把「建议分区」一并写进类型 —— 这一步让它**真正生效**：
     * 保存后条目表单会按这些分区渲染，而不是回落到内置 FORM_GROUPS / 语义兜底。
     * 自定义模板没有建议数据 ⇒ 清空旧分区，避免残留指向已删除字段的分组。
     */
    const suggestion = TYPE_TEMPLATE_SECTIONS[name]
    const sections: TypeSectionDef[] | undefined = suggestion
      ? suggestion.map((section) => ({ title: section.title, icon: section.icon, fields: [...section.fields] }))
      : undefined
    updateType({ formFields: fields, sections })
    bumpReset()
    setPendingTemplate(null)
    setNotice(`已应用模板「${name}」${suggestion ? '并填入建议分区' : ''}（尚未保存）`)
  }

  /** 把当前类型的字段存为自定义模板 */
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
      <TypeSideList draft={draft} selectedId={selectedId} onSelect={setSelectedId} onAddType={addType} />

      <div className="te-main">
        <TypeEditorHeader
          saving={saving}
          canSave={current !== null}
          onReset={handleReset}
          onSave={() => void handleSave()}
          onClose={onClose}
        />

        {current ? (
          <>
            <TypePropsSection
              current={current}
              draft={draft}
              baseIds={baseIds}
              templateName={templateName}
              templateSections={templateSections}
              customTemplates={customTemplates}
              newTemplateName={newTemplateName}
              pendingTemplate={pendingTemplate}
              isBuiltinTemplate={isBuiltinTemplate}
              onEditTypeId={editTypeId}
              onUpdateName={updateTypeName}
              onUpdate={updateType}
              onRemoveType={removeType}
              onTemplateNameChange={setTemplateName}
              onApplyTemplate={() => void applyTemplate()}
              onAddField={addField}
              onConfirmTemplate={commitTemplateReplace}
              onCancelTemplate={() => setPendingTemplate(null)}
              onNewTemplateNameChange={setNewTemplateName}
              onSaveAsTemplate={() => void saveAsTemplate()}
              onDeleteTemplate={() => void deleteTemplate()}
            />

            <TypeFieldList
              current={current}
              draft={draft}
              selectedId={selectedId}
              resetToken={resetToken}
              idSuggest={idSuggest}
              onUpdateField={updateField}
              onGenerate={requestIdSuggestions}
              onPinyin={requestPinyinSuggestions}
              onClearSuggest={() => setIdSuggest(null)}
              onRequestAiSuggestions={(index) => void requestAiSuggestions(index)}
              onMoveField={moveField}
              onRemoveField={removeField}
            />
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