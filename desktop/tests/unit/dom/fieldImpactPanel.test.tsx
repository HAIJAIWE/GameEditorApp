// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import ChapterForm from '../../../src/renderer/src/components/ChapterForm'
import FieldImpactPanel from '../../../src/renderer/src/components/ceshu/FieldImpactPanel'
import { createDefaultCeshu } from '../../../src/shared/ceshu/ceshuModel'
import { installMbApi, renderDom, type RenderResult } from './render'

/**
 * 字段影响面 UI（「改这里会影响什么」）。
 *
 * 钉住两件事：
 * 1. ChapterForm 只发信号（chapter + field），不自己渲染面板——它拿不到整份文档；
 * 2. 面板把「必须改 / 复核 / 断言 / 同源字段 / 验收」按结构列出来，不是一段散文。
 */

let view: RenderResult | null = null
let api: ReturnType<typeof installMbApi> | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
  api?.restore()
  api = null
})

describe('字段影响面 UI', () => {
  it('字段头上的「影响面」按钮把 chapter/field 交给宿主', async () => {
    const calls: Array<{ chapter: string; field: string }> = []
    const doc = createDefaultCeshu({ scope: 'full', name: '测试' })
    api = installMbApi()
    view = await renderDom(
      <ChapterForm
        chapter="combat"
        data={doc.combat}
        busy={false}
        gameName=""
        onSave={async () => undefined}
        onAiGenerate={async () => ({ model: '', fields: {}, rawText: '' })}
        onAiGenerateField={async () => ({ model: '', fields: {}, rawText: '' })}
        onShowImpact={(chapter, field) => calls.push({ chapter, field })}
      />
    )

    const buttons = view.queryAll('[data-testid="field-impact"]')
    expect(buttons.length).toBeGreaterThan(0)
    await view.click(buttons[0]!)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.chapter).toBe('combat')
    expect(calls[0]?.field).not.toBe('')
  })

  it('不传 onShowImpact 时不渲染按钮（纯表单模式）', async () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试' })
    api = installMbApi()
    view = await renderDom(
      <ChapterForm
        chapter="combat"
        data={doc.combat}
        busy={false}
        gameName=""
        onSave={async () => undefined}
        onAiGenerate={async () => ({ model: '', fields: {}, rawText: '' })}
        onAiGenerateField={async () => ({ model: '', fields: {}, rawText: '' })}
      />
    )
    expect(view.queryAll('[data-testid="field-impact"]')).toHaveLength(0)
  })

  it('面板列出直接引用的文档、同源字段与验收条目', async () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试' })
    doc.meta.game_type = 'RPG'
    api = installMbApi()
    view = await renderDom(
      <FieldImpactPanel doc={doc} chapter="combat" field="damage_formula" onClose={() => undefined} />
    )

    const text = view.text()
    expect(text).toContain('改「伤害公式」会影响什么')
    expect(text).toContain('必须改（直接引用）')
    expect(text).toContain('03-战斗与伤害公式.md')
    expect(text).toContain('同源字段（通常要一起改）')
    expect(text).toContain('会重新判定的验收条目')
  })
})
