import { useEffect, useMemo, useRef, useState } from 'react'

import { attrListToRows, rowsToAttrList, type AttrRow } from '../../../shared/attrList'
import { attrPanelToRows, defaultAttrPanelRows, rowsToAttrPanel, type AttrPanelRow } from '../../../shared/attrPanel'
import type { AttrSystem } from '../../../shared/attrSystem'
import {
  canParseAsDropTable,
  normalizeDropEntries,
  serializeDropEntries,
  type DropEntry
} from '../../../shared/dropTable'
import { buildFormLayout, fieldLabelFor, isComplexFieldType } from '../../../shared/formSections'
import {
  autoFillLabel,
  buildAutoImageInfo,
  buildDescContext,
  buildDescPrompt,
  buildImageTagsPrompt,
  mergeImageTagsResult
} from '../../../shared/fieldAiAssist'
import type { ImageGenConfig } from '../../../shared/imageGen'
import { loadImageGenConfig } from '../../../shared/imageGenConfig'
import { SECRET_NAMES } from '../../../shared/secretNames'
import { resolveFieldLabel } from '../../../shared/gameStyle'
import {
  canParseAsRefTable,
  normalizeRefEntries,
  serializeRefEntries,
  type ReferenceEntry
} from '../../../shared/refTable'
import type { DataTypeDef, ItemRecord, TypeFieldDef } from '../../../shared/types'

import AttrPanelEditor from './AttrPanelEditor'
import AttrTableEditor from './AttrTableEditor'
import DropTableEditor from './DropTableEditor'
import FormSectionCard from './FormSectionCard'
import LucideIcon from './LucideIcon'
import LazyImage from './LazyImage'
import RefTableEditor from './RefTableEditor'

interface ItemFormProps {
  item: ItemRecord
  fields: TypeFieldDef[]
  /** 全部数据类型定义（引用类字段解析 refType → 单数 id + 中文名） */
  types: readonly DataTypeDef[]
  /**
   * 当前活跃的游戏风格 id（`game_styles.json` 的 id，如 `xianxia`）。
   * 用于按风格替换字段标签术语（对应 Python `style_manager.resolve_field_label`）；
   * `''` = 不启用，标签原样显示（与 Python 无活跃风格时等价）。
   */
  gameStyle?: string
  onSaved: (updated: ItemRecord) => void
  /**
   * 打开「字段结构编辑器」（App 级浮层 TypeEditorPanel）编辑当前条目所属类型。
   * 不提供则「更多 ▸」里不出现该项——本组件不自行造浮层，也不放点了没反应的按钮。
   */
  onEditType?: (typeId: string) => void
  /**
   * 打开「数据关联预览」（App 级浮层 ReferencesPanel）查看当前条目的引用关系。
   * 入参形状与 `ReferencesPanel` 的 `ReferenceTarget` 一致（type / id / name）。
   * 不提供则「更多 ▸」里不出现该项。
   */
  onShowReferences?: (target: { type: string; id: string; name: string }) => void
  /** 打开「AI 数据生成」面板（宿主编排书级浮层 AiDataGenPanel）；不提供则不渲染该按钮 */
  onAiGenerate?: (typeId: string) => void
  /**
   * 复制完成后回调（父级可据此选中副本并给出专门提示）。
   * 复制本身由本组件走既有 `data:createItem` 完成；未提供时回退 `onSaved` 触发列表刷新。
   */
  onDuplicated?: (created: ItemRecord) => void
}

/**
 * 该字段是否退化为 JSON 文本框（仅当值无法被专用编辑器无损表示时，保留原始数据防止丢失）。
 * - droptable：无法归一的（结构异常）走 JSON
 * - multiselect：无法归一的走 JSON
 */
function usesJsonEditor(field: TypeFieldDef, value: unknown): boolean {
  if (field.type === 'droptable') return !canParseAsDropTable(value)
  if (field.type === 'multiselect') return !canParseAsRefTable(value)
  return false
}

/** draft 中的 attrtable 值（始终为编辑行数组；防御异常数据） */
function asAttrRows(value: unknown): AttrRow[] {
  return Array.isArray(value) ? (value as AttrRow[]) : []
}

/** draft 中的 attrpanel 值（始终为编辑行数组；防御异常数据） */
function asAttrPanelRows(value: unknown): AttrPanelRow[] {
  return Array.isArray(value) ? (value as AttrPanelRow[]) : []
}

/** draft 中的 multiselect 值（已归一化；防御异常数据） */
function asRefEntries(value: unknown): ReferenceEntry[] {
  return Array.isArray(value) ? (value as ReferenceEntry[]) : []
}

/** draft 中的 droptable 值（已归一化；防御异常数据） */
function asDropEntries(value: unknown): DropEntry[] {
  return Array.isArray(value) ? (value as DropEntry[]) : []
}

