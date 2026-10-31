import { describe, expect, it } from 'vitest'

import {
  AI_GENERATED_KEY,
  clearAiGenerated,
  markAiGenerated,
  pendingAiChapters,
  readAiGenerated
} from '../../src/shared/ceshu/prompts'
import type { ChapterKey } from '../../src/shared/ceshu/reference'

/**
 * 「AI 生成、待核对」标记的纯逻辑。
 *
 * ## 为什么值得单测
 * 它写在 `meta` 的一个额外键里，和策划书本体数据放在一起 ——
 * 一旦读写规则写错（比如把别人的标记清了、脏数据炸掉），
 * 表现是「用户的对账进度莫名丢失」而不是空指针，很难查。
 */

const VISION: ChapterKey = 'vision'
const COMBAT: ChapterKey = 'combat'

describe('readAiGenerated', () => {
  it('没有键时返回空表', () => {
    expect(readAiGenerated({})).toEqual({})
  })

  it('脏数据（非对象）当空表，不抛', () => {
    expect(readAiGenerated({ [AI_GENERATED_KEY]: 'garbage' })).toEqual({})
    expect(readAiGenerated({ [AI_GENERATED_KEY]: null })).toEqual({})
  })

  it('过滤掉值为空的条目', () => {
    const meta = { [AI_GENERATED_KEY]: { vision: '2026-10-20T00:00:00.000Z', combat: 42 } }
    expect(readAiGenerated(meta)).toEqual({ vision: '2026-10-20T00:00:00.000Z' })
  })
})

describe('markAiGenerated', () => {
  it('标记追加，不覆盖已有章节的时间戳', () => {
    const first = markAiGenerated({}, [VISION], '2026-10-20T01:00:00.000Z')
    const second = markAiGenerated(first, [COMBAT], '2026-10-20T02:00:00.000Z')

    expect(readAiGenerated(second)).toEqual({
      vision: '2026-10-20T01:00:00.000Z',
      combat: '2026-10-20T02:00:00.000Z'
    })
  })

  it('不碰 meta 里的其它字段', () => {
    const marked = markAiGenerated({ game_name: '星海' }, [VISION], '2026-10-20T01:00:00.000Z')
    expect(marked.game_name).toBe('星海')
  })
})

describe('clearAiGenerated', () => {
  it('清掉指定章节，别的章节保留', () => {
    const meta = markAiGenerated({}, [VISION, COMBAT], '2026-10-20T01:00:00.000Z')
    const cleared = clearAiGenerated(meta, VISION)

    expect(readAiGenerated(cleared)).toEqual({ combat: '2026-10-20T01:00:00.000Z' })
  })

  it('没有该章节标记时**原样返回同一个对象**（调用方据此跳过写盘）', () => {
    const meta = { game_name: '星海' }
    expect(clearAiGenerated(meta, VISION)).toBe(meta)
  })

  it('清光最后一个后键仍在（空表），不留 undefined 残留', () => {
    const meta = markAiGenerated({}, [VISION], '2026-10-20T01:00:00.000Z')
    const cleared = clearAiGenerated(meta, VISION)

    expect(readAiGenerated(cleared)).toEqual({})
    expect(cleared[AI_GENERATED_KEY]).toEqual({})
  })
})

describe('pendingAiChapters', () => {
  it('按传入的章节顺序返回待核对章节（未标记的不出现）', () => {
    const meta = markAiGenerated({}, [COMBAT, VISION], '2026-10-20T01:00:00.000Z')
    const order: ChapterKey[] = [VISION, COMBAT, 'economy']

    expect(pendingAiChapters(meta, order)).toEqual([VISION, COMBAT])
  })
})
