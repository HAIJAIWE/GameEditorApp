import {
  CHAPTER_KEYS,
  CHAPTER_LABELS,
  enabledModuleChapters,
  visibleChapterKeys,
  type CeshuColumnDef,
  type CeshuDocument,
  type CeshuFieldDef,
  type ChapterData,
  type ChapterKey,
  type GddScope
} from '@mobai/shared/ceshu/reference'
import { CESHU_CHAPTER_FIELDS, fieldLabelOf } from '@mobai/shared/ceshu/fields'
import {
  SYSTEM_CONFIG_SCHEMA,
  chapterDataForDoc,
  chapterFieldsForDoc,
  chapterLabelForDoc,
  getGameType,
  getGddScope,
  isPlainObject,
  isSoftwareDoc,
  visibleChaptersForDoc
} from '@mobai/shared/ceshu/model'
import { isMachineDataField, readPath } from '@mobai/shared/ceshu/workflow'
import { splitRow, toRows } from '@mobai/shared/ceshu/workflow'
import {
  expandPersonaEntries,
  extraKeyLabelFor,
  extraKeyPlacementFor,
  formatExtraKeyValue
} from './extraFieldRules'

/**
 * 导出器公用工具。
 * 供 markdown / html / docx / pptx / pdf 共用的字段格式化与章节渲染辅助。
 */

/** 空值显示符 */
export const EMPTY_PLACEHOLDER = '—'

/**
 * 整章没生成时的提示（markdown / docx / html / pptx 共用一个常量）。
 *
 * 2026-11-09 实测真实导出：22 页 docx 里有 6 页只有半角的 `(本章暂无内容)`，
 * 既没说明这一章是「没跑过 AI 生成」还是「生成了但写空了」，也没告诉用户下一步该做什么。
 * 改成全角括号 + 明确动作，并收口到一个常量——原先 4 个渲染器各写一份，措辞已经开始漂。
 */
export const EMPTY_CHAPTER_NOTICE = '（本章未生成内容：用 AI 生成补齐这一章后再导出）'

/**
 * 空值判定：null / undefined / 空白字符串 / 空列表 / 空字典。
 * 注意：数值 0 与布尔 false 不视为空（业务上可能是有效值）。
 */
export function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  if (isPlainObject(value)) return Object.keys(value).length === 0
  return false
}

export interface FormatFieldOptions {
  /** 缩进层级，每层两个空格 */
  indent?: number
  /** 列表项前缀（docx 用 "- "，pptx 用 "• "） */
  bullet?: string
}

/**
 * 字段值 → 人类可读多行文本（空值统一返回 '—'）。
 * 与 旧版 format_field_value 行为一致：列表逐项加 bullet，字典按键值展开并对嵌套缩进。
 */
export function formatFieldValue(value: unknown, options: FormatFieldOptions = {}): string {
  const indent = options.indent ?? 0
  const bullet = options.bullet ?? '- '

  if (value === null || value === undefined) return EMPTY_PLACEHOLDER
  if (typeof value === 'string') return value.trim() ? value : EMPTY_PLACEHOLDER
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'number') return String(value)

  if (Array.isArray(value)) {
    if (value.length === 0) return EMPTY_PLACEHOLDER
    const prefix = '  '.repeat(indent) + bullet
    return value
      .map((item) => {
        if (isPlainObject(item)) {
          const parts = Object.entries(item)
            .filter(([, inner]) => !isEmptyValue(inner))
            .map(([key, inner]) => `${key}: ${formatScalar(inner)}`)
          return prefix + (parts.length > 0 ? parts.join(' | ') : '(空)')
        }
        if (typeof item === 'string') {
          // 模型常自带「- 」前缀（2026-11-09 实测导出成品出现「- - 不开发移动端版本」）
          return prefix + item.replace(/^\s*[-*·•]\s+/, '')
        }
        return prefix + String(item)
      })
      .join('\n')
  }

  if (isPlainObject(value)) {
    if (Object.keys(value).length === 0) return EMPTY_PLACEHOLDER
    const prefix = '  '.repeat(indent)
    return Object.entries(value)
      .map(([key, inner]) => {
        if (isPlainObject(inner) || Array.isArray(inner)) {
          const nested = formatFieldValue(inner, { indent: indent + 1, bullet })
          return `${prefix}${key}:\n${prefix}  ${nested}`
        }
        return `${prefix}${key}: ${formatFieldValue(inner, { indent, bullet })}`
      })
      .join('\n')
  }

  return String(value)
}