function buildInitialDraft(
  data: Record<string, unknown>,
  fields: TypeFieldDef[],
  typeId: string
): Record<string, unknown> {
  const draft: Record<string, unknown> = { ...data }
  for (const field of fields) {
    const value = data[field.name]
    if (field.type === 'attrtable') {
      draft[field.name] = attrListToRows(value)
    } else if (field.type === 'attrpanel') {
      // 对应 Python load_data：无有效数据时套用该类型的默认模板（role=新手 / monster=小怪）
      const rows = attrPanelToRows(value)
      draft[field.name] = rows.length > 0 ? rows : defaultAttrPanelRows(typeId)
    } else if (usesJsonEditor(field, value)) {
      draft[field.name] = value === undefined || value === null ? '' : JSON.stringify(value, null, 2)
    } else if (field.type === 'multiselect') {
      draft[field.name] = normalizeRefEntries(value)
    } else if (field.type === 'droptable') {
      draft[field.name] = normalizeDropEntries(value)
    } else if (field.type === 'spinbox' || field.type === 'double_spin') {
      draft[field.name] = value === undefined || value === null ? '' : String(value)
    } else if (field.type === 'tags') {
      draft[field.name] = Array.isArray(value) ? value.join(', ') : (value ?? '')
    }
  }
  return draft
}

function buildPayload(
  draft: Record<string, unknown>,
  fields: TypeFieldDef[],
  id: string,
  jsonFields: Set<string>
): Record<string, unknown> {
  // 以完整 draft 为底，保留 schema 未收录的扩展字段（导入数据可能携带）
  const payload: Record<string, unknown> = { ...draft }

  for (const field of fields) {
    const name = field.name
    const raw = draft[name]

    if (name === 'id') {
      payload.id = id
      continue
    }
    if (field.type === 'attrtable') {
      payload[name] = rowsToAttrList(asAttrRows(raw), field.label)
      continue
    }
    if (field.type === 'attrpanel') {
      payload[name] = rowsToAttrPanel(asAttrPanelRows(raw))
      continue
    }
    if (jsonFields.has(name)) {
      if (typeof raw !== 'string' || raw.trim() === '') {
        delete payload[name]
        continue
      }
      try {
        payload[name] = JSON.parse(raw)
      } catch {
        throw new Error(`字段「${field.label}」不是合法 JSON`)
      }
      continue
    }
    if (field.type === 'spinbox' || field.type === 'double_spin') {
      if (raw === '' || raw === null || raw === undefined) {
        delete payload[name]
        continue
      }
      const numeric = Number(raw)
      if (!Number.isFinite(numeric)) {
        throw new Error(`字段「${field.label}」需要数字`)
      }
      payload[name] = numeric
      continue
    }
    if (field.type === 'multiselect') {
      payload[name] = serializeRefEntries(asRefEntries(raw))
      continue
    }
    if (field.type === 'droptable') {
      payload[name] = serializeDropEntries(asDropEntries(raw))
      continue
    }
    if (field.type === 'tags' && typeof raw === 'string') {
      payload[name] = raw
        .split(/[,，]/)
        .map((part) => part.trim())
        .filter(Boolean)
    }
  }
  return payload
}

interface FieldControlProps {
  field: TypeFieldDef
  value: unknown
  jsonMode: boolean
  onChange: (value: unknown) => void
  /**
   * `template` 字段被选中/输入时回调（PyQt `dynamic_form.py::_on_template_changed`）。
   * 用来把模板文本联动写进同类型的 `desc` 字段 —— 语义由调用方决定，这里只负责传出来。
   */
  onTemplatePicked?: (templateText: string) => void
  /**
   * 字段级 AI 辅助所需的上下文（PyQt `dynamic_form.py::_create_desc_widget` 等
   * 靠 `self.get_data()` / `self.widgets` 拿同表单的其它值）。
   * TS 侧由 ItemForm 显式传入 —— **不引全局单例**，组件自己不知道整份表单长什么样。
   */
  aiAssist?: FieldAiAssist
  /** 当前表单里 `image` 字段的值（图片类按钮需要路径才能分析/生图） */
  imagePath?: string
  /** 当前条目的名称（「自动填充」模板要它，对齐 PyQt `_on_auto_generate_image_info` 的 `data.get('name')`） */
  itemName?: string
  /**
   * `dialog` 字段可选的对话条目（对齐 PyQt `dynamic_form.py::_on_select_dialog`：
   * 从 `data['dialogs']` 里选一条，写回其 **id**，列表显示 `id — name`）。
   * 由 ItemForm 懒加载后传入；缺省空数组时控件禁用并给出提示。
   */
  dialogOptions?: readonly ItemRecord[]
}

/**
 * 字段级 AI 按钮需要的宿主能力。
 * 都是 async 且**由 ItemForm 统一兜错**，控件本身只管显示按钮与忙态。
 */
interface FieldAiAssist {
  /** 生成 desc（对齐 PyQt `_on_ai_generate` → `features.generate_desc_only`） */
  generateDesc: (fieldLabel: string, currentText: string) => Promise<string>
  /**
   * 为某个字段生成配图（对齐 PyQt `_on_ai_image`）。
   * PyQt 只是 `QMessageBox.information("需要配置API密钥")` 的**占位桩**；
   * TS 侧接真实的 `image:generate`（项目已有该通道）—— 详见 ItemForm 里的说明。
   */
  generateImage: (prompt: string) => Promise<string>
  /** 现有图片路径存在时，让模型提取标签（对齐 PyQt `_on_ai_analyze_image`） */
  analyzeImageTags: (imagePath: string) => Promise<string>
}

