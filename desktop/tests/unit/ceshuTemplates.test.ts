import { describe, expect, it } from 'vitest'

import {
  TEMPLATE_APPLY_MODES,
  buildTemplatePreview,
  chapterTemplateSummary,
  countChapterTemplates,
  countTemplateFields,
  filterChapterTemplates,
  formatTemplateValue,
  getChapterTemplateByName,
  isTemplateEmptyField,
  listChapterTemplates,
  mergeTemplateByMode,
  mergeTemplateToChapter,
  searchChapterTemplates,
  templateChapterLabel
} from '../../src/shared/ceshuTemplates'

describe('ceshuTemplates 内置模板库', () => {
  it('数据池：24 章 / 34 个模板，既有章数量与 Python 一致（P2 新章暂无模板）', () => {
    expect(countChapterTemplates()).toBe(34)
    expect(chapterTemplateSummary()).toEqual({
      meta: 3,
      vision: 3,
      story: 4,
      gameplay: 3,
      systems: 1,
      numeric: 2,
      art: 3,
      tech: 2,
      resources: 1,
      market_analysis: 2,
      combat: 2,
      economy: 1,
      monetization: 2,
      mvp: 1,
      risk_handling: 1,
      audio: 2,
      accessibility: 1,
      // P2 扩展设计 7 章：暂无预制模板（模板是便利数据，不影响字段与校验）
      uiux: 0,
      level_design: 0,
      live_ops: 0,
      analytics: 0,
      qa: 0,
      publishing: 0,
      performance: 0
    })
    expect(Object.keys(chapterTemplateSummary())).toHaveLength(24)
  })

  it('按章取模板：meta 3 个且顺序固定；未知章节返回空数组', () => {
    expect(listChapterTemplates('meta').map((item) => item.name)).toEqual([
      '仙侠 RPG 项目样板',
      '科幻射击样板',
      '休闲放置样板'
    ])
    expect(listChapterTemplates('不存在的章节')).toEqual([])
    expect(listChapterTemplates('systems')[0]?.note).toContain('请使用「预设」按钮')
    expect(listChapterTemplates('systems')[0]?.data).toEqual({})
  })

  it('跨章搜索：关键词命中 name/description/tags，空关键词返回全部', () => {
    expect(searchChapterTemplates('')).toHaveLength(34)
    expect(searchChapterTemplates('仙侠')).toHaveLength(8)
    expect(searchChapterTemplates('RPG')).toHaveLength(7)
    expect(searchChapterTemplates('放置')).toHaveLength(1)
    expect(searchChapterTemplates('zzz')).toHaveLength(0)
    // 大小写不敏感 + 首项归属
    expect(searchChapterTemplates('rpg')[0]).toMatchObject({ chapterKey: 'meta' })
  })

  it('按章节 + 关键词筛选：无关键词走该章列表，有关键词先全局再过滤', () => {
    expect(filterChapterTemplates('meta', '')).toHaveLength(3)
    expect(filterChapterTemplates('meta', '仙侠').map((hit) => hit.template.name)).toEqual(['仙侠 RPG 项目样板'])
    expect(filterChapterTemplates('meta', 'RPG').map((hit) => hit.template.name)).toEqual(['仙侠 RPG 项目样板'])
    expect(filterChapterTemplates('', '仙侠')).toHaveLength(8)
    expect(filterChapterTemplates('vision', '仙侠')).toHaveLength(1)
    expect(filterChapterTemplates('vision', 'RPG')).toHaveLength(0)
  })

  it('按名取模板与章节标签', () => {
    expect(getChapterTemplateByName('meta', '科幻射击样板')?.description).toBe('近未来科幻 TPS 射击游戏项目元信息')
    expect(getChapterTemplateByName('meta', '不存在的模板')).toBeNull()
    expect(getChapterTemplateByName('不存在的章节', '科幻射击样板')).toBeNull()
    expect(templateChapterLabel('meta')).toBe('文档信息')
    expect(templateChapterLabel('unknown_key')).toBe('unknown_key')
  })
})

