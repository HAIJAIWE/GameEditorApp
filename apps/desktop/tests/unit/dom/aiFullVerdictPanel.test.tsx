// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AiFullGeneratePanel } from '../../../src/renderer/src/components/agent'
import { chapterDataForDoc, chapterFieldsForDoc, createDefaultCeshu, visibleChaptersForDoc } from '@mobai/shared/ceshu/model'
import { renderGenerationDigest } from '@mobai/shared/ceshu/export/generationDigest'
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
  // 草稿快照按 ceshuId 落在 localStorage，所有用例都用 "c1"：
  // 不清会串到下一轮，凭空冒出「恢复上次未应用结果」横幅。
  window.localStorage.clear()
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

/** 给受控 textarea 设值：render helper 的 change() 只认 HTMLInputElement */
async function setTextarea(rendered: RenderResult, testId: string, value: string): Promise<void> {
  const el = rendered.query(`[data-testid="${testId}"]`) as HTMLTextAreaElement | null
  expect(el, testId).not.toBeNull()
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  await act(async () => {
    setter?.call(el!, value)
    el!.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await rendered.flush()
}

/**
 * 一页结果速览（2026-11-11）：旧版叫「一页立项预览」，但制作档实测 34261 字符 /
 * 中文 19864 字 / 7 个 ### 小节，早就不是一页；而且只在 concept 档渲染，制作/全量档
 * 根本看不到。现在换成 renderGenerationDigest（每章最多 2 个已填字段、1400 字预算），
 * 并去掉阶段门禁：所有阶段 / 档位都能在应用前先看一眼这次写了什么。
 */
describe('AiFullGeneratePanel：一页结果速览', () => {
  it('立项阶段生成完成后显示速览，内容含已生成章节的字段', async () => {
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
    expect(body, '生成后应显示速览').not.toBeNull()
    expect(body!.textContent).toContain('星际考古的核心幻想')
    expect(view.text()).toContain('尚未写盘')
  })

  it('切到「全量」阶段仍显示速览（旧实现只对立项档可见）', async () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试项目' })
    api = installMbApi()
    view = await renderDom(
      <AiFullGeneratePanel ceshuId="c1" doc={doc} onApplied={() => {}} onClose={() => {}} />
    )
    await view.click(view.byTestId('ai-full-stage-full'))
    expect(view.query('[data-testid="ai-full-pitch"]')).not.toBeNull()
    expect(view.query('[data-testid="ai-full-pitch-empty"]')).not.toBeNull()
  })

  it('应用档（SDD）也显示速览，四步流程条齐全', async () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试项目', docKind: 'application' })
    api = installMbApi()
    view = await renderDom(
      <AiFullGeneratePanel ceshuId="c1" doc={doc} onApplied={() => {}} onClose={() => {}} />
    )
    expect(view.query('[data-testid="ai-full-pitch"]')).not.toBeNull()
    expect(view.queryAll('[data-testid^="ai-full-step-"]').length).toBe(4)
  })
})

/**
 * 两阶段门禁（2026-11-11，用户原话「设计文档先确定好……看完之后等人确定再去生成」）：
 * 第 2 步先把表单确定性推导出的设计概要给人看，人确认后才真正调 LLM；
 * 概要里补的方向修订随每章提示词的【用户输入】下发，而不是只停留在 UI。
 */
