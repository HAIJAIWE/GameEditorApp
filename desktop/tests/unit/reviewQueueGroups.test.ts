import { describe, expect, it } from 'vitest'

import { groupReviewQueue, type ReviewQueueItem } from '../../src/renderer/src/components/ceshu/reviewQueueGroups'

/** 造一条待审字段（字段名不参与分组，仅为可读性） */
function item(chapter: ReviewQueueItem['chapter'], fieldKey = 'f'): ReviewQueueItem {
  return { chapter, fieldKey, fieldLabel: fieldKey }
}

describe('groupReviewQueue：审阅队列按章节分组', () => {
  it('空列表 → 空数组', () => {
    expect(groupReviewQueue([])).toEqual([])
  })

  it('单章多条合并成一组，flatIndex 连续且 startIndex 为 0', () => {
    const groups = groupReviewQueue([item('meta', 'a'), item('meta', 'b'), item('meta', 'c')])

    expect(groups).toHaveLength(1)
    expect(groups[0]?.chapter).toBe('meta')
    expect(groups[0]?.startIndex).toBe(0)
    expect(groups[0]?.items.map((entry) => entry.flatIndex)).toEqual([0, 1, 2])
    expect(groups[0]?.items.map((entry) => entry.item.fieldKey)).toEqual(['a', 'b', 'c'])
  })

  it('跨章按原序分组，startIndex 等于该组第一条的扁平下标', () => {
    const groups = groupReviewQueue([
      item('meta', 'a'),
      item('meta', 'b'),
      item('story', 'c'),
      item('gameplay', 'd')
    ])

    expect(groups.map((group) => group.chapter)).toEqual(['meta', 'story', 'gameplay'])
    expect(groups.map((group) => group.startIndex)).toEqual([0, 2, 3])
    expect(groups.map((group) => group.items.length)).toEqual([2, 1, 1])
  })

  it('同章不连续出现时各自成组（不重排，保证 flatIndex 与视觉顺序一致）', () => {
    const groups = groupReviewQueue([item('meta', 'a'), item('story', 'b'), item('meta', 'c')])

    expect(groups).toHaveLength(3)
    expect(groups.map((group) => group.chapter)).toEqual(['meta', 'story', 'meta'])
    expect(groups.map((group) => group.startIndex)).toEqual([0, 1, 2])
    // 两个 meta 组各含自己那一条，字段顺序不被打乱
    expect(groups[0]?.items[0]?.item.fieldKey).toBe('a')
    expect(groups[2]?.items[0]?.item.fieldKey).toBe('c')
  })

  it('所有组的 flatIndex 拼起来等于原始顺序 0..n-1', () => {
    const flat = [item('meta', 'a'), item('story', 'b'), item('story', 'c'), item('meta', 'd')]
    const indexes = groupReviewQueue(flat).flatMap((group) => group.items.map((entry) => entry.flatIndex))

    expect(indexes).toEqual([0, 1, 2, 3])
  })
})
