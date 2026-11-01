import type { PluginHost } from '@mobai/shared/plugin/host'
import type { PluginManifest } from '@mobai/shared/plugin/types'
import { AboutPanel } from '../../components/common'
import { PluginsPanel } from '../../components/common'
import { registerReactBinding, type PanelBindingProps } from '../host'

/**
 * 外壳类面板 → 插件化第八切片的收尾两件（B 方案 Slice 8 前置）。
 *
 * 这两个是 `renderPanel()` 里最后两个「组件直连」：
 * - **关于**：唯一的输入是版本号，走**打开参数**（`openPanel('about.panel', { version })`），
 *   不为了一个字符串往 context 里加字段。
 * - **插件中心**：它自己就是管理面，需要 `host` 实例。宿主由 `defineXxx(host)` 传进来并
 *   被绑定闭包捕获（不是 hook，不违反规则），这样不必让插件反向 import `builtins` 单例（会循环依赖）。
 */

function AboutPanelBound({ params }: PanelBindingProps) {
  const raw = typeof params === 'object' && params !== null ? (params as { version?: unknown }) : {}
  const version = typeof raw.version === 'string' ? raw.version : null
  return <AboutPanel version={version} />
}

export function defineShellPanelsPlugin(host: PluginHost): PluginManifest {
  registerReactBinding('about.panel', AboutPanelBound)
  // 插件中心 = 自举：把自己也当作一个面板能力挂上去，App 侧不再有 case
  registerReactBinding('plugins.panel', ({ onClose }: PanelBindingProps) => (
    <PluginsPanel host={host} onClose={onClose} />
  ))

  return {
    id: 'shell-panels',
    name: 'shell-panels',
    version: '0.1.0',
    description: 'Shell panels (about / plugin center)',
    meta: {
      label: 'Shell panels',
      labelKey: 'plugin.shell.label',
      icon: '🪟',
      description: 'About and plugin center: one takes panel params, one is a self-hosted admin surface',
      descriptionKey: 'plugin.shell.desc'
    },
    capabilities: [
      {
        kind: 'command',
        id: 'about.open',
        label: 'About',
        labelKey: 'plugin.shell.aboutLabel',
        run: () => host.openPanel('about.panel')
      },
      {
        kind: 'panel',
        id: 'about.panel',
        title: 'About Mobai Editor',
        titleKey: 'plugin.shell.aboutTitle',
        ui: { type: 'text', text: 'Version, license and credits' }
      },
      {
        kind: 'command',
        id: 'plugins.open',
        label: 'Plugin center',
        labelKey: 'plugin.shell.pluginsLabel',
        run: () => host.openPanel('plugins.panel')
      },
      {
        kind: 'panel',
        id: 'plugins.panel',
        title: 'Plugin center',
        titleKey: 'plugin.shell.pluginsLabel',
        ui: { type: 'text', text: 'Registered plugins (enable / disable / panel preview)' }
      }
    ]
  }
}