describe('ceshuTemplates 空值语义与合并', () => {
  it('空字段判定：null/空串/空数组/空对象为空；0 与 false 不是空', () => {
    expect(isTemplateEmptyField(null)).toBe(true)
    expect(isTemplateEmptyField(undefined)).toBe(true)
    expect(isTemplateEmptyField('')).toBe(true)
    expect(isTemplateEmptyField([])).toBe(true)
    expect(isTemplateEmptyField({})).toBe(true)
    expect(isTemplateEmptyField(0)).toBe(false)
    expect(isTemplateEmptyField(false)).toBe(false)
    expect(isTemplateEmptyField('x')).toBe(false)
    expect(isTemplateEmptyField([1])).toBe(false)
    expect(isTemplateEmptyField({ a: 1 })).toBe(false)
  })

  it('mergeTemplateToChapter：仅填充空字段，0/false 保留；overwrite 覆盖', () => {
    const existing = { a: '已填', b: '', c: 0, d: false, e: {}, f: [] }
    const template = { a: '模板A', b: '模板B', c: 99, d: true, e: { x: 1 }, f: [1], g: '新增' }
    expect(mergeTemplateToChapter(existing, template, false)).toEqual({
      a: '已填',
      b: '模板B',
      c: 0,
      d: false,
      e: { x: 1 },
      f: [1],
      g: '新增'
    })
    expect(mergeTemplateToChapter(existing, template, true)).toEqual({
      a: '模板A',
      b: '模板B',
      c: 99,
      d: true,
      e: { x: 1 },
      f: [1],
      g: '新增'
    })
    // 非 dict 入参容错
    expect(mergeTemplateToChapter(null, template)).toMatchObject({ a: '模板A' })
    expect(mergeTemplateToChapter({ a: 1 }, null)).toEqual({ a: 1 })
    // 不修改原对象
    expect(existing.b).toBe('')
  })

  it('mergeTemplateByMode：overwrite 保留非模板字段', () => {
    expect(mergeTemplateByMode({ a: '旧', extra: '保留' }, { a: '新', b: '模板' }, 'overwrite')).toEqual({
      a: '新',
      b: '模板',
      extra: '保留'
    })
  })

  it('mergeTemplateByMode：append 文本换行追加，空值直填，非文本不覆盖', () => {
    expect(mergeTemplateByMode({ text: '第一段', num: 5, empty: '' }, { text: '第二段', num: 9, empty: '填入' }, 'append')).toEqual({
      text: '第一段\n第二段',
      num: 5,
      empty: '填入'
    })
    // 现有为空串/缺失 → 直接填入
    expect(mergeTemplateByMode({}, { text: '第二段' }, 'append')).toEqual({ text: '第二段' })
    // 一侧为空串不拼接
    expect(mergeTemplateByMode({ text: '' }, { text: '第二段' }, 'append')).toEqual({ text: '第二段' })
  })

  it('mergeTemplateByMode：fillEmpty 等价于仅填空字段', () => {
    expect(mergeTemplateByMode({ a: '已填', b: '' }, { a: 'X', b: 'Y' }, 'fillEmpty')).toEqual({ a: '已填', b: 'Y' })
    expect(mergeTemplateByMode(null, { a: 1 }, 'fillEmpty')).toEqual({ a: 1 })
  })

  it('应用模式常量与字段计数', () => {
    expect(TEMPLATE_APPLY_MODES).toEqual(['fillEmpty', 'overwrite', 'append'])
    expect(countTemplateFields({ a: 1, b: 2 })).toBe(2)
    expect(countTemplateFields(null)).toBe(0)
  })
})

describe('ceshuTemplates 预览树', () => {
  it('遍历顺序与层级：dict 分组 → 值行；列表项标 -；对象列表继续下钻', () => {
    const rows = buildTemplatePreview({
      game_name: '云海仙踪',
      platform: ['PC', '移动端'],
      user_personas: { primary: '核心玩家', secondary: '' },
      milestones: [{ name: '原型', date: '2026-01' }]
    })
    expect(rows).toEqual([
      { depth: 0, kind: 'value', text: 'game_name: 云海仙踪', path: 'game_name' },
      { depth: 0, kind: 'group', text: 'platform:', path: 'platform' },
      { depth: 1, kind: 'item', text: '- PC', path: 'platform[0]' },
      { depth: 1, kind: 'item', text: '- 移动端', path: 'platform[1]' },
      { depth: 0, kind: 'group', text: 'user_personas:', path: 'user_personas' },
      { depth: 1, kind: 'value', text: 'primary: 核心玩家', path: 'user_personas.primary' },
      { depth: 1, kind: 'value', text: 'secondary: (空)', path: 'user_personas.secondary' },
      { depth: 0, kind: 'group', text: 'milestones:', path: 'milestones' },
      { depth: 1, kind: 'value', text: 'name: 原型', path: 'milestones[0].name' },
      { depth: 1, kind: 'value', text: 'date: 2026-01', path: 'milestones[0].date' }
    ])
  })

  it('空数据 → 空行；标量值格式化', () => {
    expect(buildTemplatePreview({})).toEqual([])
    expect(buildTemplatePreview(null)).toEqual([{ depth: 0, kind: 'value', text: '(空)', path: '' }])
    expect(formatTemplateValue(null)).toBe('(空)')
    expect(formatTemplateValue('')).toBe('(空)')
    expect(formatTemplateValue(true)).toBe('是')
    expect(formatTemplateValue(false)).toBe('否')
    expect(formatTemplateValue(3)).toBe('3')
    expect(formatTemplateValue({ a: 1 })).toBe('{"a":1}')
  })

  it('内置 numeric 模板首项可预览（键顺序与数据池一致）', () => {
    const template = listChapterTemplates('numeric')[0]
    expect(template?.name).toBe('RPG 经典数值公式')
    const rows = buildTemplatePreview(template?.data ?? {})
    expect(rows.map((row) => row.path).slice(0, 5)).toEqual([
      'core_formulas',
      'growth_curves',
      'growth_curves[0].name',
      'growth_curves[0].curve',
      'growth_curves[1].name'
    ])
    // 仅 dict / list 值产生分组行（economic_model 与 balance_principles 为文本）
    expect(rows.filter((row) => row.kind === 'group').map((row) => row.text)).toEqual(['growth_curves:', 'drop_tables:'])
    expect(rows.map((row) => row.path)).toContain('economic_model')
    expect(rows.map((row) => row.path)).toContain('balance_principles')
  })
})