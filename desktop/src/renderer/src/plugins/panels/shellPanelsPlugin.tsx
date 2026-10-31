import type { PluginHost } from '../../../../shared/plugin/host'
import type { PluginManifest } from '../../../../shared/plugin/types'
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
    description: '外壳面板包（关于 / 插件中心）',
    meta: {
      label: '外壳面板',
      icon: '🪟',
      description: '关于与插件中心：一个走打开参数，一个是自举的管理面'
    },
    capabilities: [
      {
        kind: 'command',
        id: 'about.open',
        label: '关于',
        run: () => host.openPanel('about.panel')
      },
      {
        kind: 'panel',
        id: 'about.panel',
        title: '关于墨白编辑器',
        ui: { type: 'text', text: '版本、许可与致谢' }
      },
      {
        kind: 'command',
        id: 'plugins.open',
        label: '插件中心',
        run: () => host.openPanel('plugins.panel')
      },
      {
        kind: 'panel',
        id: 'plugins.panel',
        title: '插件中心',
        ui: { type: 'text', text: '已注册插件清单（启用 / 禁用 / 面板预览）' }
      }
    ]
  }
}
