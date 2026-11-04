// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { PluginHost } from '@mobai/shared/plugin/host'
import type { PluginMenuItem } from '@mobai/shared/plugin/types'
import { MenuBar } from '../../../src/renderer/src/components/layout'
import { defineMenusPlugin } from '../../../src/renderer/src/plugins/ux'
import { setMenuStateProvider } from '../../../src/renderer/src/plugins/context'
import { installMbApi, pressKey, renderDom, type ApiStub, type RenderResult } from './render'

/**
 * `MenuBar` 的**行为级**测试（Slice 9 后重写）。
 *
 * 菜单结构不再写在组件里，而是来自 `menusPlugin` 的 `menu` 能力；点击 = 执行 command 能力。
 * 所以这里搭一个「真宿主」：注册菜单插件 + 一个把所有被引用命令都实现成「记一笔」的 recorder 插件，
 * 断言点击真的派发到了对应 command id。
 */

let view: RenderResult | null = null
let api: ApiStub | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
  api?.restore()
  api = null
  setMenuStateProvider(null)
})

interface Mounted {
  host: PluginHost
  calls: string[]
}

/** 收集菜单里引用到的全部命令 id（含子菜单） */
function collectCommandIds(items: PluginMenuItem[], into: Set<string>): void {
  for (const item of items) {
    if (item.command !== undefined) into.add(item.command)
    if (item.items !== undefined) collectCommandIds(item.items, into)
  }
}

async function mount(options: { canUndo?: boolean; canRedo?: boolean } = {}): Promise<Mounted> {
  api = installMbApi() // 菜单栏右侧常驻 LibraryBar，会读 window.mbApi.library
  const host = new PluginHost()
  host.register(defineMenusPlugin(host))

  const calls: string[] = []
  const ids = new Set<string>()
  for (const menu of host.menus()) collectCommandIds(menu.items, ids)
  // 右侧角部件的 AI 按钮不挂在任何菜单里，但同样走命令
  ids.add('app.focusAi')
  host.register({
    id: 'recorder',
    name: 'recorder',
    version: '0.1.0',
    capabilities: [...ids].map((id) => ({
      kind: 'command' as const,
      id,
      label: id,
      run: () => {
        calls.push(id)
      }
    }))
  })

  setMenuStateProvider(() => ({ undo: options.canUndo ?? true, redo: options.canRedo ?? true }))
  view = await renderDom(<MenuBar host={host} />)
  return { host, calls }
}

describe('MenuBar：菜单展开与收起', () => {
  it('渲染全部顶层菜单标题（结构来自插件）', async () => {
    await mount()

    for (const testid of [
      'menu-title-file',
      'menu-title-edit',
      'menu-title-tools',
      'menu-title-view',
      'menu-title-settings',
      'menu-title-help'
    ]) {
      expect(view?.byTestId(testid), testid).toBeTruthy()
    }
  })

  it('点标题展开下拉，再点一次收起', async () => {
    await mount()
    await view!.click(view!.byTestId('menu-title-file'))
    expect(view!.byTestId('menuitem-file-open')).toBeTruthy()

    await view!.click(view!.byTestId('menu-title-file'))
    expect(view!.query('[data-testid="menuitem-file-open"]')).toBeNull()
  })

  it('按 Escape 收起下拉', async () => {
    await mount()
    await view!.click(view!.byTestId('menu-title-file'))
    expect(view!.query('[data-testid="menuitem-file-open"]')).not.toBeNull()

    await pressKey('Escape')

    expect(view!.query('[data-testid="menuitem-file-open"]')).toBeNull()
  })
})

describe('MenuBar：菜单项派发命令', () => {
  it('点「打开」执行 app.io.open，并收起菜单', async () => {
    const { calls } = await mount()

    await view!.click(view!.byTestId('menu-title-file'))
    await view!.click(view!.byTestId('menuitem-file-open'))

    expect(calls).toEqual(['app.io.open'])
    expect(view!.query('[data-testid="menuitem-file-open"]')).toBeNull()
  })

  it('引擎导出按目标引擎派发各自的命令（不再全落到 lua）', async () => {
    const { calls } = await mount()

    await view!.click(view!.byTestId('menu-title-file'))
    await view!.click(view!.byTestId('menuitem-file-exportLua'))
    await view!.click(view!.byTestId('menu-title-file'))
    await view!.click(view!.byTestId('menuitem-file-exportUnity'))

    expect(calls).toEqual(['app.io.engineExport.lua', 'app.io.engineExport.unity'])
  })

  it('子菜单里的条目也能派发', async () => {
    const { calls } = await mount()

    await view!.click(view!.byTestId('menu-title-tools'))
    await view!.click(view!.byTestId('menuitem-tools-attributeChart'))

    expect(calls).toEqual(['attributeChart.open'])
  })

  it('撤销/重做按宿主状态置灰（disabledWhen），置灰时点击不派发', async () => {
    const { calls } = await mount({ canUndo: false, canRedo: true })

    await view!.click(view!.byTestId('menu-title-edit'))
    const undo = view!.byTestId('menuitem-edit-undo') as HTMLButtonElement
    const redo = view!.byTestId('menuitem-edit-redo') as HTMLButtonElement

    expect(undo.disabled).toBe(true)
    expect(redo.disabled).toBe(false)

    await view!.click(undo)
    expect(calls).toEqual([])
  })

  it('可撤销时点撤销派发 app.undo', async () => {
    const { calls } = await mount({ canUndo: true })

    await view!.click(view!.byTestId('menu-title-edit'))
    await view!.click(view!.byTestId('menuitem-edit-undo'))

    expect(calls).toEqual(['app.undo'])
  })

  it('右侧角部件的设置/AI 也走命令（App 不再传 actions）', async () => {
    const { calls } = await mount()

    await view!.click(view!.byTestId('menubar-settings'))
    await view!.click(view!.byTestId('menubar-ai'))

    expect(calls).toEqual(['settings.open', 'app.focusAi'])
  })
})

describe('MenuBar：键帽与 aria-keyshortcuts（dsh ShortcutKeys 形态）', () => {
  it('撤销/重做带规范名 aria-keyshortcuts 与键帽，键帽整块 aria-hidden', async () => {
    await mount()
    await view!.click(view!.byTestId('menu-title-edit'))

    const undo = view!.byTestId('menuitem-edit-undo')
    // aria 用规范名 Control（读屏念得出）；界面上显示的是 Ctrl
    expect(undo.getAttribute('aria-keyshortcuts')).toBe('Control+Z')
    expect([...undo.querySelectorAll('.shortcut-key')].map((node) => node.textContent)).toEqual([
      'Ctrl',
      'Z'
    ])
    // 键帽是纯视觉，语义由 aria-keyshortcuts 承担——两者都让读屏读会念两遍
    expect(undo.querySelector('.shortcut-keys')?.getAttribute('aria-hidden')).toBe('true')

    expect(view!.byTestId('menuitem-edit-redo').getAttribute('aria-keyshortcuts')).toBe(
      'Control+Shift+Z'
    )
  })

  it('没有快捷键的菜单项不渲染键帽、也不带 aria-keyshortcuts', async () => {
    await mount()
    await view!.click(view!.byTestId('menu-title-edit'))

    const templateManager = view!.byTestId('menuitem-edit-templateManager')
    expect(templateManager.getAttribute('aria-keyshortcuts')).toBeNull()
    expect(templateManager.querySelector('.shortcut-keys')).toBeNull()
  })
})