/**
 * 枚举码 → 中文文案（按字段定义的 `optionLabels`）。
 *
 * 2026-11-09 实测：导出 docx/html/markdown/pptx/excel 时，meta 的
 * `status` / `confidentiality` / `gdd_scope` 直接印出 `draft` / `internal` / `full`，
 * 系统配置详情更是整片英文 key（`turn_mode: turn_based`）。字段定义里其实早就有
 * `optionLabels`，只是一页摘要（packages/shared/src/ceshu/export/onePage.ts）用了
 * `displayFieldValue`、其余导出格式全都没用 —— 同一份数据两个口径。
 *
 * 这里补上导出侧的本地化，且**只在有字段定义时**做：扩展键（schema 外）无法判断语义，
 * 原样返回比瞎猜安全。
 */
function localizedOptionValue(
  field: Pick<CeshuFieldDef, 'kind' | 'optionLabels'> | undefined,
  value: unknown
): unknown {
  if (field === undefined || field.optionLabels === undefined) return value
  if ((field.kind === 'combo' || field.kind === 'checkbox') && typeof value === 'string') {
    return field.optionLabels[value] ?? value
  }
  if ((field.kind === 'multiCombo' || field.kind === 'stringList') && Array.isArray(value)) {
    return value.map((item) => (typeof item === 'string' ? (field.optionLabels?.[item] ?? item) : item))
  }
  return value
}

/** 按**章节 key**取字段定义做本地化后格式化（游戏档 narrative / homepage 等用） */
export function formatFieldValueByKey(
  chapterKey: ChapterKey,
  key: string,
  value: unknown,
  options: FormatFieldOptions = {}
): string {
  return formatFieldValue(localizedOptionValue(fieldDef(chapterKey, key), value), options)
}

/** 按**文档档位**取字段定义做本地化后格式化（GDD 与 SDD 章节/字段表不同源） */
export function formatFieldValueForDoc(
  doc: CeshuDocument,
  chapter: string,
  key: string,
  value: unknown,
  options: FormatFieldOptions = {}
): string {
  return formatFieldValue(localizedOptionValue(fieldDefForDoc(doc, chapter, key), value), options)
}

/** 列表内对象的标量显示 */
function formatScalar(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'number') return String(value)
  if (isPlainObject(value) || Array.isArray(value)) return JSON.stringify(value)
  return value === null || value === undefined ? EMPTY_PLACEHOLDER : String(value)
}

/**
 * 系统配置的一行（已本地化）。
 *
 * 口径对齐交接包 `ceshuHandoffRenderDoc.renderSystemBlock`（label + 值 + 可选范围）：
 * 交接包早就用 `SYSTEM_CONFIG_SCHEMA` 把 `turn_mode` 翻成「战斗模式」、把
 * `turn_based` 翻成「回合制」，而 GDD 的 docx/html/markdown/pptx/excel 五个导出器
 * 各自 `Object.entries(config)` 直接印英文 key（2026-11-09 实测成品可见
 * `turn_mode=turn_based`），读者拿到的是一张只有内部人能看懂的配置表。
 */
export interface SystemConfigRow {
  /** config 里的原始 key（保留给机器读，不要拿去当列名） */
  key: string
  /** 中文列名（schema 里没有的扩展键回退成 key） */
  label: string
  /** 已本地化的值（多行值保留换行，由渲染器决定怎么摊平） */
  value: string
  /** 可选范围（combo 列出全部 optionLabels；number 给区间；其余为空串） */
  range: string
}

/** 单个系统配置字段的中文列名 */
export function systemConfigLabel(systemId: string, key: string): string {
  return SYSTEM_CONFIG_SCHEMA[systemId]?.[key]?.label ?? key
}

/** 单个系统配置值的本地化格式化（表格式导出按「系统 × 字段」逐个取用时） */
export function formatSystemConfigValue(systemId: string, key: string, value: unknown): string {
  return formatFieldValue(localizedOptionValue(SYSTEM_CONFIG_SCHEMA[systemId]?.[key], value))
}