/** 条目显示名（name 优先，回退 id）——`dialog` 候选列表与只读展示共用 */
function itemNameOf(record: ItemRecord): string {
  const name = record.data.name
  return typeof name === 'string' && name !== '' ? name : record.id
}

function FieldControl({
  field,
  value,
  jsonMode,
  onChange,
  onTemplatePicked,
  aiAssist,
  imagePath,
  itemName = '',
  dialogOptions = []
}: FieldControlProps) {
  const testId = `field-${field.name}`
  const [picking, setPicking] = useState(false)
  /**
   * 正在跑的 AI 动作（键是动作名，用于按钮各自的忙态）。
   * 用派生渲染而非多个布尔 —— 三个布尔会出现「两个同时转圈」的不可能状态。
   */
  const [aiBusy, setAiBusy] = useState<string | null>(null)
  /** AI 失败的中文原因（就地显示，不弹窗打断表单） */
  const [aiError, setAiError] = useState<string | null>(null)

  /**
   * 跑一个 AI 动作并把结果写回字段。
   * `apply` 拿到结果决定写什么（整段替换还是追加），出错统一显示中文原因。
   */
  const runAi = async (name: string, action: () => Promise<string>, apply: (result: string) => void): Promise<void> => {
    setAiBusy(name)
    setAiError(null)
    try {
      apply(await action())
    } catch (error: unknown) {
      setAiError(error instanceof Error ? error.message : String(error))
    } finally {
      setAiBusy(null)
    }
  }

  if (jsonMode) {
    return (
      <textarea
        id={testId}
        className="form-textarea"
        data-testid={testId}
        rows={4}
        value={String(value ?? '')}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  }

  switch (field.type) {
    case 'spinbox':
    case 'double_spin':
      return (
        <input
          id={testId}
          type="number"
          className="form-input"
          data-testid={testId}
          min={field.from}
          max={field.to}
          step={field.type === 'double_spin' ? 'any' : undefined}
          value={String(value ?? '')}
          readOnly={!field.editable}
          onChange={(event) => onChange(event.target.value)}
        />
      )
    case 'combobox': {
      const options = field.values ?? []
      const current = value === null || value === undefined ? '' : String(value)
      const extras = current !== '' && !options.includes(current) ? [current] : []
      return (
        <select
          id={testId}
          className="form-select"
          data-testid={testId}
          value={current}
          disabled={!field.editable}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">（空）</option>
          {[...extras, ...options].map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )
    }
    /*
     * `template`：**可编辑**的模板框（对齐 PyQt `dynamic_form.py::_create_template_widget`
     * 的 `combo.setEditable(True)`）。TS 原用不可编辑 `<select>`，用户既不能从预置模板里
     * 微调，也没法手写自己的模板 —— 而模板本身就是「描述的骨架」，必须能改。
     * 用 `<input list>` 实现原生可编辑下拉：既能选也能填，零依赖。
     */
    case 'template': {
      const options = field.values ?? []
      const current = value === null || value === undefined ? '' : String(value)
      const listId = `${testId}-options`
      return (
        <>
          <input
            id={testId}
            className="form-input"
            data-testid={testId}
            list={listId}
            placeholder="从模板里挑一个，或直接写自己的"
            value={current}
            readOnly={!field.editable}
            onChange={(event) => {
              onChange(event.target.value)
              // PyQt：模板文本变化即联动写入 desc（清空不算，避免误清描述）
              if (event.target.value !== '') onTemplatePicked?.(event.target.value)
            }}
          />
          <datalist id={listId}>
            {options.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </>
      )
    }
    /*
     * `tags`：PyQt `dynamic_form.py` 的 tags 分支是 QLineEdit + placeholder
     * 「多个标签用逗号分隔」，值按**原始字符串**存。TS 侧刻意存**字符串数组**
     * （`buildPayload` 按 `/[,，]/` 拆分后过滤空串）。
     *
     * 两条路径都要接住（别以为只有一条）：
     * - 常见路径：`buildInitialDraft` 已把数组 `join(', ')` 成**字符串**放进草稿；
     * - 防御路径：字段值仍为数组时（外部直接塞进来的数据）自己拼。
     * 原先落到 `default` 分支靠 `String(array)` 隐式拼逗号 —— 能显示，但没 placeholder，
     * 且数组带空元素时会多出连续逗号。
     */
    case 'tags': {
      const current = Array.isArray(value) ? value.map((part) => String(part)).join(',') : String(value ?? '')
      return (
        <input
          id={testId}
          type="text"
          className="form-input"
          data-testid={testId}
          placeholder="多个标签用逗号分隔"
          value={current}
          readOnly={!field.editable}
          onChange={(event) => onChange(event.target.value)}
        />
      )
    }
    /*
     * `image`：**只读路径框 + 「选择图片」按钮 + 实时预览**
     * （对齐 PyQt `dynamic_form.py::_create_image_widget` 的三件套：只读 QLineEdit +
     * 选择按钮 + `LazyImageLabel` 预览）。TS 原先落到 `default` 分支是**可编辑**单行框 ——
     * 路径得手打、且看不到图对不对。
     *
     * 预览图用主进程回传的 `data:` URL，但**不再依赖本会话刚选过的 `picked`**：
     * 直接用字段值（已保存的绝对路径）经 `images:readByPath` 回读 —— 这样打开已保存图片
     * 的条目也能看到图（对齐 PyQt `load_image(str(value))`）。渲染层直接引用 `C://...`
     * 会被 `webSecurity` 拦，故一律走主进程读文件转 data URL。
     */
    case 'image': {
      const current = value === null || value === undefined ? '' : String(value)
      return (
        <div className="image-field" data-testid={`${testId}-wrap`}>
          <div className="image-field-row">
            <input
              id={testId}
              type="text"
              className="form-input"
              data-testid={testId}
              placeholder="尚未选择图片"
              value={current}
              readOnly
            />
            <button
              type="button"
              className="btn slim"
              data-testid={`${testId}-pick`}
              disabled={picking || !field.editable}
              onClick={() => {
                setPicking(true)
                void window.mbApi.dialog
                  .chooseImageFile()
                  .then((pickedFile) => {
                    if (pickedFile.path === null) return
                    onChange(pickedFile.path)
                  })
                  .catch(() => undefined) // 取消/读失败都不打断表单
                  .finally(() => setPicking(false))
              }}
            >
              选择图片
            </button>
          </div>
          {/*
           * 预览改成 <LazyImage>：按「已保存的绝对路径」经主进程 `images:readByPath`
           * 回读 data URL。这样**打开已保存图片路径的条目**也能看到图（修复原 TS 只在
           * 刚选过才显示、打开已保存条目看不到图的问题，对齐 PyQt `load_image(str(value))`）。
           */}
          <LazyImage path={current} width={120} height={120} alt="图片预览" />
        </div>
      )
    }
    /*
     * `image_desc`：PyQt 是 QTextEdit 且 `setMaximumHeight(60)`（多行但比 desc 矮）。
     * TS 原先落到 `default` 单行输入框 —— 字段名带「描述」却是单行，长描述没法看全。
     */
    case 'image_desc':
      return (
        <div className="image-field" data-testid={`${testId}-wrap`}>
          <textarea
            id={testId}
            className="form-textarea image-desc-textarea"
            data-testid={testId}
            rows={2}
            value={String(value ?? '')}
            readOnly={!field.editable}
            onChange={(event) => onChange(event.target.value)}
          />
          <div className="field-ai-actions">
            <button
              type="button"
              className="btn slim"
              data-testid={`${testId}-auto-fill`}
              disabled={!field.editable}
              title="按条目名称填入占位描述（纯模板，不调用 AI）"
              onClick={() => onChange(buildAutoImageInfo(itemName, '').desc)}
            >
              {autoFillLabel()}
            </button>
          </div>
        </div>
      )
    /*
     * `desc` / `content` / `achievement_desc`：文本域 + 两个 AI 按钮
     * （对齐 PyQt `dynamic_form.py::_create_desc_widget`：QTextEdit(120px) + 「AI生成」「AI生图」两枚）。
     *
     * 「AI生图」与 PyQt **刻意不同**：PyQt 的 `_on_ai_image` 只是一句
     * `QMessageBox.information("AI图片生成功能需要配置API密钥")` 的**占位桩**（零能力）。
     * TS 侧接真实的 `image:generate`（项目已有该通道，且主进程会用钥匙串里的 Key 覆盖空串），
     * 否则这枚按钮就是「点了只弹一句你还没配 API」的装饰 —— 与项目「不放点了没反应的按钮」铁律冲突。
     */
    case 'desc':
    case 'content':
    case 'achievement_desc': {
      const current = String(value ?? '')
      const locked = !field.editable
      return (
        <div className="desc-field" data-testid={`${testId}-wrap`}>
          <textarea
            id={testId}
            className="form-textarea"
            data-testid={testId}
            rows={4}
            value={current}
            readOnly={locked}
            onChange={(event) => onChange(event.target.value)}
          />
          {aiAssist !== undefined && (
            <div className="field-ai-actions">
              <button
                type="button"
                className="btn slim accent-outline"
                data-testid={`${testId}-ai-generate`}
                disabled={locked || aiBusy !== null}
                title="按本表单已有的其它字段作为上下文，生成一段 50-100 字的描述"
                onClick={() =>
                  void runAi(
                    'desc',
                    () => aiAssist.generateDesc(field.label, current),
                    onChange
                  )
                }
              >
                {aiBusy === 'desc' ? '生成中…' : 'AI生成'}
              </button>
              <button
                type="button"
                className="btn slim"
                data-testid={`${testId}-ai-image`}
                disabled={locked || aiBusy !== null}
                title="用「AI生图」面板的同一套通道，按本条目名称与描述生成一张配图"
                onClick={() =>
                  void runAi(
                    'image',
                    () => aiAssist.generateImage(field.label),
                    (result) => onChange(`${current}${current === '' ? '' : '\n'}${result}`)
                  )
                }
              >
                {aiBusy === 'image' ? '生图中…' : 'AI生图'}
              </button>
              {aiError !== null && (
                <span className="form-hint field-ai-error" data-testid={`${testId}-ai-error`}>
                  {aiError}
                </span>
              )}
            </div>
          )}
        </div>
      )
    }
    /*
     * `image_tags`：单行标签框 + 「自动填充」「AI分析」
     * （对齐 PyQt `dynamic_form.py::_create_image_tags_widget` 的两枚按钮）。
     *
     * **「自动填充」不调 AI**：PyQt 的 `_on_auto_generate_image_info` 是纯字符串模板
     * （`f'{name}的图片描述'` / `f'{name},图片,游戏'`），按钮名里的「生成」容易误读成 AI。
     * TS 侧文案明确叫「自动填充」，语义与 PyQt 一致但不骗人（详见 shared/fieldAiAssist.ts）。
     */
    case 'image_tags': {
      const current = Array.isArray(value) ? value.map((part) => String(part)).join(', ') : String(value ?? '')
      const locked = !field.editable
      return (
        <div className="image-field" data-testid={`${testId}-wrap`}>
          <input
            id={testId}
            type="text"
            className="form-input"
            data-testid={testId}
            placeholder="多个标签用逗号分隔"
            value={current}
            readOnly={locked}
            onChange={(event) => onChange(event.target.value)}
          />
          <div className="field-ai-actions">
            <button
              type="button"
              className="btn slim"
              data-testid={`${testId}-auto-fill`}
              disabled={locked}
              title="按条目名称填入占位标签与描述（纯模板，不调用 AI）"
              onClick={() => onChange(buildAutoImageInfo(itemName, '').tags)}
            >
              {autoFillLabel()}
            </button>
            <button
              type="button"
              className="btn slim accent-outline"
              data-testid={`${testId}-ai-analyze`}
              disabled={locked || aiBusy !== null || (imagePath ?? '') === ''}
              title={
                (imagePath ?? '') === ''
                  ? '请先选择一张图片'
                  : '让模型读取图片路径并提取视觉标签（追加到现有标签后）'
              }
              onClick={() => {
                const path = imagePath ?? ''
                void runAi(
                  'analyze',
                  () => (aiAssist === undefined ? Promise.reject(new Error('AI 能力不可用')) : aiAssist.analyzeImageTags(path)),
                  (result) => onChange(mergeImageTagsResult(current, result))
                )
              }}
            >
              {aiBusy === 'analyze' ? '分析中…' : 'AI分析'}
            </button>
            {aiError !== null && (
              <span className="form-hint field-ai-error" data-testid={`${testId}-ai-error`}>
                {aiError}
              </span>
            )}
          </div>
        </div>
      )
    }
    /*
     * `dialog`：**只读展示当前 id + 下拉选择一条对话**
     * （对齐 PyQt `dynamic_form.py::_create_dialog_widget` + `_on_select_dialog`：
     * 只读 QLineEdit + 「选择对话」按钮 → 列出 `dialogs` 的 `id — name`，选中后写回其 **id**）。
     * TS 原先落到 `default` 分支是**可编辑**单行框 —— id 得手打、也没有候选可挑。
     */
    case 'dialog': {
      const current = value === null || value === undefined ? '' : String(value)
      const locked = !field.editable
      const known = dialogOptions.some((entry) => entry.id === current)
      const hasOptions = dialogOptions.length > 0
      return (
        <div className="dialog-field" data-testid={`${testId}-wrap`}>
          <select
            id={testId}
            className="form-select"
            data-testid={testId}
            value={current}
            disabled={locked || !hasOptions}
            title={hasOptions ? undefined : '没有可用的对话数据，请先在「对话」类型中创建数据'}
            onChange={(event) => onChange(event.target.value)}
          >
            <option value="">（未选择）</option>
            {/* 值指向已被删除的对话时保留原值可见（不静默清空），与 Python 的只读框行为一致 */}
            {current !== '' && !known && <option value={current}>{current}（已失效）</option>}
            {dialogOptions.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.id} — {itemNameOf(entry)}
              </option>
            ))}
          </select>
          {!hasOptions && (
            <span className="form-hint" data-testid={`${testId}-empty`}>
              没有可用的对话数据，请先在「对话」类型中创建数据
            </span>
          )}
        </div>
      )
    }
    default:
      return (
        <input
          id={testId}
          type="text"
          className="form-input"
          data-testid={testId}
          value={String(value ?? '')}
          readOnly={!field.editable}
          onChange={(event) => onChange(event.target.value)}
        />
      )
  }
}
export default function ItemForm({
  item,
  fields,
  types,
  gameStyle = '',
  onSaved,
  onEditType,
  onShowReferences,
  onAiGenerate,
  onDuplicated
}: ItemFormProps) {
  const [draft, setDraft] = useState<Record<string, unknown>>(() => buildInitialDraft(item.data, fields, item.type))
  const [saving, setSaving] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement | null>(null)
  const hasAttrTable = fields.some((field) => field.type === 'attrtable')
  const hasDialogField = fields.some((field) => field.type === 'dialog')
  const [attrSystem, setAttrSystem] = useState<AttrSystem | null>(null)
  const [attrSystemError, setAttrSystemError] = useState<string | null>(null)
  /** `dialog` 字段的候选对话（懒加载；无该形态字段时不请求） */
  const [dialogOptions, setDialogOptions] = useState<ItemRecord[]>([])

  // 属性系统懒加载（仅含 attrtable 字段的表单需要，用于计算预览）
  useEffect(() => {
    if (!hasAttrTable) return
    let cancelled = false
    window.mbApi.attrSystem
      .get()
      .then((system) => {
        if (!cancelled) setAttrSystem(system)
      })
      .catch((error: unknown) => {
        if (!cancelled) setAttrSystemError(error instanceof Error ? error.message : String(error))
      })
    return () => {
      cancelled = true
    }
  }, [hasAttrTable])

  // `dialog` 字段候选懒加载（对齐 PyQt `_on_select_dialog` 读 `data['dialogs']`）
  useEffect(() => {
    if (!hasDialogField) return undefined
    let cancelled = false
    window.mbApi.data
      .listItems({ type: 'dialog' })
      .then((items) => {
        if (!cancelled) setDialogOptions(items)
      })
      .catch(() => {
        // 读取失败按「暂无候选」处理（控件会显示空态提示），不打断整表单
        if (!cancelled) setDialogOptions([])
      })
    return () => {
      cancelled = true
    }
  }, [hasDialogField])

  // 「更多 ▸」下拉：点击别处关闭（对齐工具栏下拉的常规行为）
  useEffect(() => {
    if (!moreOpen) return
    const handleOutside = (event: MouseEvent): void => {
      const node = event.target
      if (moreRef.current !== null && node instanceof Node && !moreRef.current.contains(node)) {
        setMoreOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [moreOpen])

  const jsonFields = new Set(
    fields.filter((field) => usesJsonEditor(field, item.data[field.name])).map((field) => field.name)
  )

  /** 条目编辑器分区布局（分区/折叠/双列；未归组字段走兜底，一个都不丢） */
  const layout = useMemo(() => buildFormLayout(item.type, fields), [item.type, fields])

  const setValue = (name: string, value: unknown): void => {
    setDraft((current) => ({ ...current, [name]: value }))
  }

  /**
   * 模板联动：把选中的模板文本写进同类型的 `desc` 字段
   * （对齐 PyQt `dynamic_form.py::_on_template_changed` —— 它也是写进名为 `desc` 的 QTextEdit）。
   *
   * 两处刻意的收敛（都与 PyQt 不同，理由写明）：
   * - 只在**存在可编辑的 `desc` 字段**时才写；没有就只更新 template 本身，不凭空造字段。
   * - PyQt 的 `_apply_desc_template` 实际是 `return template_text`（**没有做 `{职业}` 占位符替换**，
   *   是留给子类实现的钩子）。TS 侧同样**不猜占位符语义**，只做原文写入 —— 免得替换错了
   *   悄悄改掉用户的数据。
   */
  /**
   * 字段级 AI 的系统提示词。
   *
   * PyQt 的 `generate_desc_only` 把角色说明**内联在 user prompt 里**（`prompt = f"""【角色】…"""`），
   * `system_prompt` 参数留空。TS 侧刻意拆成 system + prompt 两段：
   * 本地 ollama 的 system 段参与「格式遵循」，拆开后角色约束更稳；
   * **user prompt 的正文逐字照抄 PyQt**（见 `buildDescPrompt`），两边的提示词不打架。
   */
  const SYSTEM_PROMPT_TEXT = '你是一位游戏文案创作专家，擅长用精炼、有感染力的中文写出令人印象深刻的游戏描述。'

  /** 当前条目所属类型的中文名（PyQt 直接传 `data_type`，那是英文 id；TS 侧用中文名更像给人看的上下文） */
  const typeLabel = types.find((definition) => definition.id === item.type)?.name ?? item.type

  /** 当前草稿里 `image` 字段的路径（图片类 AI 按钮需要它才能分析） */
  const currentImagePath = (): string => {
    const value = draft['image']
    return typeof value === 'string' ? value : ''
  }

  const handleTemplatePicked = (templateText: string): void => {
    const descField = fields.find((item) => item.name === 'desc' && item.editable)
    if (descField === undefined) return
    setDraft((current) => ({ ...current, desc: templateText }))
  }

  const handleReset = (): void => {
    setDraft(buildInitialDraft(item.data, fields, item.type))
    setLocalError(null)
  }

  /* ---- 字段级 AI 辅助（对齐 PyQt `dynamic_form.py` 的四个回调） ----
     能力实现在这里、控件只管按钮与忙态 —— 这样上下文（整份表单草稿）只有一份真源。
     提示词组装在 `shared/fieldAiAssist.ts`（纯函数、可单测），此处只负责发 IPC 与取回结果。 */

  /** 当前草稿里的条目名（PyQt `data.get('name', '')`） */
  const currentItemName = (): string => {
    const value = draft['name']
    return typeof value === 'string' ? value : ''
  }

  /** 「AI生成」：把整份草稿（排除 desc/description/image/id）作为上下文交给模型 */
  const generateDescFor = async (fieldLabel: string, currentText: string): Promise<string> => {
    const api = window.mbApi as unknown as {
      llm: { generate: (req: { system: string; prompt: string }) => Promise<{ content: string }> }
    }
    const context = buildDescContext(typeLabel, draft)
    // 字段标签进上下文：同类型里 desc / content 语义不同（描述 vs 正文），模型得知道写哪个
    const prompt = `${buildDescPrompt(typeLabel, context)}\n【本次要填的字段】${fieldLabel}`
    const reply = await api.llm.generate({ system: SYSTEM_PROMPT_TEXT, prompt })
    const text = reply.content.trim()
    if (text === '') throw new Error('AI 未返回内容，请重试或检查本地模型')
    // 已有内容时追加而不是覆盖：用户手写的前半段不该被一键抹掉（PyQt 是直接 setPlainText 覆盖）
    return currentText === '' ? text : `${currentText}\n${text}`
  }

  /**
   * 「AI生图」：走项目既有的 `image:generate` 通道。
   *
   * 与 PyQt 的**本质差异**：PyQt `_on_ai_image` 只弹一句「需要配置API密钥」，是零能力桩；
   * TS 侧是真的去生图。这里必须先落盘路径 —— `image:generate` 要求 `saveDir`，
   * 未选过目录时弹原生目录选择框（复用 `dialog:chooseImageSaveDir`）。
   */
  const generateImageFor = async (fieldLabel: string): Promise<string> => {
    const api = window.mbApi as unknown as {
      dialog: { chooseImageSaveDir: () => Promise<{ path: string | null }> }
      settings: { hasSecret: (req: { name: string }) => Promise<{ has: boolean }> }
      image: {
        generate: (req: unknown) => Promise<{ ok: true; path: string } | { ok: false; error: string }>
      }
    }
    // 配置形态与 `ImageGenPanel` 保持一致：`apiKey` 传空串，主进程会用钥匙串里的真 Key 覆盖
    // （见 main/ipc.ts 的 image:generate handler）—— 渲染层永远碰不到明文。
    const stored = loadImageGenConfig()
    const hasKey = await api.settings.hasSecret({ name: SECRET_NAMES.imageGenApiKey })
    if (!hasKey.has) throw new Error('请先在「AI 生图」面板里配置 API Key')
    const config: ImageGenConfig = {
      enabled: true,
      provider: stored.provider,
      apiKey: '',
      model: stored.model.trim() === '' ? undefined : stored.model.trim(),
      baseUrl: stored.baseUrl.trim() === '' ? undefined : stored.baseUrl.trim()
    }
    const picked = await api.dialog.chooseImageSaveDir()
    if (picked.path === null) throw new Error('已取消：未选择保存目录')
    const subject = currentItemName()
    const prompt = subject === '' ? `为${fieldLabel}生成一张配图` : `为「${subject}」生成一张配图（${fieldLabel}）`
    const result = await api.image.generate({ config, prompt, saveDir: picked.path })
    if (!result.ok) throw new Error(result.error)
    return `配图已保存：${result.path}`
  }

  /** 「AI分析」：把图片路径交给模型提取标签（对齐 PyQt `_on_ai_analyze_image`） */
  const analyzeImageTagsFor = async (imagePath: string): Promise<string> => {
    const api = window.mbApi as unknown as {
      llm: { generate: (req: { system: string; prompt: string }) => Promise<{ content: string }> }
    }
    const reply = await api.llm.generate({
      system: SYSTEM_PROMPT_TEXT,
      prompt: buildImageTagsPrompt(imagePath)
    })
    const text = reply.content.trim()
    if (text === '') throw new Error('AI 未返回内容，请重试或检查本地模型')
    return text
  }

  /** 传给所有字段控件的 AI 能力（一次构造，值稳定） */
  const aiAssist = useMemo<FieldAiAssist>(
    () => ({ generateDesc: generateDescFor, generateImage: generateImageFor, analyzeImageTags: analyzeImageTagsFor }),
    // 依赖草稿与类型名：这两个进了提示词与生图 prompt，必须跟着变
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft, typeLabel]
  )

  const handleSave = async (): Promise<void> => {
    setLocalError(null)
    try {
      const payload = buildPayload(draft, fields, item.id, jsonFields)
      setSaving(true)
      const updated = await window.mbApi.data.updateItem({ id: item.id, data: payload })
      onSaved(updated)
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  /**
   * 复制当前条目为独立副本（对应 PyQt `data_tab._on_copy_clicked`）：
   * 沿用当前表单内容 + 新 id（主进程 `createItem` 生成，对应 Python `generate_id`）。
   * 副本不带原 id——`DataService.updateItem` 会在下次保存时把 data.id 与记录 id 对齐。
   */
  const handleDuplicate = async (): Promise<void> => {
    setLocalError(null)
    try {
      const payload = buildPayload(draft, fields, item.id, jsonFields)
      delete payload.id
      setSaving(true)
      const created = await window.mbApi.data.createItem({ type: item.type, data: payload })
      if (onDuplicated) {
        onDuplicated(created)
      } else {
        onSaved(created)
      }
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  /** 单个字段的编辑控件（不含标签；标签由分区分发处负责） */
  const renderFieldControl = (field: TypeFieldDef): React.ReactElement => {
    if (field.type === 'attrtable') {
      return (
        <AttrTableEditor
          fieldName={field.name}
          rows={asAttrRows(draft[field.name])}
          attrSystem={attrSystem}
          systemError={attrSystemError}
          onChange={(rows) => setValue(field.name, rows)}
        />
      )
    }
    if (field.type === 'attrpanel') {
      return (
        <AttrPanelEditor
          fieldName={field.name}
          typeId={item.type}
          rows={asAttrPanelRows(draft[field.name])}
          onChange={(rows) => setValue(field.name, rows)}
        />
      )
    }
    if (field.type === 'multiselect' && !jsonFields.has(field.name)) {
      return (
        <RefTableEditor
          fieldName={field.name}
          refType={field.refType ?? ''}
          types={types}
          entries={asRefEntries(draft[field.name])}
          onChange={(entries) => setValue(field.name, entries)}
        />
      )
    }
    if (field.type === 'droptable' && !jsonFields.has(field.name)) {
      return (
        <DropTableEditor
          fieldName={field.name}
          entries={asDropEntries(draft[field.name])}
          onChange={(entries) => setValue(field.name, entries)}
        />
      )
    }
    return (
      <FieldControl
        field={field}
        value={draft[field.name]}
        jsonMode={jsonFields.has(field.name)}
        onChange={(value) => setValue(field.name, value)}
        onTemplatePicked={handleTemplatePicked}
        aiAssist={aiAssist}
        imagePath={currentImagePath()}
        itemName={currentItemName()}
        dialogOptions={dialogOptions}
      />
    )
  }

  /** 普通字段行（标签 + 控件） */
  const renderFieldRow = (field: TypeFieldDef, label: string): React.ReactElement => (
    <div className="form-row" key={field.name}>
      <label className="form-label" htmlFor={`field-${field.name}`}>
        {label}
      </label>
      {renderFieldControl(field)}
    </div>
  )

  return (
    <aside className="editor" data-testid="item-editor">
      <div className="editor-header">
        <div className="editor-title">
          {String(item.data.name ?? item.id)}
          <small>{item.id}</small>
        </div>
      </div>

      <div className="editor-body">
        {localError && <div className="form-error">{localError}</div>}
        {layout.sections.map((section, index) => (
          <FormSectionCard
            key={`${section.title}-${index}`}
            title={section.title}
            icon={section.icon}
            collapsed={section.collapsed}
            testId={`form-section-${index}`}
          >
            {section.panelField !== null ? (
              (() => {
                const panel = fields.find((field) => field.name === section.panelField)
                return panel ? renderFieldControl(panel) : null
              })()
            ) : section.layout === 'grid' ? (
              <div className="form-grid" data-testid={`form-section-${index}-grid`}>
                {section.fields.map((field) => renderFieldRow(field, fieldLabelFor(field, 'grid', gameStyle)))}
              </div>
            ) : (
              section.fields.map((field) => renderFieldRow(field, fieldLabelFor(field, 'form', gameStyle)))
            )}
          </FormSectionCard>
        ))}
        {layout.ungrouped.map((field) =>
          isComplexFieldType(field.type) ? (
            // 兜底：复杂控件单独成区（对应 Python P0-2），避免与普通字段混排
            <FormSectionCard
              key={field.name}
              title={resolveFieldLabel(field.label, gameStyle)}
              icon="📋"
              collapsed={false}
              testId={`form-section-ungrouped-${field.name}`}
            >
              {renderFieldControl(field)}
            </FormSectionCard>
          ) : (
            renderFieldRow(field, fieldLabelFor(field, 'form', gameStyle))
          )
        )}
      </div>

      <div className="editor-actions">
        <button type="button" className="btn" disabled={saving} onClick={handleReset}>
          重置
        </button>
        <button type="button" className="btn primary" disabled={saving} onClick={() => void handleSave()}>
          保存
        </button>
        <button
          type="button"
          className="btn"
          data-testid="item-form-duplicate"
          disabled={saving}
          onClick={() => void handleDuplicate()}
        >
          复制
        </button>
        {onAiGenerate !== undefined && (
          <button
            type="button"
            className="btn"
            data-testid="item-form-ai-generate"
            onClick={() => onAiGenerate(item.type)}
          >
            <LucideIcon name="bot" size={14} />
            AI 生成
          </button>
        )}
        {/*
          「更多 ▸」收纳低频项（对应 PyQt data_tab 的 more_btn 菜单）。
          每一项仅在父级确实传入了回调时才渲染，保证菜单里不存在点了没反应的死控件。
          新建 / 删除按既有约定留在左栏（DataEditorTab），此处不再重复。
        */}
        {(onEditType !== undefined || onShowReferences !== undefined) && (
          <div className="toolbar-more" ref={moreRef}>
            <button
              type="button"
              className="btn"
              data-testid="item-form-more"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((open) => !open)}
            >
              更多
              <LucideIcon name="chevron-down" size={14} />
            </button>
            {moreOpen && (
              <div className="toolbar-more-menu" data-testid="item-form-more-menu">
                {onEditType !== undefined && (
                  <div className="toolbar-more-group">
                    <button
                      type="button"
                      className="toolbar-more-item"
                      data-testid="item-form-more-edit-type"
                      onClick={() => {
                        setMoreOpen(false)
                        onEditType(item.type)
                      }}
                    >
                      <LucideIcon name="settings" size={14} />
                      编辑当前类型字段结构
                    </button>
                  </div>
                )}
                {onShowReferences !== undefined && (
                  <div className="toolbar-more-group">
                    <button
                      type="button"
                      className="toolbar-more-item"
                      data-testid="item-form-more-references"
                      onClick={() => {
                        setMoreOpen(false)
                        onShowReferences({
                          type: item.type,
                          id: item.id,
                          name: String(item.data.name ?? item.id)
                        })
                      }}
                    >
                      <LucideIcon name="link" size={14} />
                      查看此项的引用关系
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}