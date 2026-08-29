"""
菜单配置 — 从 main_window 拆分，独立管理
"""
from PyQt6.QtCore import QSize, Qt
from PyQt6.QtGui import QAction
from PyQt6.QtWidgets import QMenu, QPushButton

from common.lucide_icon import get_icon
from features.advanced import (
    cleanup_unused_images,
    show_attribute_charts,
    show_content_relations,
    show_relation_visualization,
    show_template_manager,
)
from features.backup import show_backup_manager
from features.engine_export import (
    export_to_cocos2d,
    export_to_godot,
    export_to_unity,
    export_to_unreal,
    show_game_data_preview,
)
from features.export import (
    batch_edit,
    batch_export,
    batch_import,
    export_csv,
    export_excel,
    export_json,
    import_csv,
    import_excel,
    import_json,
)
from features.statistics import show_balance_analysis, show_game_data_statistics
from ui.themes import theme_color

MENU_CONFIG = [
    {
        "title": "文件",
        "items": [
            {"title": "打开", "callback": "open_file"},
            {"title": "保存", "callback": "save_file"},
            {"type": "separator"},
            # P3-11: 合并所有导入入口为单一子菜单
            {"title": "导入", "type": "submenu", "items": [
                {"title": "导入 JSON", "callback": lambda mw: import_json(mw)},
                {"title": "导入 CSV", "callback": lambda mw: import_csv(mw)},
                {"title": "导入 Excel", "callback": lambda mw: import_excel(mw)},
                {"type": "separator"},
                {"title": "批量导入", "callback": lambda mw: batch_import(mw)},
            ]},
            # P3-11: 合并所有导出入口（含引擎导出）为单一子菜单
            {"title": "导出", "type": "submenu", "items": [
                {"title": "导出 JSON", "callback": lambda mw: export_json(mw)},
                {"title": "导出 CSV", "callback": lambda mw: export_csv(mw)},
                {"title": "导出 Excel", "callback": lambda mw: export_excel(mw)},
                {"type": "separator"},
                {"title": "批量导出", "callback": lambda mw: batch_export(mw)},
                {"title": "批量编辑", "callback": lambda mw: batch_edit(mw)},
                {"type": "separator"},
                {"title": "导出游戏数据", "callback": "export_game_data"},
                {"type": "separator"},
                {"title": "导出为 Unity 格式", "callback": lambda mw: export_to_unity(mw)},
                {"title": "导出为 Unreal 格式", "callback": lambda mw: export_to_unreal(mw)},
                {"title": "导出为 Godot 格式", "callback": lambda mw: export_to_godot(mw)},
                {"title": "导出为 Cocos2d 格式", "callback": lambda mw: export_to_cocos2d(mw)},
                {"type": "separator"},
                {"title": "游戏数据预览", "callback": lambda mw: show_game_data_preview(mw)},
            ]},
            {"type": "separator"},
            {"title": "备份管理", "callback": lambda mw: show_backup_manager(mw)},
            {"type": "separator"},
            {"title": "退出", "callback": "close"},
        ],
    },
    {
        "title": "编辑",
        "items": [
            {"title": "撤销 (Ctrl+Z)", "callback": "_do_undo"},
            {"title": "重做 (Ctrl+Y)", "callback": "_do_redo"},
            {"type": "separator"},
            {"title": "模板管理", "callback": lambda mw: show_template_manager(mw)},
            {"type": "separator"},
            {"title": "清空所有数据", "callback": "clear_all_data"},
        ],
    },
    {
        # P3-11: 合并「数据分析」+「内容关联」+「工具」+「游戏引擎预览」为单一「工具」菜单
        "title": "工具",
        "items": [
            {"title": "快速创建向导", "callback": "_show_quick_create"},
            {"title": "批量修改数据", "callback": "_show_batch_edit"},
            {"title": "数据关联预览", "callback": "_show_reference_panel"},
            {"type": "separator"},
            {"title": "关系图", "callback": "_show_relation_graph"},
            {"title": "数据对比", "callback": "_show_data_diff"},
            {"type": "separator"},
            {"title": "数据分析", "type": "submenu", "items": [
                {"title": "属性分布图表", "callback": lambda mw: show_attribute_charts(mw)},
                {"title": "平衡性分析工具", "callback": lambda mw: show_balance_analysis(mw)},
                {"title": "游戏数据统计", "callback": lambda mw: show_game_data_statistics(mw)},
            ]},
            {"title": "内容关联", "type": "submenu", "items": [
                {"title": "内容关联管理", "callback": lambda mw: show_content_relations(mw)},
                {"title": "关联可视化", "callback": lambda mw: show_relation_visualization(mw)},
            ]},
            {"type": "separator"},
            {"title": "属性系统编辑器", "callback": "open_attr_system_editor"},
            {"title": "清理未使用图片", "callback": lambda mw: cleanup_unused_images(mw)},
        ],
    },
    {
        "title": "设置",
        "items": [
            {"title": "打开设置...", "callback": "open_settings"},
        ],
    },
    {
        "title": "帮助",
        "items": [
            {"title": "快速入门", "callback": "_show_onboarding"},
            {"title": "快捷键参考", "callback": "_show_shortcut_reference"},
            {"type": "separator"},
            {"title": "关于墨白编辑器", "callback": "_show_about"},
        ],
    },
]


def build_menu(menu: QMenu, items: list, mw):
    """递归构建菜单项（支持子菜单）"""
    for item in items:
        t = item.get("type", "")
        if t == "separator":
            menu.addSeparator()
        elif t == "submenu":
            sub = menu.addMenu(item["title"])
            build_menu(sub, item["items"], mw)
        else:
            action = QAction(item["title"], mw)
            cb = item.get("callback", "")
            if isinstance(cb, str):
                # P3-11: 修复下划线前缀回调 bug — 旧逻辑会去掉 cb 首字符 "_" 再 getattr，
                # 导致 "_show_quick_create" 实际查找不存在的 "show_quick_create" 而失效。
                # 正确做法：直接用 cb 进行 getattr（Python 下划线前缀仅为约定，getattr 不受影响）。
                fn = getattr(mw, cb, None)
                if fn:
                    action.triggered.connect(fn)
                else:
                    action.triggered.connect(lambda checked, c=cb: getattr(mw, c, lambda: None)())
            elif callable(cb):
                action.triggered.connect(lambda checked, c=cb: c(mw))
            menu.addAction(action)


def setup_menubar(mw):
    """构建完整菜单栏"""
    menubar = mw.menuBar()
    menubar.clear()
    for menu_def in MENU_CONFIG:
        menu = menubar.addMenu(menu_def["title"])
        build_menu(menu, menu_def["items"], mw)
    return menubar


def setup_agent_toolbar(mw):
    """构建 Agent 工具栏（菜单栏右侧）"""
    corner = QPushButton(" 智能体")
    corner.setIcon(get_icon("brain", "white", 14))
    corner.setIconSize(QSize(14, 14))
    corner.setStyleSheet(f"""
        QPushButton {{ background: {theme_color('accent')}; color: white; border-radius: 6px;
                      padding: 4px 12px; font-weight: bold; }}
        QPushButton:hover {{ background: {theme_color('accent_hover')}; }}
    """)
    corner.clicked.connect(mw._open_agent_editor)
    menubar = mw.menuBar()
    menubar.setCornerWidget(corner, Qt.Corner.TopRightCorner)
    return corner
