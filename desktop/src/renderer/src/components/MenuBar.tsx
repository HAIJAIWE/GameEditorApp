import { useEffect, useRef, useState } from 'react'

import type { EngineExportInput } from '../../../shared/schemas'
import LibraryBar from './LibraryBar'
import LucideIcon from './LucideIcon'

/** 目标引擎枚举（与主进程 `engine:exportData` 的 zod 契约同源） */
type EngineTarget = EngineExportInput['engine']

/**
 * 顶部菜单栏（对齐 PyQt `ui/menus.py` 的 MENU_CONFIG + `ui/main_window.py` 的角部件）。
 *
 * 设计取舍：
 * - 菜单栏是整个应用**唯一的能力入口**（对齐 PyQt：无侧栏，能力全在菜单里）。
 * - **全部菜单项均已接线**（E37 起分批清理 `notImplemented` 占位，E57 收掉最后两项 → 见
 *   `menuTree` 里「内容关联」位置的注释）。菜单里**不存在**「点了只报尚未实现」的占位项，
 *   故 `notImplemented` 这个动作与对应的占位机制已一并移除 —— 今后新能力要么接线、要么不进菜单。
 * - 菜单栏**右侧角部件**（对齐 PyQt `menuBar().setCornerWidget`）承载库选择与
 *   「设置 / 智能体 / AI」三个强调按钮；库条（`library-bar`）自侧栏迁入此处并保持可见。
 */

export interface MenuActions {
  importJson: () => void
  importCsv: () => void
  importExcel: () => void
  exportJson: () => void
  exportCsv: () => void
  exportExcel: () => void
  batchEdit: () => void
  /** 引擎数据导出：按目标引擎走各自的渲染器与扩展名（对齐 PyQt `features/engine_export.py`） */
  engineExport: (engine: EngineTarget) => void
  /** 数据快照导出（审查件）：json = 确定性可 diff 的全量数据；csv = 单表宽表。format 经菜单项 arg 传入 */
  exportSnapshot: (format: 'json' | 'csv') => void
  /** 视图菜单：缩放 / 重载 / 开发者工具（主进程对聚焦窗口执行） */
  zoomIn: () => void
  zoomOut: () => void
  zoomReset: () => void
  reload: () => void
  toggleDevTools: () => void
  /**
   * 「打开」/「保存」—— 整个数据仓库的 JSON 文件 I/O
   * （对齐 PyQt `main_window.py:710` 的 `open_file` / `:730` 的 `save_file`）。
   *
   * ⚠️ **与 PyQt 的已知语义差异**（勿改文案掩盖）：
   * - PyQt `打开` 是**整库替换**（`data_manager.py:382` 直接 `self.data = temp_data`）并记录
   *   `current_file`；TS 的 `importLegacy` 是**按 id upsert 的合并**，不删除既有条目。
   * - PyQt `保存` 复用 `current_file`（第二次起不再问路径）；TS 每次都弹另存为对话框。
   * 补齐需新增 IPC（整库替换 + current_file 记忆），不在本轮「零新能力」范围内。
   */
  open: () => void
  /** 「保存」，与 `open` 成对，共用 `handleExportLegacy`（差异同上） */
  save: () => void
  /**
   * 「导入 → 批量导入」（PyQt `features/export.py:168` 的 `batch_import`：
   * 读 JSON 后**为每条重新生成 id** 再追加）。
   * ⚠️ TS 的 `importLegacy` 保留原 id（缺失才生成 UUID），重复导入同一文件是**幂等更新**
   * 而非「每次追加一份新副本」——与 PyQt 有行为差异，详见上方 `open` 的说明。
   */
  batchImport: () => void
  /**
   * 「导出 → 批量导出」（PyQt `features/export.py:206`：与 `export_json` **共用同一个函数**
   * `_export_data_as_json`，仅对话框标题/成功文案不同）→ 故与 `exportJson` 同实现是精确对齐。
   */
  batchExport: () => void
  backup: () => void
  undo: () => void
  redo: () => void
  quickCreate: () => void
  references: () => void
  /** 「工具 → 关系图」：表格式总览某条数据的关联数据（对齐 PyQt `relation_graph.py::RelationTablePanel`） */
  relationGraph: () => void
  dataDiff: () => void
  stats: () => void
  attrSystem: () => void
  /** 游戏数据预览（对齐 PyQt `menus.py:69`「导出 → 游戏数据预览」） */
  gameDataPreview: () => void
  /** 字段结构编辑器（TS 独有入口：该面板无 PyQt 菜单项） */
  fieldEditor: () => void
  /** 高级搜索（TS 独有入口） */
  advancedSearch: () => void
  attributeChart: () => void
  /** AI 生图（TS 独有入口） */
  imageGen: () => void
  /** 角部件「设置」按钮 **与** 菜单「设置 → 打开设置...」共用的动作（打开设置面板） */
  settings: () => void
  /** 清理未使用图片（迁移 `features/advanced.py::cleanup_unused_images`，破坏性） */
  cleanupUnusedImages: () => void
  /** AI 关键词模板配置（PyQt 只在设置面板工具页有，`menus.py` 零引用） */
  keywordTemplates: () => void
  /** 角部件「智能体」按钮（打开智能体编辑器） */
  agentEditor: () => void
  /** 角部件「AI」按钮（唤起 AI 助手） */
  aiPanel: () => void
  /** 「编辑 → 清空所有数据」：破坏性操作，交互由宿主做内联二次确认 */
  clearAll: () => void
  /** 「帮助 → 快捷键参考」 */
  shortcuts: () => void
  /** 「帮助 → 关于墨白编辑器」 */
  about: () => void
  /** 「帮助 → 快速入门」：打开引导式主页浮层（对齐 PyQt `HomeWidget`） */
  onboarding: () => void
  quit: () => void
}