describe('AiFullGeneratePanel：先确认设计概要再生成', () => {
  it('首次点开始只出概要卡片，未确认前不调用 LLM；确认后方向修订进入每章提示词', async () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试项目' })
    const generate = vi.fn(async (req: unknown) => ({
      fields: { placeholder: `内容-${(req as { chapter: string }).chapter}` },
      quality: verdict(0, 0),
      usage: { totalTokens: 10 }
    }))
    api = installMbApi({ overrides: { 'ceshu.aiGenerateChapter': generate } })
    view = await renderDom(
      <AiFullGeneratePanel ceshuId="c1" doc={doc} onApplied={() => {}} onClose={() => {}} />
    )
    expect(view.queryAll('[data-testid^="ai-full-step-"]').length).toBe(4)
    expect(view.byTestId('ai-full-step-form').className).toContain('is-current')

    await setTextarea(view, 'ai-full-desc', '一个关于星际考古的游戏，玩家探索遗迹并拼合线索。')
    await view.click(view.byTestId('ai-full-start'))

    // 第 2 步：概要卡片是唯一出口，start 收起，LLM 一次都没调
    expect(view.byTestId('ai-full-confirm')).not.toBeNull()
    expect(view.byTestId('ai-full-brief').textContent).toContain('星际考古')
    expect(view.byTestId('ai-full-brief-chips').textContent).toBeTruthy()
    expect(view.query('[data-testid="ai-full-start"]')).toBeNull()
    expect(view.byTestId('ai-full-step-brief').className).toContain('is-current')
    expect(generate).not.toHaveBeenCalled()

    await setTextarea(view, 'ai-full-brief-note', '必须包含考古解密与非线性叙事')
    await view.click(view.byTestId('ai-full-confirm-yes'))
    for (let i = 0; i < 30; i++) await view.flush()

    expect(generate.mock.calls.length).toBeGreaterThan(0)
    const prompts = generate.mock.calls.map(
      (call) => (call[0] as { fullGenerate: { extraPrompt: string } }).fullGenerate.extraPrompt
    )
    expect(prompts.some((prompt) => prompt.includes('方向修订（用户补充）'))).toBe(true)
    expect(prompts.some((prompt) => prompt.includes('必须包含考古解密与非线性叙事'))).toBe(true)
  })

  it('概要卡片出现时滚进视口，标题不被长面板上沿裁掉', async () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试项目' })
    api = installMbApi({
      overrides: {
        'ceshu.aiGenerateChapter': async () => ({
          fields: { placeholder: '内容' },
          quality: verdict(0, 0),
          usage: { totalTokens: 10 }
        })
      }
    })
    // jsdom 不实现 scrollIntoView，临时装一个探针；组件用 typeof 守卫，真浏览器里才会滚。
    const scroll = vi.fn()
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: scroll
    })
    try {
      view = await renderDom(
        <AiFullGeneratePanel ceshuId="c1" doc={doc} onApplied={() => {}} onClose={() => {}} />
      )
      expect(scroll, '第 1 步不该滚动').not.toHaveBeenCalled()
      await setTextarea(view, 'ai-full-desc', '一个关于星际考古的游戏。')
      await view.click(view.byTestId('ai-full-start'))
      expect(scroll, '进入第 2 步时把概要卡片滚进视口').toHaveBeenCalledTimes(1)
      expect(scroll.mock.calls[0]?.[0]).toMatchObject({ block: 'start', behavior: 'auto' })
    } finally {
      if (descriptor === undefined) Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
      else Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', descriptor)
    }
  })

  it('点「返回修改」不生成，回到第 1 步且 start 按钮重新出现', async () => {
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
    await setTextarea(view, 'ai-full-desc', '一个关于星际考古的游戏。')
    await view.click(view.byTestId('ai-full-start'))
    await view.click(view.byTestId('ai-full-confirm-no'))
    expect(view.query('[data-testid="ai-full-start"]')).not.toBeNull()
    expect(view.byTestId('ai-full-step-form').className).toContain('is-current')
    expect(generate).not.toHaveBeenCalled()
  })
})

