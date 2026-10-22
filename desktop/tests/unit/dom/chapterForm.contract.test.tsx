// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import ChapterForm from '../../../src/renderer/src/components/ChapterForm'
import { createDefaultCeshu } from '../../../src/shared/ceshuModel'
import { installMbApi, renderDom, type RenderResult } from './render'

let view: RenderResult | null = null
let api: ReturnType<typeof installMbApi> | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
  api?.restore()
  api = null
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
