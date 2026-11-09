import type { PluginHost } from '@mobai/shared/plugin/host'
import type { PluginManifest, PluginMenuItem } from '@mobai/shared/plugin/types'
import { CESHU_CONTENT_MOUNT } from './ceshuViewContext'
import {
  editorAutoFill,
  editorExportHandoff,
  editorExportProject,
  editorShowChangelog,
  editorShowReadiness,
  editorStartAiDev
} from './ceshuEditorBridge'

/**
 * 编辑器「更多 ▸」下拉菜单插件化（Slice 16）。
 *
 * 原来这 18 项写死在 CeshuView 的 `moreMenuGroups`（含 4 组、组间分隔）。现在：
 * - **菜单结构**由 `menu` 能力声明，挂载点 `ceshu.toolbar`，由 `<MenuMount>` 在工具栏渲染；
 * - **动作**拆成 20 条 command：视图类直接 `host.openView(id)`，非视图类走 `ceshuEditorBridge`。
 *   第 19 条 `ceshuMenu.startAiDev` 是 2026-11-09 新增：导出交接包的同一动作顺带预填派工单；
 *   第 20 条 `ceshuMenu.workBoard` 同日新增：施工看板（一次看清几十份文档的工序状态与下一份）。
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

  /**
   * 施工看板是**产出物页签**（`ceshu.artifact`），不是内容槽。
   * 但菜单可能是在内容槽视图（如变更记录）开着时点的——那时左栏/工作区整块被替换，
   * 产出物视图即使激活也渲染不出来。所以先把内容槽关掉，再切到产出物页签。
   */
  const openWorkBoard = () => {
    try {
      host.closeView(CESHU_CONTENT_MOUNT)
      host.openView('workboard.view')
    } catch {
      /* 视图插件未启用：静默 */
    }
  }

  const SEP: PluginMenuItem = { label: '' }

  const items: PluginMenuItem[] = [
    { labelKey: 'ceshuMore.derive', command: 'ceshuMenu.derive', testid: 'ceshu-derive' },
    { labelKey: 'ceshuMore.aiReview', command: 'ceshuMenu.aiReview', testid: 'ceshu-ai-review' },
    SEP,
    { labelKey: 'ceshuMore.presetMarket', command: 'ceshuMenu.presetMarket', testid: 'ceshu-preset-market' },
    { labelKey: 'ceshuMore.templateEditor', command: 'ceshuMenu.templateEditor', testid: 'ceshu-template-editor' },
    SEP,
    { labelKey: 'ceshuMore.route', command: 'ceshuMenu.route', testid: 'ceshu-route' },
    { labelKey: 'ceshuMore.health', command: 'ceshuMenu.health', testid: 'ceshu-health' },
    { labelKey: 'ceshuMore.readiness', command: 'ceshuMenu.readiness', testid: 'ceshu-readiness' },
    { labelKey: 'ceshuMore.autofill', command: 'ceshuMenu.autofill', testid: 'ceshu-autofill' },
    { labelKey: 'ceshuMore.diff', command: 'ceshuMenu.diff', testid: 'ceshu-diff' },
    { labelKey: 'ceshuMore.timeline', command: 'ceshuMenu.timeline', testid: 'ceshu-timeline' },
    { labelKey: 'ceshuMore.changelog', command: 'ceshuMenu.changelog', testid: 'ceshu-changelog' },
    { labelKey: 'ceshuMore.dataRefs', command: 'ceshuMenu.dataRefs', testid: 'ceshu-datarefs' },
    { labelKey: 'ceshuMore.migration', command: 'ceshuMenu.migration', testid: 'ceshu-migration-preview' },
    { labelKey: 'ceshuMore.consume', command: 'ceshuMenu.consume', testid: 'ceshu-consume-prompt' },
    { labelKey: 'ceshuMore.import', command: 'ceshuMenu.import', testid: 'ceshu-import-patch' },
    { labelKey: 'ceshuMore.exportProject', command: 'ceshuMenu.exportProject', testid: 'ceshu-export-project' },
    { labelKey: 'ceshuMore.exportHandoff', command: 'ceshuMenu.exportHandoff', testid: 'ceshu-export-handoff' },
    { labelKey: 'ceshuMore.startAiDev', command: 'ceshuMenu.startAiDev', testid: 'ceshu-start-ai-dev' },
    { labelKey: 'ceshuMore.workBoard', command: 'ceshuMenu.workBoard', testid: 'ceshu-work-board' },
    SEP,
    { labelKey: 'ceshuMore.notes', command: 'ceshuMenu.notes', testid: 'ceshu-notes' }
  ]

  return {
    id: 'ceshu-menus',
    name: 'ceshu-menus',
    version: '0.1.0',
    description: 'Editor "More" dropdown menu (menu capability on ceshu.toolbar) with 20 commands',
    meta: { labelKey: 'ceshuMenus.metaLabel', icon: '☰', descriptionKey: 'ceshuMenus.metaDescription' },
    capabilities: [
      // —— 视图类 ——
      { kind: 'command', id: 'ceshuMenu.derive', label: 'Derive new version', labelKey: 'ceshuMore.derive', run: openView('derive.view') },
      { kind: 'command', id: 'ceshuMenu.aiReview', label: 'AI review', labelKey: 'ceshuMore.aiReview', run: openView('aiReview.view') },
      { kind: 'command', id: 'ceshuMenu.presetMarket', label: 'Preset market', labelKey: 'ceshuMore.presetMarket', run: openView('presetMarket.view') },
      { kind: 'command', id: 'ceshuMenu.templateEditor', label: 'Template editor', labelKey: 'ceshuMore.templateEditor', run: openView('templateEditor.view') },
      { kind: 'command', id: 'ceshuMenu.route', label: 'Development roadmap', labelKey: 'ceshuMore.route', run: openView('route.view') },
      { kind: 'command', id: 'ceshuMenu.health', label: 'Development health check', labelKey: 'ceshuMore.health', run: openView('health.view') },
      { kind: 'command', id: 'ceshuMenu.diff', label: 'Version diff', labelKey: 'ceshuMore.diff', run: openView('diff.view') },
      { kind: 'command', id: 'ceshuMenu.timeline', label: 'Version timeline', labelKey: 'ceshuMore.timeline', run: openView('timeline.view') },
      { kind: 'command', id: 'ceshuMenu.dataRefs', label: 'Data references', labelKey: 'ceshuMore.dataRefs', run: openView('dataRefs.view') },
      { kind: 'command', id: 'ceshuMenu.migration', label: 'Migration preview', labelKey: 'ceshuMore.migration', run: openView('migration.view') },
      { kind: 'command', id: 'ceshuMenu.consume', label: 'AI consume prompt', labelKey: 'ceshuMore.consume', run: openView('consume.view') },
      { kind: 'command', id: 'ceshuMenu.import', label: 'Import AI result', labelKey: 'ceshuMore.import', run: openView('import.view') },
      { kind: 'command', id: 'ceshuMenu.notes', label: 'Notes', labelKey: 'ceshuMore.notes', run: openView('notes.view') },
      // —— 非视图类（走编辑器桥）——
      { kind: 'command', id: 'ceshuMenu.readiness', label: 'Readiness', labelKey: 'ceshuMore.readiness', run: () => editorShowReadiness() },
      { kind: 'command', id: 'ceshuMenu.autofill', label: 'Autofill empty fields', labelKey: 'ceshuMore.autofill', run: () => editorAutoFill() },
      { kind: 'command', id: 'ceshuMenu.changelog', label: 'Changelog', labelKey: 'ceshuMore.changelog', run: () => editorShowChangelog() },
      { kind: 'command', id: 'ceshuMenu.exportProject', label: 'Export project folder', labelKey: 'ceshuMore.exportProject', run: () => editorExportProject() },
      { kind: 'command', id: 'ceshuMenu.exportHandoff', label: 'Export handoff bundle', labelKey: 'ceshuMore.exportHandoff', run: () => editorExportHandoff() },
      { kind: 'command', id: 'ceshuMenu.startAiDev', label: 'Start AI development', labelKey: 'ceshuMore.startAiDev', run: () => editorStartAiDev() },
      { kind: 'command', id: 'ceshuMenu.workBoard', label: 'Work board', labelKey: 'ceshuMore.workBoard', run: openWorkBoard },
      // —— 菜单结构 ——
      { kind: 'menu', id: 'menu.ceshuMore', menuKey: 'common.more', mount: 'ceshu.toolbar', order: 10, items }
    ]
  }
}