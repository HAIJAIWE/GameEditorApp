// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import ChapterForm from '../../../src/renderer/src/components/ChapterForm'
import { createDefaultCeshu } from '../../../src/shared/ceshuModel'
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
