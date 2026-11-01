import type { ComponentType } from 'react'

import type { PluginHost } from '@mobai/shared/plugin/host'
import type { PluginManifest, UiNode } from '@mobai/shared/plugin/types'
import { registerReactBinding } from '../host'

/**
 * 示例插件：证明插件契约端到端可用，且 manifest **零框架依赖**。
 *
 * 它同时贡献三类能力，覆盖 dsh 的能力面：
 * - `command`：菜单/按钮可触发的动作（这里打开自己的面板，证明 command → panel 接线）；
 * - `panel`：用**声明式 `ui`** 描述（任意宿主都能渲染），富 UI 通过 `registerReactBinding` 外置；
 * - `service`：可被其他插件调用的纯函数（这里返回一句问候）。
 *
 * 关键：manifest 里没有 React 类型。React 宿主读 `demoReactBindings` 拿到富组件；
 * CLI / 引擎宿主忽略绑定，直接渲染 `ui`。这正是「任意宿主都能接」的落地方式。
 */

const demoUi: UiNode = {
  type: 'container',
  children: [
    { type: 'text', text: '这是「示例插件」提供的面板（声明式 UI，任意宿主都能渲染）。' },
    { type: 'text', text: 'React 宿主会用富绑定渲染带「禁用本插件」按钮的版本。' }
  ]
}

export function defineDemoPlugin(host: PluginHost): PluginManifest {
  // 富 UI 作为可选绑定在此注册（宿主相关）。非 React 宿主忽略，回退到 demoUi。
  const DemoPanel: ComponentType<{ onClose: () => void }> = ({ onClose }) => (
    <div className="demo-plugin-panel" data-testid="demo-plugin-panel">
      <p>这是「示例插件」提供的面板。它证明了插件可以贡献独立浮层。</p>
      <p>点击下方按钮禁用本插件：宿主会把它从清单移除，并关闭此面板（dsh 风格 disable）。</p>
      <button
        type="button"
        className="btn"
        data-testid="demo-disable"
        onClick={() => {
          host.disable('demo')
          onClose()
        }}
      >
        禁用示例插件
      </button>
    </div>
  )
  registerReactBinding('demo-panel', DemoPanel)

  return {
    id: 'demo',
    name: 'demo',
    version: '0.0.1',
    description: '证明插件契约端到端可用（命令 / 面板 / 服务），且 manifest 零框架依赖',
    meta: { label: '示例插件', icon: '🧩', description: '端到端示例：命令 / 面板 / 服务，且 manifest 零框架依赖' },
    engines: { host: '0.1.0' },
    capabilities: [
      { kind: 'command', id: 'demo.open', label: '插件示例', run: () => host.openPanel('demo-panel') },
      { kind: 'panel', id: 'demo-panel', title: '示例插件面板', ui: demoUi },
      { kind: 'service', id: 'demo.ping', invoke: () => '你好，来自示例插件' }
    ]
  }
}
