import { describe, expect, it } from 'vitest'

import {
  createItemInputSchema,
  deleteItemInputSchema,
  listItemsInputSchema
} from '@mobai/shared/schema/adapters'

describe('IPC 契约 schema', () => {
  it('listItems 需要非空 type', () => {
    expect(listItemsInputSchema.safeParse({ type: 'skill' }).success).toBe(true)
    expect(listItemsInputSchema.safeParse({ type: '' }).success).toBe(false)
    expect(listItemsInputSchema.safeParse({}).success).toBe(false)
  })

  it('createItem 的 data 缺省为空对象', () => {
    const parsed = createItemInputSchema.parse({ type: 'skill' })
    expect(parsed).toEqual({ type: 'skill', data: {} })
  })

  it('deleteItem 需要非空 id', () => {
    expect(deleteItemInputSchema.safeParse({ id: 'abc' }).success).toBe(true)
    expect(deleteItemInputSchema.safeParse({ id: '' }).success).toBe(false)
  })
})