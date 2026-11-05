import type { MessageKey } from '@mobai/shared/i18n'
import type { PluginHost } from '@mobai/shared/plugin/host'
import type { PluginManifest, PluginMenuItem } from '@mobai/shared/plugin/types'

/**
 * 菜单结构插件（B 方案 Slice 9）。
 *
 * 以前 `MenuBar.tsx` 里内嵌一棵 6 菜单的静态树（35 个条目 + 子菜单 + 分隔符），
 * App 另持有一张 35 项的动作映射表。现在**菜单结构本身**也是插件声明的：
 * 一个 manifest 带 6 个 `menu` 能力，条目只写「文案键 + command id」。
 *
 * 三个设计点：
 * 1. **合并**：同一 `menuKey` 的多个能力由宿主合并（未来某个插件要往「工具」里加一项，
 *    自己声明 `menuKey:'menu.tools'` 即可，不用改这里）。
 * 2. **禁用态**：`undo` / `redo` 用 `disabledWhen` 声明「按宿主状态判」，状态由
 *    `menuState.ts` 注入——manifest 保持可序列化。
 * 3. **同实现多标签**：`打开` 与 `导入 JSON`、`保存` 与 `导出 JSON` 历史上就是同一对 handler
 *    （见 MenuBar 旧注释），这里指向同一命令，**不趁机改语义**。
 *
 * 文案走 `labelKey` / `menuKey`（不是中文字面量）：渲染层用 `t(key)` 翻译，
 * 切语言即时生效。`label` / `menu` 只留给不接 i18n 的外部插件做回退。
 */

const sep: PluginMenuItem = { label: '—' }

function item(labelKey: MessageKey, command: string, testid: string, disabledWhen?: string): PluginMenuItem {
  return { labelKey, command, testid, disabledWhen }
}

