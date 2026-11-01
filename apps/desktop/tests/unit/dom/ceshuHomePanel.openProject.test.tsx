// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { CeshuHomePanel } from '../../../src/renderer/src/components/ceshuDoc'
import { installMbApi, renderDom, type RenderResult } from './render'

/**
 * 首页「打开项目文件夹…」：选目录 → `ceshu.openProjectFolder` → 打开返回的文档。
 * 三条路径都要覆盖：正常打开 / 用户取消 / 不是项目文件夹（错误要看得见）。
 */

let view: RenderResult | null = null
let api: ReturnType<typeof installMbApi> | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
  api?.restore()
  api = null
})

async function mount(onOpen: (id: string) => void, onChanged: () => void = () => undefined): Promise<void> {
  view = await renderDom(
    <CeshuHomePanel
      summaries={[]}
      activeId={null}
      onOpen={onOpen}
      onChanged={onChanged}
      onDeleted={() => undefined}
    />
  )
}

describe('CeshuHomePanel：打开项目文件夹', () => {
  it('选中目录 → 调 openProjectFolder、刷新列表并打开文档', async () => {
    const opened: string[] = []
    let changed = 0
    api = installMbApi({
      overrides: {
        'dialog.chooseProjectDir': () => ({ path: '/tmp/星海计划' }),
        'ceshu.openProjectFolder': () => ({ doc: { ceshu_id: 'proj-1', meta: { game_name: '星海计划' } } })
      }
    })
    await mount(
      (id) => opened.push(id),
      () => {
        changed += 1
      }
    )

    await view!.click(view!.byTestId('home-open-folder'))

    expect(api!.calls).toContain('dialog.chooseProjectDir')
    expect(api!.calls).toContain('ceshu.openProjectFolder')
    expect(opened).toEqual(['proj-1'])
    expect(changed).toBe(1)
    expect(view!.byTestId('home-notice').textContent).toContain('星海计划')
  })

  it('取消选择：不调导入、不刷新、不弹提示', async () => {
    const opened: string[] = []
    let changed = 0
    api = installMbApi({ overrides: { 'dialog.chooseProjectDir': () => ({ path: null }) } })
    await mount(
      (id) => opened.push(id),
      () => {
        changed += 1
      }
    )

    await view!.click(view!.byTestId('home-open-folder'))

    expect(api!.calls).toContain('dialog.chooseProjectDir')
    expect(api!.calls).not.toContain('ceshu.openProjectFolder')
    expect(opened).toEqual([])
    expect(changed).toBe(0)
    expect(view!.query('[data-testid="home-notice"]')).toBeNull()
  })

  it('不是项目文件夹：把主进程的中文错误显示出来', async () => {
    const opened: string[] = []
    api = installMbApi({
      overrides: {
        'dialog.chooseProjectDir': () => ({ path: '/tmp/空目录' }),
        'ceshu.openProjectFolder': () => {
          throw new Error('不是有效的项目文件夹（缺少 config.json）')
        }
      }
    })
    await mount((id) => opened.push(id))

    await view!.click(view!.byTestId('home-open-folder'))

    expect(view!.byTestId('home-error').textContent).toContain('config.json')
    expect(opened).toEqual([])
  })
})
