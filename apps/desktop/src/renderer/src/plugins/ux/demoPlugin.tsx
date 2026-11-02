import type { ComponentType } from 'react'

import { useT } from '@mobai/client-ui'
import type { PluginHost } from '@mobai/shared/plugin/host'
import type { PluginManifest, UiNode } from '@mobai/shared/plugin/types'
import { translate } from '@mobai/shared/i18n'
import { getLocalePreference } from '../../localePreference'
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
export function defineDemoPlugin(host: PluginHost): PluginManifest {
  // 声明式 ui 是给非 React 宿主的回退（React 宿主走富绑定），在注册时按当前语言烘焙。
  const demoUi: UiNode = {
    type: 'container',
    children: [
      { type: 'text', text: translate(getLocalePreference(), 'demo.ui.text1') },
      { type: 'text', text: translate(getLocalePreference(), 'demo.ui.text2') }
    ]
  }

  // 富 UI 作为可选绑定在此注册（宿主相关）。非 React 宿主忽略，回退到 demoUi。
  const DemoPanel: ComponentType<{ onClose: () => void }> = ({ onClose }) => {
    const t = useT()
    return (
      <div className="demo-plugin-panel" data-testid="demo-plugin-panel">
        <p>{t('demo.panel.p1')}</p>
        <p>{t('demo.panel.p2')}</p>
        <button
          type="button"
          className="btn"
          data-testid="demo-disable"
          onClick={() => {
            host.disable('demo')
            onClose()
          }}
        >
          {t('demo.panel.disable')}
        </button>
      </div>
    )
  }
  registerReactBinding('demo-panel', DemoPanel)

  return {
    id: 'demo',
    name: 'demo',
    version: '0.0.1',
    description: 'Proves the plugin contract works end-to-end (command / panel / service) with a framework-free manifest',
    meta: { labelKey: 'demo.metaLabel', icon: '🧩', descriptionKey: 'demo.metaDescription' },
    engines: { host: '0.1.0' },
    capabilities: [
      {
        kind: 'command',
        id: 'demo.open',
        label: 'Plugin demo',
        labelKey: 'demo.commandLabel',
        run: () => host.openPanel('demo-panel')
      },
      { kind: 'panel', id: 'demo-panel', title: 'Demo plugin panel', titleKey: 'demo.panelTitle', ui: demoUi },
      { kind: 'service', id: 'demo.ping', invoke: () => translate(getLocalePreference(), 'demo.ping') }
    ]
  }
}
