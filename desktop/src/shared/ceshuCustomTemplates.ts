import { isPlainObject } from './ceshuModel'
import type { ChapterTemplate } from './ceshuTemplates'

/**
 * 自定义模板纯逻辑（自 Python `core/ceshu/custom_template_manager.py` 匹平迁移）。
 * 存储布局与 Python 一致：`<root>/custom_templates/<category>.json`，category = 章节键或 `global`，
 * 每个文件结构为 `{"templates": [...]}`；本条模块只做数据类型与数组级操作，磁盘读写在主进程 templateStore。
 */

/** 全局分类（不绑定具体章节的模板） */
export const CUSTOM_TEMPLATE_GLOBAL_CATEGORY = 'global'

/** 名称必填错误文案（对应 Python `save_template` 的 ValueError） */
export const TEMPLATE_NAME_REQUIRED_ERROR = '模板名称不能为空'

export interface CeshuCustomTemplate {
  id: string
  name: string
  description: string
  tags: string[]
  /** 所属章节键名（如 meta）；全局模板为空串 */
  chapter_key: string
  /** 与 CeshuModel.get_chapter(key) 字段对齐的数据 */
  data: Record<string, unknown>
  created_at: string
  updated_at: string
  /** 来源游戏名（可空） */
  source_game: string
}

/** 分类文件结构（与 Python 一致：{"templates": [...]}） */
export interface CustomTemplateFile {
  templates: CeshuCustomTemplate[]
}

/** 新建模板的输入（对应 Python save_template 参数） */
export interface CustomTemplateDraft {
  name: string
  description?: string
  tags?: string[]
  /** 所属章节键；为空归入 global */
  chapterKey?: string
  data?: Record<string, unknown>
  sourceGame?: string
}

/** 模板 id：12 位十六进制（对应 Python uuid4().hex[:12]） */
export function createCustomTemplateId(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12)
}

/** 名称是否有效（去空白后非空；对应 Python 的 name.strip() 校验） */
export function isValidCustomTemplateName(name: string): boolean {
  return Boolean(name && name.trim())
}

/** 分类归一化：空 → global（对应 Python `category or GLOBAL_CATEGORY`） */
export function normalizeTemplateCategory(chapterKey: string): string {
  return chapterKey || CUSTOM_TEMPLATE_GLOBAL_CATEGORY
}

/**
 * 分类名净化（对应 Python `_category_path` 的路径穿越防护）：
 * 仅保留字母/数字/下划线/连字符，结果为空则回退 global。
 * 有意偏离：Python 用 `str.isalnum()`（中文等 Unicode 字母也算合法），此处限定 ASCII（本项目章节键均为 ASCII）。
 */
export function safeTemplateCategory(chapterKey: string): string {
  const safe = [...normalizeTemplateCategory(chapterKey)]
    .filter((char) => /[A-Za-z0-9_-]/.test(char))
    .join('')
  return safe || CUSTOM_TEMPLATE_GLOBAL_CATEGORY
}

/** 新建模板（名称非法时抛错；字段归一化与 Python 一致） */
export function createCustomTemplate(draft: CustomTemplateDraft, now: string): CeshuCustomTemplate {
  if (!isValidCustomTemplateName(draft.name)) {
    throw new Error(TEMPLATE_NAME_REQUIRED_ERROR)
  }
  return {
    id: createCustomTemplateId(),
    name: draft.name.trim(),
    description: draft.description || '',
    tags: normalizeTemplateTags(draft.tags),
    chapter_key: draft.chapterKey || '',
    data: isPlainObject(draft.data) ? draft.data : {},
    created_at: now,
    updated_at: now,
    source_game: draft.sourceGame || ''
  }
}

/** 标签归一化：去空白、去空项（对应 Python `[t.strip() for t in tags if t and t.strip()]`） */
export function normalizeTemplateTags(tags: string[] | undefined): string[] {
  return (tags ?? []).map((tag) => tag.trim()).filter((tag) => tag.length > 0)
}

