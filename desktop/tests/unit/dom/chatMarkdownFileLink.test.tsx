// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

import { ChatMarkdown } from '../../../src/renderer/src/components/digital'
import { renderDom } from './render'

/**
 * 正文内联文件引用（对齐 dsh ui-deliverables）：像文件路径的内联代码变成可点链接。
 *
 * 关键边界：**围栏代码块内不链接化**（否则会把代码内容当路径）；
 * 普通内联词条（不像路径）不链接化；不传 onOpenFile 时保持纯代码。
 */

describe('ChatMarkdown：内联文件链接', () => {
  it('内联文件路径 → 可点链接，点击回调收到路径', async () => {
    const onOpenFile = vi.fn()
    const rendered = await renderDom(<ChatMarkdown text="改动见 `src/main/ipc.ts` 这个文件" onOpenFile={onOpenFile} />)

    const link = rendered.byTestId('chat-file-link')
    expect(link.textContent).toBe('src/main/ipc.ts')
    await rendered.click(link)
    expect(onOpenFile).toHaveBeenCalledWith('src/main/ipc.ts')
    await rendered.cleanup()
  })

  it('围栏代码块内的同一路径不链接化（仍是 <code>）', async () => {
    const onOpenFile = vi.fn()
    const rendered = await renderDom(
      <ChatMarkdown text={'```\nsrc/main/ipc.ts\n```'} onOpenFile={onOpenFile} />
    )
    expect(rendered.queryAll('[data-testid="chat-file-link"]')).toHaveLength(0)
    expect(rendered.queryAll('pre code')).toHaveLength(1)
    await rendered.cleanup()
  })

  it('不像路径的内联代码不链接化', async () => {
    const onOpenFile = vi.fn()
    const rendered = await renderDom(<ChatMarkdown text="用 `hello` 打个招呼" onOpenFile={onOpenFile} />)
    expect(rendered.queryAll('[data-testid="chat-file-link"]')).toHaveLength(0)
    await rendered.cleanup()
  })

  it('未传 onOpenFile 时保持纯代码渲染', async () => {
    const rendered = await renderDom(<ChatMarkdown text="见 `src/main/ipc.ts`" />)
    expect(rendered.queryAll('[data-testid="chat-file-link"]')).toHaveLength(0)
    expect(rendered.queryAll('code')).toHaveLength(1)
    await rendered.cleanup()
  })
})
