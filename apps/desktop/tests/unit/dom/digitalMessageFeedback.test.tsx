// @vitest-environment jsdom
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { DigitalMessageItem } from '../../../src/renderer/src/components/digital'
import { flush, renderDom } from './render'

/**
 * 消息反馈（对齐 dsh `ui-message-feedback`）：助手消息动作行里的 Like/Dislike。
 *
 * 断言的是「真的调用了后端回调、评分与说明对得上、失败不静默吞掉」，
 * 而不是「按钮能点」——`onFeedback` 就是从 `DigitalPanel` 接 `agent:feedback` 的那根线。
 */

async function typeIntoTextarea(textarea: HTMLTextAreaElement, text: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
  await act(async () => {
    setter?.call(textarea, text)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('消息反馈（Like/Dislike）', () => {
  it('只有「定稿的助手消息 + 传了 onFeedback」才挂反馈按钮', async () => {
    const onFeedback = vi.fn()

    const assistant = await renderDom(<DigitalMessageItem role="assistant" text="答案" onFeedback={onFeedback} />)
    expect(assistant.byTestId('digital-feedback-up')).toBeTruthy()
    expect(assistant.byTestId('digital-feedback-down')).toBeTruthy()
    await assistant.cleanup()

    // 用户消息不挂反馈
    const user = await renderDom(<DigitalMessageItem role="user" text="问题" onFeedback={onFeedback} />)
    expect(user.queryAll('[data-testid="digital-feedback-up"]')).toHaveLength(0)
    await user.cleanup()

    // 没传回调（纯展示用法）不挂反馈
    const plain = await renderDom(<DigitalMessageItem role="assistant" text="答案" />)
    expect(plain.queryAll('[data-testid="digital-feedback-up"]')).toHaveLength(0)
    await plain.cleanup()

    // 流式半截消息不挂反馈（dsh：只有 finalized 消息才有）
    const streaming = await renderDom(
      <DigitalMessageItem role="assistant" text="半截" streaming onFeedback={onFeedback} />
    )
    expect(streaming.queryAll('[data-testid="digital-feedback-up"]')).toHaveLength(0)
    await streaming.cleanup()
  })

  it('点赞 → 填说明 → 提交：回调收到 rating=5 与说明，提交后标记为已记录', async () => {
    const onFeedback = vi.fn().mockResolvedValue(undefined)
    const rendered = await renderDom(
      <DigitalMessageItem role="assistant" text="答案" onFeedback={onFeedback} />
    )

    await rendered.click(rendered.byTestId('digital-feedback-up'))
    expect(rendered.byTestId('digital-feedback-form')).toBeTruthy()

    await typeIntoTextarea(rendered.byTestId('digital-feedback-comment') as HTMLTextAreaElement, '解释很清楚')
    await rendered.click(rendered.byTestId('digital-feedback-submit'))
    await flush()

    expect(onFeedback).toHaveBeenCalledWith({ rating: 5, comment: '解释很清楚' })
    // 成功：表单收起，点赞按钮保持高亮（对齐 dsh recorded rating 常显）
    expect(rendered.queryAll('[data-testid="digital-feedback-form"]')).toHaveLength(0)
    expect(rendered.byTestId('digital-feedback-up').getAttribute('data-active')).toBe('true')
    await rendered.cleanup()
  })

  it('点踩提交 rating=1；提交失败时展示错误且表单不关闭', async () => {
    const onFeedback = vi.fn().mockRejectedValue(new Error('boom'))
    const rendered = await renderDom(
      <DigitalMessageItem role="assistant" text="答案" onFeedback={onFeedback} />
    )

    await rendered.click(rendered.byTestId('digital-feedback-down'))
    await rendered.click(rendered.byTestId('digital-feedback-submit'))
    await flush()

    expect(onFeedback).toHaveBeenCalledWith({ rating: 1, comment: '' })
    expect(rendered.byTestId('digital-feedback-error')).toBeTruthy()
    // 失败不收起表单，用户可修正重试
    expect(rendered.byTestId('digital-feedback-form')).toBeTruthy()
    await rendered.cleanup()
  })

  it('取消：收起表单且不调用回调', async () => {
    const onFeedback = vi.fn()
    const rendered = await renderDom(
      <DigitalMessageItem role="assistant" text="答案" onFeedback={onFeedback} />
    )

    await rendered.click(rendered.byTestId('digital-feedback-up'))
    await rendered.click(rendered.byTestId('digital-feedback-cancel'))

    expect(rendered.queryAll('[data-testid="digital-feedback-form"]')).toHaveLength(0)
    expect(onFeedback).not.toHaveBeenCalled()
    await rendered.cleanup()
  })
})
