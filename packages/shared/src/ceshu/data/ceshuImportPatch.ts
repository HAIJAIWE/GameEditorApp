import { CHAPTER_LABELS, isChapterKey, type CeshuDocument, type ChapterData, type ChapterKey } from '../reference'
import { CESHU_CHAPTER_FIELDS, fieldLabelOf } from '../fields'
import { isPlainObject } from '../model'
import { parseLlmJson } from '../../util/object'

/**
 * 「导入 AI 结果」的纯逻辑：把外部 AI 返回的字段增量 JSON 解析成可预览、可应用的补丁。
 *
 * ## 闭环里的位置
 * 「AI 消费提示词」让外部 AI 按契约产出 `{章节: {字段: 值}}` 增量；
 * 本模块负责把它**安全地**粘回来：先校验（未知章节/字段一律拒绝，不静默丢），
 * 再逐字段比对（值没变的不算改动），最后按章分组交给调用方写盘。
 *
 * ## 安全默认
 * - 空值（''/null/空数组）**不应用**：避免 AI 的空输出把已有内容清掉；
 * - 未知章节 / 未知字段进 `errors` 并跳过，不猜、不静默；
 * - 审阅结果（`{"issues": [...]}`）明确拒绝并给出引导文案。
 */

export interface CeshuPatchItem {
  chapter: ChapterKey
  fieldKey: string
  fieldLabel: string
  /** AI 给的新值 */
  value: unknown
  /** 文档里的旧值 */
  previous: unknown
  /** 是否有实际变化（相同则应用时跳过） */
  changed: boolean
}

export interface CeshuPatchParseResult {
  items: CeshuPatchItem[]
  /** 中文错误说明（格式问题 / 未知章节字段 / 审阅结果误用） */
  errors: string[]
}

/** 空值判定（与「AI 空输出不清空已有内容」的既有约定一致） */
function isEmptyPatchValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

/**
 * 字段中文标签（单源在 `ceshuFields.fieldLabelOf`，此处保留短名以少改调用点）。
 *
 * 必须包一层函数、不能写成 `const fieldLabel = fieldLabelOf`：本文件经 `data` 桶被
 * `model` 加载，同时又 `import ... from '../model'`，是一条循环依赖。顶层直接取绑定
 * 会在求值顺序变化时拿到尚未初始化的 `undefined`（表现为 `fieldLabel is not a function`）；
 * 包成函数则在实际调用时才解析 live binding，循环里也安全。
 */
function fieldLabel(chapter: ChapterKey, key: string): string {
  return fieldLabelOf(chapter, key)
}

/** 点路径读取（如 user_personas.primary） */
function readByPath(data: ChapterData, path: string): unknown {
  let node: unknown = data
  for (const part of path.split('.')) {
    if (!isPlainObject(node)) return undefined
    node = node[part]
  }
  return node
}

/** 点路径写入（中间节点缺失时补对象） */
function writeByPath(data: ChapterData, path: string, value: unknown): void {
  const parts = path.split('.')
  let node: ChapterData = data
  for (let index = 0; index < parts.length - 1; index++) {
    const key = parts[index]
    if (!isPlainObject(node[key])) node[key] = {}
    node = node[key] as ChapterData
  }
  node[parts[parts.length - 1]] = value
}

/** 解析粘贴的 AI 结果（容错：允许 markdown 代码块与尾逗号） */
export function parseCeshuPatch(raw: string, doc: CeshuDocument): CeshuPatchParseResult {
  const items: CeshuPatchItem[] = []
  const errors: string[] = []
  const trimmed = raw.trim()
  if (trimmed === '') return { items, errors: ['内容为空：请粘贴 AI 返回的字段增量 JSON'] }

  const parsed = parseLlmJson(trimmed)
  if (Object.keys(parsed).length === 0) {
    return { items, errors: ['无法解析为 JSON：请确认粘贴的是 {"小节": {"字段": 值}} 形式的增量'] }
  }

  // 审阅结果（issues）不是可应用补丁：明确引导，避免用户以为坏了
  if (Array.isArray(parsed['issues'])) {
    return {
      items,
      errors: ['这是「审阅结果」（issues 列表），不能直接应用；请让 AI 用「按契约起草」任务返回字段增量']
    }
  }

  for (const [rawChapter, chapterValue] of Object.entries(parsed)) {
    const chapterKey = rawChapter.trim()
    if (!isChapterKey(chapterKey)) {
      errors.push(`未知小节「${chapterKey}」：已跳过`)
      continue
    }
    if (!isPlainObject(chapterValue)) {
      errors.push(`小节「${CHAPTER_LABELS[chapterKey]}」的值不是对象：已跳过`)
      continue
    }
    const chapterData: ChapterData = doc[chapterKey]
    const allowed = new Set<string>([
      ...(CESHU_CHAPTER_FIELDS[chapterKey] ?? []).map((field) => field.key),
      ...Object.keys(chapterData)
    ])
    for (const [rawField, value] of Object.entries(chapterValue)) {
      const fieldKey = rawField.trim()
      if (!allowed.has(fieldKey)) {
        errors.push(`「${CHAPTER_LABELS[chapterKey]}」中没有字段「${fieldKey}」：已跳过`)
        continue
      }
      if (isEmptyPatchValue(value)) continue // 空值不应用：不清空已有内容
      const previous = readByPath(chapterData, fieldKey)
      items.push({
        chapter: chapterKey,
        fieldKey,
        fieldLabel: fieldLabel(chapterKey, fieldKey),
        value,
        previous,
        changed: JSON.stringify(previous) !== JSON.stringify(value)
      })
    }
  }

  if (items.length === 0 && errors.length === 0) {
    errors.push('没有可应用的字段（可能全为空值）')
  }
  return { items, errors }
}

