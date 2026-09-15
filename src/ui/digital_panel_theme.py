"""主题应用（深浅色与各区域样式） —— DigitalPanel 的 DigitalPanelThemeMixin 部分

自 digital_employee.py 拆出，方法体逐行原样搬运（逻辑未改动）。
"""

from __future__ import annotations

from typing import Optional

from common.logger import get_logger
from ui.digital_panel_state import DigitalPanelState
from ui.widgets.collapsible_task_panel import CollapsibleTaskPanel

try:
    from config.settings import AppConfig, get_config
    _APP_CONFIG: Optional[AppConfig] = get_config()
except (ImportError, RuntimeError):
    _APP_CONFIG = None

logger = get_logger()



class DigitalPanelThemeMixin(DigitalPanelState):
    """主题应用（深浅色与各区域样式）"""

    def _theme_menu_qss(self) -> str:
        """返回跟随主题的菜单 QSS"""
        try:
            from ui.themes import get_theme_colors
            c = get_theme_colors()
            bg = c.get('menu_bg', c['input_bg'])
            fg = c['fg']
            border = c['border']
            sel = c['input_bg']
            accent = c['accent']
        except Exception:
            bg, fg, border, sel, accent = '#fff', '#000', '#ccc', '#eee', '#5a6ef5'
        return f"""
            QMenu {{
                background: {bg};
                border: 1px solid {border};
                border-radius: 8px;
                padding: 4px;
            }}
            QMenu::item {{
                padding: 8px 16px;
                border-radius: 4px;
                color: {fg};
                font-size: 14px;
            }}
            QMenu::item:selected {{
                background: {sel};
                color: {accent};
            }}
            QMenu::separator {{
                height: 1px;
                background: {border};
                margin: 4px 8px;
            }}
        """
    def _apply_chat_theme(self):
        """应用主题感知的聊天显示 + 输入区 + workspace 样式

        拆分为 6 个子方法以提升可维护性：
        - _apply_chat_display_theme: 聊天显示区
        - _apply_workspace_combo_theme: 工作区下拉框
        - _apply_task_labels_theme: 任务面板标题/统计/placeholder
        - _apply_input_area_theme: 输入框容器/输入框/发送按钮/提示标签
        - _apply_task_panel_theme: 任务面板（CollapsibleTaskPanel 与普通分支）
        - _apply_misc_widgets_theme: 命令弹窗/任务标记/模型按钮
        """
        try:
            from ui.themes import get_theme_colors, is_dark_theme
            colors = get_theme_colors()
            dark = is_dark_theme()
            self._apply_chat_display_theme(colors)
            self._apply_workspace_combo_theme(colors)
            self._apply_task_labels_theme(colors)
            self._apply_input_area_theme(colors, dark)
            self._apply_task_panel_theme(colors)
            self._apply_misc_widgets_theme(colors)
        except Exception as e:
            logger.warning(f"操作失败: {e}")
    def _apply_chat_display_theme(self, colors):
        """聊天显示区 QSS（QTextBrowser + 滚动条）"""
        from ui.themes import get_chat_css
        bg = colors['bg']
        fg = colors['fg']
        border = colors['border']
        self._chat_display.setStyleSheet(f"""
            QTextBrowser#chatDisplay {{
                background: {bg};
                color: {fg};
                border: none;
                font-size: 15px;
                padding: 4px;
            }}
            QScrollBar:vertical {{
                background: {bg};
                width: 8px;
                margin: 0;
            }}
            QScrollBar::handle:vertical {{
                background: {border};
                border-radius: 4px;
                min-height: 32px;
            }}
            QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {{
                height: 0;
            }}
        """)
        self._chat_display.document().setDefaultStyleSheet(get_chat_css())
    def _apply_workspace_combo_theme(self, colors):
        """工作区下拉框 QSS"""
        if not hasattr(self, '_workspace_combo'):
            return
        input_bg = colors['input_bg']
        border = colors['border']
        fg = colors['fg']
        accent = colors['accent']
        menu_bg = colors.get('menu_bg', input_bg)
        self._workspace_combo.setStyleSheet(f"""
            QComboBox#workspaceCombo {{
                background: {input_bg};
                border: 1px solid {border};
                border-radius: 4px;
                color: {fg};
                font-size: 13px;
                padding: 2px 6px;
            }}
            QComboBox#workspaceCombo:hover {{
                border-color: {accent};
            }}
            QComboBox#workspaceCombo QAbstractItemView {{
                background: {menu_bg};
                border: 1px solid {border};
                color: {fg};
                font-size: 13px;
                selection-background-color: {accent}22;
            }}
        """)
    def _apply_task_labels_theme(self, colors):
        """任务面板标题 / 数据统计 / placeholder 样式"""
        fg = colors['fg']
        hint = colors['hint']
        if hasattr(self, '_task_title_label'):
            self._task_title_label.setStyleSheet(
                f"font-weight: bold; font-size: 14px; color: {fg};"
            )
        if hasattr(self, '_count_label'):
            self._count_label.setStyleSheet(f"color: {hint}; font-size: 14px;")
        if hasattr(self, '_task_placeholder'):
            self._task_placeholder.setStyleSheet(
                f"color: {hint}; font-size: 14px; padding: 8px;"
            )
    def _apply_input_area_theme(self, colors, dark):
        """输入区组件样式（容器/输入框/发送按钮/提示标签/生成中标签）"""
        fg = colors['fg']
        border = colors['border']
        input_bg = colors['input_bg']
        hint = colors['hint']

        if hasattr(self, '_compose'):
            self._compose.setStyleSheet(f"""
                QFrame#composeBar {{
                    background: {input_bg};
                    border: 1px solid {border};
                    border-radius: 12px;
                }}
            """)

        if hasattr(self, '_input_edit'):
            self._input_edit.setStyleSheet(f"""
                QLineEdit {{
                    background: transparent;
                    color: {fg};
                    border: none;
                    padding: 8px 4px;
                    font-size: 14px;
                    outline: none;
                }}
            """)

        if hasattr(self, '_send_btn'):
            btn_bg = input_bg if dark else '#e2e8f0'
            self._send_btn.setStyleSheet(f"""
                QPushButton {{
                    background: {btn_bg};
                    color: {hint};
                    border: none;
                    border-radius: 16px;
                    font-size: 16px;
                    font-weight: bold;
                }}
                QPushButton:hover {{
                    background: {border};
                }}
            """)

        if hasattr(self, '_info_label'):
            self._info_label.setStyleSheet(
                f"color: {hint}; font-size: 14px; padding-left: 8px; margin-top: 4px;"
            )

        if hasattr(self, '_gen_label'):
            self._gen_label.setStyleSheet(f"color: {hint}; font-size: 14px;")
    def _apply_task_panel_theme(self, colors):
        """任务面板 QSS（支持 CollapsibleTaskPanel 和普通两种分支）"""
        fg = colors['fg']
        border = colors['border']
        input_bg = colors['input_bg']
        hint = colors['hint']

        if hasattr(self, '_task_panel') and isinstance(self._task_panel, CollapsibleTaskPanel):
            self._task_panel.setStyleSheet(f"""
                QWidget#taskPanel {{
                    background: {input_bg};
                    border: 1px solid {border};
                    border-radius: 8px;
                }}
                QWidget#taskPanel QLabel {{
                    color: {fg};
                    background: transparent;
                }}
                QWidget#collapsibleHeader {{
                    background: transparent;
                    border: none;
                    border-bottom: 1px solid {border};
                }}
                QWidget#collapsibleContent {{
                    background: transparent;
                    border: none;
                }}
                QScrollArea#collapsibleScrollArea {{
                    background: transparent;
                    border: none;
                }}
                QWidget#collapsibleScrollContent {{
                    background: transparent;
                    border: none;
                }}
                QScrollBar:vertical {{
                    background: transparent;
                    width: 4px;
                    margin: 0;
                }}
                QScrollBar::handle:vertical {{
                    background: {border};
                    border-radius: 2px;
                    min-height: 20px;
                }}
                QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {{
                    height: 0;
                }}
            """)
            self._task_panel.set_title_style(f"font-weight: bold; font-size: 14px; color: {fg};")
            self._task_panel.set_summary_style(f"color: {hint}; font-size: 12px;")
            self._task_panel.set_chevron_color(hint)
        elif hasattr(self, '_task_panel'):
            self._task_panel.setStyleSheet(f"""
                QFrame#taskPanel {{
                    background: {input_bg};
                    border: 1px solid {border};
                    border-radius: 8px;
                    padding: 8px;
                }}
                QFrame#taskPanel QLabel {{
                    color: {fg};
                    font-size: 14px;
                    background: transparent;
                }}
            """)
    def _apply_misc_widgets_theme(self, colors):
        """命令弹窗 / 任务标记 / 模型按钮样式"""
        fg = colors['fg']
        border = colors['border']
        input_bg = colors['input_bg']
        accent = colors['accent']
        hint = colors['hint']
        menu_bg = colors.get('menu_bg', input_bg)

        if hasattr(self, '_cmd_popup'):
            self._cmd_popup.setStyleSheet(f"""
                QListWidget#cmdPopup {{
                    background: {menu_bg};
                    border: 1px solid {border};
                    border-radius: 8px;
                    padding: 4px;
                    color: {fg};
                    font-size: 14px;
                    outline: none;
                }}
                QListWidget#cmdPopup::item {{
                    padding: 5px 10px;
                    border-radius: 4px;
                }}
                QListWidget#cmdPopup::item:selected {{
                    background: {input_bg};
                    color: {fg};
                }}
                QListWidget#cmdPopup::item:hover {{
                    background: {input_bg};
                }}
            """)

        if hasattr(self, '_task_badge'):
            self._task_badge.setStyleSheet(f"""
                QLabel {{
                    background: {input_bg};
                    color: {accent};
                    border: 1px solid {border};
                    border-radius: 4px;
                    padding: 3px 8px;
                    font-size: 13px;
                }}
            """)

        if hasattr(self, '_model_btn'):
            self._model_btn.setStyleSheet(f"""
                QPushButton {{
                    background: transparent;
                    color: {hint};
                    border: 1px solid {border};
                    border-radius: 8px;
                    padding: 4px 8px;
                    font-size: 14px;
                }}
                QPushButton:hover {{
                    color: {fg};
                    border-color: {accent};
                    background: {input_bg};
                }}
            """)
    def _on_theme_changed_panel(self, theme=None, **kwargs):
        self._apply_chat_theme()
        if hasattr(self, '_refresh_team_btn'):
            self._refresh_team_btn()
