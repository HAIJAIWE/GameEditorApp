import { describe, expect, it } from 'vitest'

import {
  CHART_GRID_STEPS,
  CHART_HEIGHT,
  CHART_MARGIN,
  CHART_WIDTH,
  COMPETITOR_COLORS,
  MAX_COMPETITORS,
  chartGridPositions,
  clampScore,
  normalizeCompetitors,
  projectX,
  projectY
} from '../../src/shared/ceshuCompetitiveChart'

describe('ceshuCompetitiveChart 常量', () => {
  it('画布尺寸与留白：340/260/50', () => {
    expect(CHART_WIDTH).toBe(340)
    expect(CHART_HEIGHT).toBe(260)
    expect(CHART_MARGIN).toBe(50)
  })

  it('网格步长与最大竞品数', () => {
    expect(CHART_GRID_STEPS).toEqual([0, 25, 50, 75, 100])
    expect(MAX_COMPETITORS).toBe(5)
  })

  it('配色 5 项，顺序照抄 Python fallback', () => {
    expect(COMPETITOR_COLORS).toHaveLength(5)
    expect(COMPETITOR_COLORS[0]).toBe('#534AB7')
    expect(COMPETITOR_COLORS[3]).toBe('#0EA5E9')
  })
})

describe('ceshuCompetitiveChart 网格与投影', () => {
  it('网格线位置精确匹配', () => {
    expect(chartGridPositions()).toEqual({
      xs: [50, 117.5, 185, 252.5, 320],
      ys: [210, 162.5, 115, 67.5, 20]
    })
  })

  it('横轴投影 projectX', () => {
    expect(projectX(0)).toBe(50)
    expect(projectX(50)).toBe(185)
    expect(projectX(100)).toBe(320)
    expect(projectX(-10)).toBe(50)
    expect(projectX(200)).toBe(320)
    expect(projectX(undefined)).toBe(185)
  })

  it('纵轴投影 projectY', () => {
    expect(projectY(0)).toBe(210)
    expect(projectY(50)).toBe(115)
    expect(projectY(100)).toBe(20)
    expect(projectY(NaN)).toBe(115)
  })

  it('clampScore 归一化', () => {
    expect(clampScore(50)).toBe(50)
    expect(clampScore(-5)).toBe(0)
    expect(clampScore(300)).toBe(100)
    expect(clampScore('abc')).toBe(50)
    expect(clampScore(null)).toBe(50)
    expect(clampScore(NaN)).toBe(50)
  })
})

describe('ceshuCompetitiveChart 竞品归一化', () => {
  it('非数组返回空列表', () => {
    expect(normalizeCompetitors(undefined)).toEqual([])
  })

  it('单条数据坐标与颜色精确匹配', () => {
    const points = normalizeCompetitors([
      { name: 'A', innovation_score: 0, completion_score: 100 }
    ])
    expect(points).toHaveLength(1)
    expect(points[0]).toEqual({
      name: 'A',
      innovation: 0,
      completion: 100,
      color: '#534AB7',
      x: 50,
      y: 20
    })
  })

  it('超过 5 项只取前 5', () => {
    const points = normalizeCompetitors([
      { name: '1' },
      { name: '2' },
      { name: '3' },
      { name: '4' },
      { name: '5' },
      { name: '6' }
    ])
    expect(points).toHaveLength(5)
    expect(points.map((p) => p.name)).toEqual(['1', '2', '3', '4', '5'])
  })

  it('跳过非普通对象但保留原始下标（颜色取下标 1）', () => {
    const points = normalizeCompetitors([
      'x',
      { name: 'B', innovation_score: 0, completion_score: 0 }
    ])
    expect(points).toHaveLength(1)
    expect(points[0]).toEqual({
      name: 'B',
      innovation: 0,
      completion: 0,
      color: '#1D9E75',
      x: 50,
      y: 210
    })
  })

  it('缺 name 时使用默认名 竞品1，坐标精确', () => {
    const points = normalizeCompetitors([{ innovation_score: 10 }])
    expect(points).toHaveLength(1)
    expect(points[0].name).toBe('竞品1')
    expect(points[0].x).toBe(77)
    expect(points[0].y).toBe(115)
  })
})