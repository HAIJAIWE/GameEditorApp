import { describe, expect, it } from 'vitest'

import {
  DEFAULT_NOTE_AUTHOR,
  countNotesByChapter,
  createNote,
  deleteNoteIn,
  filterNotes,
  notePreview,
  parseNotesFile,
  serializeNotesFile,
  sortNotes,
  updateNoteIn,
  type CeshuNote
} from '@mobai/shared/ceshu/notes'

function note(overrides: Partial<CeshuNote> & { id: string; created_at: string }): CeshuNote {
  return {
    chapter_key: 'meta',
    content: '',
    updated_at: overrides.created_at,
    author: DEFAULT_NOTE_AUTHOR,
    ...overrides
  }
}

describe('章节笔记：模型与纯 CRUD', () => {
  it('createNote：12 位 id、默认作者与空正文，章节为空时报错', () => {
    const created = createNote('meta', '', undefined, '2026-10-01 10:00:00')
    expect(created.id).toMatch(/^[0-9a-f]{12}$/)
    expect(created).toMatchObject({
      chapter_key: 'meta',
      content: '',
      created_at: '2026-10-01 10:00:00',
      updated_at: '2026-10-01 10:00:00',
      author: DEFAULT_NOTE_AUTHOR
    })
    expect(createNote('meta', '正文', '策划A', '2026-10-01 10:00:00').author).toBe('策划A')
    expect(() => createNote('', '正文', undefined, '2026-10-01 10:00:00')).toThrow('小节不能为空')
  })

  it('sortNotes 按创建时间升序（同秒保持插入顺序），filterNotes 可按章节筛选', () => {
    const notes = [
      note({ id: 'b', created_at: '2026-10-01 10:00:05', chapter_key: 'vision' }),
      note({ id: 'a', created_at: '2026-10-01 10:00:01', chapter_key: 'meta' }),
      note({ id: 'c', created_at: '2026-10-01 10:00:05', chapter_key: 'meta' })
    ]
    expect(sortNotes(notes).map((item) => item.id)).toEqual(['a', 'b', 'c'])
    expect(filterNotes(notes, 'meta').map((item) => item.id)).toEqual(['a', 'c'])
    expect(filterNotes(notes, undefined)).toHaveLength(3)
    expect(filterNotes(notes, '')).toHaveLength(3)
  })

  it('countNotesByChapter 统计每章数量', () => {
    const notes = [
      note({ id: 'a', created_at: '2026-10-01 10:00:01', chapter_key: 'meta' }),
      note({ id: 'b', created_at: '2026-10-01 10:00:02', chapter_key: 'meta' }),
      note({ id: 'c', created_at: '2026-10-01 10:00:03', chapter_key: 'art' })
    ]
    expect(countNotesByChapter(notes)).toEqual({ meta: 2, art: 1 })
  })

  it('notePreview：去空白、换行折叠、超 30 字截断补省略号', () => {
    expect(notePreview('  第一行\n第二行  ')).toBe('第一行 第二行')
    expect(notePreview('A'.repeat(30))).toBe('A'.repeat(30))
    expect(notePreview('A'.repeat(31))).toBe(`${'A'.repeat(30)}…`)
    expect(notePreview('')).toBe('')
  })

  it('updateNoteIn：更新正文与时间戳，作者仅在提供时替换；不存在返回 null', () => {
    const notes = [note({ id: 'a', created_at: '2026-10-01 10:00:00', author: '原作者', content: '旧' })]
    const next = updateNoteIn(notes, 'a', '新正文', undefined, '2026-10-01 11:00:00')
    expect(next).toHaveLength(1)
    expect(next?.[0]).toMatchObject({ content: '新正文', author: '原作者', updated_at: '2026-10-01 11:00:00' })
    expect(next?.[0]?.created_at).toBe('2026-10-01 10:00:00')
    // 原数组不被修改（纯函数）
    expect(notes[0]?.content).toBe('旧')

    const withAuthor = updateNoteIn(notes, 'a', '新正文', '新作者', '2026-10-01 11:00:00')
    expect(withAuthor?.[0]?.author).toBe('新作者')
    expect(updateNoteIn(notes, 'missing', 'x', undefined, '2026-10-01 11:00:00')).toBeNull()
  })

  it('deleteNoteIn：删除命中返回新数组，未命中返回 null', () => {
    const notes = [
      note({ id: 'a', created_at: '2026-10-01 10:00:00' }),
      note({ id: 'b', created_at: '2026-10-01 10:00:01' })
    ]
    expect(deleteNoteIn(notes, 'a')?.map((item) => item.id)).toEqual(['b'])
    expect(notes).toHaveLength(2)
    expect(deleteNoteIn(notes, 'missing')).toBeNull()
  })
})

describe('章节笔记：文件解析与序列化', () => {
  it('parseNotesFile 容错：非对象/notes 非数组 → 空；无 id 条目丢弃；缺字段补默认', () => {
    expect(parseNotesFile(null)).toEqual([])
    expect(parseNotesFile('x')).toEqual([])
    expect(parseNotesFile({ notes: 'oops' })).toEqual([])
    expect(parseNotesFile({ notes: [1, null, { content: '无id' }] })).toEqual([])
    const parsed = parseNotesFile({
      notes: [
        { id: 'a', chapter_key: 'meta', content: '正文', created_at: '2026-10-01 10:00:00', updated_at: 'x' },
        { id: 'b' }
      ]
    })
    expect(parsed).toHaveLength(2)
    expect(parsed[0]).toMatchObject({ id: 'a', chapter_key: 'meta', content: '正文', author: DEFAULT_NOTE_AUTHOR })
    expect(parsed[1]).toMatchObject({ id: 'b', chapter_key: '', content: '', author: DEFAULT_NOTE_AUTHOR })
  })

  it('serializeNotesFile：输出 {notes: [...]} 且按创建时间升序', () => {
    const file = serializeNotesFile([
      note({ id: 'b', created_at: '2026-10-01 10:00:02' }),
      note({ id: 'a', created_at: '2026-10-01 10:00:01' })
    ])
    expect(Object.keys(file)).toEqual(['notes'])
    expect(file.notes.map((item) => item.id)).toEqual(['a', 'b'])
  })
})