/** 已启用系统的配置项 → 本地化行（跳过空值，保持 config 键序） */
export function systemConfigRows(systemId: string, config: Record<string, unknown>): SystemConfigRow[] {
  const schema = SYSTEM_CONFIG_SCHEMA[systemId] ?? {}
  const rows: SystemConfigRow[] = []
  for (const [key, raw] of Object.entries(config)) {
    if (isEmptyValue(raw)) continue
    const def = schema[key]
    rows.push({
      key,
      label: def?.label ?? key,
      value: formatFieldValue(localizedOptionValue(def, raw)),
      range:
        def?.values !== undefined
          ? def.values.map((item) => def.optionLabels?.[item] ?? item).join(' / ')
          : def?.from !== undefined
            ? `${def.from}–${def.to}`
            : ''
    })
  }
  return rows
}

/** 系统分组：(已启用, 未启用)，顺序保持数据键序 */
export function classifySystems(data: ChapterData | undefined): Array<[string, ChapterData]>[] {
  const enabled: Array<[string, ChapterData]> = []
  const disabled: Array<[string, ChapterData]> = []
  for (const [systemId, systemData] of Object.entries(data ?? {})) {
    if (!isPlainObject(systemData)) continue
    if (systemData.enabled === true) {
      enabled.push([systemId, systemData])
    } else {
      disabled.push([systemId, systemData])
    }
  }
  return [enabled, disabled]
}

/** 字段定义（key → label/kind/columns）；schema 里没有的扩展键返回 undefined */
export function fieldDef(chapterKey: ChapterKey, key: string): CeshuFieldDef | undefined {
  return (CESHU_CHAPTER_FIELDS[chapterKey] ?? []).find((field) => field.key === key)
}

/**
 * 字段中文标签。
 *
 * 优先取导出侧对「schema 外扩展键」的显式标签（extraFieldRules），
 * 其次取 schema 里的 label；两者都没有才回落成 key 本身（至少不丢信息）。
 */
export function fieldLabel(chapterKey: ChapterKey, key: string): string {
  return extraKeyLabelFor(chapterKey, key) ?? fieldLabelOf(chapterKey, key)
}

/** schema 阅读顺序索引（schema 外扩展键排到最后） */
function schemaOrder(chapterKey: ChapterKey): Map<string, number> {
  return new Map((CESHU_CHAPTER_FIELDS[chapterKey] ?? []).map((field, index) => [field.key, index]))
}

/** 字段在 schema 里的位置（未收录 → 末尾），供点路径字段插回原位 */
function orderIndexOf(chapterKey: ChapterKey, key: string): number {
  return schemaOrder(chapterKey).get(key) ?? Number.MAX_SAFE_INTEGER
}

function bySchemaOrder(chapterKey: ChapterKey, keys: string[]): string[] {
  const order = schemaOrder(chapterKey)
  return keys.sort((a, b) => (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER))
}

/**
 * 章节正文字段：按 **schema 阅读顺序**、跳过**机读字段**与**空值**。
 *
 * 与旧实现的区别：旧版是「必填在前 + 数据原序」，导出顺序和编辑器里看到的顺序对不上，
 * 还把 `ledger` / `numeric_assertions` 这类机读字段混进正文。现在正文只留人读字段、
 * 按 schema 顺序、不输出 `—` 空行；机读字段统一进「附录：验收与机读数据」。
 */
export function orderedFieldEntries(chapterKey: ChapterKey, data: ChapterData): Array<[string, unknown]> {
  return selectFieldEntries(
    chapterKey,
    data,
    undefined,
    false,
    (keys) => bySchemaOrder(chapterKey, keys),
    (key) => orderIndexOf(chapterKey, key)
  )
}

/** 机读/验收字段（schema 顺序、跳过空值），供各格式的「附录：验收与机读数据」 */
export function machineFieldEntries(chapterKey: ChapterKey, data: ChapterData): Array<[string, unknown]> {
  return selectFieldEntries(
    chapterKey,
    data,
    undefined,
    true,
    (keys) => bySchemaOrder(chapterKey, keys),
    (key) => orderIndexOf(chapterKey, key)
  )
}

