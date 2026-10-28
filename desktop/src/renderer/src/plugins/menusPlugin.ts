import type { PluginHost } from '../../../shared/plugin/host'
import type { PluginManifest, PluginMenuItem } from '../../../shared/plugin/types'

/**
 * 菜单结构插件（B 方案 Slice 9）。
 *
 * 以前 `MenuBar.tsx` 里内嵌一棵 6 菜单的静态树（35 个条目 + 子菜单 + 分隔符），
 * App 另持有一张 35 项的动作映射表。现在**菜单结构本身**也是插件声明的：
 * 一个 manifest 带 6 个 `menu` 能力，条目只写「label + command id」。
 *
 * 三个设计点：
 * 1. **合并**：同一 `menu` 标题的多个能力由宿主合并（未来某个插件要往「工具」里加一项，
 *    自己声明 `menu:'工具'` 即可，不用改这里）。
 * 2. **禁用态**：`undo` / `redo` 用 `disabledWhen` 声明「按宿主状态判」，状态由
 *    `menuState.ts` 注入——manifest 保持可序列化。
 * 3. **同实现多标签**：`打开` 与 `导入 JSON`、`保存` 与 `导出 JSON` 历史上就是同一对 handler
 *    （见 MenuBar 旧注释），这里指向同一命令，**不趁机改语义**。
 */

const sep: PluginMenuItem = { label: '—' }

function item(label: string, command: string, testid: string, disabledWhen?: string): PluginMenuItem {
  return { label, command, testid, disabledWhen }
}

