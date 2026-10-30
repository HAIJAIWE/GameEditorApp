// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import HealthPanel from '../../../src/renderer/src/components/ceshu/HealthPanel'
import { createDefaultCeshu } from '../../../src/shared/ceshu/ceshuModel'
import { installMbApi, renderDom, type RenderResult } from './render'

/**
 * 开发交接体检面板：把「完整 + 路线清晰」凝成一张开发者一眼能看的视图。
 * 数据来自交接包已有口径（computeReadiness / buildHandoffPlan / analyzeParallelism / findCouplingGaps），
 * 面板不新增判断；导出侧有同源的 renderHandoffHealthMarkdown。
 */

let view: RenderResult | null = null
let api: ReturnType<typeof installMbApi> | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
  api?.restore()
  api = null
})

function makeDoc(): ReturnType<typeof createDefaultCeshu> {
  const doc = createDefaultCeshu({ scope: 'full', name: '测试' })
  doc.meta.game_type = 'RPG'
  return doc
}

describe('开发交接体检面板', () => {
  it('四张核心指标都在', async () => {
    const doc = makeDoc()
    api = installMbApi()
    view = await renderDom(<HealthPanel doc={doc} onClose={() => undefined} />)

    const text = view.text()
    expect(text).toContain('开发交接体检')
    expect(text).toContain('设计完成度')
    expect(text).toContain('交接门禁')
    expect(text).toContain('并行机会')
    expect(text).toContain('可开发性缺口')
    expect(text).toContain('下一步')
  })

  it('有可开发性缺口时列出具体字段与原因', async () => {
    const doc = makeDoc()
    doc.combat.damage_formula = '(攻击 - 防御) × 倍率'
    api = installMbApi()
    view = await renderDom(<HealthPanel doc={doc} onClose={() => undefined} />)

    const text = view.text()
    expect(text).toContain('命中判定')
    expect(text).toContain('「打没打中」只能由程序自己拍')
  })

  it('门禁统计与可开工/待补口径一致', async () => {
    const doc = makeDoc()
    api = installMbApi()
    view = await renderDom(<HealthPanel doc={doc} onClose={() => undefined} />)

    const text = view.text()
    expect(text).toContain('可开工')
    expect(text).toContain('待补')
    expect(text).toContain('不适用')
  })
})
