import { useState } from 'react'

import { buildAutoImageInfo, autoFillLabel, mergeImageTagsResult } from '../../../shared/util/field/fieldAiAssist'
import type { ItemRecord, TypeFieldDef } from '../../../shared/types'
import LazyImage from './LazyImage'
import { itemNameOf } from './itemFormUtils'

interface FieldControlProps {
  field: TypeFieldDef
  value: unknown
  jsonMode: boolean
  onChange: (value: unknown) => void
  /**
   * `template` 字段被选中/输入时回调。
   * 用来把模板文本联动写进同类型的 `desc` 字段 —— 语义由调用方决定，这里只负责传出来。
   */
  onTemplatePicked?: (templateText: string) => void
  /**
   * 字段级 AI 辅助所需的上下文（旧版 `dynamic_form::_create_desc_widget` 等
   * 靠 `self.get_data()` / `self.widgets` 拿同表单的其它值）。
   * TS 侧由 ItemForm 显式传入 —— **不引全局单例**，组件自己不知道整份表单长什么样。
   */
  aiAssist?: FieldAiAssist
  /** 当前表单里 `image` 字段的值（图片类按钮需要路径才能分析/生图） */
  imagePath?: string
  /** 当前条目的名称 */
  itemName?: string
  /**
   * `dialog` 字段可选的对话条目（对齐 旧版 `dynamic_form::_on_select_dialog`：
   * 从 `data['dialogs']` 里选一条，写回其 **id**，列表显示 `id — name`）。
   * 由 ItemForm 懒加载后传入；缺省空数组时控件禁用并给出提示。
   */
  dialogOptions?: readonly ItemRecord[]
}

export interface FieldAiAssist {
  /** 生成 desc */
  generateDesc: (fieldLabel: string, currentText: string) => Promise<string>
  /**
   * 为某个字段生成配图。
   * 旧版 只是 `QMessageBox.information("需要配置API密钥")` 的**占位桩**；
   * TS 侧接真实的 `image:generate`（项目已有该通道）—— 详见 ItemForm 里的说明。
   */
  generateImage: (prompt: string) => Promise<string>
  /** 现有图片路径存在时，让模型提取标签 */
  analyzeImageTags: (imagePath: string) => Promise<string>
}

export function FieldControl({
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
     * `template`：**可编辑**的模板框（对齐 旧版 `dynamic_form::_create_template_widget`
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
              // 旧版：模板文本变化即联动写入 desc（清空不算，避免误清描述）
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
     * `tags`：旧版 `dynamic_form` 的 tags 分支是 QLineEdit + placeholder
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
     * `image`：**点选式方框** —— 空态是虚线框 + 居中「+」，点一下选图；
     * 有图则显示预览，方框本身就是「点击更换」的热区。
     *
     * ## 为什么从「三件套」改成点选式
     * 旧版 原版是「只读路径框 + 选择按钮 + 预览」三件套挤成一行：既看不出哪里能点，
     * 又在已经很挤的表单列里吃掉一整行宽度。这里改成通行的「头像上传」交互 ——
     * 空态一个虚线方框中间一个 `+`，所见即所得、点击区域就是预览区域。
     *
     * 保留 `id` / `data-testid` 与只读路径框（缩小为 11px 提示行）：路径本身有排查价值
     * （「图片文件不存在」时要能看出指向哪），但不再占据主视觉。
     *
     * 预览仍走 `LazyImage`：按字段值（已保存的绝对路径）经主进程 `images:readByPath`
     * 回读 data URL，**打开已保存图片的条目也能看到图**。
     * 渲染层直接引用 `C://...` 会被 `webSecurity` 拦，故一律走主进程转 data URL。
     */
    case 'image': {
      const current = value === null || value === undefined ? '' : String(value)
      const hasImage = current !== ''
      const pick = (): void => {
        setPicking(true)
        void window.mbApi.dialog
          .chooseImageFile()
          .then((pickedFile) => {
            if (pickedFile.path === null) return
            onChange(pickedFile.path)
          })
          .catch(() => undefined) // 取消/读失败都不打断表单
          .finally(() => setPicking(false))
      }
      return (
        <div className="image-field" data-testid={`${testId}-wrap`}>
          <button
            type="button"
            className={`image-picker${hasImage ? ' has-image' : ''}`}
            data-testid={`${testId}-pick`}
            disabled={picking || !field.editable}
            onClick={pick}
            title={hasImage ? '点击更换图片' : '点击选择图片'}
            aria-label={hasImage ? '更换图片' : '选择图片'}
          >
            {picking ? (
              <span className="image-picker-hint">读取中…</span>
            ) : hasImage ? (
              <LazyImage path={current} width={120} height={120} alt="图片预览" className="image-picker-img" />
            ) : (
              <span className="image-picker-plus" aria-hidden="true">
                +
              </span>
            )}
          </button>
          <div className="image-field-foot">
            {hasImage ? (
              <>
                <span className="image-field-tip">点击方框可更换</span>
                <input
                  id={testId}
                  type="text"
                  className="image-field-path"
                  data-testid={testId}
                  value={current}
                  readOnly
                  title={current}
                />
              </>
            ) : (
              /*
               * 空态只留一行提示：原先「点击「+」选择图片」+ 输入框占位「尚未选择图片」
               * 是两句话讲同一件事，纯噪音。输入框本身仍要存在（label 的 htmlFor 指向它），
               * 故保留为不可见的值载体。
               */
              <>
                <span className="image-field-tip">点击「+」选择图片</span>
                <input
                  id={testId}
                  type="text"
                  className="image-field-path sr-only"
                  data-testid={testId}
                  value={current}
                  readOnly
                />
              </>
            )}
          </div>
        </div>
      )
    }
    /*
     * `image_desc`：旧版 是 QTextEdit 且 `setMaximumHeight(60)`（多行但比 desc 矮）。
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
     * 。
     *
     * 「AI生图」与 旧版 **刻意不同**：旧版 的 `_on_ai_image` 只是一句
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
     * 。
     *
     * **「自动填充」不调 AI**：旧版 的 `_on_auto_generate_image_info` 是纯字符串模板
     * （`f'{name}的图片描述'` / `f'{name},图片,游戏'`），按钮名里的「生成」容易误读成 AI。
     * TS 侧文案明确叫「自动填充」，语义与 旧版 一致但不骗人（详见 shared/util/fieldAiAssist.ts）。
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
     * （对齐 旧版 `dynamic_form::_create_dialog_widget` + `_on_select_dialog`：
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
            {/* 值指向已被删除的对话时保留原值可见（不静默清空），与 旧版 的只读框行为一致 */}
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
