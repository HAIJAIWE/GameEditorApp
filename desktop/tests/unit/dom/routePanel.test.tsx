// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import RoutePanel from '../../../src/renderer/src/components/ceshu/RoutePanel'
import { createDefaultCeshu } from '../../../src/shared/ceshuModel'
import { installMbApi, renderDom, type RenderResult } from './render'

/**
 * 开发路线面板：把「几波、每波能并行做什么、门禁过没过」变成一眼能看的东西。
 * 数据来自交接包已有口径（planHandoffDocs / buildHandoffPlan / analyzeParallelism），
 * 面板不新增判断。
 */

let view: RenderResult | null = null
let api: ReturnType<typeof installMbApi> | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
  api?.restore()
  api = null
})

describe('开发路线面板', () => {
  it('列出波次、可并行卷与开工第一份', async () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试' })
    doc.meta.game_type = 'RPG'
    api = installMbApi()
    view = await renderDom(<RoutePanel doc={doc} onClose={() => undefined} />)

    const text = view.text()
    expect(text).toContain('开发路线')
    expect(text).toContain('第 1 波')
    expect(text).toContain('可并行')
    expect(text).toContain('开工第一份')
    // 架构卷永远是第一波
    expect(text).toContain('00-架构')
  })

  it('每份文档带门禁标记（✅ / ⏳ / —）', async () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试' })
    doc.meta.game_type = 'RPG'
    api = installMbApi()
    view = await renderDom(<RoutePanel doc={doc} onClose={() => undefined} />)

    const text = view.text()
    expect(/[✅⏳—]/.test(text)).toBe(true)
    expect(text).toContain('字段 ')
  })
})
