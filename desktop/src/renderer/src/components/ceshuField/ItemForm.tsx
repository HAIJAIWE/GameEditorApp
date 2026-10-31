import { useEffect, useMemo, useRef, useState } from 'react'

import {
  buildDescContext,
  buildDescPrompt,
  buildImageTagsPrompt
} from '../../../../shared/util/field'
import type { ImageGenConfig } from '../../../../shared/config/llm'
import { loadImageGenConfig } from '../../../../shared/config/llm'
import { SECRET_NAMES } from '../../../../shared/config/secrets'
import { resolveFieldLabel } from '../../../../shared/config/game'
import { displayItemId } from '../../../../shared/util/id'
import type { AttrSystem } from '../../../../shared/attrSystem'
import { buildFormLayout } from '../../../../shared/schema/core'
import type { DataTypeDef, ItemRecord, TypeFieldDef } from '../../../../shared/types'

import { AttrPanelEditor } from '../attr'
import { AttrTableEditor } from '../attr'
import { DropTableEditor } from '../data'
import FormSectionCard from './FormSectionCard'
import { LucideIcon } from '../common'
import RefTableEditor from './RefTableEditor'

import {
  asAttrRows,
  asAttrPanelRows,
  asDropEntries,
  asRefEntries,
  buildInitialDraft,
  buildPayload,
  usesJsonEditor
} from '../itemFormUtils'
import { FieldControl } from './FieldControl'
import type { FieldAiAssist } from './FieldControl'


interface ItemFormProps {
  item: ItemRecord
  fields: TypeFieldDef[]
  /** 全部数据类型定义（引用类字段解析 refType → 单数 id + 中文名） */
  types: readonly DataTypeDef[]
  /**
   * 当前活跃的游戏风格 id（`game_styles.json` 的 id，如 `xianxia`）。
   * 用于按风格替换字段标签术语；
   * `''` = 不启用，标签原样显示。
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
  /**
   * 删除当前条目（父级 DataEditorTab 执行 deleteItem + 列表刷新 + 选中清空）。
   * 对应 旧版 `data_tab` 底部操作栏的「删除」钮；未提供则不渲染该按钮。
   */
  onDelete?: () => void
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
  onDuplicated,
  onDelete
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

  // `dialog` 字段候选懒加载
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

  const setValue = (name: string, value: unknown): void => {
    setDraft((current) => ({ ...current, [name]: value }))
  }

  /**
   * 模板联动：把选中的模板文本写进同类型的 `desc` 字段
   * 。
   *
   * 两处刻意的收敛：
   * - 只在**存在可编辑的 `desc` 字段**时才写；没有就只更新 template 本身，不凭空造字段。
   * - 旧版 的 `_apply_desc_template` 实际是 `return template_text`（**没有做 `{职业}` 占位符替换**，
   *   是留给子类实现的钩子）。TS 侧同样**不猜占位符语义**，只做原文写入 —— 免得替换错了
   *   悄悄改掉用户的数据。
   */
  /**
   * 字段级 AI 的系统提示词。
   *
   * 旧版 的 `generate_desc_only` 把角色说明**内联在 user prompt 里**（`prompt = f"""【角色】…"""`），
   * `system_prompt` 参数留空。TS 侧刻意拆成 system + prompt 两段：
   * 本地 ollama 的 system 段参与「格式遵循」，拆开后角色约束更稳；
   * **user prompt 的正文逐字照抄 旧版**（见 `buildDescPrompt`），两边的提示词不打架。
   */
  const SYSTEM_PROMPT_TEXT = '你是一位游戏文案创作专家，擅长用精炼、有感染力的中文写出令人印象深刻的游戏描述。'

  /** 当前条目所属类型的中文名 */
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

  /* ---- 字段级 AI 辅助 ----
     能力实现在这里、控件只管按钮与忙态 —— 这样上下文（整份表单草稿）只有一份真源。
     提示词组装在 `shared/util/fieldAiAssist.ts`（纯函数、可单测），此处只负责发 IPC 与取回结果。 */

