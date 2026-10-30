import { describe, expect, it } from 'vitest'

import { orderHeadersWithId, RECORD_ID_KEY } from '../../src/shared/util/id/recordHeaders'

/**
 * 导出表头排序：`id` 必须排首列。
 *
 * 这不是审美问题——`data.id` 是「导出→改→导入」的往返主键，而它创建时是最后写进 data 的，
 * 按 data 键序导出会落在最右列。放最后极易被整列删掉，删了导入就把全表当新增（数据翻倍）。
 */
describe('orderHeadersWithId', () => {
  it('把末尾的 id 提到首列，其余保持原序', () => {
    expect(orderHeadersWithId(['name', 'value', 'desc', 'id'])).toEqual(['id', 'name', 'value', 'desc'])
  })

  it('id 已在首位时原样返回', () => {
    expect(orderHeadersWithId(['id', 'name'])).toEqual(['id', 'name'])
  })

  it('没有 id 时不凭空造一个（这张表本来就不带主键）', () => {
    expect(orderHeadersWithId(['name', 'hp'])).toEqual(['name', 'hp'])
  })

  it('不修改入参', () => {
    const input = ['name', 'id']
    orderHeadersWithId(input)
    expect(input).toEqual(['name', 'id'])
  })

  it('主键列名常量与约定一致', () => {
    expect(RECORD_ID_KEY).toBe('id')
  })
})
