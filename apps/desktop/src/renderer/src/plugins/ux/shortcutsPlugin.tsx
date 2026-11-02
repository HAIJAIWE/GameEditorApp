import type { PluginHost } from '@mobai/shared/plugin/host'
import type { PluginManifest } from '@mobai/shared/plugin/types'
import { translate } from '@mobai/shared/i18n'
import { getLocalePreference } from '../../localePreference'
import { registerReactBinding } from '../host'
import { ShortcutsPanel } from '../../components/common'

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
    description: 'Keyboard shortcuts reference panel',
    meta: { labelKey: 'shortcuts.metaLabel', icon: '⌨', descriptionKey: 'shortcuts.metaDescription' },
    capabilities: [
      {
        kind: 'command',
        id: 'shortcuts.open',
        label: 'Keyboard shortcuts',
        labelKey: 'shortcuts.metaLabel',
        run: () => host.openPanel('shortcuts.panel')
      },
      {
        kind: 'panel',
        id: 'shortcuts.panel',
        title: 'Keyboard shortcuts',
        titleKey: 'shortcuts.metaLabel',
        ui: { type: 'text', text: translate(getLocalePreference(), 'shortcuts.panelText') }
      }
    ]
  }
}