  /** 当前草稿里的条目名 */
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
    // 已有内容时追加而不是覆盖：用户手写的前半段不该被一键抹掉
    return currentText === '' ? text : `${currentText}\n${text}`
  }

  /**
   * 「AI生图」：走项目既有的 `image:generate` 通道。
   *
   * 与 旧版 的**本质差异**：旧版 `_on_ai_image` 只弹一句「需要配置API密钥」，是零能力桩；
   * TS 侧是真的去生图。这里必须先落盘路径 —— `image:generate` 要求 `saveDir`，
   * 未选过目录时弹原生目录选择框（复用 `dialog:chooseImageSaveDir`）。
   */
  const generateImageFor = async (fieldLabel: string): Promise<string> => {
    const api = window.mbApi as unknown as {
      images: { libraryDir: () => Promise<{ dir: string }> }
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
    /*
     * 保存目录固定取**库图片目录**（`images:libraryDir`，不存在则创建）。
     * 原先让用户自选目录，图就散落在各处、和库脱钩 —— 工程一搬家/备份，图全丢，
     * 而未用清理也扫不到它们。进库后字段存的是库相对路径，整套设施才接得上。
     */
    const { dir } = await api.images.libraryDir()
    const subject = currentItemName()
    const prompt = subject === '' ? `为${fieldLabel}生成一张配图` : `为「${subject}」生成一张配图（${fieldLabel}）`
    const result = await api.image.generate({ config, prompt, saveDir: dir })
    if (!result.ok) throw new Error(result.error)
    return `配图已保存：${result.path}`
  }

  /** 「AI分析」：把图片路径交给模型提取标签 */
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
      const payload = buildPayload(draft, fields, jsonFields)
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
   * 复制当前条目为独立副本：
   * 沿用当前表单内容 + 新短 id。
   * 副本不带原 id（`delete payload.id`）⇒ 落库时分配该类型下一个序号。
   */
  const handleDuplicate = async (): Promise<void> => {
    setLocalError(null)
    try {
      const payload = buildPayload(draft, fields, jsonFields)
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

  /** 单个字段的编辑控件（不含标签；标签由字段行渲染处负责） */
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

  /**
   * 字段行（标签 + 控件）—— 分区间与兜底路径的**唯一**行形态。
   *
   * 行本身对齐 旧版 `ui/widgets/dynamic_form::_build_form` 的 `QFormLayout`：
   * 一行一个字段、标签左控件右。2026-10-13 曾把分区整体拉平（当时用户满意扁平一列），
   * 2026-10-19 又对照分区版截图要求恢复 ⇒ 现在**行形态不变，只把行归进可折叠分区**。
   *
   * 标签口径：字段自身 label 经 `resolveFieldLabel` 术语替换（E21 游戏风格）；
   * **不套** 旧 grid 时代的 `STAT_LABELS` emoji 前缀（📊数值/⏱️CD）—— 目标截图里就是原始标签。
   */
  // 类型自带的「自定义分区」（模板/用户定义）优先于内置 FORM_GROUPS；
  // 从 `types` 里按 id 取当前类型的 sections，取不到则 undefined（回落内置/兜底）。
  const typeSections = useMemo(
    () => types.find((def) => def.id === item.type)?.sections,
    [types, item.type]
  )
  const formLayout = useMemo(
    () => buildFormLayout(item.type, fields, typeSections),
    [item.type, fields, typeSections]
  )
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
          {/* 裸 id（如「0」）单看没有意义，加 `#` 前缀标明这是标识符而不是数值字段 */}
          <small>#{displayItemId(item)}</small>
        </div>
      </div>

      <div className="editor-body">
        {localError && <div className="form-error">{localError}</div>}
        {/*
          字段偏少时的引导：分区数量由**字段**决定，用户看到「只有一个分区」时
          很容易以为编辑器坏了，而不知道字段可以在「字段结构编辑器」里整体换模板。
          放在**顶部**（不是表单末尾）：末尾会被操作栏截断，而这条提示恰恰是
          用来解释「为什么表单这么空」的，必须一进来就看到。
          只在字段 < 5 时出现（内置类型 15+ 字段不会看到）。
        */}
        {fields.length < 5 && onEditType !== undefined && (
          <div className="form-hint-row" data-testid="item-form-few-fields">
            <span>
              这个类型只有 {fields.length} 个字段，所以只有 {formLayout.sections.length} 个分区。
              不同玩法需要的字段不同，可在「字段结构编辑器」里套用模板（RPG角色 / 卡牌TCG / 策略SLG单位 等）。
            </span>
            <button type="button" className="btn slim" onClick={() => onEditType(item.type)}>
              配置字段
            </button>
          </div>
        )}
        {/*
          折叠分区。
          分区内仍是「标签左、控件右」的扁平行 —— 拉平期确立的行形态原样保留，
          变的只是「行被归到哪个可折叠分组里」。复杂控件（属性面板/属性表/引用表）
          在 旧版 侧本就该单独成区，这里由 buildFormLayout 兜底保证。
         */}
        {formLayout.sections.map((section) => (
          <FormSectionCard key={section.title} title={section.title} icon={section.icon} defaultCollapsed={section.collapsed}>
            {section.fields.map((field) => renderFieldRow(field, resolveFieldLabel(field.label, gameStyle)))}
          </FormSectionCard>
        ))}
        {/*
          字段偏少时的引导：分区数量由**字段**决定，用户看到「只有一个分区」时
          很容易以为编辑器坏了，而不知道字段可以在「字段结构编辑器」里整体换模板。
          只在字段 < 5 时出现（内置类型 15+ 字段不会看到），且提供直达入口。
        */}
      </div>

      <div className="editor-actions">
        <button type="button" className="btn" disabled={saving} onClick={handleReset}>
          重置
        </button>
        <button type="button" className="btn primary" disabled={saving} onClick={() => void handleSave()}>
          保存
        </button>
        {onDelete !== undefined && (
          <button
            type="button"
            className="btn danger"
            data-testid="item-form-delete"
            disabled={saving}
            onClick={onDelete}
          >
            <LucideIcon name="trash" size={14} />
            删除
          </button>
        )}
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
          「更多 ▸」收纳低频项。
          每一项仅在父级确实传入了回调时才渲染，保证菜单里不存在点了没反应的死控件。
          注：删除已从行内图标移至本操作栏；新建仍留在左栏。
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
