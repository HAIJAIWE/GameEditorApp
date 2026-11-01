// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { ChapterForm } from '../../../src/renderer/src/components/ceshuField'
import type { ChapterKey } from '@mobai/shared/ceshu/reference'
import { createDefaultCeshu } from '@mobai/shared/ceshu/model'
import { CESHU_MACHINE_DATA_FIELDS } from '@mobai/shared/ceshu/workflow'
import { installMbApi, renderDom, type RenderResult } from './render'

/**
 * 「验收 / 机读数据」分组（2026-10-26 反向验证后）：
 * 对账账本、数值断言、证据核对、用例清单这类字段是给机器判的，
 * 混在正文里会让人以为立项就得写一份经济账本。这里钉住三件事：
 * 1. 分组头出现且说明「不计入完成度」；
 * 2. 分组头之后**只剩**机读字段（正文不会漏在后面）；
 * 3. 没有机读字段的章（如 meta）不出现空分组。
 */

let view: RenderResult | null = null
let api: ReturnType<typeof installMbApi> | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
  api?.restore()
  api = null
})

async function mount(chapter: ChapterKey): Promise<void> {
  api = installMbApi()
  const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
  view = await renderDom(
    <ChapterForm
      chapter={chapter}
      data={doc[chapter]}
      busy={false}
      gameName=""
      onSave={async () => undefined}
      onAiGenerate={async () => ({ model: '', fields: {}, rawText: '' })}
      onAiGenerateField={async () => ({ model: '', fields: {}, rawText: '' })}
    />
  )
}

/** 分组头之后紧跟的字段块（按 DOM 顺序） */
function fieldBlocksAfter(header: HTMLElement): HTMLElement[] {
  const blocks: HTMLElement[] = []
  let node = header.nextElementSibling
  while (node !== null) {
    if (node instanceof HTMLElement && node.classList.contains('field-block')) blocks.push(node)
    node = node.nextElementSibling
  }
  return blocks
}

describe('ChapterForm：验收 / 机读数据分组', () => {
  it('economy 章：账本排在正文之后，并标注不计入完成度', async () => {
    await mount('economy')
    const header = view!.byTestId('machine-data-group')
    expect(header.textContent).toContain('验收 / 机读数据')
    expect(header.textContent).toContain('不计入完成度')

    // 正文（货币类型）必须排在分组头之前
    const bodyText = view!.container.textContent ?? ''
    expect(bodyText.indexOf('货币类型')).toBeGreaterThanOrEqual(0)
    expect(bodyText.indexOf('货币类型')).toBeLessThan(bodyText.indexOf('验收 / 机读数据'))

    // 分组头之后只剩机读字段：economy 只有 ledger 一个
    const expected = CESHU_MACHINE_DATA_FIELDS.filter((item) => item.chapter === 'economy').length
    const after = fieldBlocksAfter(header)
    expect(after).toHaveLength(expected)
    expect(after[0].textContent).toContain('经济账本')
  })

  it('qa 章：三个机读字段（原型验收 / 用例清单 / 验收旅程）都在分组里', async () => {
    await mount('qa')
    const header = view!.byTestId('machine-data-group')
    const after = fieldBlocksAfter(header)
    const expected = CESHU_MACHINE_DATA_FIELDS.filter((item) => item.chapter === 'qa').length
    expect(after).toHaveLength(expected)
    const machineText = after.map((block) => block.textContent ?? '').join(' ')
    expect(machineText).toContain('原型验收记录')
    expect(machineText).toContain('用例清单')
    expect(machineText).toContain('验收旅程')
  })

  it('meta 章没有机读字段：不渲染空分组', async () => {
    await mount('meta')
    expect(view!.query('[data-testid="machine-data-group"]')).toBeNull()
    expect(view!.text()).not.toContain('验收 / 机读数据')
  })
})
