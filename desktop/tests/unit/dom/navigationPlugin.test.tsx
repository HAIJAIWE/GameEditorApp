// @vitest-environment jsdom
/**
 * 主导航插件（B 方案 Slice 10：侧栏条目由插件声明）。
 *
 * 覆盖三件事：
 * 1. `sidebar` 能力的结构与顺序（8 个条目，key 固定）；
 * 2. `nav.home` / `nav.agent` 两个命令的真实行为（关浮层 / 聚焦输入框 / 提示）；
 * 3. 死链守卫：侧栏引用的每条 command / panel 都真实存在（改名/删能力后不能留死链）。
 *
 * 放在 `tests/unit/dom/` 且用 jsdom：`nav.agent` 要读 `document` 并 focus 输入框。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PluginHost } from '../../../src/shared/plugin/host'
import { defineAppActionsPlugin } from '../../../src/renderer/src/plugins/appActionsPlugin'
import { defineCeshuPlugin } from '../../../src/renderer/src/plugins/ceshuPlugin'
import { defineDataPanelsPlugin } from '../../../src/renderer/src/plugins/dataPanelsPlugin'
import { defineDemoPlugin } from '../../../src/renderer/src/plugins/demoPlugin'
import { defineEntryPanelsPlugin } from '../../../src/renderer/src/plugins/entryPanelsPlugin'
import { defineMaintenancePanelsPlugin } from '../../../src/renderer/src/plugins/maintenancePanelsPlugin'
import { defineMenusPlugin } from '../../../src/renderer/src/plugins/menusPlugin'
import { defineNavigationPlugin } from '../../../src/renderer/src/plugins/navigationPlugin'
import { defineOnboardingPlugin } from '../../../src/renderer/src/plugins/onboardingPlugin'
import { defineReferencesPlugin } from '../../../src/renderer/src/plugins/referencesPlugin'
import { defineShellPanelsPlugin } from '../../../src/renderer/src/plugins/shellPanelsPlugin'
import { defineShortcutsPlugin } from '../../../src/renderer/src/plugins/shortcutsPlugin'
import { defineStatisticsPlugin } from '../../../src/renderer/src/plugins/statisticsPlugin'
import { defineUtilityPanelsPlugin } from '../../../src/renderer/src/plugins/utilityPanelsPlugin'
import { setHostUi, type HostUiBridge } from '../../../src/renderer/src/plugins/hostBridge'

afterEach(() => {
  setHostUi(null)
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

/** 干净宿主 + 只注册主导航插件（不碰模块单例，测试间互不影响） */
function navHost(): PluginHost {
  const host = new PluginHost()
  host.register(defineNavigationPlugin(host))
  return host
}

/** 与 builtins.ts 同构的全套插件（死链守卫需要真实的面板/命令集合） */
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
  host.register(defineNavigationPlugin(host))
  return host
}

function commandOf(host: PluginHost, id: string) {
  const command = host.commands().find((capability) => capability.id === id)
  if (command === undefined) throw new Error(`missing command "${id}"`)
  return command
}

/** 注入一个可观测的宿主 UI 桥（nav.home/nav.agent 依赖它） */
function injectBridge(overrides: Partial<HostUiBridge> = {}) {
  const bridge: HostUiBridge = {
    notify: vi.fn(),
    openPanel: vi.fn(),
    setHomeVisible: vi.fn(),
    getActiveCeshuId: () => null,
    ...overrides
  }
  setHostUi(bridge)
  return bridge
}

describe('主导航插件（Slice 10：侧栏由插件声明）', () => {
  it('sidebar 能力声明 8 个条目，key 与顺序固定', () => {
    const host = navHost()
    expect(host.sidebarItems().map((item) => item.key)).toEqual([
      'home',
      'plugins',
      'relationGraph',
      'advancedSearch',
      'stats',
      'settings',
      'about',
      'agent'
    ])
  })

  it('home/agent 用 command，其余用 panel（二者互斥）', () => {
    const host = navHost()
    const byKey = new Map(host.sidebarItems().map((item) => [item.key, item]))

    expect(byKey.get('home')?.command).toBe('nav.home')
    expect(byKey.get('agent')?.command).toBe('nav.agent')
    expect(byKey.get('stats')?.panel).toBe('statistics.panel')

    // 互斥：command 条目不带 panel，panel 条目不带 command
    expect(byKey.get('home')?.panel).toBeUndefined()
    expect(byKey.get('stats')?.command).toBeUndefined()
  })

  it('宿主合并多个 sidebar 能力：按 order 排序、key 去重（先到者为准）', () => {
    const host = navHost()
    host.register({
      id: 'extra-nav',
      name: 'extra-nav',
      version: '0.1.0',
      capabilities: [
        {
          kind: 'sidebar',
          id: 'extra.sidebar',
          order: 5,
          items: [{ key: 'extra', label: '额外', icon: '✨', panel: 'demo.panel' }]
        },
        {
          kind: 'sidebar',
          id: 'extra.sidebar.dup',
          order: 99,
          items: [{ key: 'home', label: '重复', icon: 'x', command: 'nav.home' }]
        }
      ]
    })

    const keys = host.sidebarItems().map((item) => item.key)
    expect(keys[0]).toBe('extra') // order 5 排在内置（order 10）之前
    expect(keys.filter((key) => key === 'home')).toHaveLength(1) // 重复 key 只留一个
  })

  it('nav.home 关闭当前浮层并显示首页', () => {
    const host = navHost()
    host.register({
      id: 'stub',
      name: 'stub',
      version: '0.1.0',
      capabilities: [
        { kind: 'panel', id: 'stub.panel', title: '桩', ui: { type: 'text', text: 'x' } }
      ]
    })
    const bridge = injectBridge()

    host.openPanel('stub.panel')
    expect(host.activePanel()?.id).toBe('stub.panel')

    commandOf(host, 'nav.home').run()
    expect(bridge.setHomeVisible).toHaveBeenCalledWith(true)
    expect(host.activePanel()).toBeNull()
  })

  it('nav.agent 聚焦数字员工输入框（可用时）', () => {
    const host = navHost()
    injectBridge()

    const input = document.createElement('input')
    input.setAttribute('data-testid', 'digital-input')
    // jsdom 未实现 scrollIntoView，桩掉避免 TypeError（行为本身与聚焦无关）
    input.scrollIntoView = vi.fn()
    document.body.appendChild(input)

    commandOf(host, 'nav.agent').run()
    expect(document.activeElement).toBe(input)
  })

  it('nav.agent 输入框不可用时给提示', () => {
    const host = navHost()
    const bridge = injectBridge()

    // 没有 digital-input 元素 ⇒ 走提示分支
    commandOf(host, 'nav.agent').run()
    expect(bridge.notify).toHaveBeenCalledTimes(1)
  })

  it('侧栏引用的每条 command / panel 都真实存在（死链守卫）', () => {
    const host = fullHost()
    const commandIds = new Set(host.commands().map((command) => command.id))
    const panelIds = new Set(host.panels().map((panel) => panel.id))

    const missing: string[] = []
    for (const item of host.sidebarItems()) {
      if (item.command !== undefined && !commandIds.has(item.command)) {
        missing.push(`${item.key} → command ${item.command}`)
      }
      if (item.panel !== undefined && !panelIds.has(item.panel)) {
        missing.push(`${item.key} → panel ${item.panel}`)
      }
      if (item.command === undefined && item.panel === undefined) {
        missing.push(`${item.key} → 无动作（command 与 panel 都缺失）`)
      }
    }

    expect(missing).toEqual([])
  })
})
