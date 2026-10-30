// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

import { DigitalMessageItem } from '../../../src/renderer/src/components/digital/DigitalMessageItem'
import { installMbApi, pressKey, renderDom } from './render'

/**
 * 用户消息的附件 chip（对齐 dsh ui-attachment 的诚实子集）。
 *
 * 断言「附件真的渲染出来、点开走回调、助手消息不显示附件」，
 * 而不是「有个按钮」——`onOpenAttachment` 就是接 `attachments:open` 的那根线。
 */

const file = (name: string): { name: string; path: string; mime: string; bytes: number } => ({
  name,
  path: `/lib/attachments/${name}`,
  mime: 'text/markdown',
  bytes: 2048
})

const img = (name: string): { name: string; path: string; mime: string; bytes: number } => ({
  name,
  path: `/lib/attachments/${name}`,
  mime: 'image/png',
  bytes: 4096
})

describe('消息附件 chip', () => {
  it('用户消息渲染附件 chip（名称 + 大小），点开回调收到路径', async () => {
    const onOpen = vi.fn()
    const rendered = await renderDom(
      <DigitalMessageItem
        role="user"
        text="看看这两份"
        attachments={[file('a.md'), file('b.md')]}
        onOpenAttachment={onOpen}
      />
    )

    const chips = rendered.queryAll('[data-testid="digital-message-attachment"]')
    expect(chips).toHaveLength(2)
    expect(rendered.text()).toContain('a.md')
    expect(rendered.text()).toContain('2.0 KB')

    await rendered.click(chips[0] as HTMLElement)
    expect(onOpen).toHaveBeenCalledWith('/lib/attachments/a.md')
    await rendered.cleanup()
  })

  it('没有附件时不渲染附件区', async () => {
    const rendered = await renderDom(<DigitalMessageItem role="user" text="纯文字" />)
    expect(rendered.queryAll('[data-testid="digital-message-attachments"]')).toHaveLength(0)
    await rendered.cleanup()
  })

  it('助手消息不渲染附件区（附件只属于用户消息）', async () => {
    const rendered = await renderDom(
      <DigitalMessageItem role="assistant" text="答复" attachments={[file('a.md')]} />
    )
    expect(rendered.queryAll('[data-testid="digital-message-attachment"]')).toHaveLength(0)
    await rendered.cleanup()
  })

  it('图片附件渲染缩略图（单图 single），点开 lightbox 并可关闭', async () => {
    const api = installMbApi({
      overrides: {
        'attachments.readImage': async () => ({ ok: true, dataUrl: 'data:image/png;base64,AAAA' })
      }
    })
    try {
      const rendered = await renderDom(
        <DigitalMessageItem role="user" text="看图" attachments={[img('pic.png')]} />
      )
      await rendered.flush()
      const imageBtn = rendered.byTestId('digital-message-image')
      expect(imageBtn.getAttribute('data-variant')).toBe('single')
      expect(rendered.queryAll('[data-testid="digital-message-image"] img')).toHaveLength(1)

      await rendered.click(imageBtn)
      expect(rendered.byTestId('digital-lightbox')).toBeTruthy()
      // 点关闭收起
      await rendered.click(rendered.byTestId('digital-lightbox-close'))
      expect(rendered.queryAll('[data-testid="digital-lightbox"]')).toHaveLength(0)
      await rendered.cleanup()
    } finally {
      api.restore()
    }
  })

  it('多附件时图片用 64px 方块（tile）', async () => {
    const api = installMbApi({
      overrides: {
        'attachments.readImage': async () => ({ ok: true, dataUrl: 'data:image/png;base64,AAAA' })
      }
    })
    try {
      const rendered = await renderDom(
        <DigitalMessageItem role="user" text="两个" attachments={[img('a.png'), file('b.md')]} />
      )
      await rendered.flush()
      expect(rendered.byTestId('digital-message-image').getAttribute('data-variant')).toBe('tile')
      await rendered.cleanup()
    } finally {
      api.restore()
    }
  })

  it('lightbox 支持 Esc 关闭', async () => {
    const api = installMbApi({
      overrides: {
        'attachments.readImage': async () => ({ ok: true, dataUrl: 'data:image/png;base64,AAAA' })
      }
    })
    try {
      const rendered = await renderDom(
        <DigitalMessageItem role="user" text="看图" attachments={[img('pic.png')]} />
      )
      await rendered.flush()
      await rendered.click(rendered.byTestId('digital-message-image'))
      expect(rendered.byTestId('digital-lightbox')).toBeTruthy()
      await pressKey('Escape')
      expect(rendered.queryAll('[data-testid="digital-lightbox"]')).toHaveLength(0)
      await rendered.cleanup()
    } finally {
      api.restore()
    }
  })

  it('读图失败时回退成文件 chip（仍可打开）', async () => {
    const api = installMbApi({
      overrides: {
        'attachments.readImage': async () => ({ ok: false, error: '不是受支持的图片格式' })
      }
    })
    try {
      const rendered = await renderDom(
        <DigitalMessageItem role="user" text="坏图" attachments={[img('bad.png')]} />
      )
      await rendered.flush()
      expect(rendered.queryAll('[data-testid="digital-message-image"]')).toHaveLength(0)
      expect(rendered.queryAll('[data-testid="digital-message-attachment"]')).toHaveLength(1)
      await rendered.cleanup()
    } finally {
      api.restore()
    }
  })
})
