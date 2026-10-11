import { describe, expect, it } from 'vitest'

import { CHAPTER_KEYS, type CeshuDocument } from '../../src/shared/ceschu/ceshuConstants'
import {
  computeChapterProgress,
  computeEnabledEditors,
  createDefaultCeshu,
  formatLocalTimestamp,
  getGddScope,
  isEmptyRequiredValue,
  isFilledValue,
  normalizeCeshu,
  resolveDocGameStyle,
  withChapter
} from '../../src/shared/ceschu/ceshuModel'

describe('策划书模型（W3 第一切片）', () => {
  it('createDefaultCeshu：18 章 + 13 系统默认关闭 + 档位写入 meta.gdd_scope', () => {
    const doc = createDefaultCeshu({ scope: 'full' })

    expect(doc.version).toBe('5.0')
    expect(doc.ceshu_id).toMatch(/^[0-9a-f]{8}$/)
    expect(doc.is_active).toBe(true)
    expect(doc.parent_id).toBe('')
    expect(doc.version_label).toBe('v1.0')
    expect(Object.keys(doc.systems)).toHaveLength(13)
    expect(Object.values(doc.systems).every((entry) => (entry as { enabled: boolean }).enabled === false)).toBe(true)
    expect(doc.meta.gdd_scope).toBe('full')
    expect(doc.meta.version).toBe('0.1.0')
    expect(doc.enabled_editors).toEqual([])
    for (const key of CHAPTER_KEYS) {
      expect(doc[key]).toBeTypeOf('object')
    }
  })

  it('createDefaultCeshu：两次调用不共享可变引用', () => {
    const a = createDefaultCeshu({ scope: 'lite' })
    const b = createDefaultCeshu({ scope: 'lite' })
    ;(a.meta as Record<string, unknown>).game_name = '改过了'
    ;(a.systems.battle as Record<string, unknown>).enabled = true
    expect(b.meta.game_name).toBe('')
    expect((b.systems.battle as Record<string, unknown>).enabled).toBe(false)
  })

  it('normalizeCeshu：兼容旧版字段差异（章节整体采用旧数据、缺失章取默认、未知顶层键保留）', () => {
    const doc = normalizeCeshu({
      version: '5.0',
      ceshu_id: '9669a8b0',
      created_at: '2026-09-09 03:33:39',
      updated_at: '2026-09-09 03:33:39',
      meta: { game_type: 'RPG角色扮演游戏', gdd_scope: 'full' },
      characters: { protagonist: {}, npc_list: [] },
      combat: { combat_mode: 'turn_based', enemy_design: [] },
      enabled_editors: [{ key: 'battle', name: '战斗', data_type: 'battle' }],
      custom_future_key: { foo: 1 }
    })

    expect(doc.ceshu_id).toBe('9669a8b0')
    // 缺失章节自动补默认值
    expect(doc.story.architecture).toBe('')
    // 存在的章节整体采用旧数据（含旧字段）
    expect((doc.combat as Record<string, unknown>).enemy_design).toEqual([])
    expect(doc.combat.combat_mode).toBe('turn_based')
    expect(doc.story.protagonist).toEqual({})
    // 未知顶层键保留
    expect((doc as unknown as Record<string, unknown>).custom_future_key).toEqual({ foo: 1 })
    expect(doc.enabled_editors).toHaveLength(1)
    expect(getGddScope(doc)).toBe('full')
  })

  it('normalizeCeshu：缺失 gdd_scope 时档位回退为 full', () => {
    const doc = normalizeCeshu({ meta: { game_name: '旧策划书' } })
    expect(getGddScope(doc)).toBe('full')
  })

  it('normalizeCeshu：非对象输入抛错', () => {
    expect(() => normalizeCeshu([])).toThrow('格式不正确')
    expect(() => normalizeCeshu('text')).toThrow('格式不正确')
  })

  it('computeChapterProgress：必填字段、数组与 0 的真值语义、systems 占比、档位可见章节', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    const progress = computeChapterProgress(doc)
    expect(Object.keys(progress)).toHaveLength(CHAPTER_KEYS.length + 1)
    expect(progress.meta).toBe(0)
    expect(progress.systems).toBe(0)

    // meta：4 个必填填 3 个（tags 为空数组视为未填）
    doc.meta.game_name = '测试游戏'
    doc.meta.game_type = 'RPG'
    doc.meta.positioning = '一句话'
    expect(computeChapterProgress(doc).meta).toBe(0.75)

    // 空数组与 0 都视为未填
    doc.meta.tags = ['剧情向']
    expect(computeChapterProgress(doc).meta).toBe(1)
    expect(computeChapterProgress(doc).story).toBe(0)
    doc.story.main_npc_count = 0
    expect(computeChapterProgress(doc).story).toBe(0)
    doc.story.protagonist = '主角设定'
    expect(computeChapterProgress(doc).story).toBe(0.25)

    // systems：启用 2/13
    ;(doc.systems.battle as Record<string, unknown>).enabled = true
    ;(doc.systems.skill as Record<string, unknown>).enabled = true
    expect(computeChapterProgress(doc).systems).toBe(0.15)

    // lite 档 = 文档信息段 + 核心 9 章
    doc.meta.gdd_scope = 'lite'
    const lite = computeChapterProgress(doc)
    expect(Object.keys(lite)).toHaveLength(10 + 1)
    expect(lite.market_analysis).toBeUndefined()
    expect(lite.total).toBeTypeOf('number')
  })

  it('withChapter：meta 保留既有档位；保存后重算 enabled_editors', () => {
    const doc = createDefaultCeshu({ scope: 'lite' })
    doc.updated_at = '2000-01-01 00:00:00'

    const savedMeta = withChapter(doc, 'meta', { game_name: '新名字' })
    expect(savedMeta.meta.gdd_scope).toBe('lite')
    expect(savedMeta.meta.game_name).toBe('新名字')
    expect(savedMeta.updated_at).not.toBe('2000-01-01 00:00:00')

    const systems = structuredClone(doc.systems)
    ;(systems.battle as Record<string, unknown>).enabled = true
    const savedSystems = withChapter(doc, 'systems', systems)
    expect(savedSystems.enabled_editors).toEqual([{ key: 'battle', name: '战斗', data_type: 'battle' }])
  })

  it('computeEnabledEditors：沿用自定义 name 与 data_type', () => {
    const doc: CeshuDocument = createDefaultCeshu({ scope: 'full' })
    doc.systems.battle = { enabled: true, name: '自定义战斗名', data_type: 'custom_battle', config: {} }
    expect(computeEnabledEditors(doc)).toEqual([{ key: 'battle', name: '自定义战斗名', data_type: 'custom_battle' }])
  })

  it('formatLocalTimestamp：与 Python 版同为本地时间字符串（YYYY-MM-DD HH:mm:ss）', () => {
    const stamp = formatLocalTimestamp(new Date(2026, 9, 1, 8, 5, 3))
    expect(stamp).toBe('2026-10-01 08:05:03')
  })

  it('空对象 {} 的双重语义：进度视为未填（真值），校验不视为空（_is_empty_required_value）', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    // resources 必填 = budget({}) + risk_matrix([]) → 进度 0
    expect(computeChapterProgress(doc).resources).toBe(0)
    doc.resources.budget = { summary: '预算' }
    expect(computeChapterProgress(doc).resources).toBe(0.5)

    expect(isFilledValue({})).toBe(false)
    expect(isFilledValue({ summary: 'x' })).toBe(true)
    expect(isEmptyRequiredValue({})).toBe(false)
    expect(isEmptyRequiredValue([])).toBe(true)
    expect(isEmptyRequiredValue(0)).toBe(true)
    expect(isEmptyRequiredValue('x')).toBe(false)
  })
})

