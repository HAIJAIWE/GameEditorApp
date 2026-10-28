import { isPlainObject } from './ceshuModel'

/**
 * 章节笔记纯逻辑。
 * 每份策划书共用一份笔记文件（{"notes": [...]}）；本条模块只做数据类型与数组级 CRUD，磁盘读写在主进程 notesStore。
 */

export const DEFAULT_NOTE_AUTHOR = 'anonymous'

export interface CeshuNote {
  id: string
  /** 所属章节键名（如 meta / vision） */
  chapter_key: string
  content: string
  created_at: string
  updated_at: string
  author: string
}

/** 笔记文件结构 */
export interface CeshuNotesFile {
  notes: CeshuNote[]
}

/** 笔记 id：12 位十六进制 */
export function createNoteId(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12)
}

/** 新建笔记（content 缺省为空串；author 缺省 anonymous） */
export function createNote(
  chapterKey: string,
  content: string,
  author: string | undefined,
  now: string
): CeshuNote {
  if (!chapterKey) {
    throw new Error('章节不能为空')
  }
  return {
    id: createNoteId(),
    chapter_key: chapterKey,
    content: content || '',
    created_at: now,
    updated_at: now,
    author: author || DEFAULT_NOTE_AUTHOR
  }
}

/** 按创建时间升序 */
export function sortNotes(notes: CeshuNote[]): CeshuNote[] {
  return [...notes].sort((a, b) => a.created_at.localeCompare(b.created_at))
}

/** 按章节筛选（chapterKey 为空则返回全部） */
export function filterNotes(notes: CeshuNote[], chapterKey: string | undefined): CeshuNote[] {
  const filtered = chapterKey ? notes.filter((note) => note.chapter_key === chapterKey) : notes
  return sortNotes(filtered)
}

/** 每章笔记数量统计 */
export function countNotesByChapter(notes: CeshuNote[]): Record<string, number> {
  const result: Record<string, number> = {}
  for (const note of notes) {
    result[note.chapter_key] = (result[note.chapter_key] ?? 0) + 1
  }
  return result
}

/** 列表项预览：去首尾空白 + 换行折叠为空格，超长截断补省略号 */
export function notePreview(content: string, maxLength = 30): string {
  const text = content.trim().replace(/\n/g, ' ')
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text
}

/** 更新笔记正文（可选同时更新作者），返回新数组；noteId 不存在返回 null */
export function updateNoteIn(
  notes: CeshuNote[],
  noteId: string,
  content: string,
  author: string | undefined,
  now: string
): CeshuNote[] | null {
  const index = notes.findIndex((note) => note.id === noteId)
  if (index < 0) return null
  const target = notes[index]
  if (!target) return null
  const next = [...notes]
  next[index] = {
    ...target,
    content: content || '',
    updated_at: now,
    author: author ? author : target.author
  }
  return next
}

/** 删除笔记，返回新数组；noteId 不存在返回 null */
export function deleteNoteIn(notes: CeshuNote[], noteId: string): CeshuNote[] | null {
  const next = notes.filter((note) => note.id !== noteId)
  return next.length === notes.length ? null : next
}

/**
 * 解析笔记文件（容错）：
 * 非对象或 notes 非数组 → 空列表；逐条归一化（缺字段补默认），无有效 id 的条目丢弃。
 */
export function parseNotesFile(raw: unknown): CeshuNote[] {
  const list = isPlainObject(raw) && Array.isArray(raw.notes) ? raw.notes : []
  const notes: CeshuNote[] = []
  for (const item of list) {
    const note = normalizeNote(item)
    if (note) notes.push(note)
  }
  return notes
}

/** 序列化为磁盘结构 */
export function serializeNotesFile(notes: CeshuNote[]): CeshuNotesFile {
  return { notes: sortNotes(notes) }
}

function normalizeNote(raw: unknown): CeshuNote | null {
  if (!isPlainObject(raw)) return null
  const id = typeof raw.id === 'string' && raw.id ? raw.id : ''
  if (!id) return null
  return {
    id,
    chapter_key: typeof raw.chapter_key === 'string' ? raw.chapter_key : '',
    content: typeof raw.content === 'string' ? raw.content : '',
    created_at: typeof raw.created_at === 'string' ? raw.created_at : '',
    updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : '',
    author: typeof raw.author === 'string' && raw.author ? raw.author : DEFAULT_NOTE_AUTHOR
  }
}