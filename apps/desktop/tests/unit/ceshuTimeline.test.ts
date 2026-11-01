import { describe, expect, it } from 'vitest'

import type { CeshuSummary } from '@mobai/shared/ceshu/reference'
import {
  TIMELINE_COLORS,
  TIMELINE_LEGEND,
  TIMELINE_NODE_HEIGHT,
  TIMELINE_NODE_Y,
  buildTimelineDetail,
  buildTimelineLayout,
  classifyTimelineNode,
  defaultTimelineSelectionId,
  timelineNameText,
  timelineNodeLabel,
  timelineProgressPercent,
  timelineTimeText,
  timelineUpdatedFull
} from '@mobai/shared/domain/ceshu/ceshuTimeline'

function summary(overrides: Partial<CeshuSummary> = {}): CeshuSummary {
  return {
    id: 'id-root',
    gameName: '时间线测试',
    scope: 'full',
    versionLabel: 'v1.0',
    updatedAt: '2026-10-02 10:30:45',
    progress: 0.25,
    pendingCount: 0,
    parentId: '',
    isActive: false,
    createdAt: '2026-10-01 09:00:00',
    versionNote: '',
    gameType: '',
    status: 'draft',
    ...overrides
  }
}

describe('ceshuTimeline 节点分类与文案', () => {
  it('节点类型：激活优先，其次按 parent_id 区分主策划/子版本', () => {
    expect(classifyTimelineNode(summary({ isActive: true, parentId: 'p' }))).toBe('active')
    expect(classifyTimelineNode(summary({ isActive: false, parentId: '' }))).toBe('main')
    expect(classifyTimelineNode(summary({ isActive: false, parentId: 'id-root' }))).toBe('sub')
  })

  it('节点标题：主策划加前缀 ★，激活加后缀 ★', () => {
    expect(timelineNodeLabel(summary({ versionLabel: 'v1.0', parentId: '' }))).toBe('★ v1.0')
    expect(timelineNodeLabel(summary({ versionLabel: 'v1.1', parentId: 'id-root', isActive: true }))).toBe('v1.1 ★')
    expect(timelineNodeLabel(summary({ versionLabel: 'v1.0', parentId: '', isActive: true }))).toBe('★ v1.0 ★')
  })

  it('时间文案：updated_at 优先并截断 16 字符；缺失为 (无时间) / (无)', () => {
    expect(timelineTimeText(summary({ updatedAt: '2026-10-02 10:30:45' }))).toBe('2026-10-02 10:30')
    expect(timelineTimeText(summary({ updatedAt: '2026', createdAt: '2026-10-01 09:00:00' }))).toBe('2026')
    expect(timelineTimeText(summary({ updatedAt: '', createdAt: '2026-10-01 09:00:00' }))).toBe('2026-10-01 09:00')
    expect(timelineTimeText(summary({ updatedAt: '', createdAt: '' }))).toBe('(无时间)')
    expect(timelineUpdatedFull(summary({ updatedAt: '', createdAt: '2026-10-01 09:00:00' }))).toBe('2026-10-01 09:00:00')
    expect(timelineUpdatedFull(summary({ updatedAt: '', createdAt: '' }))).toBe('(无)')
  })

  it('名称文案：空为「未命名」；19 字截断为前 17 字 + …', () => {
    expect(timelineNameText('时间线测试')).toBe('时间线测试')
    expect(timelineNameText('')).toBe('未命名')
    expect(timelineNameText('ABCDEFGHIJKLMNOPQRS')).toBe('ABCDEFGHIJKLMNOPQ…')
    expect(timelineNameText('ABCDEFGHIJKLMNOPQR')).toBe('ABCDEFGHIJKLMNOPQR')
  })

  it('进度百分比：int(progress * 100)，非有限数归零', () => {
    expect(timelineProgressPercent(0)).toBe(0)
    expect(timelineProgressPercent(0.4237)).toBe(42)
    expect(timelineProgressPercent(1)).toBe(100)
    expect(timelineProgressPercent(Number.NaN)).toBe(0)
  })
})