/**
 * 正文/机读字段的统一筛选内核（四个入口共用，避免四份口径漂移）。
 *
 * 处理顺序（每一键）：
 * 1. 空值跳过；
 * 2. 点路径字段的**数组形态**（`vision.user_personas` 被 AI 写成字符串数组）→ 展开成三条中文标签字段；
 * 3. schema 外扩展键 → 按 extraFieldRules 的落位分流（body / machine / skip）；
 * 4. 其余按 `isMachineDataField` 分正文/机读。
 *
 * 扩展键与展开出来的画像按「数据原序」插在**所属位置**：点路径字段（`user_personas`）
 * 紧随它的父键（`design_vision` 之后），其余扩展键排在 schema 字段之后。
 * 无序追加会让「用户画像」跑到章节末尾，读者以为那是个附录。
 */
const DOT_PATH_KEYS_BY_CHAPTER: Record<string, readonly string[]> = {
  vision: ['user_personas.primary', 'user_personas.secondary', 'user_personas.potential']
}

function selectFieldEntries(
  chapter: string,
  data: ChapterData,
  doc: CeshuDocument | undefined,
  machine: boolean,
  order: (keys: string[]) => string[],
  indexOf: (key: string) => number
): Array<[string, unknown]> {
  const appended: Array<[string, unknown]> = []
  /** 点路径展开项：`父键: 展开后的键` —— 渲染时插到父键那条之后 */
  const afterParent = new Map<string, Array<[string, unknown]>>()
  const plainKeys: string[] = []
  for (const key of Object.keys(data)) {
    const value = data[key]
    if (isEmptyValue(value)) continue
    const personas = expandPersonaEntries(chapter, key, value)
    if (personas !== null) {
      afterParent.set(key, personas)
      continue
    }
    const placement = extraKeyPlacementFor(doc, chapter, key)
    if (placement !== undefined) {
      if (placement === 'skip') continue
      if ((placement === 'machine') !== machine) continue
      appended.push([key, formatExtraKeyValue(chapter, key, value)])
      continue
    }
    if (isMachineDataField(chapter as ChapterKey, key) !== machine) continue
    plainKeys.push(key)
  }
  let ordered = order(plainKeys).map((key) => [key, data[key]] as [string, unknown])
  /*
   * 把点路径展开项插回它们的 schema 位置：`user_personas` 的三个子字段在 schema 里
   * 紧跟在 `design_vision` 之后，若直接追加到章尾，读者会把「主要用户」当成附录。
   */
  for (const [parent, entries] of afterParent) {
    const anchor = DOT_PATH_KEYS_BY_CHAPTER[chapter]?.find((key) => key.split('.')[0] === parent)
    const anchorIndex = anchor === undefined ? Number.MAX_SAFE_INTEGER : indexOf(anchor)
    const at = ordered.findIndex(([key]) => indexOf(key) > anchorIndex)
    const position = at < 0 ? ordered.length : at
    ordered = [...ordered.slice(0, position), ...entries, ...ordered.slice(position)]
  }
  return [...ordered, ...appended]
}

/**
 * 按「章 + 字段」取一个字段的值，供**选择性抽取**的导出（narrative 首页 / homepage）使用。
 *
 * 直接 `data[field]` 对点路径字段恒 undefined（`user_personas.primary` 是嵌套对象）；
 * 而实测 AI 还把 `user_personas` 落成字符串数组，此时嵌套与点路径都不成立，
 * 只能走 expandPersonaEntries 的槽位还原。三条都试过仍取不到才返回 undefined。
 */
export function readPageFieldValue(
  chapter: ChapterKey,
  field: string,
  data: ChapterData | undefined
): unknown {
  if (data === undefined) return undefined
  const direct = data[field]
  if (!isEmptyValue(direct)) return direct
  const dotPath = readPath(data, field)
  if (!isEmptyValue(dotPath)) return dotPath
  const [head, slot] = field.split('.')
  if (head === 'user_personas' && slot !== undefined) {
    const personas = expandPersonaEntries(chapter, head, data[head])
    const hit = personas?.find(([key]) => key === field)
    return hit?.[1]
  }
  return undefined
}