/** 标签输入框（逗号/顿号/换行分隔）→ 标签数组 */
export function parseTemplateTagsInput(text: string): string[] {
  return normalizeTemplateTags(text.split(/[,，、\n]/))
}

/** 按创建时间升序（时间戳为本地固定格式，字符串序即时间序；Python 同样按 created_at 排序） */
export function sortCustomTemplates(templates: CeshuCustomTemplate[]): CeshuCustomTemplate[] {
  return [...templates].sort((a, b) => a.created_at.localeCompare(b.created_at))
}

/** 按章节筛选：指定章节取该章模板；为空取全部（含 global）——与 Python `list_templates` 一致 */
export function filterCustomTemplates(
  templates: CeshuCustomTemplate[],
  chapterKey: string | undefined
): CeshuCustomTemplate[] {
  const filtered = chapterKey ? templates.filter((template) => template.chapter_key === chapterKey) : templates
  return sortCustomTemplates(filtered)
}

/** 跨模板搜索：大小写不敏感，匹配 name / description / tags / source_game；空关键词返回全部 */
export function searchCustomTemplates(templates: CeshuCustomTemplate[], keyword: string): CeshuCustomTemplate[] {
  if (!keyword) return sortCustomTemplates(templates)
  const kw = keyword.toLowerCase()
  return sortCustomTemplates(
    templates.filter((template) => {
      const tags = (template.tags ?? []).join(' ').toLowerCase()
      return (
        template.name.toLowerCase().includes(kw) ||
        (template.description ?? '').toLowerCase().includes(kw) ||
        tags.includes(kw) ||
        (template.source_game ?? '').toLowerCase().includes(kw)
      )
    })
  )
}

/** 自定义模板 → 章节模板形态（复用查询/合并/预览逻辑） */
export function customTemplateToChapterTemplate(template: CeshuCustomTemplate): ChapterTemplate {
  return {
    name: template.name,
    description: template.description,
    tags: template.tags,
    data: template.data
  }
}

/**
 * 解析分类文件（容错，对应 Python `_load_category`）：
 * 非对象或 templates 非数组 → 空列表；逐条归一化，缺少有效 id 的条目丢弃
 * （有意偏离：Python 原样保留无 id 条目，但那类模板无法被查询/删除）。
 */
export function parseTemplateCategoryFile(raw: unknown): CeshuCustomTemplate[] {
  const list = isPlainObject(raw) && Array.isArray(raw.templates) ? raw.templates : []
  const templates: CeshuCustomTemplate[] = []
  for (const item of list) {
    const template = normalizeCustomTemplate(item)
    if (template) templates.push(template)
  }
  return templates
}

/** 单条归一化（缺字段补默认；无有效 id 返回 null） */
export function normalizeCustomTemplate(raw: unknown): CeshuCustomTemplate | null {
  if (!isPlainObject(raw)) return null
  const id = typeof raw.id === 'string' && raw.id ? raw.id : ''
  if (!id) return null
  return {
    id,
    name: typeof raw.name === 'string' ? raw.name : '',
    description: typeof raw.description === 'string' ? raw.description : '',
    tags: normalizeTemplateTags(Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === 'string') : []),
    chapter_key: typeof raw.chapter_key === 'string' ? raw.chapter_key : '',
    data: isPlainObject(raw.data) ? raw.data : {},
    created_at: typeof raw.created_at === 'string' ? raw.created_at : '',
    updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : '',
    source_game: typeof raw.source_game === 'string' ? raw.source_game : ''
  }
}

/** 序列化为磁盘结构（与 Python indent=2 / ensure_ascii=False 等价，落盘用 JSON.stringify(…, null, 2)） */
export function serializeTemplateCategoryFile(templates: CeshuCustomTemplate[]): CustomTemplateFile {
  return { templates: sortCustomTemplates(templates) }
}