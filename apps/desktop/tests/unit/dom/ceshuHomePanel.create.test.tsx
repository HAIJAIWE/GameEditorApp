// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { CeshuHomePanel } from '../../../src/renderer/src/components/ceshuDoc'
import { installMbApi, renderDom, type RenderResult } from './render'

/**
 * 首页「新建空白」入口：点开后先选「游戏 / 应用」两种模式（AI 不单列），
 * 选中后按对应 docKind 建文档并打开。
 */

let view: RenderResult | null = null
let api: ReturnType<typeof installMbApi> | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
  api?.restore()
  api = null
})

async function mount(onOpen: (id: string) => void): Promise<void> {
  view = await renderDom(
    <CeshuHomePanel
      summaries={[]}
      activeId={null}
      onOpen={onOpen}
      onChanged={() => undefined}
      onDeleted={() => undefined}
    />
  )
}

describe('CeshuHomePanel：新建时选档位', () => {
  it('点「空白策划书」先出「游戏 / 应用」选择，选应用即按 application 建并打开', async () => {
    const opened: string[] = []
    let captured: unknown = null
    api = installMbApi({
      overrides: {
        'ceshu.create': (req: unknown) => {
          captured = req
          return { ceshu_id: 'app-id' }
        }
      }
    })
    await mount((id) => opened.push(id))

    await view!.click(view!.byTestId('home-new-blank'))
    expect(view!.query('[data-testid="home-blank-picker"]')).not.toBeNull()

    await view!.click(view!.byTestId('home-blank-app'))
    expect(api!.calls).toContain('ceshu.create')
    expect(captured).toMatchObject({ docKind: 'application' })
    expect(opened).toEqual(['app-id'])
  })

  it('选「游戏」按 game 建；点取消收起选择', async () => {
    const opened: string[] = []
    let captured: unknown = null
    api = installMbApi({
      overrides: {
        'ceshu.create': (req: unknown) => {
          captured = req
          return { ceshu_id: 'game-id' }
        }
      }
    })
    await mount((id) => opened.push(id))

    await view!.click(view!.byTestId('home-new-blank'))
    await view!.click(view!.byTestId('home-blank-game'))
    expect(captured).toMatchObject({ docKind: 'game' })
    expect(opened).toEqual(['game-id'])
  })

  it('取消收起选择，不建文档', async () => {
    api = installMbApi()
    await mount(() => undefined)
    await view!.click(view!.byTestId('home-new-blank'))
    expect(view!.query('[data-testid="home-blank-picker"]')).not.toBeNull()
    await view!.click(view!.byTestId('home-blank-cancel'))
    expect(view!.query('[data-testid="home-blank-picker"]')).toBeNull()
    expect(api!.calls).not.toContain('ceshu.create')
  })
})
