// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { PluginHost } from '../../../src/shared/plugin/host'
import type { DataTypeDef } from '../../../src/shared/types'
import { HostPanel } from '../../../src/renderer/src/plugins/HostPanel'
import { AppContextProvider } from '../../../src/renderer/src/plugins/appContext'
import { setHostUi, type HostUiBridge } from '../../../src/renderer/src/plugins/hostBridge'
import { defineOnboardingPlugin } from '../../../src/renderer/src/plugins/onboardingPlugin'
import { appContextValue, installMbApi, renderDom, type RenderResult } from './render'

const TYPES: DataTypeDef[] = [
  { id: 'role', name: '角色', pluralKey: 'roles', color: '#0a0', formFields: [] }
]

let view: RenderResult | null = null
let api: ReturnType<typeof installMbApi> | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
  api?.restore()
  api = null
  setHostUi(null)
})

/** 记录桥调用：证明命令走的是「App 注入的 openPanel（含守卫）/提示/首页开关」而不是自己造一套 */
function installBridge(overrides: Partial<HostUiBridge> = {}): {
  opened: Array<{ panel: string; params: unknown }>
  notices: string[]
  home: boolean[]
} {
  const opened: Array<{ panel: string; params: unknown }> = []
  const notices: string[] = []
  const home: boolean[] = []
  setHostUi({
    notify: (message) => notices.push(message),
    openPanel: (panel, params) => opened.push({ panel, params }),
    setHomeVisible: (visible) => home.push(visible),
    getActiveCeshuId: () => null,
    ...overrides
  })
  return { opened, notices, home }
}

function hostWithPlugin(): PluginHost {
  const host = new PluginHost()
  host.register(defineOnboardingPlugin(host))
  return host
}

function run(host: PluginHost, commandId: string): void {
  host.commands().find((command) => command.id === commandId)!.run()
}

describe('快速入门：引导动作已命令化（B 方案 Slice 8d）', () => {
  it('12 个引导动作各成一个 nav.* 命令 + 1 个打开面板命令', () => {
    const host = hostWithPlugin()
    const ids = host.commands().map((command) => command.id)
    expect(ids).toContain('onboarding.open')
    for (const nav of [
      'nav.createRole',
      'nav.createMonster',
      'nav.createSkill',
      'nav.createEquip',
      'nav.batchCreate',
      'nav.viewRelations',
      'nav.fieldEditor',
      'nav.stats',
      'nav.library',
      'nav.ai',
      'nav.dataDesign',
      'nav.ceshu'
    ]) {
      expect(ids).toContain(nav)
    }
  })

  it('创建类命令把类型烘进命令里（走 App 的 openPanel，带参数）', () => {
    const bridge = installBridge()
    const host = hostWithPlugin()

    run(host, 'nav.createRole')
    run(host, 'nav.createEquip')

    expect(bridge.opened).toEqual([
      { panel: 'quickCreate.panel', params: { type: 'role' } },
      { panel: 'quickCreate.panel', params: { type: 'equip' } }
    ])
  })

  it('导航类命令走 App 的 openPanel（守卫与菜单一致，不自己 setPanel）', () => {
    const bridge = installBridge()
    const host = hostWithPlugin()

    run(host, 'nav.viewRelations')
    run(host, 'nav.fieldEditor')
    run(host, 'nav.stats')

    expect(bridge.opened.map((entry) => entry.panel)).toEqual([
      'relationGraph.panel',
      'typeEditor.panel',
      'statistics.panel'
    ])
  })

  it('纯提示类命令经 notify 通道（不静默）', () => {
    const bridge = installBridge()
    const host = hostWithPlugin()

    run(host, 'nav.library')
    run(host, 'nav.ai')

    expect(bridge.notices).toHaveLength(2)
    expect(bridge.notices[0]).toContain('当前库')
    expect(bridge.notices[1]).toContain('智能体')
  })

  it('「去设计数据」：没有打开的策划书 → 提示 + 回首页', () => {
    const bridge = installBridge({ getActiveCeshuId: () => null })
    run(hostWithPlugin(), 'nav.dataDesign')

    expect(bridge.notices[0]).toContain('请先打开一本策划书')
    expect(bridge.home).toEqual([true])
  })

  it('「去设计数据」：已有策划书 → 离开首页', () => {
    const bridge = installBridge({ getActiveCeshuId: () => 'abc12345' })
    run(hostWithPlugin(), 'nav.dataDesign')

    expect(bridge.notices).toEqual([])
    expect(bridge.home).toEqual([false])
  })

  it('面板经宿主渲染（testid 保留），types 来自 context', async () => {
    const host = hostWithPlugin()
    // 引导卡按库内条目数决定进度，必须给一个数组（默认桩返回 undefined 会让 countByType 抛）
    api = installMbApi({ overrides: { 'data.listAll': () => [] } })

    host.openPanel('onboarding.panel')
    view = await renderDom(
      <AppContextProvider value={appContextValue({ types: TYPES })}>
        <HostPanel host={host} panelId="onboarding.panel" onClose={() => undefined} />
      </AppContextProvider>
    )
    await view.flush()

    expect(view.byTestId('onboarding-panel')).toBeTruthy()
  })
})
