// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import CeshuHomePanel from '../../../src/renderer/src/components/CeshuHomePanel'
import type { CeshuSummary } from '../../../src/shared/ceshuConstants'
import { renderDom, type RenderResult } from './render'

/**
 * 首页卡片「待审 N」徽标的渲染断言。
 *
 * 放在 `tests/unit/dom/`（而不是 `ceshuHome.test.ts`）是因为后者由
 * `tsconfig.node.json` 检查——那份配置刻意不引入 DOM lib，渲染组件的
 * `window.mbApi` 会在类型层面报错。DOM 测试统一归本目录的配置检查。
 */

let view: RenderResult | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
})

function summary(overrides: Partial<CeshuSummary> = {}): CeshuSummary {
  return {
    id: 'id-1',
    gameName: '仙侠 RPG',
    scope: 'full',
    versionLabel: 'v1.0',
    updatedAt: '2026-10-04 12:30:45',
    progress: 0.25,
    pendingCount: 0,
    parentId: '',
    isActive: true,
    createdAt: '2026-10-01 09:00:00',
    versionNote: '',
    gameType: 'rpg',
    status: 'draft',
    ...overrides
  }
}

async function renderPanel(summaries: CeshuSummary[]): Promise<RenderResult> {
  view = await renderDom(
    <CeshuHomePanel
      summaries={summaries}
      activeId={null}
      onOpen={() => undefined}
      onChanged={() => undefined}
      onDeleted={() => undefined}
    />
  )
  return view
}

describe('CeshuHomePanel：卡片待审徽标', () => {
  it('有待审时显示「待审 N」', async () => {
    const rendered = await renderPanel([summary({ id: 'a', pendingCount: 3 })])
    expect(rendered.byTestId('home-card-pending').textContent).toBe('待审 3')
  })

  it('待审为 0 时不显示徽标', async () => {
    const rendered = await renderPanel([summary({ id: 'a', pendingCount: 0 })])
    expect(rendered.query('[data-testid="home-card-pending"]')).toBeNull()
  })

  it('多张卡片各自显示自己的待审数', async () => {
    const rendered = await renderPanel([
      summary({ id: 'a', pendingCount: 2 }),
      summary({ id: 'b', pendingCount: 0 })
    ])
    const badges = rendered.queryAll('[data-testid="home-card-pending"]')
    expect(badges).toHaveLength(1)
    expect(badges[0]?.textContent).toBe('待审 2')
  })
})
