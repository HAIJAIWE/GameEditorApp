import { describe, expect, it } from 'vitest'

import {
  collectLeaves,
  diffItems,
  diffLibraries,
  diffValues,
  summarizeDiff,
  type DiffEntry
} from '../../src/shared/util/diff'
import type { ItemRecord } from '../../src/shared/types'

function rec(
  id: string,
  type: string,
  data: Record<string, unknown>,
  createdAt = 'c0',
  updatedAt = 't0'
): ItemRecord {
  return { id, type, data, createdAt, updatedAt }
}

describe('diffValues：标量与根路径', () => {
  it('相同标量 → 空数组（无变化不产出条目）', () => {
    expect(diffValues(1, 1)).toEqual([])
    expect(diffValues('a', 'a')).toEqual([])
  })

  it('相同结构对象（不同引用）→ 空数组', () => {
    expect(diffValues({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toEqual([])
  })

  it('标量修改 → 一条 modified，带 old/new；根路径为 <root>', () => {
    expect(diffValues(1, 2)).toEqual([
      { path: '<root>', diffType: 'modified', oldValue: 1, newValue: 2 }
    ])
    expect(diffValues('x', 'y', 'p')).toEqual([
      { path: 'p', diffType: 'modified', oldValue: 'x', newValue: 'y' }
    ])
  })

  it('类型不同（number vs string）→ modified', () => {
    expect(diffValues(1, '1')).toEqual([
      { path: '<root>', diffType: 'modified', oldValue: 1, newValue: '1' }
    ])
  })
})

describe('diffValues：对象', () => {
  it('新增键 → added，携带新值', () => {
    expect(diffValues({ a: 1 }, { a: 1, b: 2 })).toEqual([
      { path: 'b', diffType: 'added', newValue: 2 }
    ])
  })

  it('删除键 → removed，携带旧值', () => {
    expect(diffValues({ a: 1, b: 2 }, { a: 1 })).toEqual([
      { path: 'b', diffType: 'removed', oldValue: 2 }
    ])
  })

  it('嵌套对象 → 父条目 modified + children 递归到叶子', () => {
    expect(diffValues({ a: { b: 1 } }, { a: { b: 2 } })).toEqual([
      {
        path: 'a',
        diffType: 'modified',
        children: [{ path: 'a.b', diffType: 'modified', oldValue: 1, newValue: 2 }]
      }
    ])
  })

  it('key 并集按排序遍历 → 输出稳定', () => {
    const diffs = diffValues({ z: 1 }, { z: 1, m: 3, a: 2 })
    expect(diffs.map((entry) => entry.path)).toEqual(['a', 'm'])
  })

  it('键存在但对象结构相同 → 不产出条目', () => {
    expect(diffValues({ a: { b: 1 } }, { a: { b: 1 } })).toEqual([])
  })
})

describe('diffValues：数组按下标对齐', () => {
  it('新增元素 → added，路径带下标', () => {
    expect(diffValues([1], [1, 2], 'n')).toEqual([
      { path: 'n[1]', diffType: 'added', newValue: 2 }
    ])
  })

  it('删除元素 → removed，路径带下标', () => {
    expect(diffValues([1, 2], [1], 'n')).toEqual([
      { path: 'n[1]', diffType: 'removed', oldValue: 2 }
    ])
  })

  it('标量元素修改 → 直接在该下标上 modified', () => {
    expect(diffValues([1, 2], [1, 3], 'n')).toEqual([
      { path: 'n[1]', diffType: 'modified', oldValue: 2, newValue: 3 }
    ])
  })

  it('数组内嵌对象递归', () => {
    const diffs = diffValues([{ a: 1 }], [{ a: 2 }], 'items')
    expect(diffs).toEqual([
      {
        path: 'items[0]',
        diffType: 'modified',
        children: [{ path: 'items[0].a', diffType: 'modified', oldValue: 1, newValue: 2 }]
      }
    ])
    // 关键：叶子路径确实点到了内层字段，而不是只停在 items[0]
    expect(collectLeaves(diffs).map((leaf) => leaf.path)).toEqual(['items[0].a'])
  })

  it('数组内嵌数组递归', () => {
    const diffs = diffValues([[1, 2]], [[1, 9]], 'grid')
    expect(collectLeaves(diffs)).toEqual([
      { path: 'grid[0][1]', diffType: 'modified', oldValue: 2, newValue: 9 }
    ])
  })
})

describe('diffItems：按 id 对齐', () => {
  it('新增条目携带 data 全量（修复缺陷 D，不再只带 name）', () => {
    const diffs = diffItems([], [rec('a', 'role', { name: 'A', hp: 100, tags: ['x'] })])
    expect(diffs).toEqual([
      { path: 'a', diffType: 'added', newValue: { name: 'A', hp: 100, tags: ['x'] } }
    ])
  })

  it('删除条目携带 data 全量', () => {
    const diffs = diffItems([rec('a', 'role', { name: 'A', hp: 100 })], [])
    expect(diffs).toEqual([
      { path: 'a', diffType: 'removed', oldValue: { name: 'A', hp: 100 } }
    ])
  })

  it('字段级修改路径含 id，且排除时间戳', () => {
    const diffs = diffItems(
      [rec('a', 'role', { name: 'A', hp: 1 })],
      [rec('a', 'role', { name: 'B', hp: 1 })]
    )
    // data 是嵌套容器 → 父条目 path 为 `a.data`，叶子为 `a.data.name`（id 前缀）
    expect(diffs).toEqual([
      {
        path: 'a.data',
        diffType: 'modified',
        children: [{ path: 'a.data.name', diffType: 'modified', oldValue: 'A', newValue: 'B' }]
      }
    ])
    expect(collectLeaves(diffs).map((leaf) => leaf.path)).toEqual(['a.data.name'])
  })

  it('updatedAt 变化不产生任何 diff', () => {
    expect(
      diffItems(
        [rec('a', 'role', { name: 'A' }, 'c0', 't0')],
        [rec('a', 'role', { name: 'A' }, 'c0', 't999')]
      )
    ).toEqual([])
  })

  it('createdAt 变化也不产生 diff', () => {
    expect(
      diffItems(
        [rec('a', 'role', { name: 'A' }, 'c0', 't0')],
        [rec('a', 'role', { name: 'A' }, 'c999', 't0')]
      )
    ).toEqual([])
  })

  it('type 变化计入 diff（比较 { type, data }）', () => {
    const diffs = diffItems([rec('a', 'role', { name: 'A' })], [rec('a', 'skill', { name: 'A' })])
    expect(collectLeaves(diffs)).toEqual([
      { path: 'a.type', diffType: 'modified', oldValue: 'role', newValue: 'skill' }
    ])
  })

  it('id 排序稳定：输入顺序打乱，输出仍按 id 升序', () => {
    const diffs = diffItems(
      [rec('c', 'role', { name: 'C' }), rec('a', 'role', { name: 'A' })],
      [rec('a', 'role', { name: 'A2' }), rec('c', 'role', { name: 'C2' })]
    )
    expect(diffs.map((entry) => entry.path)).toEqual(['a.data', 'c.data'])
  })
})

describe('diffLibraries：按单数 type 分组', () => {
  it('按单数 type 分组，只保有变化的组', () => {
    const oldItems = [rec('r1', 'role', { name: 'R' }), rec('s1', 'skill', { name: 'S' })]
    const newItems = [rec('r1', 'role', { name: 'R2' }), rec('s1', 'skill', { name: 'S' })]
    const groups = diffLibraries(oldItems, newItems)
    expect(groups.map((group) => group.type)).toEqual(['role'])
    expect(groups[0].entries.map((entry) => entry.path)).toEqual(['r1.data'])
  })

  it('新增类型的整组也被保留', () => {
    const groups = diffLibraries([rec('r1', 'role', { name: 'R' })], [
      rec('r1', 'role', { name: 'R' }),
      rec('j1', 'job', { name: 'J' })
    ])
    expect(groups.map((group) => group.type)).toEqual(['job'])
    expect(groups[0].entries).toEqual([
      { path: 'j1', diffType: 'added', newValue: { name: 'J' } }
    ])
  })

  it('组按 type 升序（与输入顺序无关）', () => {
    const groups = diffLibraries(
      [rec('s1', 'skill', { name: 'S' }), rec('r1', 'role', { name: 'R' })],
      [rec('s1', 'skill', { name: 'S2' }), rec('r1', 'role', { name: 'R2' })]
    )
    expect(groups.map((group) => group.type)).toEqual(['role', 'skill'])
  })

  it('完全一致 → 空数组', () => {
    const items = [rec('r1', 'role', { name: 'R' })]
    expect(diffLibraries(items, items)).toEqual([])
  })
})

describe('collectLeaves：拍平 diff 树', () => {
  it('嵌套树拍平成叶子改动列表（容器条目自身不算叶子）', () => {
    const tree: DiffEntry[] = [
      {
        path: 'a',
        diffType: 'modified',
        children: [
          {
            path: 'a.b',
            diffType: 'modified',
            children: [{ path: 'a.b.c', diffType: 'modified', oldValue: 1, newValue: 2 }]
          },
          { path: 'a.d', diffType: 'added', newValue: 9 }
        ]
      },
      { path: 'x', diffType: 'removed', oldValue: 5 }
    ]
    expect(collectLeaves(tree)).toEqual([
      { path: 'a.b.c', diffType: 'modified', oldValue: 1, newValue: 2 },
      { path: 'a.d', diffType: 'added', newValue: 9 },
      { path: 'x', diffType: 'removed', oldValue: 5 }
    ])
  })

  it('空树 → 空数组', () => {
    expect(collectLeaves([])).toEqual([])
  })
})

describe('summarizeDiff：三态计数', () => {
  it('只统计叶子改动的三态数量', () => {
    const tree: DiffEntry[] = [
      {
        path: 'a',
        diffType: 'modified',
        children: [{ path: 'a.b', diffType: 'modified', oldValue: 1, newValue: 2 }]
      },
      { path: 'add', diffType: 'added', newValue: {} },
      { path: 'del', diffType: 'removed', oldValue: {} }
    ]
    expect(summarizeDiff(tree)).toEqual({ added: 1, removed: 1, modified: 1 })
  })

  it('空 diff → 三态全 0', () => {
    expect(summarizeDiff([])).toEqual({ added: 0, removed: 0, modified: 0 })
  })
})
