import { describe, expect, it } from 'vitest'

import type { CeshuSummary } from '../../src/shared/ceshuConstants'
import {
  CESHU_STATUS_LABELS,
  RECENT_LIMIT,
  buildCeshuCard,
  buildCeshuCards,
  buildDuplicateName,
  ceshuCardTitle,
  ceshuProgressPercent,
  ceshuStatusLabel,
  ceshuTypeLabel,
  ceshuUpdatedDisplay,
  ceshuVersionBadge,
  filterCeshuCards,
  pickRecentCeshu
} from '../../src/shared/ceshuHome'

function summary(overrides: Partial<CeshuSummary> = {}): CeshuSummary {
  return {
    id: 'id-1',
    gameName: '仙侠 RPG',
    scope: 'full',
    versionLabel: 'v1.0',
    updatedAt: '2026-10-04 12:30:45',
    progress: 0.25,
    parentId: '',
    isActive: true,
    createdAt: '2026-10-01 09:00:00',
    versionNote: '',
    gameType: 'rpg',
    status: 'draft',
    ...overrides
  }
}

describe('ceshuHome 文案与徽章（对齐 Python home_card）', () => {
  it('状态标签：四个已知状态有中文，未知状态原样返回', () => {
    expect(CESHU_STATUS_LABELS).toEqual({
      draft: '草稿',
      in_progress: '进行中',
      review: '评审中',
      final: '已确认'
    })
    expect(ceshuStatusLabel('draft')).toBe('草稿')
    expect(ceshuStatusLabel('in_progress')).toBe('进行中')
    expect(ceshuStatusLabel('review')).toBe('评审中')
    expect(ceshuStatusLabel('final')).toBe('已确认')
    expect(ceshuStatusLabel('archived')).toBe('archived')
  })

  it('标题与类型：空值分别回退「未命名」「未分类」', () => {
    expect(ceshuCardTitle('')).toBe('未命名')
    expect(ceshuCardTitle('有名字')).toBe('有名字')
    expect(ceshuTypeLabel('')).toBe('未分类')
    expect(ceshuTypeLabel('rpg')).toBe('rpg')
  })

  it('更新时间显示：超过 16 字符截断，短于等于 16 原样', () => {
    expect(ceshuUpdatedDisplay('2026-10-04 12:30:45')).toBe('2026-10-04 12:30')
    expect(ceshuUpdatedDisplay('2026-10-04 12:30')).toBe('2026-10-04 12:30')
    expect(ceshuUpdatedDisplay('')).toBe('')
    // ISO 来源（导入/外部）不应露出 `T`
    expect(ceshuUpdatedDisplay('2026-01-01T00:00:00')).toBe('2026-01-01 00:00')
    expect(ceshuUpdatedDisplay('2026-01-01T00:00:00.000Z')).toBe('2026-01-01 00:00')
  })

  it('版本徽章：主子后缀 + 活跃星标；无版本号时不显示', () => {
    expect(ceshuVersionBadge({ versionLabel: 'v1.0', parentId: '', isActive: true })).toBe('v1.0 (主) ★')
    expect(ceshuVersionBadge({ versionLabel: 'v1.1', parentId: 'id-1', isActive: false })).toBe('v1.1 (子)')
    expect(ceshuVersionBadge({ versionLabel: 'v1.1', parentId: 'id-1', isActive: true })).toBe('v1.1 (子) ★')
    expect(ceshuVersionBadge({ versionLabel: '', parentId: '', isActive: true })).toBe('')
  })

  it('进度百分比：向零截断（对齐 Python int(progress*100)），非有限值归零', () => {
    expect(ceshuProgressPercent(0.756)).toBe(75)
    expect(ceshuProgressPercent(1)).toBe(100)
    expect(ceshuProgressPercent(0)).toBe(0)
    // 与 Python 同为 IEEE754 语义：0.29*100 = 28.999... → int → 28
    expect(ceshuProgressPercent(0.29)).toBe(28)
    expect(ceshuProgressPercent(Number.NaN)).toBe(0)
    expect(ceshuProgressPercent(Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('ceshuHome 卡片视图模型', () => {
  it('buildCeshuCard：完整映射摘要字段', () => {
    const card = buildCeshuCard(summary({ gameName: '', gameType: '', status: 'final', progress: 0.5 }))
    expect(card).toEqual({
      id: 'id-1',
      title: '未命名',
      typeLabel: '未分类',
      statusKey: 'final',
      statusLabel: '已确认',
      versionBadge: 'v1.0 (主) ★',
      updatedDisplay: '2026-10-04 12:30',
      progressPercent: 50,
      isMain: true,
      isActive: true,
      searchKey: '未命名'
    })
  })

  it('buildCeshuCard：有父版本时 isMain=false', () => {
    const card = buildCeshuCard(summary({ parentId: 'id-root' }))
    expect(card.isMain).toBe(false)
    expect(card.versionBadge).toBe('v1.0 (子) ★')
  })

  it('buildCeshuCards：逐一映射', () => {
    const cards = buildCeshuCards([summary({ id: 'a' }), summary({ id: 'b' })])
    expect(cards.map((card) => card.id)).toEqual(['a', 'b'])
  })
})

describe('ceshuHome 搜索与最近打开', () => {
  const cards = buildCeshuCards([
    summary({ id: 'a', gameName: '仙侠 RPG' }),
    summary({ id: 'b', gameName: '射击 RPG' }),
    summary({ id: 'c', gameName: 'Puzzle' })
  ])

  it('filterCeshuCards：不区分大小写子串匹配，空关键词返回全部', () => {
    expect(filterCeshuCards(cards, '').map((c) => c.id)).toEqual(['a', 'b', 'c'])
    expect(filterCeshuCards(cards, '  ').map((c) => c.id)).toEqual(['a', 'b', 'c'])
    expect(filterCeshuCards(cards, 'rpg').map((c) => c.id)).toEqual(['a', 'b'])
    expect(filterCeshuCards(cards, 'RPG').map((c) => c.id)).toEqual(['a', 'b'])
    expect(filterCeshuCards(cards, '仙侠').map((c) => c.id)).toEqual(['a'])
    expect(filterCeshuCards(cards, 'puz').map((c) => c.id)).toEqual(['c'])
    expect(filterCeshuCards(cards, 'zzz')).toEqual([])
    // 关键词首尾空白被忽略
    expect(filterCeshuCards(cards, '  仙侠  ').map((c) => c.id)).toEqual(['a'])
  })

  it('pickRecentCeshu：按 updatedAt 倒序取前 N（默认 5）', () => {
    const list = [
      summary({ id: 'old', updatedAt: '2026-01-01 00:00:00' }),
      summary({ id: 'new', updatedAt: '2026-12-31 23:59:59' }),
      summary({ id: 'mid', updatedAt: '2026-06-15 08:00:00' })
    ]
    expect(pickRecentCeshu(list).map((s) => s.id)).toEqual(['new', 'mid', 'old'])
    expect(pickRecentCeshu(list, 2).map((s) => s.id)).toEqual(['new', 'mid'])
    expect(pickRecentCeshu(list, 0)).toEqual([])
    expect(RECENT_LIMIT).toBe(5)
    // 不改动入参顺序
    expect(list.map((s) => s.id)).toEqual(['old', 'new', 'mid'])
  })
})

describe('ceshuHome 复制命名', () => {
  it('buildDuplicateName：追加「 (副本)」；空名回退「未命名」（修正 Python 的空名怪值）', () => {
    expect(buildDuplicateName('仙侠 RPG')).toBe('仙侠 RPG (副本)')
    expect(buildDuplicateName('')).toBe('未命名 (副本)')
  })
})
