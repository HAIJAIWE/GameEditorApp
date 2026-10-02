import { describe, expect, it } from 'vitest'

import {
  CUSTOM_TEMPLATE_GLOBAL_CATEGORY,
  TEMPLATE_NAME_REQUIRED_ERROR,
  createCustomTemplate,
  customTemplateToChapterTemplate,
  filterCustomTemplates,
  isValidCustomTemplateName,
  normalizeCustomTemplate,
  normalizeTemplateCategory,
  normalizeTemplateTags,
  parseTemplateCategoryFile,
  parseTemplateTagsInput,
  safeTemplateCategory,
  searchCustomTemplates,
  serializeTemplateCategoryFile,
  sortCustomTemplates,
  type CeshuCustomTemplate
} from '../../src/shared/ceshuCustomTemplates'

function template(overrides: Partial<CeshuCustomTemplate> = {}): CeshuCustomTemplate {
  return {
    id: 'aaaaaaaaaaaa',
    name: '模板A',
    description: '',
    tags: [],
    chapter_key: 'meta',
    data: {},
    created_at: '2026-10-03 10:00:00',
    updated_at: '2026-10-03 10:00:00',
    source_game: '',
    ...overrides
  }
}

describe('ceshuCustomTemplates 新建与归一化', () => {
  it('id 为 12 位十六进制（对应 Python uuid4().hex[:12]）', () => {
    const created = createCustomTemplate({ name: 'x' }, '2026-10-03 10:00:00')
    expect(created.id).toMatch(/^[0-9a-f]{12}$/)
  })

  it('新建：名称去空白、标签清理、缺省字段兜底、章节为空归 global 分类', () => {
    const created = createCustomTemplate(
      {
        name: '  我的模板  ',
        description: '',
        tags: ['  仙侠 ', '', '  ', 'RPG'],
        data: { game_name: '云海' },
        sourceGame: '云海仙踪',
        chapterKey: ''
      },
      '2026-10-03 12:00:00'
    )
    expect(created).toMatchObject({
      name: '我的模板',
      description: '',
      tags: ['仙侠', 'RPG'],
      chapter_key: '',
      data: { game_name: '云海' },
      created_at: '2026-10-03 12:00:00',
      updated_at: '2026-10-03 12:00:00',
      source_game: '云海仙踪'
    })
    expect(normalizeTemplateCategory(created.chapter_key)).toBe(CUSTOM_TEMPLATE_GLOBAL_CATEGORY)
  })

  it('名称为空或纯空白 → 抛错；data 非对象退化为空对象', () => {
    expect(() => createCustomTemplate({ name: '   ' }, 'now')).toThrow(TEMPLATE_NAME_REQUIRED_ERROR)
    expect(() => createCustomTemplate({ name: '' }, 'now')).toThrow('模板名称不能为空')
    expect(isValidCustomTemplateName(' x ')).toBe(true)
    expect(isValidCustomTemplateName('  ')).toBe(false)
    const created = createCustomTemplate(
      { name: 'x', data: [] as unknown as Record<string, unknown> },
      'now'
    )
    expect(created.data).toEqual({})
  })

  it('分类净化：空 → global；路径穿越与非法字符被剔除；纯非 ASCII → global', () => {
    expect(normalizeTemplateCategory('')).toBe('global')
    expect(normalizeTemplateCategory('meta')).toBe('meta')
    expect(safeTemplateCategory('meta')).toBe('meta')
    expect(safeTemplateCategory('')).toBe('global')
    expect(safeTemplateCategory('../evil')).toBe('evil')
    expect(safeTemplateCategory('a/b\\c')).toBe('abc')
    expect(safeTemplateCategory('第一章')).toBe('global')
  })

  it('标签输入解析：逗号/中文逗号/顿号/换行分隔 + 去重空白项', () => {
    expect(parseTemplateTagsInput('仙侠, RPG、 国产，双平台\n剧情')).toEqual(['仙侠', 'RPG', '国产', '双平台', '剧情'])
    expect(parseTemplateTagsInput('  ')).toEqual([])
    expect(normalizeTemplateTags([' a ', 'b'])).toEqual(['a', 'b'])
  })

  it('单条归一化：非对象 / 缺 id 丢弃；缺字段补默认', () => {
    expect(normalizeCustomTemplate(null)).toBeNull()
    expect(normalizeCustomTemplate({ name: '无 id' })).toBeNull()
    expect(normalizeCustomTemplate({ id: '' })).toBeNull()
    expect(normalizeCustomTemplate({ id: 'id1', name: 'A', tags: ['t', 3], data: [] })).toEqual({
      id: 'id1',
      name: 'A',
      description: '',
      tags: ['t'],
      chapter_key: '',
      data: {},
      created_at: '',
      updated_at: '',
      source_game: ''
    })
  })

  it('分类文件解析：{"templates": [...]} 结构；非对象 → 空；条目逐个归一化', () => {
    expect(parseTemplateCategoryFile(null)).toEqual([])
    expect(parseTemplateCategoryFile([])).toEqual([])
    expect(parseTemplateCategoryFile({ templates: 'x' })).toEqual([])
    expect(parseTemplateCategoryFile({ templates: [{ id: 'a' }, 5, { name: 'x' }] })).toEqual([
      {
        id: 'a',
        name: '',
        description: '',
        tags: [],
        chapter_key: '',
        data: {},
        created_at: '',
        updated_at: '',
        source_game: ''
      }
    ])
  })

  it('序列化按创建时间升序（磁盘结构 {"templates": [...]}）', () => {
    const payload = serializeTemplateCategoryFile([
      template({ id: 'b', created_at: '2026-10-03 12:00:00' }),
      template({ id: 'a', created_at: '2026-10-03 09:00:00' })
    ])
    expect(Object.keys(payload)).toEqual(['templates'])
    expect(payload.templates.map((item) => item.id)).toEqual(['a', 'b'])
  })
})

