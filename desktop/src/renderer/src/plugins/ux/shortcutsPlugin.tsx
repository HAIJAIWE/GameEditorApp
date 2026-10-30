import type { PluginHost } from '../../../../shared/plugin/host'
import type { PluginManifest } from '../../../../shared/plugin/types'
import { registerReactBinding } from '../host/reactBindings'
import ShortcutsPanel from '../../components/common/ShortcutsPanel'

/**
 * 快捷键参考面板 → 插件化首切片（证明「真实产品面板经宿主渲染」通路）。
 *
 * 它无 App 状态依赖（纯静态参考），是深层插件化最安全的第一个迁移对象。
 * 后续状态化面板（数据编辑 / 策划书编辑器）迁移时，会经 **appContext store** 自供给数据（Slice 2），
 * 不再由 App 以 props 下发——那才是 dsh 式「插件自供给」的解耦点。
 */
export function defineShortcutsPlugin(host: PluginHost): PluginManifest {
  // 富 UI 作为可选绑定外置（宿主侧）；CLI / 引擎宿主回退到声明式 ui。
  registerReactBinding('shortcuts.panel', () => <ShortcutsPanel />)
  return {
    id: 'shortcuts',
    name: 'shortcuts',
    version: '0.1.0',
    description: '快捷键参考面板',
    meta: { label: '快捷键参考', icon: '⌨', description: '快捷键参考（插件化首切片，经宿主渲染）' },
    capabilities: [
      { kind: 'command', id: 'shortcuts.open', label: '快捷键参考', run: () => host.openPanel('shortcuts.panel') },
      { kind: 'panel', id: 'shortcuts.panel', title: '快捷键参考', ui: { type: 'text', text: '快捷键参考面板' } }
    ]
  }
}
