// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { DigitalChangeList } from '../../../src/renderer/src/components/digital'
import type { RecentChangeView } from '@mobai/shared/agent/observability'
import { renderDom } from './render'

/** 改动行的展示：脱敏由 IPC 出口负责，这里只锁「遮挡要如实告诉用户」。 */

function change(overrides: Partial<RecentChangeView> = {}): RecentChangeView {
  return {
    opType: 'update',
    dataType: 'role',
    itemId: 'role_1',
    itemName: '火系法师',
    conversationId: 'conv_1',
    timestamp: 1_700_000_000_000,
    ...overrides
  }
}

describe('DigitalChangeList · 遮挡提示', () => {
  it('maskedCount > 0 时 title 说明遮挡处数', async () => {
    const view = await renderDom(
      <DigitalChangeList changes={[change({ itemName: 'api_key=****', maskedCount: 2 })]} />
    )
    const name = view.query('.digital-change-name')
    expect(name?.textContent).toBe('api_key=****')
    expect(name?.getAttribute('title')).toContain('已遮挡 2 处密钥')
    await view.cleanup()
  })

  it('没有遮挡时 title 就是条目名，不画蛇添足', async () => {
    const view = await renderDom(<DigitalChangeList changes={[change()]} />)
    expect(view.query('.digital-change-name')?.getAttribute('title')).toBe('火系法师')
    await view.cleanup()
  })

  it('空列表渲染空态', async () => {
    const view = await renderDom(<DigitalChangeList changes={[]} />)
    expect(view.query('.digital-change-empty')).not.toBeNull()
    await view.cleanup()
  })
})
