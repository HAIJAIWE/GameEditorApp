/**
 * 注意放置位置：本测试**不需要 jsdom**，但放在 `tests/unit/dom/` 下是因为它 import 渲染层插件
 * （进而 import React 组件），而 `tsconfig.node.json` 没有 DOM lib —— 放外面会让 tsc 报
 * 「window 不存在」一大片。`tsconfig.test-dom.json` 才覆盖 `src/renderer/**` 与这个目录。
 */

import { describe, expect, it } from 'vitest'

import { PluginHost } from '../../../src/shared/plugin/host'
import type { PluginMenuItem } from '../../../src/shared/plugin/types'
import { defineAppActionsPlugin } from '../../../src/renderer/src/plugins/ux/appActionsPlugin'
import { defineCeshuPlugin } from '../../../src/renderer/src/plugins/ceshu/ceshuPlugin'
import { defineDataPanelsPlugin } from '../../../src/renderer/src/plugins/panels/dataPanelsPlugin'
import { defineDemoPlugin } from '../../../src/renderer/src/plugins/ux/demoPlugin'
import { defineEntryPanelsPlugin } from '../../../src/renderer/src/plugins/panels/entryPanelsPlugin'
import { defineMaintenancePanelsPlugin } from '../../../src/renderer/src/plugins/panels/maintenancePanelsPlugin'
import { defineMcpConfigPlugin } from '../../../src/renderer/src/plugins/panels/mcpConfigPlugin'
import { defineMenusPlugin } from '../../../src/renderer/src/plugins/ux/menusPlugin'
import { defineOnboardingPlugin } from '../../../src/renderer/src/plugins/ux/onboardingPlugin'
import { defineReferencesPlugin } from '../../../src/renderer/src/plugins/panels/referencesPlugin'
import { defineShellPanelsPlugin } from '../../../src/renderer/src/plugins/panels/shellPanelsPlugin'
import { defineShortcutsPlugin } from '../../../src/renderer/src/plugins/ux/shortcutsPlugin'
import { defineStatisticsPlugin } from '../../../src/renderer/src/plugins/panels/statisticsPlugin'
import { defineUtilityPanelsPlugin } from '../../../src/renderer/src/plugins/panels/utilityPanelsPlugin'

/** 把「与 builtins.ts 同构」的全套插件注册进一个干净宿主（不碰模块单例，测试间互不影响） */
function fullHost(): PluginHost {
  const host = new PluginHost()
  host.register(defineCeshuPlugin())
  host.register(defineDemoPlugin(host))
  host.register(defineShortcutsPlugin(host))
  host.register(defineStatisticsPlugin(host))
  host.register(defineReferencesPlugin(host))
  host.register(defineUtilityPanelsPlugin(host))
  host.register(defineDataPanelsPlugin(host))
  host.register(defineMaintenancePanelsPlugin(host))
  host.register(defineEntryPanelsPlugin(host))
  host.register(defineShellPanelsPlugin(host))
  host.register(defineOnboardingPlugin(host))
  host.register(defineAppActionsPlugin(host))
  host.register(defineMenusPlugin(host))
  host.register(defineMcpConfigPlugin(host))
  return host
}

function walk(items: PluginMenuItem[], visit: (item: PluginMenuItem) => void): void {
  for (const item of items) {
    visit(item)
    if (item.items !== undefined) walk(item.items, visit)
  }
}

describe('菜单结构插件（Slice 9：菜单由插件声明）', () => {
  it('六个顶层菜单按 order 排列', () => {
    const host = new PluginHost()
    host.register(defineMenusPlugin(host))
    expect(host.menus().map((menu) => menu.menu)).toEqual(['文件', '编辑', '工具', '视图', '设置', '帮助'])
  })

  it('同标题的菜单能力由宿主合并（未来插件可自己往「工具」里加项）', () => {
    const host = new PluginHost()
    host.register(defineMenusPlugin(host))
    host.register({
      id: 'extra-menu',
      name: 'extra-menu',
      version: '0.1.0',
      capabilities: [
        {
          kind: 'menu',
          id: 'menu.tools.extra',
          menu: '工具',
          order: 31,
          items: [{ label: '外部工具', command: 'demo.panel.open', testid: 'menuitem-tools-extra' }]
        }
      ]
    })

    const tools = host.menus().filter((menu) => menu.menu === '工具')
    expect(tools).toHaveLength(2)
    // 宿主按 order 排序：内置工具菜单（30）在前，扩展（31）在后
    expect(tools[0]?.id).toBe('menu.tools')
    expect(tools[1]?.items[0]?.label).toBe('外部工具')
  })

  it('菜单引用的每条命令都真实存在（防止改名/删命令后留下死链）', () => {
    const host = fullHost()
    const commandIds = new Set(host.commands().map((command) => command.id))

    const missing: string[] = []
    for (const menu of host.menus()) {
      walk(menu.items, (item) => {
        if (item.command !== undefined && !commandIds.has(item.command)) {
          missing.push(`${menu.menu} → ${item.label} → ${item.command}`)
        }
      })
    }

    expect(missing).toEqual([])
  })

  it('撤销/重做用 disabledWhen 声明禁用条件，而不是写死 disabled', () => {
    const host = new PluginHost()
    host.register(defineMenusPlugin(host))
    const edit = host.menus().find((menu) => menu.menu === '编辑')!

    const undo = edit.items.find((item) => item.command === 'app.undo')!
    const redo = edit.items.find((item) => item.command === 'app.redo')!
    expect(undo.disabledWhen).toBe('undo')
    expect(redo.disabledWhen).toBe('redo')
  })

  it('引擎导出与快照导出各成独立命令（菜单不再靠 arg 区分）', () => {
    const host = new PluginHost()
    host.register(defineMenusPlugin(host))
    const ids = new Set<string>()
    for (const menu of host.menus()) walk(menu.items, (item) => item.command !== undefined && ids.add(item.command))

    for (const engine of ['lua', 'unity', 'unreal', 'godot', 'cocos2d']) {
      expect(ids.has(`app.io.engineExport.${engine}`)).toBe(true)
    }
    expect(ids.has('app.io.snapshot.json')).toBe(true)
    expect(ids.has('app.io.snapshot.csv')).toBe(true)
  })

  it('E2E 依赖的菜单锚点全部保留', () => {
    const host = new PluginHost()
    host.register(defineMenusPlugin(host))
    const testids = new Set<string>()
    for (const menu of host.menus()) walk(menu.items, (item) => item.testid !== undefined && testids.add(item.testid))

    for (const id of [
      'menuitem-file-open',
      'menuitem-file-save',
      'menuitem-file-importJson',
      'menuitem-file-exportCsv',
      'menuitem-file-exportLua',
      'menuitem-file-exportCocos',
      'menuitem-file-exportSnapshotJson',
      'menuitem-edit-undo',
      'menuitem-edit-redo',
      'menuitem-tools-quickCreate',
      'menuitem-tools-fieldEditor',
      'menuitem-view-zoomIn',
      'menuitem-settings-open',
      'menuitem-help-about'
    ]) {
      expect(testids.has(id), id).toBe(true)
    }
  })
})
