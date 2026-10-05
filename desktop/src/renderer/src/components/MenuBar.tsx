import { useEffect, useRef, useState } from 'react'

import LibraryBar from './LibraryBar'

/**
 * 顶部菜单栏（对齐 PyQt `ui/menus.py` 的 MENU_CONFIG + `ui/main_window.py` 的角部件）。
 *
 * 设计取舍：
 * - 菜单栏是整个应用**唯一的能力入口**（对齐 PyQt：无侧栏，能力全在菜单里）。
 * - 凡 TS 已有对应能力的菜单项直接接线；尚无实现的项（引擎批量导入/导出、关系图、数据分析子项、
 *   设置/帮助等）保持与 PyQt 一致的菜单结构，但点击后给出「尚未实现」的轻提示，不伪造功能。
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
  engineExport: () => void
  backup: () => void
  undo: () => void
  redo: () => void
  quickCreate: () => void
  references: () => void
  dataDiff: () => void
  stats: () => void
  attrSystem: () => void
  /** 字段结构编辑器（TS 独有入口：该面板无 PyQt 菜单项） */
  fieldEditor: () => void
  /** 高级搜索（TS 独有入口） */
  advancedSearch: () => void
  /** 数据可见类型（TS 独有入口） */
  typeVisibility: () => void
  /** AI 生图（TS 独有入口） */
  imageGen: () => void
  /** 角部件「设置」按钮 */
  settings: () => void
  /** 角部件「智能体」按钮（打开智能体编辑器） */
  agentEditor: () => void
  /** 角部件「AI」按钮（唤起 AI 助手） */
  aiPanel: () => void
  notImplemented: (label: string) => void
  quit: () => void
}

interface MenuActionItem {
  type: 'action'
  label: string
  action: keyof MenuActions
  disabled?: boolean
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
  hasSelection: boolean
  actions: MenuActions
}

export default function MenuBar({ canUndo, canRedo, hasSelection, actions }: MenuBarProps) {
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
    if (item.action === 'notImplemented') {
      actions.notImplemented(item.label)
    } else {
      actions[item.action]()
    }
    setOpenIndex(null)
  }

  const menuTree: MenuNode[][] = [
    [
      { type: 'action', label: '打开', action: 'notImplemented' },
      { type: 'action', label: '保存', action: 'notImplemented' },
      { type: 'separator' },
      {
        type: 'submenu',
        label: '导入',
        items: [
          { type: 'action', label: '导入 JSON', action: 'importJson' },
          { type: 'action', label: '导入 CSV', action: 'importCsv' },
          { type: 'action', label: '导入 Excel', action: 'importExcel' },
          { type: 'separator' },
          { type: 'action', label: '批量导入', action: 'notImplemented' }
        ]
      },
      {
        type: 'submenu',
        label: '导出',
        items: [
          { type: 'action', label: '导出 JSON', action: 'exportJson' },
          { type: 'action', label: '导出 CSV', action: 'exportCsv' },
          { type: 'action', label: '导出 Excel', action: 'exportExcel' },
          { type: 'separator' },
          { type: 'action', label: '批量导出', action: 'notImplemented' },
          { type: 'action', label: '批量编辑', action: 'batchEdit' },
          { type: 'separator' },
          { type: 'action', label: '导出游戏数据', action: 'notImplemented' },
          { type: 'separator' },
          { type: 'action', label: '导出为 Unity 格式', action: 'engineExport' },
          { type: 'action', label: '导出为 Unreal 格式', action: 'engineExport' },
          { type: 'action', label: '导出为 Godot 格式', action: 'engineExport' },
          { type: 'action', label: '导出为 Cocos2d 格式', action: 'engineExport' },
          { type: 'separator' },
          { type: 'action', label: '游戏数据预览', action: 'notImplemented' }
        ]
      },
      { type: 'separator' },
      { type: 'action', label: '备份管理', action: 'backup' },
      { type: 'separator' },
      { type: 'action', label: '退出', action: 'quit' }
    ],
    [
      { type: 'action', label: '撤销 (Ctrl+Z)', action: 'undo', disabled: !canUndo },
      { type: 'action', label: '重做 (Ctrl+Y)', action: 'redo', disabled: !canRedo },
      { type: 'separator' },
      { type: 'action', label: '模板管理', action: 'notImplemented' },
      { type: 'separator' },
      { type: 'action', label: '清空所有数据', action: 'notImplemented' }
    ],
    [
      { type: 'action', label: '快速创建向导', action: 'quickCreate' },
      { type: 'action', label: '批量修改数据', action: 'batchEdit' },
      { type: 'action', label: '数据关联预览', action: 'references', disabled: !hasSelection },
      { type: 'separator' },
      { type: 'action', label: '关系图', action: 'notImplemented' },
      { type: 'action', label: '数据对比', action: 'dataDiff' },
      { type: 'separator' },
      {
        type: 'submenu',
        label: '数据分析',
        items: [
          { type: 'action', label: '属性分布图表', action: 'notImplemented' },
          { type: 'action', label: '平衡性分析工具', action: 'notImplemented' },
          { type: 'action', label: '游戏数据统计', action: 'stats' }
        ]
      },
      {
        type: 'submenu',
        label: '内容关联',
        items: [
          { type: 'action', label: '内容关联管理', action: 'notImplemented' },
          { type: 'action', label: '关联可视化', action: 'notImplemented' }
        ]
      },
      { type: 'separator' },
      { type: 'action', label: '属性系统编辑器', action: 'attrSystem' },
      { type: 'action', label: '字段结构编辑器', action: 'fieldEditor' },
      { type: 'action', label: '高级搜索', action: 'advancedSearch' },
      { type: 'action', label: '数据可见类型', action: 'typeVisibility' },
      { type: 'action', label: 'AI 生图', action: 'imageGen' },
      { type: 'action', label: '清理未使用图片', action: 'notImplemented' }
    ],
    [{ type: 'action', label: '打开设置...', action: 'notImplemented' }],
    [
      { type: 'action', label: '快速入门', action: 'notImplemented' },
      { type: 'action', label: '快捷键参考', action: 'notImplemented' },
      { type: 'separator' },
      { type: 'action', label: '关于墨白编辑器', action: 'notImplemented' }
    ]
  ]

  return (
    <div className="menubar" ref={barRef}>
      {menuTree.map((items, idx) => (
        <div className="menu" key={idx}>
          <button
            type="button"
            className={`menu-title${openIndex === idx ? ' open' : ''}`}
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
          设置
        </button>
        <button
          type="button"
          className="btn slim"
          data-testid="menubar-agent"
          onClick={() => actions.agentEditor()}
        >
          智能体
        </button>
        <button type="button" className="btn slim primary" data-testid="menubar-ai" onClick={() => actions.aiPanel()}>
          AI
        </button>
      </div>
    </div>
  )
}

const MENU_TITLES = ['文件', '编辑', '工具', '设置', '帮助']
