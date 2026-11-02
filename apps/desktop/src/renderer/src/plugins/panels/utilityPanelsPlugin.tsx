import type { PluginHost } from '@mobai/shared/plugin/host'
import type { PluginManifest } from '@mobai/shared/plugin/types'
import { AgentEditorPanel } from '../../components/agent'
import { AttrSystemPanel } from '../../components/attr'
import { CleanupImagesPanel } from '../../components/backup'
import { DataDiffPanel } from '../../components/data'
import { GameDataPreviewPanel } from '../../components/data'
import { ImageGenPanel } from '../../components/browser'
import { KeywordTemplatePanel } from '../../components/ceshuType'
import { SettingsPanel } from '../../components/common'
import { translate } from '@mobai/shared/i18n'
import { getLocalePreference } from '../../localePreference'
import { registerReactBinding } from '../host'

/**
 * 低风险工具面板 → 插件化第四切片（B 方案 Slice 4）。
 *
 * 这 8 个面板**都不依赖 App 状态**：5 个零 props，3 个只要 `onClose`（宿主下发）。
 * 所以按 dsh 的 **bundle 形态**一次打包成一个插件：一个 manifest 带多个 `panel` 能力，
 * 而不是 8 个各含 1 个面板的插件文件——省掉重复样板，启用/禁用粒度对这类工具面板也够用。
 *
 * 需要「按面板单独开关」或需要注入参数/共享状态的，仍按一片一插件的写法
 * （见 statistics / references / dataPanels）。
 */
export function defineUtilityPanelsPlugin(host: PluginHost): PluginManifest {
  // 零 props 面板：绑定只负责转发生命周期
  registerReactBinding('settings.panel', () => <SettingsPanel />)
  registerReactBinding('cleanupImages.panel', () => <CleanupImagesPanel />)
  registerReactBinding('keywordTemplates.panel', () => <KeywordTemplatePanel />)
  registerReactBinding('agentEditor.panel', () => <AgentEditorPanel />)
  registerReactBinding('gameDataPreview.panel', () => <GameDataPreviewPanel />)
  // 只依赖 onClose 的面板：绑定**必须转发 onClose**（否则 tsc 报缺 prop、且面板关不掉）
  registerReactBinding('attrSystem.panel', ({ onClose }) => <AttrSystemPanel onClose={onClose} />)
  registerReactBinding('dataDiff.panel', ({ onClose }) => <DataDiffPanel onClose={onClose} />)
  registerReactBinding('imageGen.panel', ({ onClose }) => <ImageGenPanel onClose={onClose} />)

  return {
    id: 'utility-panels',
    name: 'utility-panels',
    version: '0.1.0',
    description: 'Low-risk utility panels (settings / image cleanup / keyword templates / agent editor / data preview / attribute system / data diff / image generation)',
    meta: {
      labelKey: 'utilityPanels.metaLabel',
      icon: '🧰',
      descriptionKey: 'utilityPanels.metaDescription'
    },
    capabilities: [
      {
        kind: 'command',
        id: 'settings.open',
        label: 'Settings',
        labelKey: 'utilityPanels.settings',
        run: () => host.openPanel('settings.panel')
      },
      {
        kind: 'panel',
        id: 'settings.panel',
        title: 'Settings',
        titleKey: 'utilityPanels.settings',
        ui: { type: 'text', text: translate(getLocalePreference(), 'utilityPanels.settingsUi') }
      },
      {
        kind: 'command',
        id: 'cleanupImages.open',
        label: 'Clean unused images',
        labelKey: 'utilityPanels.cleanupImages',
        run: () => host.openPanel('cleanupImages.panel')
      },
      {
        kind: 'panel',
        id: 'cleanupImages.panel',
        title: 'Clean unused images',
        titleKey: 'utilityPanels.cleanupImages',
        ui: { type: 'text', text: translate(getLocalePreference(), 'utilityPanels.cleanupImagesUi') }
      },
      {
        kind: 'command',
        id: 'keywordTemplates.open',
        label: 'Keyword templates',
        labelKey: 'utilityPanels.keywordTemplates',
        run: () => host.openPanel('keywordTemplates.panel')
      },
      {
        kind: 'panel',
        id: 'keywordTemplates.panel',
        title: 'Keyword templates',
        titleKey: 'utilityPanels.keywordTemplates',
        ui: { type: 'text', text: translate(getLocalePreference(), 'utilityPanels.keywordTemplatesUi') }
      },
      {
        kind: 'command',
        id: 'agentEditor.open',
        label: 'Agent editor',
        labelKey: 'utilityPanels.agentEditor',
        run: () => host.openPanel('agentEditor.panel')
      },
      {
        kind: 'panel',
        id: 'agentEditor.panel',
        title: 'Agent editor',
        titleKey: 'utilityPanels.agentEditor',
        ui: { type: 'text', text: translate(getLocalePreference(), 'utilityPanels.agentEditorUi') }
      },
      {
        kind: 'command',
        id: 'gameDataPreview.open',
        label: 'Game data preview',
        labelKey: 'utilityPanels.gameDataPreview',
        run: () => host.openPanel('gameDataPreview.panel')
      },
      {
        kind: 'panel',
        id: 'gameDataPreview.panel',
        title: 'Game data preview',
        titleKey: 'utilityPanels.gameDataPreview',
        ui: { type: 'text', text: translate(getLocalePreference(), 'utilityPanels.gameDataPreviewUi') }
      },
      {
        kind: 'command',
        id: 'attrSystem.open',
        label: 'Attribute system',
        labelKey: 'utilityPanels.attrSystem',
        run: () => host.openPanel('attrSystem.panel')
      },
      {
        kind: 'panel',
        id: 'attrSystem.panel',
        title: 'Attribute system',
        titleKey: 'utilityPanels.attrSystem',
        ui: { type: 'text', text: translate(getLocalePreference(), 'utilityPanels.attrSystemUi') }
      },
      {
        kind: 'command',
        id: 'dataDiff.open',
        label: 'Data diff',
        labelKey: 'utilityPanels.dataDiff',
        run: () => host.openPanel('dataDiff.panel')
      },
      {
        kind: 'panel',
        id: 'dataDiff.panel',
        title: 'Data diff',
        titleKey: 'utilityPanels.dataDiff',
        ui: { type: 'text', text: translate(getLocalePreference(), 'utilityPanels.dataDiffUi') }
      },
      {
        kind: 'command',
        id: 'imageGen.open',
        label: 'AI image generation',
        labelKey: 'utilityPanels.imageGen',
        run: () => host.openPanel('imageGen.panel')
      },
      {
        kind: 'panel',
        id: 'imageGen.panel',
        title: 'AI image generation',
        titleKey: 'utilityPanels.imageGen',
        ui: { type: 'text', text: translate(getLocalePreference(), 'utilityPanels.imageGenUi') }
      }
    ]
  }
}
