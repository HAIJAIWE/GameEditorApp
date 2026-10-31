// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { copyToClipboard, DigitalMessageItem } from '../../src/renderer/src/components/digital'
import { renderDom, type RenderResult } from './dom/render'

/**
 * 消息条目：左右排版分支、纯图标复制动作、流式光标。
 *
 * 这几条是 e2e 的底层契约 —— `data-testid` / `data-role` 挪位会让
 * agent-digital-panel.spec.ts 的 hasText 过滤与 innerText 断言直接失败；
 * 复制按钮若带可见文字，也会污染 innerText。
 */

let view: RenderResult | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
  vi.unstubAllGlobals()
})

describe('DigitalMessageItem', () => {
  it('用户消息：data-role=user，原文可见', async () => {
    view = await renderDom(<DigitalMessageItem role="user" text="共 13 种数据类型" />)

    const item = view.byTestId('digital-message')
    expect(item.dataset.role).toBe('user')
    expect(item.textContent).toContain('共 13 种数据类型')
    expect(item.querySelector('.digital-message-bubble')).not.toBeNull()
  })

  it('助手消息：data-role=assistant，走 markdown 渲染', async () => {
    view = await renderDom(<DigitalMessageItem role="assistant" text="已按你的要求处理" />)

    const item = view.byTestId('digital-message')
    expect(item.dataset.role).toBe('assistant')
    expect(item.textContent).toContain('已按你的要求处理')
    expect(item.querySelector('.markdown-body')).not.toBeNull()
    // 助手是扁平正文，不该再套实心气泡
    expect(item.querySelector('.digital-message-bubble')).toBeNull()
  })

  it('复制按钮纯图标：aria-label=复制消息，点击写入剪贴板并临时变「已复制」', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    view = await renderDom(<DigitalMessageItem role="assistant" text="复制我" />)
    const button = view.byTestId('digital-message-copy')
    expect(button.getAttribute('aria-label')).toBe('复制消息')
    // 不得有任何可见文字（否则污染 e2e 的 innerText）
    expect(button.textContent).toBe('')

    await view.click(button)
    expect(writeText).toHaveBeenCalledWith('复制我')
    expect(button.getAttribute('aria-label')).toBe('已复制')
  })

  it('流式：testid 为 digital-streaming，含原文与闪烁光标，且不走 markdown', async () => {
    view = await renderDom(<DigitalMessageItem role="assistant" text="共" streaming />)

    const streaming = view.byTestId('digital-streaming')
    expect(streaming.textContent).toContain('共')
    expect(streaming.querySelector('.digital-cursor')).not.toBeNull()
    // 半截 markdown 会闪格式，流式期间只渲染原文
    expect(streaming.querySelector('.markdown-body')).toBeNull()
    expect(view.query('[data-testid="digital-message"]')).toBeNull()
  })
})

describe('copyToClipboard', () => {
  it('writeText 抛错时回退 execCommand，两者皆失败则静默返回 false', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    // jsdom 没有实现 execCommand，显式给一个返回 false 的桩
    Object.defineProperty(document, 'execCommand', { value: () => false, configurable: true })

    await expect(copyToClipboard('x')).resolves.toBe(false)
    expect(writeText).toHaveBeenCalledWith('x')
  })
})