describe('resolveDocGameStyle：策划书 → 活跃术语风格', () => {
  const base = (): CeshuDocument => createDefaultCeshu({ scope: 'full' })

  it('doc.style 为已知风格 id 时优先采用（Python 忽略它，此处有意增强）', () => {
    const doc = base()
    doc.style = 'xianxia'
    doc.meta.game_type = ''
    doc.meta.tags = []
    doc.meta.positioning = ''
    expect(resolveDocGameStyle(doc)).toBe('xianxia')
  })

  it('doc.style 未知/为空时回退到关键词推断（对齐 Python open_ceshu）', () => {
    const unknown = base()
    unknown.style = '不存在的风格'
    unknown.meta.game_type = '仙侠MMORPG'
    unknown.meta.tags = ['修仙', '飞升']
    expect(resolveDocGameStyle(unknown)).toBe('xianxia')

    const byType = base()
    byType.meta.game_type = '星际 殖民'
    expect(resolveDocGameStyle(byType)).toBe('scifi')
  })

  it('game_type + tags 推断不出时回退 positioning（Python 的第二段 fallback）', () => {
    const doc = base()
    doc.meta.game_type = '未知类型'
    doc.meta.tags = []
    doc.meta.positioning = '魔法 龙 精灵'
    expect(resolveDocGameStyle(doc)).toBe('fantasy')
  })

  it('全都推断不出 → 空串（= 无活跃风格，标签原样显示，同 Python set_active_style("")）', () => {
    const doc = base()
    doc.meta.game_type = ''
    doc.meta.tags = []
    doc.meta.positioning = ''
    expect(resolveDocGameStyle(doc)).toBe('')
  })

  it('meta 字段类型异常（非字符串/非数组）不抛错', () => {
    const doc = base()
    doc.style = 42 as unknown as string
    doc.meta.game_type = { nested: true }
    doc.meta.tags = '修仙'
    doc.meta.positioning = null
    expect(resolveDocGameStyle(doc)).toBe('')
  })

  it('tags 含非字符串项时跳过，不影响其余推断', () => {
    const doc = base()
    doc.meta.game_type = '仙侠'
    doc.meta.tags = [123, '修仙', null]
    expect(resolveDocGameStyle(doc)).toBe('xianxia')
  })
})