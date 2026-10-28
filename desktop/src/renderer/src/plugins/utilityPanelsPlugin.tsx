import type { PluginHost } from '../../../shared/plugin/host'
import type { PluginManifest } from '../../../shared/plugin/types'
import AgentEditorPanel from '../components/AgentEditorPanel'
import CleanupImagesPanel from '../components/CleanupImagesPanel'
import GameDataPreviewPanel from '../components/GameDataPreviewPanel'
import KeywordTemplatePanel from '../components/KeywordTemplatePanel'
import SettingsPanel from '../components/SettingsPanel'
import { registerReactBinding } from './reactBindings'

/**
 * 零依赖工具面板 → 插件化第四切片（B 方案 Slice 4，第一批）。
 *
 * 这 5 个面板都**不依赖任何 App 状态**（无 props、只靠自己拉数据/自己发动作），
 * 所以按 dsh 的 **bundle 形态**一次打包成一个插件：一个 manifest 带多个 `panel` 能力，
 * 而不是 5 个各含 1 个面板的插件文件——省掉重复样板，启用/禁用粒度对这类工具面板也够用。
 *
 * 需要「按面板单独开关」或需要注入参数的，仍按一片一插件的写法（见 statistics / references）。
 */
export function defineUtilityPanelsPlugin(host: PluginHost): PluginManifest {
  // 面板本身无 props（零依赖），绑定只负责转发生命周期
  registerReactBinding('settings.panel', () => <SettingsPanel />)
  registerReactBinding('cleanupImages.panel', () => <CleanupImagesPanel />)
  registerReactBinding('keywordTemplates.panel', () => <KeywordTemplatePanel />)
  registerReactBinding('agentEditor.panel', () => <AgentEditorPanel />)
  registerReactBinding('gameDataPreview.panel', () => <GameDataPreviewPanel />)

  return {
    id: 'utility-panels',
    name: 'utility-panels',
    version: '0.1.0',
    description: '零依赖工具面板包（设置 / 图片清理 / 关键词模板 / 智能体编辑 / 数据预览）',
    meta: {
      label: '工具面板',
      icon: '🧰',
      description: '5 个零依赖面板，经宿主渲染（bundle 形态样例）'
    },
    capabilities: [
      {
        kind: 'command',
        id: 'settings.open',
        label: '设置',
        run: () => host.openPanel('settings.panel')
      },
      {
        kind: 'panel',
        id: 'settings.panel',
        title: '设置',
        ui: { type: 'text', text: '模型接入、主题与本地偏好' }
      },
      {
        kind: 'command',
        id: 'cleanupImages.open',
        label: '清理未引用图片',
        run: () => host.openPanel('cleanupImages.panel')
      },
      {
        kind: 'panel',
        id: 'cleanupImages.panel',
        title: '清理未引用图片',
        ui: { type: 'text', text: '扫描库内未被引用的图片并清理' }
      },
      {
        kind: 'command',
        id: 'keywordTemplates.open',
        label: '关键词模板',
        run: () => host.openPanel('keywordTemplates.panel')
      },
      {
        kind: 'panel',
        id: 'keywordTemplates.panel',
        title: '关键词模板',
        ui: { type: 'text', text: '按类型维护 AI 生成用的关键词模板' }
      },
      {
        kind: 'command',
        id: 'agentEditor.open',
        label: '智能体编辑',
        run: () => host.openPanel('agentEditor.panel')
      },
      {
        kind: 'panel',
        id: 'agentEditor.panel',
        title: '智能体编辑',
        ui: { type: 'text', text: '查看与调整各岗位智能体的设定' }
      },
      {
        kind: 'command',
        id: 'gameDataPreview.open',
        label: '游戏数据预览',
        run: () => host.openPanel('gameDataPreview.panel')
      },
      {
        kind: 'panel',
        id: 'gameDataPreview.panel',
        title: '游戏数据预览',
        ui: { type: 'text', text: '导出前的数据落盘预览' }
      }
    ]
  }
}
