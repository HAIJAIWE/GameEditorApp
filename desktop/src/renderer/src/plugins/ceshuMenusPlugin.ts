import type { PluginHost } from '../../../shared/plugin/host'
import type { PluginManifest, PluginMenuItem } from '../../../shared/plugin/types'
import {
  editorAutoFill,
  editorExportHandoff,
  editorExportProject,
  editorShowChangelog,
  editorShowReadiness
} from './ceshuEditorBridge'

/**
 * 编辑器「更多 ▸」下拉菜单插件化（Slice 16）。
 *
 * 原来这 18 项写死在 CeshuView 的 `moreMenuGroups`（含 4 组、组间分隔）。现在：
 * - **菜单结构**由 `menu` 能力声明，挂载点 `ceshu.toolbar`，由 `<MenuMount>` 在工具栏渲染；
 * - **动作**拆成 18 条 command：视图类直接 `host.openView(id)`，非视图类走 `ceshuEditorBridge`。
 *
 * 分隔符 = 既无 `command` 也无 `items` 的条目（契约约定），`MenuMount` 据此切成组。
 */
export function defineCeshuMenusPlugin(host: PluginHost): PluginManifest {
  /** 视图类动作：打开对应视图；视图插件被禁用时静默 */
  const openView = (id: string) => () => {
    try {
      host.openView(id)
    } catch {
      /* 视图插件未启用：静默 */
    }
  }

  const SEP: PluginMenuItem = { label: '' }

  const items: PluginMenuItem[] = [
    { label: '派生新版本', command: 'ceshuMenu.derive', testid: 'ceshu-derive' },
    { label: 'AI 审阅', command: 'ceshuMenu.aiReview', testid: 'ceshu-ai-review' },
    SEP,
    { label: '预设市场', command: 'ceshuMenu.presetMarket', testid: 'ceshu-preset-market' },
    { label: '模板编辑器', command: 'ceshuMenu.templateEditor', testid: 'ceshu-template-editor' },
    SEP,
    { label: '开发路线', command: 'ceshuMenu.route', testid: 'ceshu-route' },
    { label: '开发体检', command: 'ceshuMenu.health', testid: 'ceshu-health' },
    { label: '完备度', command: 'ceshuMenu.readiness', testid: 'ceshu-readiness' },
    { label: '补全空白字段', command: 'ceshuMenu.autofill', testid: 'ceshu-autofill' },
    { label: '版本对比', command: 'ceshuMenu.diff', testid: 'ceshu-diff' },
    { label: '版本时间线', command: 'ceshuMenu.timeline', testid: 'ceshu-timeline' },
    { label: '变更记录', command: 'ceshuMenu.changelog', testid: 'ceshu-changelog' },
    { label: '数据引用', command: 'ceshuMenu.dataRefs', testid: 'ceshu-datarefs' },
    { label: '迁移预览（只读）', command: 'ceshuMenu.migration', testid: 'ceshu-migration-preview' },
    { label: 'AI 消费提示词', command: 'ceshuMenu.consume', testid: 'ceshu-consume-prompt' },
    { label: '导入 AI 结果', command: 'ceshuMenu.import', testid: 'ceshu-import-patch' },
    { label: '导出项目文件夹', command: 'ceshuMenu.exportProject', testid: 'ceshu-export-project' },
    { label: '导出开发交接包', command: 'ceshuMenu.exportHandoff', testid: 'ceshu-export-handoff' },
    SEP,
    { label: '笔记', command: 'ceshuMenu.notes', testid: 'ceshu-notes' }
  ]

  return {
    id: 'ceshu-menus',
    name: 'ceshu-menus',
    version: '0.1.0',
    description: '编辑器「更多」下拉菜单（menu 能力，挂 ceshu.toolbar）+ 18 条命令',
    meta: { label: '编辑器菜单', icon: '☰', description: '工具栏「更多 ▸」的菜单结构与动作' },
    capabilities: [
      // —— 视图类 ——
      { kind: 'command', id: 'ceshuMenu.derive', label: '派生新版本', run: openView('derive.view') },
      { kind: 'command', id: 'ceshuMenu.aiReview', label: 'AI 审阅', run: openView('aiReview.view') },
      { kind: 'command', id: 'ceshuMenu.presetMarket', label: '预设市场', run: openView('presetMarket.view') },
      { kind: 'command', id: 'ceshuMenu.templateEditor', label: '模板编辑器', run: openView('templateEditor.view') },
      { kind: 'command', id: 'ceshuMenu.route', label: '开发路线', run: openView('route.view') },
      { kind: 'command', id: 'ceshuMenu.health', label: '开发体检', run: openView('health.view') },
      { kind: 'command', id: 'ceshuMenu.diff', label: '版本对比', run: openView('diff.view') },
      { kind: 'command', id: 'ceshuMenu.timeline', label: '版本时间线', run: openView('timeline.view') },
      { kind: 'command', id: 'ceshuMenu.dataRefs', label: '数据引用', run: openView('dataRefs.view') },
      { kind: 'command', id: 'ceshuMenu.migration', label: '迁移预览', run: openView('migration.view') },
      { kind: 'command', id: 'ceshuMenu.consume', label: 'AI 消费提示词', run: openView('consume.view') },
      { kind: 'command', id: 'ceshuMenu.import', label: '导入 AI 结果', run: openView('import.view') },
      { kind: 'command', id: 'ceshuMenu.notes', label: '笔记', run: openView('notes.view') },
      // —— 非视图类（走编辑器桥）——
      { kind: 'command', id: 'ceshuMenu.readiness', label: '完备度', run: () => editorShowReadiness() },
      { kind: 'command', id: 'ceshuMenu.autofill', label: '补全空白字段', run: () => editorAutoFill() },
      { kind: 'command', id: 'ceshuMenu.changelog', label: '变更记录', run: () => editorShowChangelog() },
      { kind: 'command', id: 'ceshuMenu.exportProject', label: '导出项目文件夹', run: () => editorExportProject() },
      { kind: 'command', id: 'ceshuMenu.exportHandoff', label: '导出开发交接包', run: () => editorExportHandoff() },
      // —— 菜单结构 ——
      { kind: 'menu', id: 'menu.ceshuMore', menu: '更多', mount: 'ceshu.toolbar', order: 10, items }
    ]
  }
}
