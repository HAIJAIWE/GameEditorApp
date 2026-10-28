// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PluginHost } from '../../../src/shared/plugin/host'
import { defineAppActionsPlugin } from '../../../src/renderer/src/plugins/appActionsPlugin'
import { notify, setHostUi } from '../../../src/renderer/src/plugins/hostBridge'
import { installMbApi } from './render'

let api: ReturnType<typeof installMbApi> | null = null

afterEach(() => {
  api?.restore()
  api = null
  setHostUi(null)
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

function hostWithPlugin(): PluginHost {
  const host = new PluginHost()
  host.register(defineAppActionsPlugin(host))
  return host
}

describe('应用级动作插件（B 方案 Slice 8c 第一批）', () => {
  it('暴露 7 个 command 能力（不含 panel —— 这些不是视图）', () => {
    const host = hostWithPlugin()
    expect(host.commands().map((command) => command.id).sort()).toEqual([
      'app.focusAi',
      'app.quit',
      'app.reload',
      'app.toggleDevTools',
      'app.zoomIn',
      'app.zoomOut',
      'app.zoomReset'
    ])
    expect(host.panels()).toHaveLength(0)
  })

  it('窗口动作经 app.viewAction 派发', () => {
    api = installMbApi()
    const host = hostWithPlugin()
    host.commands().find((command) => command.id === 'app.zoomIn')!.run()
    expect(api.calls).toContain('app.viewAction')
  })

  it('AI 焦点：输入框可用时聚焦，不弹提示', () => {
    const notified: string[] = []
    setHostUi({
      notify: (message) => notified.push(message),
      openPanel: () => undefined,
      setHomeVisible: () => undefined,
      getActiveCeshuId: () => null
    })
    const input = document.createElement('input')
    input.setAttribute('data-testid', 'digital-input')
    // jsdom 没有实现 scrollIntoView（真实浏览器有），这里补个空实现
    input.scrollIntoView = () => undefined
    document.body.appendChild(input)

    hostWithPlugin().commands().find((command) => command.id === 'app.focusAi')!.run()

    expect(document.activeElement).toBe(input)
    expect(notified).toEqual([])
  })

  it('AI 焦点：输入框缺失/禁用时经 notify 通道给提示（不静默失败）', () => {
    const notified: string[] = []
    setHostUi({
      notify: (message) => notified.push(message),
      openPanel: () => undefined,
      setHomeVisible: () => undefined,
      getActiveCeshuId: () => null
    })
    const input = document.createElement('input')
    input.setAttribute('data-testid', 'digital-input')
    input.disabled = true
    document.body.appendChild(input)

    hostWithPlugin().commands().find((command) => command.id === 'app.focusAi')!.run()

    expect(notified).toEqual(['AI 助手在右侧常驻；当前对话运行中，输入框暂不可用'])
  })

  it('notify 未注入时不抛错（宿主没接通道也要能跑）', () => {
    expect(() => notify('x')).not.toThrow()
  })

  it('退出：调用 window.close（无主窗口上下文时静默）', () => {
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => undefined)
    hostWithPlugin().commands().find((command) => command.id === 'app.quit')!.run()
    expect(closeSpy).toHaveBeenCalled()
  })
})