describe('ceshuTimeline 布局', () => {
  it('3 个版本：节点 x=20/260/500，主轴 y=160，箭头 2 条，场景宽度取 880 下限', () => {
    const layout = buildTimelineLayout([
      summary({ id: 'a', parentId: '' }),
      summary({ id: 'b', parentId: 'a' }),
      summary({ id: 'c', parentId: 'a' })
    ])
    expect(layout.nodes.map((node) => node.x)).toEqual([20, 260, 500])
    expect(layout.nodes.map((node) => node.y)).toEqual([TIMELINE_NODE_Y, TIMELINE_NODE_Y, TIMELINE_NODE_Y])
    expect(layout.axisY).toBe(TIMELINE_NODE_Y + TIMELINE_NODE_HEIGHT / 2)
    expect(layout.axisY).toBe(160)
    expect(layout.totalWidth).toBe(660)
    expect(layout.sceneWidth).toBe(880)
    expect(layout.sceneHeight).toBe(240)
    expect(layout.arrows).toEqual([
      { fromX: 200, fromY: 160, toX: 260, toY: 160 },
      { fromX: 440, fromY: 160, toX: 500, toY: 160 }
    ])
  })

  it('5 个版本：宽度超出下限（1140 + 40），节点序号与选中默认值正确', () => {
    const versions = [
      summary({ id: 'a', parentId: '' }),
      summary({ id: 'b', parentId: 'a' }),
      summary({ id: 'c', parentId: 'a' }),
      summary({ id: 'd', parentId: 'a', versionLabel: 'v1.3' }),
      summary({ id: 'e', parentId: 'a', versionLabel: 'v1.4' })
    ]
    const layout = buildTimelineLayout(versions)
    expect(layout.totalWidth).toBe(1140)
    expect(layout.sceneWidth).toBe(1180)
    expect(layout.nodes).toHaveLength(5)
    expect(layout.arrows).toHaveLength(4)
    expect(layout.nodes[4]?.index).toBe(4)
  })

  it('空列表：无节点无箭头，场景宽度仍取下限', () => {
    const layout = buildTimelineLayout([])
    expect(layout.nodes).toEqual([])
    expect(layout.arrows).toEqual([])
    expect(layout.totalWidth).toBe(0)
    expect(layout.sceneWidth).toBe(880)
  })

  it('节点配色随类型切换（激活绿 / 主策划蓝 / 子版本灰蓝）', () => {
    const layout = buildTimelineLayout([
      summary({ id: 'a', parentId: '' }),
      summary({ id: 'b', parentId: 'a' }),
      summary({ id: 'c', parentId: 'a', isActive: true })
    ])
    expect(layout.nodes[0]).toMatchObject({ kind: 'main', fill: TIMELINE_COLORS.main, border: TIMELINE_COLORS.mainBorder })
    expect(layout.nodes[1]).toMatchObject({ kind: 'sub', fill: TIMELINE_COLORS.sub, border: TIMELINE_COLORS.subBorder })
    expect(layout.nodes[2]).toMatchObject({
      kind: 'active',
      fill: TIMELINE_COLORS.active,
      border: TIMELINE_COLORS.activeBorder
    })
  })
})

describe('ceshuTimeline 选中与详情', () => {
  it('默认选中：优先激活版本，否则回退当前版本', () => {
    const versions = [
      summary({ id: 'a', parentId: '' }),
      summary({ id: 'b', parentId: 'a', isActive: true }),
      summary({ id: 'c', parentId: 'a' })
    ]
    expect(defaultTimelineSelectionId(versions, 'c')).toBe('b')
    expect(defaultTimelineSelectionId(versions.map((item) => ({ ...item, isActive: false })), 'c')).toBe('c')
  })

  it('详情文案：标题带（激活版本），说明/时间缺失有兜底', () => {
    const layout = buildTimelineLayout([
      summary({ id: 'a', parentId: '' }),
      summary({ id: 'b', parentId: 'a', isActive: true, versionNote: '首轮迭代', progress: 0.5 })
    ])
    const active = layout.nodes[1]
    expect(active).toBeDefined()
    if (!active) return
    const detail = buildTimelineDetail(active)
    expect(detail).toEqual({
      title: '版本详情：v1.0（激活版本）',
      versionLabel: 'v1.0',
      name: '时间线测试',
      updated: '2026-10-02 10:30:45',
      progressPercent: 50,
      note: '首轮迭代'
    })

    const root = layout.nodes[0]
    expect(root).toBeDefined()
    if (!root) return
    const rootDetail = buildTimelineDetail({ ...root, versionNote: '', updatedFull: '(无)' })
    expect(rootDetail.title).toBe('版本详情：v1.0')
    expect(rootDetail.note).toBe('(无版本说明)')
    expect(rootDetail.updated).toBe('(无)')
  })

  it('图例：4 项，颜色与 旧版 一致', () => {
    expect(TIMELINE_LEGEND.map((item) => item.color)).toEqual([
      '#22C55E',
      '#3B82F6',
      '#90A4AE',
      '#888888'
    ])
    expect(TIMELINE_LEGEND.map((item) => item.label)).toEqual(['激活版本', '主策划', '子版本', '→ 父→子派生'])
  })
})