// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { DigitalStepList } from '../../../src/renderer/src/components/digital'
import { getToolViewBinding, registerToolViewBinding } from '../../../src/renderer/src/plugins/session'
import type { DigitalStep } from '../../../src/shared/agent/ui'
import { PluginHost } from '../../../src/shared/plugin/host'
import { renderDom } from './render'

const STEP: DigitalStep = {
  order: 0,
  tool: 'system.demo',
  kind: 'tool',
  status: 'done',
  result: '原始结果',
  success: true
}

/** 模拟 DigitalPanel 的解析链：host.toolViews() → 能力 → React 绑定 */
function resolveFromHost(host: PluginHost) {
  return (tool: string) => {
    const capability = host.toolViews().find((candidate) => candidate.tool === tool)
    return capability === undefined ? undefined : getToolViewBinding(capability.id)
  }
}

describe('工具视图 keyed slot（P2）', () => {
  it('插件声明 toolView + 注册绑定 → 覆盖内置视图', async () => {
    const host = new PluginHost()
    host.register({
      id: 'p',
      name: 'p',
      version: '1.0.0',
      capabilities: [
        { kind: 'toolView', id: 'demo.view', tool: 'system.demo', ui: { type: 'text', text: '声明式回退' } }
      ]
    })
    registerToolViewBinding('demo.view', (step) => (
      <span data-testid="plugin-view">插件视图：{step.result}</span>
    ))

    const view = await renderDom(<DigitalStepList steps={[STEP]} resolveView={resolveFromHost(host)} />)
    expect(view.byTestId('plugin-view').textContent).toContain('插件视图：原始结果')
    await view.cleanup()
  })

  it('未声明 toolView → 回退内置文本视图', async () => {
    const host = new PluginHost() // 无 toolView 能力
    const view = await renderDom(<DigitalStepList steps={[STEP]} resolveView={resolveFromHost(host)} />)
    expect(view.query('[data-testid="plugin-view"]')).toBeNull()
    expect(view.text()).toContain('原始结果')
    await view.cleanup()
  })
})