interface MenuActionItem {
  type: 'action'
  label: string
  action: keyof MenuActions
  disabled?: boolean
  /**
   * 动作参数（目前仅 `engineExport` 用：四个引擎菜单项共用一个 action，
   * 靠 `arg` 区分目标引擎 —— 此前四项**全都落到 lua**，菜单文案与产物不符）。
   */
  arg?: string
  /**
   * 稳定测试锚点（E2E 用）。菜单项**全部可点**（无占位项），但仍只给「有真实行为」的项挂
   * testid：分隔符不挂。
   */
  testid?: string
}
interface MenuSeparator {
  type: 'separator'
}
/** 子菜单内不含更深一层子菜单（与 MENU_CONFIG 的层级一致） */
type MenuLeaf = MenuActionItem | MenuSeparator
interface MenuSubmenu {
  type: 'submenu'
  label: string
  items: MenuLeaf[]
}
type MenuNode = MenuActionItem | MenuSeparator | MenuSubmenu

interface MenuBarProps {
  canUndo: boolean
  canRedo: boolean
  actions: MenuActions
}

export default function MenuBar({ canUndo, canRedo, actions }: MenuBarProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (openIndex === null) return undefined
    const onDocClick = (event: MouseEvent): void => {
      if (barRef.current && !barRef.current.contains(event.target as Node)) {
        setOpenIndex(null)
      }
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpenIndex(null)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [openIndex])

  const run = (item: MenuActionItem): void => {
    if (item.action === 'engineExport') {
      // 四个引擎菜单项共用一个 action，用 arg 传目标引擎（缺省 lua 兼容旧调用）
      actions.engineExport((item.arg ?? 'lua') as EngineTarget)
    } else if (item.action === 'exportSnapshot') {
      // 两个快照菜单项共用一个 action，用 arg 传格式（缺省 json）
      actions.exportSnapshot((item.arg ?? 'json') as 'json' | 'csv')
    } else {
      ;(actions[item.action] as () => void)()
    }
    setOpenIndex(null)
  }

  const menuTree: MenuNode[][] = [
    [
      { type: 'action', label: '打开', action: 'open', testid: 'menuitem-file-open' },
      { type: 'action', label: '保存', action: 'save', testid: 'menuitem-file-save' },
      { type: 'separator' },
      {
        type: 'submenu',
        label: '导入',
        items: [
          { type: 'action', label: '导入 JSON', action: 'importJson', testid: 'menuitem-file-importJson' },
          { type: 'action', label: '导入 CSV', action: 'importCsv', testid: 'menuitem-file-importCsv' },
          { type: 'action', label: '导入 Excel', action: 'importExcel', testid: 'menuitem-file-importExcel' },
          { type: 'separator' },
          { type: 'action', label: '批量导入', action: 'batchImport', testid: 'menuitem-file-batchImport' }
        ]
      },
      {
        type: 'submenu',
        label: '导出',
        items: [
          { type: 'action', label: '导出 JSON', action: 'exportJson', testid: 'menuitem-file-exportJson' },
          { type: 'action', label: '导出 CSV', action: 'exportCsv', testid: 'menuitem-file-exportCsv' },
          { type: 'action', label: '导出 Excel', action: 'exportExcel', testid: 'menuitem-file-exportExcel' },
          { type: 'separator' },
          { type: 'action', label: '批量导出', action: 'batchExport', testid: 'menuitem-file-batchExport' },
          { type: 'action', label: '批量编辑', action: 'batchEdit', testid: 'menuitem-file-batchEdit' },
          { type: 'separator' },
          { type: 'action', label: '导出游戏数据', action: 'exportJson', testid: 'menuitem-file-exportGameData' },
          { type: 'separator' },
          { type: 'action', label: '导出为 Lua 格式', action: 'engineExport', arg: 'lua', testid: 'menuitem-file-exportLua' },
          { type: 'action', label: '导出为 Unity 格式', action: 'engineExport', arg: 'unity', testid: 'menuitem-file-exportUnity' },
          { type: 'action', label: '导出为 Unreal 格式', action: 'engineExport', arg: 'unreal', testid: 'menuitem-file-exportUnreal' },
          { type: 'action', label: '导出为 Godot 格式', action: 'engineExport', arg: 'godot', testid: 'menuitem-file-exportGodot' },
          { type: 'action', label: '导出为 Cocos2d 格式', action: 'engineExport', arg: 'cocos2d', testid: 'menuitem-file-exportCocos' },
          { type: 'separator' },
          { type: 'action', label: '导出数据快照 (JSON)', action: 'exportSnapshot', arg: 'json', testid: 'menuitem-file-exportSnapshotJson' },
          { type: 'action', label: '导出数据快照 (CSV)', action: 'exportSnapshot', arg: 'csv', testid: 'menuitem-file-exportSnapshotCsv' },
          { type: 'separator' },
          { type: 'action', label: '游戏数据预览', action: 'gameDataPreview', testid: 'menuitem-file-gameDataPreview' }
        ]
      },
      { type: 'separator' },
      { type: 'action', label: '备份管理', action: 'backup', testid: 'menuitem-file-backup' },
      { type: 'separator' },
      { type: 'action', label: '退出', action: 'quit', testid: 'menuitem-file-quit' }
    ],
    [
      { type: 'action', label: '撤销 (Ctrl+Z)', action: 'undo', disabled: !canUndo, testid: 'menuitem-edit-undo' },
      { type: 'action', label: '重做 (Ctrl+Y)', action: 'redo', disabled: !canRedo, testid: 'menuitem-edit-redo' },
      { type: 'separator' },
      { type: 'action', label: '模板管理', action: 'fieldEditor', testid: 'menuitem-edit-templateManager' },
      { type: 'separator' },
      { type: 'action', label: '清空所有数据', action: 'clearAll', testid: 'menuitem-edit-clearAll' }
    ],
    [
      { type: 'action', label: '快速创建向导', action: 'quickCreate', testid: 'menuitem-tools-quickCreate' },
      { type: 'action', label: '批量修改数据', action: 'batchEdit', testid: 'menuitem-tools-batchEdit' },
      { type: 'action', label: '数据关联预览', action: 'references', testid: 'menuitem-tools-references' },
      { type: 'separator' },
      { type: 'action', label: '关系图', action: 'relationGraph', testid: 'menuitem-tools-relationGraph' },
      { type: 'action', label: '数据对比', action: 'dataDiff', testid: 'menuitem-tools-dataDiff' },
      { type: 'separator' },
      {
        type: 'submenu',
        label: '数据分析',
        items: [
          { type: 'action', label: '属性分布图表', action: 'attributeChart', testid: 'menuitem-tools-attributeChart' },
          { type: 'action', label: '平衡性分析工具', action: 'stats', testid: 'menuitem-tools-balance' },
          { type: 'action', label: '游戏数据统计', action: 'stats', testid: 'menuitem-tools-stats' }
        ]
      },
      /*
       * 原「内容关联」子菜单两项（内容关联管理 / 关联可视化）**已删除**（E57）。
       * 依据：PyQt `features/advanced.py:30-45` 两个 handler **函数体完全相同**，都是
       * `ReferencePanel(dm, "", "", mw)`（**空 type / 空 id**），而 `reference_panel.py::_find_item()`
       * 对空 type 必然返回 `None` ⇒ 该对话框**任何情况下只渲染「未找到该数据」**，是死入口。
       * 其能力面已由两条真实入口覆盖：`references`（「数据关联预览」，按目标看引用）+
       * `relationGraph`（「关系图」，按类型/主体浏览关联）。**不保留占位项**（点了报「尚未实现」= 假控件）。
       */
      { type: 'separator' },
      { type: 'action', label: '属性系统编辑器', action: 'attrSystem', testid: 'menuitem-tools-attrSystem' },
      { type: 'action', label: '字段结构编辑器', action: 'fieldEditor', testid: 'menuitem-tools-fieldEditor' },
      { type: 'action', label: '高级搜索', action: 'advancedSearch', testid: 'menuitem-tools-advancedSearch' },
      { type: 'action', label: 'AI 生图', action: 'imageGen', testid: 'menuitem-tools-imageGen' },
      { type: 'action', label: '清理未使用图片', action: 'cleanupUnusedImages', testid: 'menuitem-tools-cleanupUnusedImages' },
      { type: 'action', label: '关键词模板配置', action: 'keywordTemplates', testid: 'menuitem-tools-keywordTemplates' }
    ],
    [
      { type: 'action', label: '放大', action: 'zoomIn', testid: 'menuitem-view-zoomIn' },
      { type: 'action', label: '缩小', action: 'zoomOut', testid: 'menuitem-view-zoomOut' },
      { type: 'action', label: '重置缩放', action: 'zoomReset', testid: 'menuitem-view-zoomReset' },
      { type: 'separator' },
      { type: 'action', label: '重新加载', action: 'reload', testid: 'menuitem-view-reload' },
      { type: 'action', label: '开发者工具', action: 'toggleDevTools', testid: 'menuitem-view-devtools' }
    ],
    [{ type: 'action', label: '打开设置...', action: 'settings', testid: 'menuitem-settings-open' }],
    [
      { type: 'action', label: '快速入门', action: 'onboarding', testid: 'menuitem-help-onboarding' },
      { type: 'action', label: '快捷键参考', action: 'shortcuts', testid: 'menuitem-help-shortcuts' },
      { type: 'separator' },
      { type: 'action', label: '关于墨白编辑器', action: 'about', testid: 'menuitem-help-about' }
    ]
  ]

  return (
    <div className="menubar" ref={barRef}>
      {menuTree.map((items, idx) => (
        <div className="menu" key={idx}>
          <button
            type="button"
            className={`menu-title${openIndex === idx ? ' open' : ''}`}
            data-testid={MENU_TITLE_TESTIDS[idx]}
            onClick={() => setOpenIndex(openIndex === idx ? null : idx)}
            onMouseEnter={() => {
              if (openIndex !== null) setOpenIndex(idx)
            }}
          >
            {MENU_TITLES[idx]}
          </button>
          {openIndex === idx && (
            <div className="menu-dropdown" role="menu">
              {items.map((node, nIdx) =>
                node.type === 'separator' ? (
                  <div className="menu-separator" key={nIdx} />
                ) : node.type === 'submenu' ? (
                  <div className="menu-submenu" key={nIdx}>
                    <div className="menu-submenu-label">{node.label}</div>
                    <div className="menu-submenu-items">
                      {node.items.map((sub, sIdx) =>
                        sub.type === 'separator' ? (
                          <div className="menu-separator" key={sIdx} />
                        ) : (
                          <button
                            type="button"
                            key={sIdx}
                            className="menu-item"
                            data-testid={sub.testid}
                            disabled={sub.disabled}
                            onClick={() => run(sub)}
                          >
                            {sub.label}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    key={nIdx}
                    className="menu-item"
                    data-testid={node.testid}
                    disabled={node.disabled}
                    onClick={() => run(node)}
                  >
                    {node.label}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      ))}

      {/* 右侧角部件（对齐 PyQt `menuBar().setCornerWidget`）：库标签 + 库条 + 设置/智能体/AI */}
      <div className="menubar-right">
        <span className="menubar-label">当前库:</span>
        <LibraryBar />
        <button
          type="button"
          className="btn slim"
          data-testid="menubar-settings"
          onClick={() => actions.settings()}
        >
          <LucideIcon name="settings" size={14} />
          设置
        </button>
        <button
          type="button"
          className="btn slim"
          data-testid="menubar-agent"
          onClick={() => actions.agentEditor()}
        >
          <LucideIcon name="brain" size={14} />
          智能体
        </button>
        <button type="button" className="btn slim primary" data-testid="menubar-ai" onClick={() => actions.aiPanel()}>
          <LucideIcon name="bot" size={14} />
          AI
        </button>
      </div>
    </div>
  )
}

const MENU_TITLES = ['文件', '编辑', '工具', '视图', '设置', '帮助']

/** 菜单标题的稳定测试锚点：与 MENU_TITLES **同序**按 idx 取用（不做中文转写） */
const MENU_TITLE_TESTIDS = [
  'menu-title-file',
  'menu-title-edit',
  'menu-title-tools',
  'menu-title-view',
  'menu-title-settings',
  'menu-title-help'
]
