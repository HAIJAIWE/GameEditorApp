// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { CeshuHomePanel } from '../../../src/renderer/src/components/ceshuDoc'
import type { CeshuSummary } from '@mobai/shared/ceshu/reference'
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
    docKind: 'game',
    platform: [],
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

describe('CeshuHomePanel：卡片平台徽标', () => {
  it('多平台时用「 · 」连接并显示', async () => {
    const rendered = await renderPanel([summary({ id: 'a', platform: ['PC', '移动端'] })])
    expect(rendered.byTestId('home-card-platform').textContent).toBe('PC · 移动端')
  })

  it('未指定平台时不显示徽标', async () => {
    const rendered = await renderPanel([summary({ id: 'a', platform: [] })])
    expect(rendered.query('[data-testid="home-card-platform"]')).toBeNull()
  })
})

describe('CeshuHomePanel：「只看待审」筛选', () => {
  it('点开关后只剩有待审的卡，再点一次恢复全部', async () => {
    const rendered = await renderPanel([
      summary({ id: 'a', pendingCount: 2 }),
      summary({ id: 'b', pendingCount: 0 }),
      summary({ id: 'c', pendingCount: 1 })
    ])
    expect(rendered.queryAll('[data-testid="home-card"]')).toHaveLength(3)

    const toggle = rendered.byTestId('home-pending-filter')
    await rendered.click(toggle)
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    const kept = rendered.queryAll('[data-testid="home-card"]')
    expect(kept).toHaveLength(2)
    expect(kept.map((card) => card.getAttribute('data-ceshu-id'))).toEqual(['a', 'c'])

    await rendered.click(toggle)
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    expect(rendered.queryAll('[data-testid="home-card"]')).toHaveLength(3)
  })

  it('全部没有待审时显示专属空态，且不影响原有「暂无策划书」分支', async () => {
    const rendered = await renderPanel([
      summary({ id: 'a', pendingCount: 0 }),
      summary({ id: 'b', pendingCount: 0 })
    ])
    expect(rendered.query('[data-testid="home-pending-empty"]')).toBeNull()

    await rendered.click(rendered.byTestId('home-pending-filter'))
    expect(rendered.byTestId('home-pending-empty').textContent).toBe('没有待审的策划书')
    expect(rendered.queryAll('[data-testid="home-card"]')).toHaveLength(0)
    // 有卡片、只是全无待审：走专属空态，不误报成「未找到匹配」
    expect(rendered.query('[data-testid="home-empty"]')).toBeNull()
  })

  it('原本就没有任何策划书时仍走原有空态', async () => {
    const rendered = await renderPanel([])
    await rendered.click(rendered.byTestId('home-pending-filter'))
    expect(rendered.byTestId('home-empty').textContent).toContain('暂无策划书')
    expect(rendered.query('[data-testid="home-pending-empty"]')).toBeNull()
  })
})

describe('CeshuHomePanel：按文档档位筛选', () => {
  it('按「应用」只留应用档卡，再点一次恢复全部', async () => {
    const rendered = await renderPanel([
      summary({ id: 'a', docKind: 'game' }),
      summary({ id: 'b', docKind: 'application' }),
      summary({ id: 'c', docKind: 'game' })
    ])
    expect(rendered.queryAll('[data-testid="home-card"]')).toHaveLength(3)
    expect(rendered.byTestId('home-dockind-all').getAttribute('aria-pressed')).toBe('true')

    const appBtn = rendered.byTestId('home-dockind-app')
    await rendered.click(appBtn)
    expect(appBtn.getAttribute('aria-pressed')).toBe('true')
    const kept = rendered.queryAll('[data-testid="home-card"]')
    expect(kept).toHaveLength(1)
    expect(kept[0]?.getAttribute('data-ceshu-id')).toBe('b')

    await rendered.click(appBtn)
    expect(appBtn.getAttribute('aria-pressed')).toBe('false')
    expect(rendered.queryAll('[data-testid="home-card"]')).toHaveLength(3)
  })

  it('按「游戏」只留游戏档卡', async () => {
    const rendered = await renderPanel([
      summary({ id: 'a', docKind: 'game' }),
      summary({ id: 'b', docKind: 'application' }),
      summary({ id: 'c', docKind: 'game' })
    ])
    const gameBtn = rendered.byTestId('home-dockind-game')
    await rendered.click(gameBtn)
    expect(gameBtn.getAttribute('aria-pressed')).toBe('true')
    const kept = rendered.queryAll('[data-testid="home-card"]')
    expect(kept).toHaveLength(2)
    expect(kept.map((card) => card.getAttribute('data-ceshu-id'))).toEqual(['a', 'c'])
  })

  it('档位筛选与「只看待审」可叠加', async () => {
    const rendered = await renderPanel([
      summary({ id: 'a', docKind: 'game', pendingCount: 2 }),
      summary({ id: 'b', docKind: 'application', pendingCount: 1 }),
      summary({ id: 'c', docKind: 'game', pendingCount: 0 })
    ])
    await rendered.click(rendered.byTestId('home-dockind-game'))
    await rendered.click(rendered.byTestId('home-pending-filter'))
    const kept = rendered.queryAll('[data-testid="home-card"]')
    expect(kept).toHaveLength(1)
    expect(kept[0]?.getAttribute('data-ceshu-id')).toBe('a')
  })
})
