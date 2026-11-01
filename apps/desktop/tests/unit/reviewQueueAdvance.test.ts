import { describe, expect, it } from 'vitest'

import { cursorAfterAccept } from '../../src/renderer/src/components/ceshu'

/**
 * 审阅队列接受后的光标落点。
 *
 * 队列的「接受」是删掉当前项：同一句 clamp 要同时覆盖
 * 「原下标就是下一条」与「接受的是末条，得退一位」两种情形。
 */
describe('cursorAfterAccept：接受后光标落点', () => {
  it('中间项：停在原下标（列表变短后原位即下一条）', () => {
    expect(cursorAfterAccept(1, 3)).toBe(1)
    expect(cursorAfterAccept(0, 2)).toBe(0)
  })

  it('最后一项：退到新的最后一条', () => {
    expect(cursorAfterAccept(2, 2)).toBe(1)
    expect(cursorAfterAccept(1, 1)).toBe(0)
  })

  it('只剩一项：落回 0', () => {
    expect(cursorAfterAccept(0, 1)).toBe(0)
  })

  it('列表已空：返回 0', () => {
    expect(cursorAfterAccept(0, 0)).toBe(0)
    expect(cursorAfterAccept(3, 0)).toBe(0)
  })

  it('负数 / 越界 / 非有限数入参：一律回到 0', () => {
    expect(cursorAfterAccept(-1, 3)).toBe(0)
    expect(cursorAfterAccept(0, -1)).toBe(0)
    expect(cursorAfterAccept(Number.NaN, 3)).toBe(0)
    expect(cursorAfterAccept(1, Number.POSITIVE_INFINITY)).toBe(0)
    expect(cursorAfterAccept(9, 4)).toBe(3)
  })
})