export function defineMenusPlugin(_host: PluginHost): PluginManifest {
  return {
    id: 'menus',
    name: 'menus',
    version: '0.1.0',
    description: '菜单结构（文件 / 编辑 / 工具 / 视图 / 设置 / 帮助）',
    meta: {
      label: '菜单',
      icon: '📋',
      description: '把顶层菜单与条目声明成 menu 能力，App 不再持有动作映射表'
    },
    capabilities: [
      {
        kind: 'menu',
        id: 'menu.file',
        menu: '文件',
        order: 10,
        items: [
          item('打开', 'app.io.open', 'menuitem-file-open'),
          item('保存', 'app.io.save', 'menuitem-file-save'),
          sep,
          {
            label: '导入',
            items: [
              item('导入 JSON', 'app.io.open', 'menuitem-file-importJson'),
              item('导入 CSV', 'app.io.importCsv', 'menuitem-file-importCsv'),
              item('导入 Excel', 'app.io.importExcel', 'menuitem-file-importExcel'),
              sep,
              item('批量导入', 'app.io.batchImport', 'menuitem-file-batchImport')
            ]
          },
          {
            label: '导出',
            items: [
              item('导出 JSON', 'app.io.save', 'menuitem-file-exportJson'),
              item('导出 CSV', 'app.io.exportCsv', 'menuitem-file-exportCsv'),
              item('导出 Excel', 'app.io.exportExcel', 'menuitem-file-exportExcel'),
              sep,
              item('批量导出', 'app.io.batchExport', 'menuitem-file-batchExport'),
              item('批量编辑', 'batch.open', 'menuitem-file-batchEdit'),
              sep,
              item('导出游戏数据', 'app.io.save', 'menuitem-file-exportGameData'),
              sep,
              item('导出为 Lua 格式', 'app.io.engineExport.lua', 'menuitem-file-exportLua'),
              item('导出为 Unity 格式', 'app.io.engineExport.unity', 'menuitem-file-exportUnity'),
              item('导出为 Unreal 格式', 'app.io.engineExport.unreal', 'menuitem-file-exportUnreal'),
              item('导出为 Godot 格式', 'app.io.engineExport.godot', 'menuitem-file-exportGodot'),
              item('导出为 Cocos2d 格式', 'app.io.engineExport.cocos2d', 'menuitem-file-exportCocos'),
              sep,
              item('导出数据快照 (JSON)', 'app.io.snapshot.json', 'menuitem-file-exportSnapshotJson'),
              item('导出数据快照 (CSV)', 'app.io.snapshot.csv', 'menuitem-file-exportSnapshotCsv'),
              sep,
              item('游戏数据预览', 'gameDataPreview.open', 'menuitem-file-gameDataPreview')
            ]
          },
          sep,
          item('备份管理', 'backup.open', 'menuitem-file-backup'),
          sep,
          item('退出', 'app.quit', 'menuitem-file-quit')
        ]
      },
      {
        kind: 'menu',
        id: 'menu.edit',
        menu: '编辑',
        order: 20,
        items: [
          item('撤销 (Ctrl+Z)', 'app.undo', 'menuitem-edit-undo', 'undo'),
          item('重做 (Ctrl+Y)', 'app.redo', 'menuitem-edit-redo', 'redo'),
          sep,
          item('模板管理', 'typeEditor.open', 'menuitem-edit-templateManager'),
          sep,
          item('清空所有数据', 'clearAll.open', 'menuitem-edit-clearAll')
        ]
      },
      {
        kind: 'menu',
        id: 'menu.tools',
        menu: '工具',
        order: 30,
        items: [
          item('快速创建向导', 'quickCreate.open', 'menuitem-tools-quickCreate'),
          item('批量修改数据', 'batch.open', 'menuitem-tools-batchEdit'),
          item('数据关联预览', 'references.open', 'menuitem-tools-references'),
          sep,
          item('关系图', 'relationGraph.open', 'menuitem-tools-relationGraph'),
          item('数据对比', 'dataDiff.open', 'menuitem-tools-dataDiff'),
          sep,
          {
            label: '数据分析',
            items: [
              item('属性分布图表', 'attributeChart.open', 'menuitem-tools-attributeChart'),
              item('平衡性分析工具', 'statistics.open', 'menuitem-tools-balance'),
              item('游戏数据统计', 'statistics.open', 'menuitem-tools-stats')
            ]
          },
          /*
           * 原「内容关联」子菜单两项已删除（E57）：旧版两个 handler 函数体完全相同，
           * 都是空 type/空 id 的 ReferencePanel ⇒ 任何情况下只渲染「未找到该数据」，是死入口。
           * 能力面已由 `references` + `relationGraph` 覆盖。**不保留占位项**。
           */
          sep,
          item('属性系统编辑器', 'attrSystem.open', 'menuitem-tools-attrSystem'),
          item('字段结构编辑器', 'typeEditor.open', 'menuitem-tools-fieldEditor'),
          item('高级搜索', 'advancedSearch.open', 'menuitem-tools-advancedSearch'),
          item('AI 生图', 'imageGen.open', 'menuitem-tools-imageGen'),
          item('清理未使用图片', 'cleanupImages.open', 'menuitem-tools-cleanupUnusedImages'),
          item('关键词模板配置', 'keywordTemplates.open', 'menuitem-tools-keywordTemplates')
        ]
      },
      {
        kind: 'menu',
        id: 'menu.view',
        menu: '视图',
        order: 40,
        items: [
          item('放大', 'app.zoomIn', 'menuitem-view-zoomIn'),
          item('缩小', 'app.zoomOut', 'menuitem-view-zoomOut'),
          item('重置缩放', 'app.zoomReset', 'menuitem-view-zoomReset'),
          sep,
          item('重新加载', 'app.reload', 'menuitem-view-reload'),
          item('开发者工具', 'app.toggleDevTools', 'menuitem-view-devtools')
        ]
      },
      {
        kind: 'menu',
        id: 'menu.settings',
        menu: '设置',
        order: 50,
        items: [item('打开设置...', 'settings.open', 'menuitem-settings-open')]
      },
      {
        kind: 'menu',
        id: 'menu.help',
        menu: '帮助',
        order: 60,
        items: [
          item('快速入门', 'onboarding.open', 'menuitem-help-onboarding'),
          item('快捷键参考', 'shortcuts.open', 'menuitem-help-shortcuts'),
          sep,
          item('关于墨白编辑器', 'about.open', 'menuitem-help-about')
        ]
      }
    ]
  }
}
