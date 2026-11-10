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
/** 桩里指定「哪些章算净恶化」——质量门是纯函数，UI 测试只关心接线，不重复验证函数本身 */
const worseChapters = new Set<string>()

/**
 * 单元化生成后，章级结论由渲染层对「整章合并结果」重算（单元返回值里的 quality 只覆盖本单元字段，
 * 拿来当章结论会把「其它单元还没写」误判成倒退）。故这里把 evaluateChapterDraft 换成可控桩。
 */
vi.mock('@mobai/shared/agent/runtime', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    evaluateChapterDraft: (_doc: unknown, chapter: string) => ({
      ...verdict(worseChapters.has(chapter) ? 2 : 0, 0),
      chapter
    })
  }
})

afterEach(async () => {
  await view?.cleanup()
  api?.restore()
  worseChapters.clear()
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
  // 章与章串行、章内单元 2 路并发：每章要跑 1..N 个单元，多冲几次微任务队列
  for (let i = 0; i < 30; i++) await rendered.flush()
}

describe('AiFullGeneratePanel：确定性质量门可见且可行动', () => {
  it('净恶化章：显示徽标 + 汇总 + 重生成按钮，点击只重跑这些章', async () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试项目' })
    // 只有 vision 净恶化（错误 +2），其余章全部持平
    worseChapters.add('vision')
    const generate = vi.fn(async (req: unknown) => {
      const chapter = (req as { chapter: string }).chapter
      return {
        fields: { placeholder: `内容-${chapter}` },
        quality: verdict(0, 0),
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
    for (let i = 0; i < 30; i++) await view.flush()
    const redoChapters = generate.mock.calls
      .slice(before)
      .map((call) => (call[0] as { chapter: string }).chapter)
    // 只重跑净恶化的那 1 章，而不是整篇再生成一遍。
    // 单元化后一章要发多次调用（视字段数），所以断言「重跑的章恰为 vision」而不是「恰 1 次调用」。
    expect(redoChapters.length).toBeGreaterThan(0)
    expect([...new Set(redoChapters)]).toEqual(['vision'])
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

    // 单元模式下每章会发多次调用（每单元一次）⇒ 只能断言「每章都跑到了」而不是「调用数 == 章数」。
    // 断言的仍是原来的语义：**只在解析出 0 字段时重试，且只重试 1 次**。
    const chapterCount = view.queryAll('[data-testid^="ai-full-status-"]').length
    const calledChapters = new Set(
      generate.mock.calls.map((call) => (call[0] as { chapter: string }).chapter)
    )
    expect(calledChapters.size).toBe(chapterCount)
    expect(generate.mock.calls.length).toBeGreaterThan(chapterCount)
    expect(view.query('[data-testid="ai-full-status-vision"]')!.className).toContain('done')

    // 重试那次的提示词必须带严格 JSON 约束（按内容定位，不假设调用序号）
    const retryCalls = generate.mock.calls.filter((call) => {
      const req = call[0] as { fullGenerate: { extraPrompt: string } }
      return req.fullGenerate.extraPrompt.includes('严格只输出一个完整 JSON 对象')
    })
    expect(retryCalls, '应存在一次带严格 JSON 约束的重试').toHaveLength(1)
    expect((retryCalls[0]![0] as { chapter: string }).chapter).toBe('vision')
  })

  it('调用直接抛错（服务不可用）→ 不重试，首章即中断', async () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试项目' })
    const generate = vi.fn(async (_req: unknown): Promise<never> => {
      throw new Error('ECONNREFUSED')
    })
    api = installMbApi({ overrides: { 'ceshu.aiGenerateChapter': generate } })
    view = await renderDom(
      <AiFullGeneratePanel ceshuId="c1" doc={doc} onApplied={() => {}} onClose={() => {}} />
    )
    await runGeneration(view)
    // 首章即失败 ⇒ 中断，绝不重试放大故障。
    // 单元模式下首个单元（2 路并发时最多 2 个）已在途，故断言「不超并发数 + 全部属于首章」。
    const firstRow = view.query('[data-testid^="ai-full-status-"]') as HTMLElement
    const firstChapter = firstRow.getAttribute('data-testid')!.replace('ai-full-status-', '')
    expect(generate.mock.calls.length).toBeLessThanOrEqual(2)
    const tried = new Set(generate.mock.calls.map((call) => (call[0] as { chapter: string }).chapter))
    expect([...tried]).toEqual([firstChapter])
    expect(view.query(`[data-testid="ai-full-status-${firstChapter}"]`)!.className).toContain('failed')
  })
})

/**
 * 单元化生成（2026-11-10）：整章 6–33 字段一次性索要会把正文压薄、还常在最后一个字段被截断。
 * 改成「每章切单元、每单元一次调用、最多 2 路并发」后，锁住三条不变量：
 * 每次调用都带 onlyFields + skipJudge、taskId 唯一（否则并发取消会停错人）、章内确实被切成了多份。
 */
describe('AiFullGeneratePanel：按单元生成', () => {
  it('每次调用都带 onlyFields 与 skipJudge，taskId 唯一，且章内被切成多份', async () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试项目' })
    const generate = vi.fn(async (_req: unknown) => ({
      fields: { placeholder: '内容' },
      quality: verdict(0, 0),
      usage: { totalTokens: 10 }
    }))
    api = installMbApi({ overrides: { 'ceshu.aiGenerateChapter': generate } })
    view = await renderDom(
      <AiFullGeneratePanel ceshuId="c1" doc={doc} onApplied={() => {}} onClose={() => {}} />
    )
    await runGeneration(view)

    const requests = generate.mock.calls.map(
      (call) => call[0] as { chapter: string; onlyFields?: string[]; taskId?: string; skipJudge?: boolean }
    )
    expect(requests.length).toBeGreaterThan(0)
    for (const request of requests) {
      expect(Array.isArray(request.onlyFields)).toBe(true)
      expect(request.skipJudge).toBe(true)
      expect(request.taskId).toBeTruthy()
    }
    const taskIds = requests.map((request) => request.taskId!)
    expect(new Set(taskIds).size).toBe(taskIds.length)

    // 至少有一章被切成了多份（combat 33 字段 ⇒ 6 单元；不再是一章一次）
    const chapterCount = view.queryAll('[data-testid^="ai-full-status-"]').length
    expect(requests.length).toBeGreaterThan(chapterCount)
    // 成本块只报 token，不再出现「预算」
    expect(view.text()).toContain('不设预算上限')
  })
})

/** 生成阶段接入：默认立项、阶段可切换、应用档不显示（2026-11-07 改造） */
describe('AiFullGeneratePanel：生成阶段', () => {
  it('游戏档默认选中「立项」，进度列表是 concept 累计章而非 24 章', async () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试项目' })
    api = installMbApi()
    view = await renderDom(
      <AiFullGeneratePanel ceshuId="c1" doc={doc} onApplied={() => {}} onClose={() => {}} />
    )
    const concept = view.byTestId('ai-full-stage-concept') as HTMLInputElement
    expect(concept.checked).toBe(true)
    const rows = view.queryAll('[data-testid^="ai-full-status-"]')
    expect(rows.length).toBeLessThan(24)
    expect(rows.length).toBeGreaterThan(0)
  })

  it('切到「全量」后进度列表变长，且阶段单选可用', async () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试项目' })
    api = installMbApi()
    view = await renderDom(
      <AiFullGeneratePanel ceshuId="c1" doc={doc} onApplied={() => {}} onClose={() => {}} />
    )
    const before = view.queryAll('[data-testid^="ai-full-status-"]').length
    await view.click(view.byTestId('ai-full-stage-full'))
    const after = view.queryAll('[data-testid^="ai-full-status-"]').length
    expect(after).toBeGreaterThan(before)
  })

  it('应用档不显示阶段选择器（SDD 全章表一次生成）', async () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试项目', docKind: 'application' })
    api = installMbApi()
    view = await renderDom(
      <AiFullGeneratePanel ceshuId="c1" doc={doc} onApplied={() => {}} onClose={() => {}} />
    )
    expect(view.query('[data-testid="ai-full-stage"]')).toBeNull()
  })
})

