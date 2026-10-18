// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import MenuBar, { type MenuActions } from '../../../src/renderer/src/components/MenuBar'
import { installMbApi, pressKey, renderDom, type ApiStub, type RenderResult } from './render'

/**
 * `MenuBar` 的**行为级**测试（W2）。
 *
 * ## 为什么选它做第二个样本
 * 菜单栏是整个应用**唯一的能力入口**（无侧栏，能力全在菜单里），
 * 且它**零 IPC 依赖** —— 全部输入来自 props，最适合验证「点击 → 动作」这条链路。
 * 与 `CeshuView` 一起构成渲染层的第一层测试网，也是 Wave 3 拆分大组件前的地基。
 */

let view: RenderResult | null = null
let api: ApiStub | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
  api?.restore()
  api = null
})

interface RecordedActions {
  actions: MenuActions
  calls: string[]
}

/** 全部动作都是「记一笔」，无需逐条实现 30 个回调 */
function makeActions(): RecordedActions {
  const calls: string[] = []
  const actions = new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop !== 'string') return undefined
        return (...args: unknown[]): void => {
          calls.push(args.length === 0 ? prop : `${prop}(${args.join(',')})`)
        }
      }
    }
  ) as unknown as MenuActions
  return { actions, calls }
}

async function mount(options: { canUndo?: boolean; canRedo?: boolean } = {}): Promise<RecordedActions> {
  // 菜单栏右侧常驻 `LibraryBar`，它会读 `window.mbApi.library`
  api = installMbApi()
  const recorded = makeActions()
  view = await renderDom(
    <MenuBar
      canUndo={options.canUndo ?? true}
      canRedo={options.canRedo ?? true}
      actions={recorded.actions}
    />
  )
  return recorded
}

describe('MenuBar：菜单展开与收起', () => {
  it('渲染全部顶层菜单标题', async () => {
    await mount()

    for (const testid of [
      'menu-title-file',
      'menu-title-edit',
      'menu-title-tools',
      'menu-title-settings',
      'menu-title-help'
    ]) {
      expect(view?.byTestId(testid), testid).toBeTruthy()
    }
  })

  it('点标题展开下拉，再点一次收起', async () => {
    await mount()
    const title = view!.byTestId('menu-title-file')

    await view!.click(title)
    expect(view!.byTestId('menuitem-file-open')).toBeTruthy()

    await view!.click(view!.byTestId('menu-title-file'))
    expect(view!.query('[data-testid="menuitem-file-open"]')).toBeNull()
  })

  it('按 Escape 收起下拉', async () => {
    await mount()
    await view!.click(view!.byTestId('menu-title-file'))
    expect(view!.query('[data-testid="menuitem-file-open"]')).not.toBeNull()

    await pressKey('Escape')

    expect(view!.query('[data-testid="menuitem-file-open"]')).toBeNull()  })
})

describe('MenuBar：菜单项动作', () => {
  it('点「打开」触发 actions.open，并收起菜单', async () => {
    const recorded = await mount()

    await view!.click(view!.byTestId('menu-title-file'))
    await view!.click(view!.byTestId('menuitem-file-open'))

    expect(recorded.calls).toEqual(['open'])
    expect(view!.query('[data-testid="menuitem-file-open"]')).toBeNull()
  })

  it('引擎导出把目标引擎作为参数传出（Lua / Unity 分别走各自渲染器）', async () => {
    const recorded = await mount()

    await view!.click(view!.byTestId('menu-title-file'))
    await view!.click(view!.byTestId('menuitem-file-exportLua'))

    expect(recorded.calls).toEqual(['engineExport(lua)'])
  })

  it('撤销/重做按 canUndo / canRedo 置灰，置灰时不触发动作', async () => {
    const recorded = await mount({ canUndo: false, canRedo: true })

    await view!.click(view!.byTestId('menu-title-edit'))
    const undo = view!.byTestId('menuitem-edit-undo') as HTMLButtonElement
    const redo = view!.byTestId('menuitem-edit-redo') as HTMLButtonElement

    expect(undo.disabled).toBe(true)
    expect(redo.disabled).toBe(false)

    await view!.click(undo)
    expect(recorded.calls).toEqual([])
  })

  it('可撤销时点撤销会触发 actions.undo', async () => {
    const recorded = await mount({ canUndo: true })

    await view!.click(view!.byTestId('menu-title-edit'))
    await view!.click(view!.byTestId('menuitem-edit-undo'))

    expect(recorded.calls).toEqual(['undo'])
  })
})
