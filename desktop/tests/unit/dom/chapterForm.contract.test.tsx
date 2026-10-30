// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import ChapterForm, { nextPendingFieldKey } from '../../../src/renderer/src/components/ceshuField/ChapterForm'
import { CESHU_CHAPTER_FIELDS } from '../../../src/shared/ceshu/fields/ceshuFields'
import { createDefaultCeshu } from '../../../src/shared/ceshu/model/ceshuModel'
import {
  requestFieldAction,
  resetCeshuFieldFocusForTest,
  getCeshuFieldFocus
} from '../../../src/renderer/src/ceshuFieldFocus'
import { act } from 'react'
import { installMbApi, renderDom, type RenderResult } from './render'

let view: RenderResult | null = null
let api: ReturnType<typeof installMbApi> | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
  api?.restore()
  api = null
  resetCeshuFieldFocusForTest()
})

async function mount(): Promise<void> {
  api = installMbApi()
  const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
  view = await renderDom(
    <ChapterForm
      chapter="meta"
      data={doc.meta}
      busy={false}
      gameName=""
      onSave={async () => undefined}
      onAiGenerate={async () => ({ model: '', fields: {}, rawText: '' })}
      onAiGenerateField={async () => ({ model: '', fields: {}, rawText: '' })}
    />
  )
}

describe('ChapterForm：字段协作契约可见', () => {
  it('必填 / 人定 / 人审要点 出现在字段旁', async () => {
    await mount()
    const text = view!.text()
    expect(text).toContain('必填')
    expect(text).toContain('人定')
    // positioning 的 reviewHint
    expect(text).toContain('一句话能讲清')
    expect(view!.queryAll('[data-testid="field-contract"]').length).toBeGreaterThan(0)
  })

  it('人定字段的 AI 按钮被禁用（data-disabled=true）', async () => {
    await mount()
    expect(view!.queryAll('[data-disabled="true"]').length).toBeGreaterThan(0)
  })

  it('AI 草稿字段显示状态徽标与「接受」按钮，点击写入 approved', async () => {
    api = installMbApi()
    const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
    let accepted: Record<string, string> | null = null
    view = await renderDom(
      <ChapterForm
        chapter="meta"
        data={doc.meta}
        busy={false}
        gameName=""
        onSave={async () => undefined}
        onAiGenerate={async () => ({ model: '', fields: {}, rawText: '' })}
        onAiGenerateField={async () => ({ model: '', fields: {}, rawText: '' })}
        fieldStatus={{ positioning: { status: 'ai_draft', at: '2024-01-01' } }}
        onFieldStatus={async (_chapter, updates) => {
          accepted = updates
        }}
      />
    )
    expect(view!.text()).toContain('AI 草稿')
    expect(view!.queryAll('[data-testid="field-review-banner"]').length).toBe(1)
    await view!.click(view!.byTestId('field-accept'))
    expect(accepted).toEqual({ positioning: 'approved' })
  })
})