export function defineMenusPlugin(_host: PluginHost): PluginManifest {
  return {
    id: 'menus',
    name: 'menus',
    version: '0.1.0',
    description: 'Menu structure (File / Edit / Tools / View / Settings / Help)',
    meta: {
      label: 'Menus',
      icon: '📋',
      description: 'Declares top-level menus and items as menu capabilities; App no longer holds an action map'
    },
    capabilities: [
      {
        kind: 'menu',
        id: 'menu.file',
        menuKey: 'menu.file',
        order: 10,
        items: [
          item('menu.file.open', 'app.io.open', 'menuitem-file-open'),
          item('menu.file.save', 'app.io.save', 'menuitem-file-save'),
          sep,
          {
            labelKey: 'menu.file.import',
            items: [
              item('menu.file.importJson', 'app.io.open', 'menuitem-file-importJson'),
              item('menu.file.importCsv', 'app.io.importCsv', 'menuitem-file-importCsv'),
              item('menu.file.importExcel', 'app.io.importExcel', 'menuitem-file-importExcel'),
              sep,
              item('menu.file.batchImport', 'app.io.batchImport', 'menuitem-file-batchImport')
            ]
          },
          {
            labelKey: 'menu.file.export',
            items: [
              item('menu.file.exportJson', 'app.io.save', 'menuitem-file-exportJson'),
              item('menu.file.exportCsv', 'app.io.exportCsv', 'menuitem-file-exportCsv'),
              item('menu.file.exportExcel', 'app.io.exportExcel', 'menuitem-file-exportExcel'),
              sep,
              item('menu.file.batchExport', 'app.io.batchExport', 'menuitem-file-batchExport'),
              sep,
              // 「批量编辑」不属于导出动作 → 只保留「工具 → 批量编辑」。
              // 「导出游戏数据」与「导出 JSON」实现相同（都是 app.io.save → exportJson）
              // → 删除误导性重复项；若将来要真正导出运行态游戏数据，应新增独立命令。
              item('menu.file.exportLua', 'app.io.engineExport.lua', 'menuitem-file-exportLua'),
              item('menu.file.exportUnity', 'app.io.engineExport.unity', 'menuitem-file-exportUnity'),
              item('menu.file.exportUnreal', 'app.io.engineExport.unreal', 'menuitem-file-exportUnreal'),
              item('menu.file.exportGodot', 'app.io.engineExport.godot', 'menuitem-file-exportGodot'),
              item('menu.file.exportCocos', 'app.io.engineExport.cocos2d', 'menuitem-file-exportCocos'),
              sep,
              item('menu.file.snapshotJson', 'app.io.snapshot.json', 'menuitem-file-exportSnapshotJson'),
              item('menu.file.snapshotCsv', 'app.io.snapshot.csv', 'menuitem-file-exportSnapshotCsv'),
              sep,
              item('menu.file.gameDataPreview', 'gameDataPreview.open', 'menuitem-file-gameDataPreview')
            ]
          },
          sep,
          item('menu.file.backup', 'backup.open', 'menuitem-file-backup'),
          sep,
          item('menu.file.quit', 'app.quit', 'menuitem-file-quit')
        ]
      },
      {
        kind: 'menu',
        id: 'menu.edit',
        menuKey: 'menu.edit',
        order: 20,
        items: [
          item('menu.edit.undo', 'app.undo', 'menuitem-edit-undo', 'undo'),
          item('menu.edit.redo', 'app.redo', 'menuitem-edit-redo', 'redo'),
          sep,
          // 「模板管理」与「工具 → 字段结构编辑器」是同一面板（typeEditor.open）→
          // 只保留工具菜单里的那一个，避免两个名字指同一窗口。
          item('menu.edit.clearAll', 'clearAll.open', 'menuitem-edit-clearAll')
        ]
      },
      {
        kind: 'menu',
        id: 'menu.tools',
        menuKey: 'menu.tools',
        order: 30,
        items: [
          item('menu.tools.quickCreate', 'quickCreate.open', 'menuitem-tools-quickCreate'),
          item('menu.tools.batchEdit', 'batch.open', 'menuitem-tools-batchEdit'),
          item('menu.tools.references', 'references.open', 'menuitem-tools-references'),
          sep,
          item('menu.tools.relationGraph', 'relationGraph.open', 'menuitem-tools-relationGraph'),
          item('menu.tools.dataDiff', 'dataDiff.open', 'menuitem-tools-dataDiff'),
          sep,
          {
            labelKey: 'menu.tools.dataAnalysis',
            items: [
              item('menu.tools.attributeChart', 'attributeChart.open', 'menuitem-tools-attributeChart'),
              item('menu.tools.balance', 'statistics.openBalance', 'menuitem-tools-balance'),
              item('menu.tools.stats', 'statistics.open', 'menuitem-tools-stats')
            ]
          },
          /*
           * 原「内容关联」子菜单两项已删除（E57）：旧版两个 handler 函数体完全相同，
           * 都是空 type/空 id 的 ReferencePanel ⇒ 任何情况下只渲染「未找到该数据」，是死入口。
           * 能力面已由 `references` + `relationGraph` 覆盖。**不保留占位项**。
           */
          sep,
          item('menu.tools.attrSystem', 'attrSystem.open', 'menuitem-tools-attrSystem'),
          item('menu.tools.fieldEditor', 'typeEditor.open', 'menuitem-tools-fieldEditor'),
          item('menu.tools.advancedSearch', 'advancedSearch.open', 'menuitem-tools-advancedSearch'),
          item('menu.tools.imageGen', 'imageGen.open', 'menuitem-tools-imageGen'),
          item('menu.tools.cleanupUnusedImages', 'cleanupImages.open', 'menuitem-tools-cleanupUnusedImages'),
          item('menu.tools.keywordTemplates', 'keywordTemplates.open', 'menuitem-tools-keywordTemplates'),
          sep,
          item('menu.tools.mcpConfig', 'mcpConfig.open', 'menuitem-tools-mcpConfig')
        ]
      },
      {
        kind: 'menu',
        id: 'menu.view',
        menuKey: 'menu.view',
        order: 40,
        items: [
          item('menu.view.zoomIn', 'app.zoomIn', 'menuitem-view-zoomIn'),
          item('menu.view.zoomOut', 'app.zoomOut', 'menuitem-view-zoomOut'),
          item('menu.view.zoomReset', 'app.zoomReset', 'menuitem-view-zoomReset'),
          sep,
          item('menu.view.reload', 'app.reload', 'menuitem-view-reload'),
          item('menu.view.devtools', 'app.toggleDevTools', 'menuitem-view-devtools')
        ]
      },
      {
        kind: 'menu',
        id: 'menu.settings',
        menuKey: 'menu.settings',
        order: 50,
        items: [item('menu.settings.open', 'settings.open', 'menuitem-settings-open')]
      },
      {
        kind: 'menu',
        id: 'menu.help',
        menuKey: 'menu.help',
        order: 60,
        items: [
          item('menu.help.onboarding', 'onboarding.open', 'menuitem-help-onboarding'),
          item('menu.help.shortcuts', 'shortcuts.open', 'menuitem-help-shortcuts'),
          sep,
          item('menu.help.about', 'about.open', 'menuitem-help-about')
        ]
      }
    ]
  }
}
