import type { PluginHost } from '../../../shared/plugin/host'
import type { PluginManifest } from '../../../shared/plugin/types'
import OnboardingPanel from '../components/OnboardingPanel'
import { useAppContext } from './appContext'
import { registerReactBinding, type PanelBindingProps } from './reactBindings'

/**
 * 快速入门 → 插件化（B 方案 Slice 8a 的收尾：这是 `renderPanel()` 里最后一个直连组件）。
 *
 * 它需要两样东西：`types`（引导卡按现有 schema 决定显示什么）与 `handleOnboardingAction`
 * （8 个 action 的导航分发）。前者本来就在 context；后者作为**过渡**也进了 context——
 * Slice 8d 会把那 8 个 action 转成 `nav.*` command，届时这里改发命令、context 里那项删掉。
 */
function OnboardingPanelBound({ onClose }: PanelBindingProps) {
  const { types, handleOnboardingAction } = useAppContext()
  return <OnboardingPanel types={types} onAction={handleOnboardingAction} onClose={onClose} />
}

export function defineOnboardingPlugin(host: PluginHost): PluginManifest {
  registerReactBinding('onboarding.panel', OnboardingPanelBound)
  return {
    id: 'onboarding',
    name: 'onboarding',
    version: '0.1.0',
    description: '快速入门引导（8 个动作的导航分发，Slice 8d 将转 command）',
    meta: {
      label: '快速入门',
      icon: '🚀',
      description: '按现有 schema 生成引导卡，点击后导航到对应位置'
    },
    capabilities: [
      {
        kind: 'command',
        id: 'onboarding.open',
        label: '快速入门',
        run: () => host.openPanel('onboarding.panel')
      },
      {
        kind: 'panel',
        id: 'onboarding.panel',
        title: '快速入门',
        ui: { type: 'text', text: '五步引导：建条目 / 设计数据 / 写策划书 / 用 AI' }
      }
    ]
  }
}