/** 表格化后的 pipeList：表头 + 数据行；无 `columns` 或空表返回 null（调用方回落成文本） */
export interface PipeTable {
  headers: string[]
  rows: string[][]
}

export function pipeTable(chapterKey: ChapterKey, key: string, value: unknown): PipeTable | null {
  const field = fieldDef(chapterKey, key)
  if (field?.kind !== 'pipeList' || field.columns === undefined || field.columns.length === 0) return null
  const rows = pipeRows(value, field.columns)
  return rows.length > 0 ? { headers: field.columns.map((column) => column.label), rows } : null
}

/** 管道行 → 二维字符串（兼容 `['a|b']` 与 `[{colKey: 值}]` 两种存储形态） */
function pipeRows(value: unknown, columns: readonly CeshuColumnDef[]): string[][] {
  if (Array.isArray(value) && value.some((item) => isPlainObject(item))) {
    const rows: string[][] = []
    for (const item of value) {
      if (!isPlainObject(item)) continue
      rows.push(columns.map((column) => formatScalar(item[column.key])))
    }
    return rows
  }
  const rows: string[][] = []
  for (const row of toRows(value)) {
    const cells = splitRow(row)
    /*
     * 单元格数必须**与列数相等**才算表格行（2026-11-09 实测导出「列错位」后加的守卫）。
     *
     * 现场：模型把整段话写进一行（`- 瞬时层（30秒）：动作/系统变化/反馈…`，含 0 个竖线），
     * 或在一行里多写了列（`决策|候选|不选|代价|结论` 对 4 列表）。旧实现按索引硬映射：
     * 前者得到「第 1 列塞全文、后 5 列全空」，后者把「结论」挤掉、表头下面的内容整体错位一格，
     * 读者拿到的是一张**看不出错**的错表。
     *
     * 与其按索引硬猜列（会把 5 段文本压成 4 列，丢一段），不如判定「这行不是表格行」，
     * 整字段回落到文本渲染（各格式的 pipeTable === null 分支）：一个字都不丢。
     */
    if (cells.length !== columns.length) return []
    rows.push(cells)
  }
  return rows
}

export interface VisibleChapterEntry {
  key: ChapterKey
  /** 全量章节序号 */
  index: number
}

/** 按档位返回导出章节及全局序号（lite 档只导出基础 9 章，序号仍用全局章号）；传 gameType / enabledModules 时再按品类与系统模块剔除 */
export function visibleChapterEntries(
  scope: GddScope,
  gameType?: unknown,
  enabledModules?: readonly ChapterKey[]
): VisibleChapterEntry[] {
  const visible = new Set(visibleChapterKeys(scope, gameType, enabledModules))
  return CHAPTER_KEYS.map((key, position) => ({ key, index: position + 1 })).filter((entry) => visible.has(entry.key))
}

/**
 * 章节标题文本（游戏档）：直接取 `CHAPTER_LABELS`（已含「N. 」前缀，如 "4. 游戏系统设计"）。
 * **不再叠加 `entry.index`** —— 历史上两者叠加会产出「4. 4. 游戏系统设计」双号 bug。
 * 锚点 `chN` 与顺序仍由数组位置独立派生。
 */
export function chapterHeading(entry: VisibleChapterEntry): string {
  return CHAPTER_LABELS[entry.key]
}

/* ------------------------------------------------------------------ */
/* 规格化章表版本（路线 A 第 5 步：主 Markdown 导出按 docKind 分派）     */
/* 游戏档一律委托上面的既有函数，逐字节零回归。刻意用独立的 DocChapterEntry， */
/* 不把 VisibleChapterEntry.key 放宽成 string —— 那会连锁到 docx/html/pptx */
/* 等另外 5 个导出格式。                                                */
/* ------------------------------------------------------------------ */

export interface DocChapterEntry {
  key: string
  index: number
}

function isAppDoc(doc: CeshuDocument): boolean {
  // AI 档也走 SDD 式章节/字段导出，故判据为「非游戏」而非「显式 == application」
  return isSoftwareDoc(doc)
}

