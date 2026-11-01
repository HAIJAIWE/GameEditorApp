// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

import { DigitalDeliveryCard } from '../../../src/renderer/src/components/digital'
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
      // 扩展名标签 + 大小（对齐 dsh PresentedFileCard 的扩展名兜底）
      expect(rendered.text()).toContain('DOCX')
      expect(rendered.text()).toContain('2.0 KB')

      await rendered.click(files[0] as HTMLElement)
      expect(api.calls).toContain('shell.openPath')
      await rendered.cleanup()
    } finally {
      api.restore()
    }
  })

  it('传 onOpen 时点击交给调用方（文本预览 / 二进制原生由调用方决定）', async () => {
    const onOpen = vi.fn()
    const rendered = await renderDom(
      <DigitalDeliveryCard deliveries={[delivery('d1', 'a.md')]} onOpen={onOpen} />
    )
    await rendered.click(rendered.byTestId('digital-delivery-file'))
    expect(onOpen).toHaveBeenCalledWith('/lib/exports/a.md')
    await rendered.cleanup()
  })

  it('超过 4 行折叠（对齐 COLLAPSED_PRESENTED_COUNT），点开全部展开', async () => {
    const api = installMbApi()
    try {
      const files = [1, 2, 3, 4, 5].map((n) => delivery(`d${n}`, `f${n}.docx`))
      const rendered = await renderDom(<DigitalDeliveryCard deliveries={files} />)
      expect(rendered.queryAll('[data-testid="digital-delivery-file"]')).toHaveLength(4)

      const toggle = rendered.byTestId('digital-delivery-toggle')
      expect(toggle.textContent).toContain('全部 5 个文件')
      await rendered.click(toggle)
      expect(rendered.queryAll('[data-testid="digital-delivery-file"]')).toHaveLength(5)
      await rendered.cleanup()
    } finally {
      api.restore()
    }
  })
})