/** 一页立项预览：生成后显示 draft 合成的一页 pitch，不写盘 */
describe('AiFullGeneratePanel：一页立项预览', () => {
  it('立项阶段生成完成后显示预览，内容含已生成章节的字段', async () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试项目' })
    const generate = vi.fn(async (req: unknown) => ({
      fields: { placeholder: `内容-${(req as { chapter: string }).chapter}`, design_vision: '星际考古的核心幻想' },
      quality: verdict(0, 0),
      usage: { totalTokens: 10 }
    }))
    api = installMbApi({ overrides: { 'ceshu.aiGenerateChapter': generate } })
    view = await renderDom(
      <AiFullGeneratePanel ceshuId="c1" doc={doc} onApplied={() => {}} onClose={() => {}} />
    )
    expect(view.query('[data-testid="ai-full-pitch-body"]')).toBeNull() // 生成前为空
    await runGeneration(view)
    const body = view.query('[data-testid="ai-full-pitch-body"]')
    expect(body, '生成后应显示预览').not.toBeNull()
    expect(body!.textContent).toContain('星际考古的核心幻想')
    expect(view.text()).toContain('尚未写盘')
  })

  it('切到「全量」阶段不显示立项预览', async () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试项目' })
    api = installMbApi()
    view = await renderDom(
      <AiFullGeneratePanel ceshuId="c1" doc={doc} onApplied={() => {}} onClose={() => {}} />
    )
    await view.click(view.byTestId('ai-full-stage-full'))
    expect(view.query('[data-testid="ai-full-pitch"]')).toBeNull()
  })
})