/** 字段定义：游戏档 CESHU_CHAPTER_FIELDS / 应用档 APP_CHAPTER_FIELDS */
export function fieldDefForDoc(doc: CeshuDocument, chapter: string, key: string): CeshuFieldDef | undefined {
  if (isAppDoc(doc)) return chapterFieldsForDoc(doc, chapter).find((field) => field.key === key)
  return fieldDef(chapter as ChapterKey, key)
}

/** 字段中文标签（游戏档沿用 fieldLabelOf 的既有回落口径） */
export function fieldLabelForDoc(doc: CeshuDocument, chapter: string, key: string): string {
  const extraLabel = extraKeyLabelFor(chapter, key)
  if (extraLabel !== undefined) return extraLabel
  if (!isAppDoc(doc)) return fieldLabel(chapter as ChapterKey, key)
  return fieldDefForDoc(doc, chapter, key)?.label ?? key
}

function schemaOrderForDoc(doc: CeshuDocument, chapter: string): Map<string, number> {
  if (isAppDoc(doc)) {
    return new Map(chapterFieldsForDoc(doc, chapter).map((field, index) => [field.key, index]))
  }
  return schemaOrder(chapter as ChapterKey)
}

function orderIndexOfForDoc(doc: CeshuDocument, chapter: string, key: string): number {
  return schemaOrderForDoc(doc, chapter).get(key) ?? Number.MAX_SAFE_INTEGER
}

function orderedKeysForDoc(doc: CeshuDocument, chapter: string, keys: string[]): string[] {
  const order = schemaOrderForDoc(doc, chapter)
  return keys.sort((a, b) => (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER))
}

/** 章节正文字段（按 schema 顺序、跳过机读与空值） */
export function orderedFieldEntriesForDoc(
  doc: CeshuDocument,
  chapter: string,
  data: ChapterData
): Array<[string, unknown]> {
  return selectFieldEntries(chapter, data, doc, false, (keys) => orderedKeysForDoc(doc, chapter, keys), (key) =>
    orderIndexOfForDoc(doc, chapter, key)
  )
}

/** 机读/验收字段（应用章不属于游戏机读清单 ⇒ 恒为空） */
export function machineFieldEntriesForDoc(
  doc: CeshuDocument,
  chapter: string,
  data: ChapterData
): Array<[string, unknown]> {
  return selectFieldEntries(chapter, data, doc, true, (keys) => orderedKeysForDoc(doc, chapter, keys), (key) =>
    orderIndexOfForDoc(doc, chapter, key)
  )
}

/** pipeList 表格化 */
export function pipeTableForDoc(doc: CeshuDocument, chapter: string, key: string, value: unknown): PipeTable | null {
  const field = fieldDefForDoc(doc, chapter, key)
  if (field?.kind !== 'pipeList' || field.columns === undefined || field.columns.length === 0) return null
  const rows = pipeRows(value, field.columns)
  return rows.length > 0 ? { headers: field.columns.map((column) => column.label), rows } : null
}

/** 该文档参与导出的章（应用档用 SDD 全章表且章号连续，游戏档保持档位×品类裁剪） */
export function visibleChapterEntriesForDoc(doc: CeshuDocument): DocChapterEntry[] {
  if (isAppDoc(doc)) {
    return [...visibleChaptersForDoc(doc)].map((key, index) => ({ key, index: index + 1 }))
  }
  return visibleChapterEntries(getGddScope(doc), getGameType(doc), enabledModuleChapters(doc))
    .map((entry) => ({ key: entry.key as string, index: entry.index }))
}

/** 章节标题：应用档主题式（APP_CHAPTER_LABELS），游戏档编号式（CHAPTER_LABELS）——按档位分派 */
export function chapterHeadingForDoc(doc: CeshuDocument, entry: DocChapterEntry): string {
  if (isAppDoc(doc)) return chapterLabelForDoc(doc, entry.key)
  return chapterHeading(entry as VisibleChapterEntry)
}

/** 章节数据（应用章走宽松索引） */
export function chapterDataForDocExport(doc: CeshuDocument, chapter: string): ChapterData {
  return chapterDataForDoc(doc, chapter)
}

/** 章节锚点 id（ch1~ch18） */
export function chapterAnchor(index: number): string {
  return `ch${index}`
}