describe('ceshuCustomTemplates 查询与适配', () => {
  const list = [
    template({ id: '1', name: '元信息模板', description: '项目元信息', tags: ['仙侠'], chapter_key: 'meta' }),
    template({ id: '2', name: '愿景模板', tags: ['剧情'], chapter_key: 'vision', created_at: '2026-10-03 11:00:00' }),
    template({ id: '3', name: '全局通用', chapter_key: '', source_game: '云海仙踪' })
  ]

  it('按章节筛选：指定章节只取该章；空章节取全部（含 global）', () => {
    expect(filterCustomTemplates(list, 'meta').map((item) => item.id)).toEqual(['1'])
    expect(filterCustomTemplates(list, 'vision').map((item) => item.id)).toEqual(['2'])
    // 全部：按 created_at 升序；1 与 3 时间戳相同（默认值），稳定排序保持原顺序
    expect(filterCustomTemplates(list, '').map((item) => item.id)).toEqual(['1', '3', '2'])
    expect(filterCustomTemplates(list, undefined)).toHaveLength(3)
  })

  it('搜索：命中名称/描述/标签/来源游戏，大小写不敏感；空关键词返回全部', () => {
    expect(searchCustomTemplates(list, '元信息').map((item) => item.id)).toEqual(['1'])
    expect(searchCustomTemplates(list, '剧情').map((item) => item.id)).toEqual(['2'])
    expect(searchCustomTemplates(list, '云海仙踪').map((item) => item.id)).toEqual(['3'])
    expect(searchCustomTemplates(list, 'xianxia')).toHaveLength(0)
    expect(searchCustomTemplates(list, '')).toHaveLength(3)
  })

  it('排序按 created_at 升序，不修改原数组', () => {
    const input = [template({ id: 'b', created_at: '2026-10-03 12:00:00' }), template({ id: 'a' })]
    expect(sortCustomTemplates(input).map((item) => item.id)).toEqual(['a', 'b'])
    expect(input.map((item) => item.id)).toEqual(['b', 'a'])
  })

  it('自定义模板 → 章节模板形态（仅保留 name/description/tags/data）', () => {
    expect(customTemplateToChapterTemplate(template({ name: 'A', description: 'D', tags: ['t'], data: { k: 1 } }))).toEqual({
      name: 'A',
      description: 'D',
      tags: ['t'],
      data: { k: 1 }
    })
  })
})