// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import CeshuOverview from '../../../src/renderer/src/components/ceshuDoc/CeshuOverview'
import type { CeshuDocument } from '../../../src/shared/ceshu/reference/ceshuConstants'
import { computeChapterProgress, createDefaultCeshu } from '../../../src/shared/ceshu/model/ceshuModel'
import { installMbApi, renderDom, type RenderResult } from './render'

/**
 * 一页式总览（2026 对齐）：
 * 1. 立项阶段 7 章都出现；
 * 2. 必填项：有值显示值、空显示「（待填）」；
 * 3. 机读数据（economy.ledger 等）不进正文，只在章尾给「另有 N 项」；
 * 4. 无战斗品类不出现 combat 章（与阶段/品类逻辑一致）。
 */

let view: RenderResult | null = null
let api: ReturnType<typeof installMbApi> | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
  api?.restore()
  api = null
})

function makeDoc(): CeshuDocument {
  const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
  doc.meta.game_type = 'SLG'
  doc.meta.positioning = '一句话定位'
  doc.vision.design_vision = '一句话愿景'
  return doc
}

async function mount(doc: CeshuDocument): Promise<void> {
  api = installMbApi()
  view = await renderDom(
    <CeshuOverview doc={doc} stage="concept" progress={computeChapterProgress(doc)} />
  )
}

describe('CeshuOverview：一页式总览', () => {
  it('立项 7 章都渲染；填了的显示值，必填空的显示（待填）', async () => {
    await mount(makeDoc())
    expect(view!.byTestId('ceshu-overview')).toBeTruthy()
    for (const chapter of ['meta', 'vision', 'gameplay', 'combat', 'economy', 'numeric', 'mvp']) {
      expect(view!.byTestId(`overview-chapter-${chapter}`)).toBeTruthy()
    }
    // 已填
    expect(view!.byTestId('overview-field-meta-positioning').textContent).toContain('一句话定位')
    // 必填但空 → 待填
    const diff = view!.byTestId('overview-field-vision-differentiation')
    expect(diff.textContent).toContain('（待填）')
  })

  it('必填字段带 * 标记', async () => {
    await mount(makeDoc())
    const label = view!.byTestId('overview-field-meta-game_name').querySelector('.overview-field-label')
    expect(label?.textContent).toContain('*')
  })

  it('机读数据不进正文，只在章尾提示「另有 N 项」', async () => {
    await mount(makeDoc())
    // economy.ledger 是机读字段：不应作为普通字段行出现
    expect(view!.query('[data-testid="overview-field-economy-ledger"]')).toBeNull()
    const economy = view!.byTestId('overview-chapter-economy')
    expect(economy.textContent).toContain('另有')
    expect(economy.textContent).toContain('机读数据')
  })

  it('无战斗品类（模拟经营）不出现 combat 章', async () => {
    const doc = makeDoc()
    doc.meta.game_type = '模拟经营'
    await mount(doc)
    expect(view!.query('[data-testid="overview-chapter-combat"]')).toBeNull()
    expect(view!.byTestId('overview-chapter-economy')).toBeTruthy()
  })
})