describe('ChapterForm：本章字段状态摘要', () => {
  it('标题行显示非零状态摘要（只计 schema 内字段）', async () => {
    api = installMbApi()
    const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
    view = await renderDom(
      <ChapterForm
        chapter="meta"
        data={doc.meta}
        busy={false}
        gameName=""
        onSave={async () => undefined}
        onAiGenerate={async () => ({ model: '', fields: {}, rawText: '' })}
        onAiGenerateField={async () => ({ model: '', fields: {}, rawText: '' })}
        fieldStatus={{
          positioning: { status: 'ai_draft', at: '2024-01-01' },
          tags: { status: 'approved', at: '2024-01-01' }
        }}
      />
    )
    // meta 章其余字段（game_name / game_type）无状态，不参与计数
    expect(view!.byTestId('field-status-summary').textContent).toBe('1 待审 · 1 已批准')
  })

  it('不传 fieldStatus 时不渲染摘要', async () => {
    await mount()
    expect(view!.queryAll('[data-testid="field-status-summary"]').length).toBe(0)
  })

  it('有 AI 草稿时摘要可点击：定位到首个待审字段并高亮', async () => {
    api = installMbApi()
    const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
    view = await renderDom(
      <ChapterForm
        chapter="meta"
        data={doc.meta}
        busy={false}
        gameName=""
        onSave={async () => undefined}
        onAiGenerate={async () => ({ model: '', fields: {}, rawText: '' })}
        onAiGenerateField={async () => ({ model: '', fields: {}, rawText: '' })}
        fieldStatus={{ positioning: { status: 'ai_draft', at: '2024-01-01' } }}
      />
    )
    const summary = view!.byTestId('field-status-summary')
    // 有入口时是可点的按钮，文本仍是摘要本身（既有断言依赖 textContent）
    expect(summary.tagName).toBe('BUTTON')
    expect(summary.textContent).toBe('1 待审')

    await view!.click(summary)

    const flashed = view!.queryAll('[data-flash="true"]')
    expect(flashed.length).toBe(1)
    expect(flashed[0].querySelector('[data-testid="ceshu-field-positioning"]')).not.toBeNull()
  })

  it('只有已批准状态时摘要仍是无跳转的纯文本', async () => {
    api = installMbApi()
    const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
    view = await renderDom(
      <ChapterForm
        chapter="meta"
        data={doc.meta}
        busy={false}
        gameName=""
        onSave={async () => undefined}
        onAiGenerate={async () => ({ model: '', fields: {}, rawText: '' })}
        onAiGenerateField={async () => ({ model: '', fields: {}, rawText: '' })}
        fieldStatus={{ tags: { status: 'approved', at: '2024-01-01' } }}
      />
    )
    const summary = view!.byTestId('field-status-summary')
    expect(summary.tagName).not.toBe('BUTTON')
    expect(summary.textContent).toBe('1 已批准')
  })
})

describe('ChapterForm：接受后自动跳到下一个待审字段', () => {
  const metaFields = CESHU_CHAPTER_FIELDS.meta

  it('nextPendingFieldKey：向后优先、无则向前回绕、单个或无待审返回 null', () => {
    // 向后找到：positioning 之后还有 tags 待审
    expect(
      nextPendingFieldKey(
        metaFields,
        {
          positioning: { status: 'ai_draft', at: '2024-01-01' },
          tags: { status: 'ai_draft', at: '2024-01-01' }
        },
        'positioning'
      )
    ).toBe('tags')
    // 向后没有 → 回绕到前面
    expect(
      nextPendingFieldKey(metaFields, { positioning: { status: 'ai_draft', at: '2024-01-01' } }, 'tags')
    ).toBe('positioning')
    // 只有一个待审且就是当前字段 → null（不能原地打转）
    expect(
      nextPendingFieldKey(metaFields, { positioning: { status: 'ai_draft', at: '2024-01-01' } }, 'positioning')
    ).toBeNull()
    // 无任何待审 → null
    expect(nextPendingFieldKey(metaFields, undefined, 'positioning')).toBeNull()
    expect(nextPendingFieldKey(metaFields, {}, 'positioning')).toBeNull()
  })

  it('点「接受」后高亮下一个待审字段（不是刚接受的那个）', async () => {
    api = installMbApi()
    const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
    view = await renderDom(
      <ChapterForm
        chapter="meta"
        data={doc.meta}
        busy={false}
        gameName=""
        onSave={async () => undefined}
        onAiGenerate={async () => ({ model: '', fields: {}, rawText: '' })}
        onAiGenerateField={async () => ({ model: '', fields: {}, rawText: '' })}
        fieldStatus={{
          positioning: { status: 'ai_draft', at: '2024-01-01' },
          tags: { status: 'ai_draft', at: '2024-01-01' }
        }}
        onFieldStatus={async () => undefined}
      />
    )
    // 页面上有两个「接受」，第一个属于 positioning
    const accepts = view!.queryAll('[data-testid="field-accept"]')
    expect(accepts.length).toBe(2)
    await view!.click(accepts[0])

    const flashed = view!.queryAll('[data-flash="true"]')
    expect(flashed.length).toBe(1)
    expect(flashed[0].querySelector('[data-testid="ceshu-field-tags"]')).not.toBeNull()
    expect(flashed[0].querySelector('[data-testid="ceshu-field-positioning"]')).toBeNull()
  })

  it('只有一个待审字段时点「接受」不高亮任何字段', async () => {
    api = installMbApi()
    const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
    view = await renderDom(
      <ChapterForm
        chapter="meta"
        data={doc.meta}
        busy={false}
        gameName=""
        onSave={async () => undefined}
        onAiGenerate={async () => ({ model: '', fields: {}, rawText: '' })}
        onAiGenerateField={async () => ({ model: '', fields: {}, rawText: '' })}
        fieldStatus={{ positioning: { status: 'ai_draft', at: '2024-01-01' } }}
        onFieldStatus={async () => undefined}
      />
    )
    await view!.click(view!.byTestId('field-accept'))
    expect(view!.queryAll('[data-flash="true"]').length).toBe(0)
  })
})

