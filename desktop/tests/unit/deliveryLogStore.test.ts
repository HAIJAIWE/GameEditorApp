import { describe, expect, it } from 'vitest'

import { DeliveryLogStore } from '../../src/main/agent/store/deliveryLogStore'

const delivery = (
  conversationId: string,
  label: string,
  timestamp: number
): { conversationId: string; path: string; label: string; bytes: number; timestamp: number } => ({
  conversationId,
  path: `/lib/exports/${label}`,
  label,
  bytes: 10,
  timestamp
})

describe('DeliveryLogStore', () => {
  it('record / listRecentFiltered：新→旧，可按会话与 since 收窄', () => {
    const store = new DeliveryLogStore()
    store.record(delivery('c1', 'one.docx', 100))
    store.record(delivery('c2', 'two.docx', 200))
    store.record(delivery('c1', 'three.docx', 300))

    expect(store.listRecentFiltered(10).map((record) => record.label)).toEqual(['three.docx', 'two.docx', 'one.docx'])
    expect(store.listRecentFiltered(10, { conversationId: 'c1' }).map((record) => record.label)).toEqual([
      'three.docx',
      'one.docx'
    ])
    expect(store.listRecentFiltered(10, { since: 200 }).map((record) => record.label)).toEqual([
      'three.docx',
      'two.docx'
    ])
  })

  it('clearConversation 只清该会话', () => {
    const store = new DeliveryLogStore()
    store.record(delivery('c1', 'one.docx', 100))
    store.record(delivery('c2', 'two.docx', 200))

    expect(store.clearConversation('c1')).toBe(1)
    expect(store.listRecentFiltered(10).map((record) => record.label)).toEqual(['two.docx'])
  })
})
