// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

import { PendingAttachments } from '../../../src/renderer/src/components/digital'
import { installMbApi, renderDom } from './render'

/**
 * composer 待发送附件区（对齐 dsh draft rail 的诚实子集）：
 * 图片显示真实缩略图、其它显示文件 chip、可移除、读图失败回退。
 */

const img = (name: string): { name: string; mime: string; bytes: number } => ({
  name,
  mime: 'image/png',
  bytes: 4096
})
const file = (name: string): { name: string; mime: string; bytes: number } => ({
  name,
  mime: 'text/markdown',
  bytes: 2048
})

describe('composer 待发送附件区', () => {
  it('空列表且不在导入中 → 不渲染', async () => {
    const rendered = await renderDom(<PendingAttachments attachments={[]} onRemove={() => undefined} />)
    expect(rendered.queryAll('[data-testid="digital-attachments"]')).toHaveLength(0)
    await rendered.cleanup()
  })

  it('导入中显示「导入中…」chip（不确定进度）', async () => {
    const rendered = await renderDom(
      <PendingAttachments attachments={[]} onRemove={() => undefined} adding />
    )
    expect(rendered.byTestId('digital-attachment-adding')).toBeTruthy()
    expect(rendered.text()).toContain('导入中')
    await rendered.cleanup()
  })

  it('图片显示缩略图、文件显示文件 chip；移除回调收到路径', async () => {
    const api = installMbApi({
      overrides: {
        'attachments.readImage': async () => ({ ok: true, dataUrl: 'data:image/png;base64,AAAA' })
      }
    })
    const onRemove = vi.fn()
    try {
      const rendered = await renderDom(
        <PendingAttachments attachments={[img('a.png'), file('b.md')]} onRemove={onRemove} />
      )
      await rendered.flush()
      const chips = rendered.queryAll('[data-testid="digital-attachment-chip"]')
      expect(chips).toHaveLength(2)
      const imageChip = chips.find((chip) => chip.getAttribute('data-kind') === 'image')
      const fileChip = chips.find((chip) => chip.getAttribute('data-kind') === 'file')
      expect(imageChip).toBeTruthy()
      expect(fileChip).toBeTruthy()
      // 图片 chip 里有真实 <img> 缩略图
      expect(imageChip?.querySelector('img')).not.toBeNull()
      // 扩展名 + 大小（对齐 dsh FileCard 的 [extension, size]）
      expect(rendered.text()).toContain('PNG')
      expect(rendered.text()).toContain('MD')

      const removeButtons = rendered.queryAll('[data-testid="digital-attachment-remove"]')
      await rendered.click(removeButtons[0] as HTMLElement)
      expect(onRemove).toHaveBeenCalled()
      await rendered.cleanup()
    } finally {
      api.restore()
    }
  })

  it('读图失败时图片回退成文件 chip（附件仍在）', async () => {
    const api = installMbApi({
      overrides: {
        'attachments.readImage': async () => ({ ok: false, error: '不是受支持的图片格式' })
      }
    })
    try {
      const rendered = await renderDom(
        <PendingAttachments attachments={[img('a.png')]} onRemove={() => undefined} />
      )
      await rendered.flush()
      const chips = rendered.queryAll('[data-testid="digital-attachment-chip"]')
      expect(chips).toHaveLength(1)
      expect(chips[0]?.getAttribute('data-kind')).toBe('file')
      await rendered.cleanup()
    } finally {
      api.restore()
    }
  })
})