describe('ChapterForm：字段级局部重生成（停靠栏桥）', () => {
  it('字段聚焦 → 上报当前字段到桥（停靠栏动作条的数据源）', async () => {
    api = installMbApi()
    const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
    view = await renderDom(
      <ChapterForm
        chapter="meta"
        data={doc.meta}
        busy={false}
        gameName=""
        onSave={async () => undefined}
        onAiGenerate={async () => ({ model: '', fields: {}, rawText: '' })}
        onAiGenerateField={async () => ({ model: '', fields: {}, rawText: '' })}
      />
    )
    const textarea = view!.byTestId('ceshu-field-positioning')
    await act(async () => {
      textarea.focus()
    })
    await view!.flush()

    expect(getCeshuFieldFocus().active).toMatchObject({
      chapter: 'meta',
      key: 'positioning',
      label: '一句话定位'
    })
  })

  it('停靠栏请求 → 带 action 调单字段生成、回填内容并标记 AI 草稿', async () => {
    api = installMbApi()
    const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
    const seen: Array<{ chapter: string; field: string; action?: string }> = []
    const statusWrites: Array<Record<string, string>> = []
    view = await renderDom(
      <ChapterForm
        chapter="meta"
        data={doc.meta}
        busy={false}
        gameName=""
        onSave={async () => undefined}
        onAiGenerate={async () => ({ model: '', fields: {}, rawText: '' })}
        onAiGenerateField={async (chapter, field, action) => {
          seen.push({ chapter, field, action })
          return { model: '本地模型', fields: { [field]: 'AI 改写后的定位' }, rawText: '' }
        }}
        onFieldStatus={async (_chapter, updates) => {
          statusWrites.push(updates as Record<string, string>)
        }}
      />
    )
    const textarea = view!.byTestId('ceshu-field-positioning') as HTMLTextAreaElement
    await act(async () => {
      textarea.focus()
    })
    await view!.flush()

    // 模拟停靠栏点击「改写」
    await act(async () => {
      requestFieldAction('rewrite')
    })
    await view!.flush()

    expect(seen).toEqual([{ chapter: 'meta', field: 'positioning', action: 'rewrite' }])
    expect(textarea.value).toBe('AI 改写后的定位')
    expect(statusWrites).toEqual([{ positioning: 'ai_draft' }])
    expect(view!.text()).toContain('AI 已改写')
    // 请求被执行后清空（不会残留重复触发）
    expect(getCeshuFieldFocus().request).toBeNull()
  })

  it('字段旁 AI 按钮：不带 action（重新起草语义）', async () => {
    api = installMbApi()
    const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
    const seen: Array<{ chapter: string; field: string; action?: string }> = []
    view = await renderDom(
      <ChapterForm
        chapter="meta"
        data={doc.meta}
        busy={false}
        gameName=""
        onSave={async () => undefined}
        onAiGenerate={async () => ({ model: '', fields: {}, rawText: '' })}
        onAiGenerateField={async (chapter, field, action) => {
          seen.push({ chapter, field, action })
          return { model: '', fields: { [field]: '起草内容' }, rawText: '' }
        }}
      />
    )
    // 取第一个未禁用（非「人定」）的字段 AI 按钮
    const enabled = view!
      .queryAll('[data-testid="ai-field-btn"]')
      .filter((button) => button.getAttribute('data-disabled') !== 'true')
    await view!.click(enabled[0])
    expect(seen).toEqual([{ chapter: 'meta', field: 'positioning', action: undefined }])
  })
})
