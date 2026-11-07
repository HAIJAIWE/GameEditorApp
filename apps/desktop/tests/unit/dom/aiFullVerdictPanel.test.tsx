// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AiFullGeneratePanel } from '../../../src/renderer/src/components/agent'
import { createDefaultCeshu } from '@mobai/shared/ceshu/model'
import { installMbApi, renderDom, type ApiStub, type RenderResult } from './render'
import type { QualityGateVerdict } from '@mobai/shared/types'

/**
 * 确定性质量门的 UI 落地（2026-11-07）。
 *
 * 此前 `response.quality` 的**主结论**在 IPC 返回值里算完了却只被前端取走 `judge`
 * 辅助维度 ⇒「体检报告出来了不治病」。本测试锁的是：净恶化的章真的会在界面上
 * 被标出来、汇总出来、并能一键重生成（而不是静默记一笔）。
 */

let view: RenderResult | null = null
let api: ApiStub | null = null

afterEach(async () => {
  await view?.cleanup()
  api?.restore()
  view = null
  api = null
})

function verdict(errorDelta: number, completionDelta: number): QualityGateVerdict {
  return {
    chapter: 'vision',
    beforeErrors: 10,
    afterErrors: 10 + errorDelta,
    errorDelta,
    blocking: [],
    completionBefore: 0.3,
    completionAfter: 0.3 + completionDelta,
    completionDelta,
    improved: errorDelta < 0 || completionDelta > 0,
    summary: `校验问题增加 ${errorDelta} 个`,
    judge: null
  }
}

/** 完整走一遍生成：填描述 → 内联确认 → 确认生成 → 等逐章循环落定 */
async function runGeneration(rendered: RenderResult): Promise<void> {
  const desc = rendered.query('[data-testid="ai-full-desc"]') as HTMLTextAreaElement | null
  expect(desc, '描述输入框').not.toBeNull()
  // render helper 的 change() 只支持 HTMLInputElement，这里描述框是 textarea，自己派发一次原生 input
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  await act(async () => {
    setter?.call(desc!, '一个关于星际考古的游戏，玩家探索遗迹并拼合线索。')
    desc!.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await rendered.flush()
  await rendered.click(rendered.query('[data-testid="ai-full-start"]') as HTMLElement)
  const confirm = rendered.query('[data-testid="ai-full-confirm-yes"]') as HTMLElement | null
  expect(confirm, '确认按钮').not.toBeNull()
  await rendered.click(confirm!)
  // 逐章是 await 串行的，多冲几次微任务队列
  for (let i = 0; i < 6; i++) await rendered.flush()
}

describe('AiFullGeneratePanel：确定性质量门可见且可行动', () => {
  it('净恶化章：显示徽标 + 汇总 + 重生成按钮，点击只重跑这些章', async () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试项目' })
    const generate = vi.fn(async (req: unknown) => {
      const chapter = (req as { chapter: string }).chapter
      return {
        fields: { placeholder: `内容-${chapter}` },
        // 只有 vision 净恶化（错误 +2），其余章全部持平
        quality: verdict(chapter === 'vision' ? 2 : 0, 0),
        usage: { totalTokens: 10 }
      }
    })
    api = installMbApi({ overrides: { 'ceshu.aiGenerateChapter': generate } })
    view = await renderDom(
      <AiFullGeneratePanel ceshuId="c1" doc={doc} onApplied={() => {}} onClose={() => {}} />
    )
    await runGeneration(view)

    expect(view.query('[data-testid="ai-full-verdict-vision"]'), '净恶化章徽标').not.toBeNull()
    expect(view.query('[data-testid="ai-full-verdict"]'), '质量门汇总区').not.toBeNull()
    expect(view.text()).toContain('净恶化')

    const regen = view.query('[data-testid="ai-full-regen"]') as HTMLButtonElement | null
    expect(regen, '重生成按钮').not.toBeNull()
    expect(regen!.disabled).toBe(false)

    const before = generate.mock.calls.length
    await view.click(regen!)
    for (let i = 0; i < 4; i++) await view.flush()
    const after = generate.mock.calls.length
    // 只重跑净恶化的 1 章，而不是整篇再生成一遍
    expect(after - before).toBe(1)
  })

  it('全部持平（improved=false 但非恶化）：不误报，重生成按钮禁用且汇总区显示通过', async () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试项目' })
    api = installMbApi({
      overrides: {
        'ceshu.aiGenerateChapter': async (req: unknown) => ({
          fields: { placeholder: `内容-${(req as { chapter: string }).chapter}` },
          quality: verdict(0, 0),
          usage: { totalTokens: 10 }
        })
      }
    })
    view = await renderDom(
      <AiFullGeneratePanel ceshuId="c1" doc={doc} onApplied={() => {}} onClose={() => {}} />
    )
    await runGeneration(view)

    expect(view.query('[data-testid="ai-full-verdict-vision"]'), '持平章不该被标').toBeNull()
    expect(view.text()).toContain('均无净恶化')
    const regen = view.query('[data-testid="ai-full-regen"]') as HTMLButtonElement | null
    expect(regen!.disabled).toBe(true)
  })
})

/** 空字段自动重试：仅对「调用成功但解析 0 字段」重试 1 次，不放大故障 */
describe('AiFullGeneratePanel：空字段自动重试（JSON 截断）', () => {
  it('首章第一次返回空字段 → 自动重试 1 次并成功；调用次数恰好 +1', async () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试项目' })
    const perChapter = new Map<string, number>()
    const generate = vi.fn(async (req: unknown) => {
      const chapter = (req as { chapter: string }).chapter
      const n = (perChapter.get(chapter) ?? 0) + 1
      perChapter.set(chapter, n)
      // vision 章第一次返回空字段（模拟截断），重试后正常；其余章一次成功
      const empty = chapter === 'vision' && n === 1
      return {
        fields: empty ? {} : { placeholder: `内容-${chapter}` },
        quality: verdict(0, 0),
        usage: { totalTokens: 10 }
      }
    })
    api = installMbApi({ overrides: { 'ceshu.aiGenerateChapter': generate } })
    view = await renderDom(
      <AiFullGeneratePanel ceshuId="c1" doc={doc} onApplied={() => {}} onClose={() => {}} />
    )
    await runGeneration(view)

    // 24 章正常调用 + vision 一次重试 = 25 次；且没有被误判为失败
    const chapterCount = view.queryAll('[data-testid^="ai-full-status-"]').length
    expect(generate.mock.calls.length).toBe(chapterCount + 1)
    expect(view.query('[data-testid="ai-full-status-vision"]')!.className).toContain('done')

    // 重试那次的提示词必须带严格 JSON 约束（按内容定位，不假设调用序号）
    const retryCall = generate.mock.calls.find((call) => {
      const req = call[0] as { fullGenerate: { extraPrompt: string } }
      return req.fullGenerate.extraPrompt.includes('严格只输出一个完整 JSON 对象')
    })
    expect(retryCall, '应存在一次带严格 JSON 约束的重试').toBeDefined()
    expect((retryCall![0] as { chapter: string }).chapter).toBe('vision')
  })

  it('调用直接抛错（服务不可用）→ 不重试，首章即中断', async () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试项目' })
    const generate = vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    })
    api = installMbApi({ overrides: { 'ceshu.aiGenerateChapter': generate } })
    view = await renderDom(
      <AiFullGeneratePanel ceshuId="c1" doc={doc} onApplied={() => {}} onClose={() => {}} />
    )
    await runGeneration(view)
    // 首章即失败 ⇒ 中断，恰好 1 次调用，绝不重试放大故障
    expect(generate.mock.calls.length).toBe(1)
  })
})
