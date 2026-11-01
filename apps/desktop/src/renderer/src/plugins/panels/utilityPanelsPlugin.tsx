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
    description: '低风险工具面板包（设置 / 图片清理 / 关键词模板 / 智能体编辑 / 数据预览 / 属性系统 / 数据差异 / 生图）',
    meta: {
      label: '工具面板',
      icon: '🧰',
      description: '8 个不依赖 App 状态的面板，经宿主渲染（bundle 形态样例）'
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
      },
      {
        kind: 'command',
        id: 'attrSystem.open',
        label: '属性系统',
        run: () => host.openPanel('attrSystem.panel')
      },
      {
        kind: 'panel',
        id: 'attrSystem.panel',
        title: '属性系统',
        ui: { type: 'text', text: '属性公式、成长曲线与战力计算' }
      },
      {
        kind: 'command',
        id: 'dataDiff.open',
        label: '数据差异',
        run: () => host.openPanel('dataDiff.panel')
      },
      {
        kind: 'panel',
        id: 'dataDiff.panel',
        title: '数据差异',
        ui: { type: 'text', text: '库内数据与策划书快照的差异对比' }
      },
      {
        kind: 'command',
        id: 'imageGen.open',
        label: 'AI 生图',
        run: () => host.openPanel('imageGen.panel')
      },
      {
        kind: 'panel',
        id: 'imageGen.panel',
        title: 'AI 生图',
        ui: { type: 'text', text: '按提示词生成美术参考图' }
      }
    ]
  }
}