export interface CeshuIssueItem {
  /** 章节 key（原文，可能非法，故为 string） */
  chapter: string
  field: string
  /** high / medium / low（原文，未归一化） */
  severity: string
  message: string
  suggestion: string
}

export interface CeshuIssueParseResult {
  issues: CeshuIssueItem[]
  /** 解析失败时的中文说明 */
  error: string | null
}

/** 取字符串字段（非字符串一律当缺省，避免 AI 把对象塞进来把 UI 撑坏） */
function readIssueText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** severity 只认三档；未知值降为 medium（宁可按中危提示，也不让清单丢项） */
function normalizeSeverity(value: string): string {
  const lowered = value.trim().toLowerCase()
  return lowered === 'high' || lowered === 'medium' || lowered === 'low' ? lowered : 'medium'
}

/**
 * 解析「审阅」任务返回的问题清单（`{"issues":[...]}`）。
 *
 * 与 `parseCeshuPatch` 的分工：那边只认可应用的字段增量，这边只读展示——
 * 审阅结果不是补丁，硬应用会覆盖文档，所以解析成清单交给 UI 呈现，
 * 由人逐条决定怎么改（本函数不碰文档，纯函数）。
 */
export function parseCeshuIssues(raw: string): CeshuIssueParseResult {
  const issues: CeshuIssueItem[] = []
  const trimmed = raw.trim()
  if (trimmed === '') return { issues, error: '内容为空：请粘贴 AI 返回的审阅结果 JSON' }

  const parsed = parseLlmJson(trimmed)
  if (Object.keys(parsed).length === 0) {
    return { issues, error: '无法解析为 JSON：请确认粘贴的是 {"issues": [...]} 形式的审阅结果' }
  }

  const rawIssues = parsed['issues']
  if (!Array.isArray(rawIssues)) {
    return { issues, error: '这不是审阅结果：缺少 issues 数组' }
  }

  for (const entry of rawIssues) {
    // 元素不是对象、或没有 message 的条目没有展示价值：跳过而不是报错，避免一条脏数据毁掉整份清单
    if (!isPlainObject(entry)) continue
    const message = readIssueText(entry['message'])
    if (message === '') continue
    issues.push({
      chapter: readIssueText(entry['chapter']),
      field: readIssueText(entry['field']),
      severity: normalizeSeverity(readIssueText(entry['severity'])),
      message,
      suggestion: readIssueText(entry['suggestion'])
    })
  }

  return { issues, error: null }
}

export interface ApplyPatchResult {
  doc: CeshuDocument
  /** 实际写入的章节（按文档顺序） */
  chapters: ChapterKey[]
  /** 实际写入的字段数（只算 changed） */
  applied: number
}

/** 应用补丁（只写 changed 项；返回新文档与涉及的章节，便于调用方按章写盘） */
export function applyCeshuPatch(doc: CeshuDocument, items: CeshuPatchItem[]): ApplyPatchResult {
  const next: CeshuDocument = structuredClone(doc)
  const touched = new Set<ChapterKey>()
  let applied = 0
  for (const item of items) {
    if (!item.changed) continue
    const chapterData = next[item.chapter] as ChapterData
    writeByPath(chapterData, item.fieldKey, item.value)
    touched.add(item.chapter)
    applied += 1
  }
  // 按 CHAPTER 顺序返回，写盘顺序稳定
  const chapters = (Object.keys(next) as string[]).filter((key): key is ChapterKey => touched.has(key as ChapterKey))
  return { doc: next, chapters, applied }
}

/** 值预览（UI 用：截断长文本，对象/数组紧凑 JSON） */
export function previewPatchValue(value: unknown, max = 60): string {
  if (value === null || value === undefined) return '（空）'
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  const flat = text.replace(/\s+/gu, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}
