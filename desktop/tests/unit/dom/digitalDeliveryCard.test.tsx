// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { DigitalDeliveryCard } from '../../../src/renderer/src/components/digital/DigitalDeliveryCard'
import { installMbApi, renderDom } from './render'

/**
 * 交付卡（对齐 dsh ui-deliverables 的 delivery cards）：只展示真实交付的文件，
 * 空列表不渲染，点文件名走系统程序打开。
 */

const delivery = (id: string, label: string, bytes = 2048) => ({
  id,
  conversationId: 'c1',
  path: `/lib/exports/${label}`,
  label,
  bytes,
  timestamp: 1
})

describe('交付卡', () => {
  it('空列表不渲染', async () => {
    const rendered = await renderDom(<DigitalDeliveryCard deliveries={[]} />)
    expect(rendered.queryAll('[data-testid="digital-delivery-card"]')).toHaveLength(0)
    await rendered.cleanup()
  })

  it('渲染交付文件（名称 + 大小），点开走 attachments.open', async () => {
    const api = installMbApi()
    try {
      const rendered = await renderDom(
        <DigitalDeliveryCard deliveries={[delivery('d1', 'game.docx'), delivery('d2', 'design.md', 512)]} />
      )
      const files = rendered.queryAll('[data-testid="digital-delivery-file"]')
      expect(files).toHaveLength(2)
      expect(rendered.text()).toContain('game.docx')
      expect(rendered.text()).toContain('2.0 KB')

      await rendered.click(files[0] as HTMLElement)
      expect(api.calls).toContain('attachments.open')
      await rendered.cleanup()
    } finally {
      api.restore()
    }
  })
})
