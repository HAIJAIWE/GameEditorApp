import { describe, expect, it } from 'vitest'

import { createDefaultCeshu } from '../../src/shared/ceshuModel'
import { migrateCeshuFieldSplits, pendingSplitCount, planCeshuMigration, splitNarrative } from '../../src/shared/ceshuMigrationPlan'

describe('splitNarrative：启发式拆分', () => {
  it('多行 → 按行拆，去掉列表前缀', () => {
    const { points, notes } = splitNarrative('- 第一条\n- 第二条\n2. 第三条\n补充一句')
    expect(points).toEqual(['第一条', '第二条', '第三条', '补充一句'])
    expect(notes).toBe('')
  })

  it('超过 maxPoints 的部分进 notes', () => {
    const { points, notes } = splitNarrative('a\nb\nc', 2)
    expect(points).toEqual(['a', 'b'])
    expect(notes).toBe('c')
  })

  it('单行多句 → 按句拆', () => {
    const { points, notes } = splitNarrative('第一句。第二句。第三句。', 2)
    expect(points).toEqual(['第一句。', '第二句。'])
    expect(notes).toBe('第三句。')
  })

  it('空文本 → 空', () => {
    expect(splitNarrative('  ')).toEqual({ points: [], notes: '' })
  })
})

describe('planCeshuMigration：迁移预览', () => {
  it('空文档 → 无拆分 / 无重叠', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '空' })
    const plan = planCeshuMigration(doc)
    expect(plan.splits).toEqual([])
    expect(plan.overlaps).toEqual([])
  })

  it('有内容时给出拆分预览与重叠提示', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试' })
    doc.story.architecture = '一句话世界观\n- 设定一\n- 设定二'
    doc.vision.design_vision = '愿景'
    doc.vision.differentiation = '差异'

    const plan = planCeshuMigration(doc)
    const arch = plan.splits.find((item) => item.fieldKey === 'architecture')
    expect(arch).toBeDefined()
    expect(arch?.points.length).toBeGreaterThan(0)
    expect(arch?.currentLength).toBeGreaterThan(0)

    const overlap = plan.overlaps.find((item) => item.chapter === 'vision')
    expect(overlap?.fieldLabels).toContain('设计愿景')
    expect(overlap?.note).toContain('差异化')
  })
})

describe('migrateCeshuFieldSplits：幂等、非破坏', () => {
  it('把大文本拆成 points/notes，且保留原文', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试' })
    doc.story.architecture = '一句话世界观\n- 设定一\n- 设定二'

    const { doc: next, migrated } = migrateCeshuFieldSplits(doc)

    expect(migrated).toHaveLength(1)
    expect(migrated[0]?.points).toBe(3)
    // 原文保留（可回滚），不是被删掉
    expect(next.story.architecture).toBe('一句话世界观\n- 设定一\n- 设定二')
    expect(next.story.architecture_points).toEqual(['一句话世界观', '设定一', '设定二'])
    expect(next.story.architecture_notes).toBe('')
  })

  it('幂等：已迁过则不覆盖人的编辑', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试' })
    doc.story.architecture = '原文'
    doc.story.architecture_points = ['人改过的要点']

    const { doc: next, migrated } = migrateCeshuFieldSplits(doc)

    expect(migrated).toHaveLength(0)
    expect(next.story.architecture_points).toEqual(['人改过的要点'])
  })

  it('pendingSplitCount 随迁移归零', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试' })
    doc.story.architecture = '原文'
    doc.gameplay.core_loop = 'a\nb'
    expect(pendingSplitCount(doc)).toBe(2)

    const { doc: next } = migrateCeshuFieldSplits(doc)
    expect(pendingSplitCount(next)).toBe(0)
  })
})