/** 未应用结果自动留存：localStorage 快照 + 恢复 / 丢弃，窗口关掉不白跑 */
describe('AiFullGeneratePanel：未应用结果不白跑', () => {
  it('生成后写入快照，重开面板显示恢复横幅，点恢复回填结果', async () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试项目' })
    const generate = vi.fn(async (_req: unknown) => ({
      fields: { design_vision: '星际考古的核心幻想' },
      quality: verdict(0, 0),
      usage: { totalTokens: 10 }
    }))
    api = installMbApi({ overrides: { 'ceshu.aiGenerateChapter': generate } })
    const first = await renderDom(
      <AiFullGeneratePanel ceshuId="c1" doc={doc} onApplied={() => {}} onClose={() => {}} />
    )
    await runGeneration(first)
    const raw = window.localStorage.getItem('mb.aiFull.draft.c1')
    expect(raw, '生成结果应自动留存').not.toBeNull()
    const draft = JSON.parse(raw!) as { results: Record<string, unknown> }
    expect(Object.keys(draft.results).length).toBeGreaterThan(0)
    await first.cleanup()

    view = await renderDom(
      <AiFullGeneratePanel ceshuId="c1" doc={doc} onApplied={() => {}} onClose={() => {}} />
    )
    expect(view.query('[data-testid="ai-full-draft"]')).not.toBeNull()
    await view.click(view.byTestId('ai-full-draft-restore'))
    expect(view.query('[data-testid="ai-full-draft"]')).toBeNull()
    expect(view.byTestId('ai-full-draft-notice').textContent).toBeTruthy()
    expect(view.query('[data-testid="ai-full-pitch-body"]')).not.toBeNull()
  })

  it('丢弃草稿会清掉快照，重开面板不再提示恢复', async () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试项目' })
    window.localStorage.setItem('mb.aiFull.draft.c1', JSON.stringify({
      version: 1,
      ceshuId: 'c1',
      savedAt: Date.now(),
      stage: 'concept',
      scope: 'full',
      briefConfirmed: true,
      results: { vision: { design_vision: '星际考古的核心幻想' } },
      statuses: { vision: 'done' },
      errors: {},
      usageTotal: 120,
      summary: null
    }))
    api = installMbApi()
    view = await renderDom(
      <AiFullGeneratePanel ceshuId="c1" doc={doc} onApplied={() => {}} onClose={() => {}} />
    )
    expect(view.byTestId('ai-full-draft')).not.toBeNull()
    await view.click(view.byTestId('ai-full-draft-discard'))
    expect(window.localStorage.getItem('mb.aiFull.draft.c1')).toBeNull()
    expect(view.query('[data-testid="ai-full-draft"]')).toBeNull()
    await view.cleanup()
    view = await renderDom(
      <AiFullGeneratePanel ceshuId="c1" doc={doc} onApplied={() => {}} onClose={() => {}} />
    )
    expect(view.query('[data-testid="ai-full-draft"]')).toBeNull()
  })

  it('恢复制作档草稿时还原阶段，8 章结果全部写回而不只写立项档子集', async () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试项目' })
    const chapters = ['meta', 'vision', 'story', 'gameplay', 'combat', 'systems', 'economy', 'numeric']
    const results: Record<string, Record<string, unknown>> = {}
    const statuses: Record<string, string> = {}
    for (const chapter of chapters) {
      results[chapter] = { design_vision: '恢复后应写盘的内容' }
      statuses[chapter] = 'done'
    }
    // 模拟「制作档 15 章跑到第 9 章时窗口被关掉」：阶段/档位写在快照里，
    // 但新窗口的表单默认回到立项档 7 章。
    window.localStorage.setItem('mb.aiFull.draft.c1', JSON.stringify({
      version: 1,
      ceshuId: 'c1',
      savedAt: Date.now(),
      stage: 'production',
      scope: 'full',
      briefConfirmed: true,
      results,
      statuses,
      errors: {},
      usageTotal: 8000,
      summary: null
    }))
    const saveChapter = vi.fn(async (_req: unknown) => doc)
    api = installMbApi({ overrides: { 'ceshu.saveChapter': saveChapter } })
    view = await renderDom(
      <AiFullGeneratePanel ceshuId="c1" doc={doc} onApplied={() => {}} onClose={() => {}} />
    )
    expect((view.byTestId('ai-full-apply') as HTMLButtonElement).disabled, '恢复前不该能应用').toBe(true)
    await view.click(view.byTestId('ai-full-draft-restore'))
    const apply = view.byTestId('ai-full-apply') as HTMLButtonElement
    expect(apply.disabled, '恢复后应可应用').toBe(false)
    await view.click(apply)
    const written = saveChapter.mock.calls.map((call) => (call[0] as { chapter: string }).chapter)
    expect(written).toEqual(chapters)
    expect(view.byTestId('ai-full-summary').textContent).toContain('8 章')
    expect(window.localStorage.getItem('mb.aiFull.draft.c1')).toBeNull()
  })
})

/** 速览体积上限：把「一页」真的锁在一页，避免旧版 34261 字符的假一页回归 */
describe('renderGenerationDigest：一页速览的体积上限', () => {
  it('所有章都塞满长文本时仍压在预算内，且不出现空字段占位', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试项目' })
    const long = '御剑探索三界与境界突破的核心循环，'.repeat(40)
    const chapters = visibleChaptersForDoc(doc)
    for (const chapter of chapters) {
      const data = chapterDataForDoc(doc, chapter)
      for (const field of chapterFieldsForDoc(doc, chapter)) data[field.key] = long
    }
    const digest = renderGenerationDigest(doc, { chapters })
    expect(digest).not.toContain('（待填）')
    expect(digest.length).toBeLessThan(2000)
    expect((digest.match(/^### /gm) ?? []).length).toBeLessThanOrEqual(chapters.length)
  })

  it('指定章全空时返回空串（不渲染空壳）', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试项目' })
    const data = chapterDataForDoc(doc, 'vision')
    for (const field of chapterFieldsForDoc(doc, 'vision')) data[field.key] = ''
    expect(renderGenerationDigest(doc, { chapters: ['vision'] })).toBe('')
  })
})
