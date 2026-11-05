// @vitest-environment jsdom
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { DigitalMessageItem } from '../../../src/renderer/src/components/digital'
import { renderDom, type RenderResult } from './render'

/**
 * 用户消息「重新提问 / 编辑后重发」。
 *
 * 锁的边界：① 只在用户消息上出现；② retry 用原文、edit 用改后文本；
 * ③ 取消与空文本不发送；④ 运行中禁用（此时发送会走 steer 插话，不能被"重试"悄悄复用）。
 *
 * 语义说明：这是**追加一个新问题**，不是截断历史重放 —— 会话历史是 append-only
 * 审计日志，改写它要么破坏审计、要么得重写 jsonl，代价远大于收益。
 */

async function typeDraft(view: RenderResult, text: string): Promise<void> {
  const textarea = view.byTestId('digital-message-edit-input') as HTMLTextAreaElement
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
  await act(async () => {
    setter?.call(textarea, text)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function pressOn(view: RenderResult, testId: string, key: string): Promise<void> {
  await act(async () => {
    view.byTestId(testId).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

describe('消息 · 重新提问 / 编辑后重发', () => {
  it('只在「用户消息 + 传了 onRequery」时挂两个按钮', async () => {
    const onRequery = vi.fn()
    const user = await renderDom(<DigitalMessageItem role="user" text="问题" onRequery={onRequery} />)
    expect(user.query('[data-testid="digital-message-retry"]')).not.toBeNull()
    expect(user.query('[data-testid="digital-message-edit"]')).not.toBeNull()
    await user.cleanup()

    const assistant = await renderDom(<DigitalMessageItem role="assistant" text="答案" onRequery={onRequery} />)
    expect(assistant.query('[data-testid="digital-message-retry"]')).toBeNull()
    await assistant.cleanup()

    const noCallback = await renderDom(<DigitalMessageItem role="user" text="问题" />)
    expect(noCallback.query('[data-testid="digital-message-retry"]')).toBeNull()
    await noCallback.cleanup()
  })

  it('重试 = 用原文重新提问', async () => {
    const onRequery = vi.fn()
    const view = await renderDom(<DigitalMessageItem role="user" text="原文问题" onRequery={onRequery} />)
    await view.click(view.byTestId('digital-message-retry'))
    expect(onRequery).toHaveBeenCalledWith('原文问题')
    await view.cleanup()
  })

  it('编辑 = 预填原文，改完发送用新文本', async () => {
    const onRequery = vi.fn()
    const view = await renderDom(<DigitalMessageItem role="user" text="原文问题" onRequery={onRequery} />)
    await view.click(view.byTestId('digital-message-edit'))

    const editor = view.byTestId('digital-message-editor')
    expect(editor).toBeTruthy()
    expect((view.byTestId('digital-message-edit-input') as HTMLTextAreaElement).value).toBe('原文问题')

    await typeDraft(view, '改过的问题')
    await view.click(view.byTestId('digital-message-edit-send'))
    expect(onRequery).toHaveBeenCalledWith('改过的问题')
    expect(view.query('[data-testid="digital-message-editor"]')).toBeNull()
    await view.cleanup()
  })

  it('Esc / 取消不发送；空文本时发送按钮不可用', async () => {
    const onRequery = vi.fn()
    const view = await renderDom(<DigitalMessageItem role="user" text="原文" onRequery={onRequery} />)
    await view.click(view.byTestId('digital-message-edit'))

    await pressOn(view, 'digital-message-edit-input', 'Escape')
    expect(view.query('[data-testid="digital-message-editor"]')).toBeNull()
    expect(onRequery).not.toHaveBeenCalled()

    await view.click(view.byTestId('digital-message-edit'))
    await typeDraft(view, '   ')
    expect((view.byTestId('digital-message-edit-send') as HTMLButtonElement).disabled).toBe(true)
    await view.click(view.byTestId('digital-message-edit-cancel'))
    expect(onRequery).not.toHaveBeenCalled()
    await view.cleanup()
  })

  it('运行中禁用（避免「重试」被当成插话）', async () => {
    const onRequery = vi.fn()
    const view = await renderDom(
      <DigitalMessageItem role="user" text="问题" onRequery={onRequery} requeryDisabled />
    )
    expect((view.byTestId('digital-message-retry') as HTMLButtonElement).disabled).toBe(true)
    expect((view.byTestId('digital-message-edit') as HTMLButtonElement).disabled).toBe(true)
    await view.cleanup()
  })

  it('流式消息不挂动作', async () => {
    const view = await renderDom(
      <DigitalMessageItem role="user" text="半截" streaming onRequery={vi.fn()} />
    )
    expect(view.query('[data-testid="digital-message-retry"]')).toBeNull()
    await view.cleanup()
  })
})
