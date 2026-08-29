"""UI 主题定义 - 生成式主题系统"""

_THEME_QSS = """
QWidget {{ background-color: {bg}; color: {fg}; font-family: "Microsoft YaHei", "PingFang SC", -apple-system, Arial; font-size: 13px; }}
QLabel {{ color: {fg}; background-color: transparent; }}
QLabel[objectName="hint_label"] {{ color: {hint}; }}
QLineEdit, QTextEdit {{ color: {fg}; }}
/* P0-1: 容器主题背景兜底 — 防止 QFrame/QScrollArea/QStackedWidget/QSplitter/QDialog/QMainWindow 使用系统默认黑背景 */
QDialog, QMainWindow {{ background-color: {bg}; color: {fg}; }}
QFrame, QScrollArea, QStackedWidget, QSplitter {{ background-color: {bg}; }}
QScrollArea > QWidget > QWidget {{ background-color: {bg}; }}
QStackedWidget > QWidget {{ background-color: {bg}; }}

QTabWidget::pane {{ border: none; background: transparent; }}
QTabBar::tab {{
    background-color: transparent; color: {hint};
    padding: 10px 20px; border: none;
    border-bottom: 2px solid transparent;
    margin-right: 4px; font-weight: 500; font-size: 13px;
}}
QTabBar::tab:selected {{ color: {accent}; border-bottom: 2px solid {accent}; font-weight: 600; }}
QTabBar::tab:hover {{ color: {fg}; background-color: {accent_bg}; }}

QPushButton {{
    background-color: {accent}; color: {btn_text};
    border: none; padding: 10px 24px; border-radius: 8px;
    font-weight: 600; font-size: 13px;
}}
QPushButton:hover {{ background-color: {accent_hover}; }}
QPushButton:pressed {{ background-color: {accent_active}; }}
QPushButton:disabled {{ background-color: {disabled_bg}; color: {disabled_fg}; }}
/* P2-8: 按钮变体 — 通过 objectName 或 property "variant" 使用 */
QPushButton[variant="secondary"] {{ background-color: {input_bg}; color: {fg}; border: 1px solid {border}; }}
QPushButton[variant="secondary"]:hover {{ background-color: {accent_bg}; border-color: {accent}; }}
QPushButton[variant="secondary"]:pressed {{ background-color: {accent_light}; }}
QPushButton[variant="secondary"]:disabled {{ background-color: {disabled_bg}; color: {disabled_fg}; border-color: {divider}; }}
QPushButton[variant="danger"] {{ background-color: {danger}; color: white; }}
QPushButton[variant="danger"]:hover {{ background-color: {danger_hover}; }}
QPushButton[variant="danger"]:pressed {{ background-color: {danger_hover}; }}
QPushButton[variant="danger"]:disabled {{ background-color: {disabled_bg}; color: {disabled_fg}; }}
QPushButton[variant="success"] {{ background-color: {success}; color: white; }}
QPushButton[variant="success"]:hover {{ background-color: {success_hover}; }}
QPushButton[variant="success"]:disabled {{ background-color: {disabled_bg}; color: {disabled_fg}; }}

QLineEdit, QTextEdit, QComboBox {{
    background-color: {input_bg}; color: {fg};
    border: 1px solid {border}; border-radius: 8px;
    padding: 10px 14px; selection-background-color: {accent}; selection-color: {btn_text};
}}
QLineEdit:focus, QTextEdit:focus, QComboBox:focus {{
    border-color: {accent}; border-width: 1.5px;
}}

QMenuBar {{ background-color: {menu_bg}; color: {fg}; border-bottom: 1px solid {border}; padding: 2px 8px; }}
QMenuBar::item {{ padding: 8px 14px; border-radius: 6px; }}
QMenuBar::item:selected {{ background-color: {accent_light}; color: {accent}; }}
QMenu {{ background-color: {menu_dropdown}; color: {fg}; border: 1px solid {border}; border-radius: 10px; padding: 6px 0; }}
QMenu::item {{ padding: 8px 24px; margin: 2px 8px; border-radius: 6px; }}
QMenu::item:selected {{ background-color: {accent_light}; color: {accent}; }}
QMenu::separator {{ height: 1px; background-color: {border}; margin: 4px 16px; }}

QListWidget {{
    background-color: {input_bg}; color: {fg};
    border: 1px solid {border}; border-radius: 10px;
}}
QListWidget::item {{ padding: 10px 14px; border-bottom: 1px solid {divider}; }}
QListWidget::item:last-child {{ border-bottom: none; }}
QListWidget::item:selected {{ background-color: {accent_light}; color: {accent_active}; }}
QListWidget::item:hover {{ background-color: {hover_bg}; }}

QTableWidget {{
    background-color: {input_bg}; color: {fg};
    border: 1px solid {border}; border-radius: 10px;
    gridline-color: {divider};
}}
QTableWidget::item {{ padding: 8px 12px; }}
QTableWidget::item:selected {{ background-color: {accent_light}; color: {accent_active}; }}
QHeaderView::section {{
    background-color: {bg}; color: {secondary_fg};
    padding: 10px 14px; border: none;
    border-bottom: 1px solid {border}; font-weight: 600; font-size: 12px;
}}

QStatusBar {{ background-color: {bg}; color: {hint}; border-top: 1px solid {border}; padding: 4px; }}
QMessageBox {{ color: {fg}; background-color: {bg}; }}

QScrollBar:vertical {{ background-color: transparent; border: none; width: 8px; margin: 0; }}
QScrollBar::handle:vertical {{ background-color: {scroll}; border-radius: 4px; min-height: 24px; }}
QScrollBar::handle:vertical:hover {{ background-color: {accent}; }}
QScrollBar::add-line, QScrollBar::sub-line {{ height: 0; border: none; }}

QCheckBox {{ color: {fg}; spacing: 8px; }}
QCheckBox::indicator {{ width: 18px; height: 18px; border-radius: 5px; }}
QCheckBox::indicator:unchecked {{ background-color: {input_bg}; border: 1.5px solid {scroll}; }}
QCheckBox::indicator:checked {{ background-color: {accent}; border: 1.5px solid {accent}; }}

QFrame[frameShape="HLine"] {{ background-color: {border}; height: 1px; }}

QGroupBox {{ color: {fg}; border: 1px solid {border}; border-radius: 10px; margin-top: 14px; padding-top: 18px; }}
QGroupBox::title {{ color: {accent}; padding: 0 10px; font-weight: 600; subcontrol-origin: margin; left: 12px; }}

QToolTip {{ background-color: {tooltip_bg}; color: {tooltip_fg}; border: none; border-radius: 8px; padding: 8px 12px; }}

QComboBox::drop-down {{ border: none; width: 24px; border-radius: 0 8px 8px 0; }}
QComboBox::down-arrow {{ image: none; width: 0; height: 0; border-left: 4px solid transparent; border-right: 4px solid transparent; border-top: 5px solid {hint}; }}

QFrame#sectionHeader {{
    background-color: {accent_light}; border: 1px solid {border};
    border-radius: 10px 10px 0 0; border-bottom: none;
}}
QFrame#sectionHeader:hover {{ background-color: {accent_hover_light}; }}
QFrame#sectionContent {{
    background-color: {input_bg}; border: 1px solid {border};
    border-radius: 0 0 10px 10px; border-top: none;
}}
QPushButton#sectionToggle {{ background-color: transparent; color: {hint}; padding: 0; border: none; }}
QPushButton#sectionToggle:hover {{ color: {accent}; }}
QLabel#sectionTitle {{ color: {section_title}; border: none; background-color: transparent; }}

QFrame#attrTopBar {{ background-color: {accent_light}; border: 1px solid {border}; border-radius: 8px; }}
QTableWidget#attrTable {{ background-color: {input_bg}; color: {fg}; border: 1px solid {border}; border-radius: 8px; gridline-color: {divider}; }}
QHeaderView#attrTableHeader::section {{ background-color: {accent_light}; color: {secondary_fg}; border: none; border-right: 1px solid {border}; }}
QLineEdit#attrCellEdit {{ background-color: {cell_bg}; color: {fg}; border: 1px solid {border}; border-radius: 6px; }}
QLineEdit#attrCellEdit:focus {{ border-color: {accent}; }}
QLabel#attrHintLabel {{ color: {hint}; background-color: {accent_light}; border: 1px solid {border}; border-radius: 8px; }}
QPushButton#attrQuickAddBtn {{ background-color: {accent}; color: {btn_text}; border: none; padding: 5px 14px; border-radius: 6px; font-weight: 600; }}
QPushButton#attrQuickAddBtn:hover {{ background-color: {accent_hover}; }}
QPushButton#attrAddBtn {{ background-color: {accent_active}; color: {btn_text}; border: none; padding: 5px 14px; border-radius: 6px; font-weight: 600; }}
QPushButton#attrAddBtn:hover {{ background-color: {accent}; }}
QPushButton#attrRemoveBtn {{ background-color: {danger}; color: white; border: none; padding: 5px 14px; border-radius: 6px; font-weight: 600; }}
QPushButton#attrRemoveBtn:hover {{ background-color: {danger_hover}; }}

QLabel#formLabel {{ color: {section_title}; font-weight: 600; border: none; background-color: transparent; }}
QLabel#statHint {{ color: {hint}; font-size: 11px; font-style: italic; padding: 4px 10px; background-color: {accent_light}; border-radius: 6px; border: 1px solid {border}; }}

#leftPanel {{ background: {bg}; }}
#leftSectionLabel {{ font-size: 12px; font-weight: bold; color: {fg}; padding: 2px 0; }}
#leftCombo {{
    padding: 6px 10px; border: 1px solid {border}; border-radius: 8px;
    min-height: 28px; font-size: 13px; background: {input_bg}; color: {fg};
}}
#leftCombo:hover {{ border-color: {accent}; }}
#leftCombo::drop-down {{ width: 22px; border: none; }}
#leftProjectList {{
    border: 1px solid {border}; border-radius: 8px; padding: 4px;
    font-size: 13px; outline: none; background: {input_bg}; color: {fg};
}}
#leftProjectList::item {{ padding: 8px 10px; border-radius: 6px; margin: 1px 0; color: {fg}; }}
#leftProjectList::item:hover {{ background: {accent_bg}; }}
#leftProjectList::item:selected {{ background: {accent_light}; color: {accent_active}; }}
#leftActionBtn {{
    text-align: left; padding: 8px 12px; border: 1px solid {border};
    border-radius: 8px; font-size: 12px; background: {input_bg}; color: {fg};
}}
#leftActionBtn:hover {{ background: {accent_bg}; border-color: {accent}; }}
#leftActionBtn:pressed {{ background: {accent_light}; }}

QSplitter::handle:horizontal {{ background: {border}; width: 1px; }}
QSplitter::handle:horizontal:hover {{ background: {accent}; width: 2px; }}

#titleBar {{
    background: {accent_light};
    border-top-left-radius: 10px;
    border-top-right-radius: 10px;
    border-bottom: 1px solid {border};
}}
#titleBtn {{
    background: transparent; color: {hint};
    border: none; font-size: 14px; font-weight: bold; border-radius: 6px;
}}
#titleBtn:hover {{ background: {accent_bg}; color: {fg}; }}
#quickFrame {{
    background: {accent_light}; border-bottom: 1px solid {border};
}}
#quickBtn {{
    background: {accent_bg}; color: {accent};
    border: 1px solid {accent_light};
    border-radius: 6px; padding: 3px 6px; font-size: 11px;
}}
#quickBtn:hover {{
    background: {panel_btn_hover}; color: {accent_hover};
    border-color: {accent};
}}
#chatDisplay {{
    background: {bg}; color: {fg};
    border: none; padding: 8px; font-size: 12px;
}}
QTextEdit#chatDisplay QScrollBar:vertical {{
    background: {bg}; width: 6px; border-radius: 3px;
}}
QTextEdit#chatDisplay QScrollBar::handle:vertical {{
    background: {scroll}; border-radius: 3px; min-height: 20px;
}}
QTextEdit#chatDisplay QScrollBar::add-line:vertical,
QTextEdit#chatDisplay QScrollBar::sub-line:vertical {{ height: 0; }}
#inputFrame {{
    background: {accent_light};
    border-top: 1px solid {border};
    border-bottom-left-radius: 8px; border-bottom-right-radius: 8px;
}}
#inputEdit {{
    background: {input_bg}; color: {fg};
    border: 1.5px solid {border}; border-radius: 6px;
    padding: 8px 12px; font-size: 12px;
}}
#inputEdit:focus {{ border-color: {accent}; }}
#sendBtn {{
    background: {accent}; color: {btn_text};
    border: none; border-radius: 6px;
    padding: 8px 16px; font-size: 12px; font-weight: bold;
}}
#sendBtn:hover {{ background: {accent_hover}; }}
#sendBtn:disabled {{ background: {disabled_bg}; color: {disabled_fg}; }}
#taskBtn {{
    background: {accent_bg}; color: {accent};
    border: 1px solid {accent_light}; border-radius: 6px; font-size: 14px;
}}
#taskBtn:hover {{
    background: {panel_btn_hover}; color: {accent_hover};
    border-color: {accent};
}}
#cmdPopup {{
    background: {input_bg}; border: 1px solid {accent};
    border-radius: 6px; padding: 2px;
    font-size: 12px; color: {fg}; outline: none;
}}
#cmdPopup::item {{ padding: 6px 10px; border-radius: 4px; }}
#cmdPopup::item:selected {{ background: {accent}; color: {btn_text}; }}
/* 任务选择器 */
#tsContainer {{
    background: {bg}; border: 2px solid {accent}; border-radius: 12px;
}}
#tsTitle {{ color: {fg}; font-size: 15px; font-weight: bold; }}
#tsCloseBtn {{
    background: transparent; color: {hint};
    border: none; font-size: 14px; font-weight: bold; border-radius: 12px;
}}
#tsCloseBtn:hover {{ background: {panel_btn_hover}; color: {panel_danger}; }}
#tsSearch {{
    background: {input_bg}; color: {fg};
    border: 1.5px solid {border}; border-radius: 6px;
    padding: 8px 12px; font-size: 13px;
}}
#tsSearch:focus {{ border-color: {accent}; }}
#tsList {{ background: transparent; border: none; font-size: 12px; outline: none; }}
#tsList::item {{
    padding: 8px 10px; border-radius: 6px;
    border-bottom: 1px solid {divider}; color: {fg};
}}
#tsList::item:selected {{
    background: {accent_light}; border: 1px solid {accent}; color: {accent_active};
}}
#tsList::item:hover {{ background: {accent_bg}; color: {fg}; }}
#tsHint {{ color: {hint}; font-size: 11px; }}
"""


def _panel_btn_hover(cfg: dict) -> str:
    """生成对话框按钮悬停背景色（比 accent_bg 更浓）"""
    return cfg["accent_bg"].replace("0.06", "0.18").replace("0.08", "0.20").replace("0.10", "0.22")

def _generate_theme(cfg):
    shadow = ""
    focus = ""
    if cfg.get("focus_bg"):
        focus = f"background-color: {cfg['focus_bg']};"

    base_qss = _THEME_QSS.format(
        bg=cfg["bg"], fg=cfg["fg"], hint=cfg["hint"],
        accent=cfg["accent"], accent_hover=cfg["accent_hover"],
        accent_active=cfg["accent_active"], accent_bg=cfg["accent_bg"],
        accent_light=cfg["accent_light"], accent_hover_light=cfg["accent_hover_light"],
        hover_bg=cfg.get("hover_bg", cfg["bg"]),
        btn_text=cfg["btn_text"], input_bg=cfg["input_bg"],
        menu_bg=cfg.get("menu_bg", cfg["input_bg"]), menu_dropdown=cfg.get("menu_dropdown", cfg["input_bg"]),
        border=cfg["border"], divider=cfg.get("divider", cfg["border"]),
        secondary_fg=cfg["secondary_fg"], scroll=cfg["scroll"],
        disabled_bg=cfg["disabled_bg"], disabled_fg=cfg["disabled_fg"],
        tooltip_bg=cfg["tooltip_bg"], tooltip_fg=cfg["tooltip_fg"],
        section_title=cfg["section_title"], cell_bg=cfg.get("cell_bg", cfg["input_bg"]),
        danger=cfg.get("danger", "#DC2626"), danger_hover=cfg.get("danger_hover", "#B91C1C"),
        success=cfg.get("success", "#22C55E"), success_hover=cfg.get("success_hover", "#16A34A"),
        focus_shadow=focus,
        panel_btn_hover=_panel_btn_hover(cfg),
        panel_danger=cfg.get("danger", "#DC2626"),
    )

    return base_qss


_THEME_CONFIGS = {
    # ========== 深色系：7 个主题 ==========
    "科幻": {
        "accent": "#00D4FF", "accent_hover": "#00B8E6", "accent_active": "#0099CC",
        "accent_rgba": "rgba(0,212,255,0.15)",
        "accent_bg": "rgba(0,212,255,0.06)", "accent_light": "#0D1A26",
        "accent_hover_light": "#122030", "accent_light_2": "#162A38",
        "bg": "#080C14", "fg": "#C8D6E5", "hint": "#6E859E",
        "secondary_fg": "#7B93A8", "section_title": "#9DB4C8",
        "input_bg": "#0F1724", "border": "rgba(0,212,255,0.18)", "divider": "#111A28",
        "scroll": "#1A2A3C", "focus_bg": "#0D1A26",
        "btn_text": "#FFFFFF", "disabled_bg": "#162030", "disabled_fg": "#576C82",
        "tooltip_bg": "#162030", "tooltip_fg": "#00D4FF",
        "cell_bg": "#0E1622", "menu_bg": "#080C14", "menu_dropdown": "#0E1622",
        "hover_bg": "#0E1622",
        "danger": "#EF4444", "danger_hover": "#DC2626",
        "agent_steward": "#00D4FF", "agent_operator": "#38BDF8",
        "agent_schema": "#6366F1", "agent_planner": "#10B981",
        "agent_analyst": "#F472B6", "agent_web": "#FB923C",
        "agent_media": "#A78BFA", "agent_dev": "#F97316",
        "agent_ops": "#FDBA74", "agent_fixer": "#F87171",
    },
    "赛博霓虹": {
        "accent": "#FF2D95", "accent_hover": "#E02080", "accent_active": "#CC1A6E",
        "accent_rgba": "rgba(255,45,149,0.15)",
        "accent_bg": "rgba(255,45,149,0.08)", "accent_light": "#1E1428",
        "accent_hover_light": "#261830", "accent_light_2": "#2E1C38",
        "bg": "#100C1A", "fg": "#E8E0F0", "hint": "#9080A8",
        "secondary_fg": "#A898C0", "section_title": "#C8B8E0",
        "input_bg": "#1A1028", "border": "rgba(255,45,149,0.15)", "divider": "#1E1430",
        "scroll": "#382850", "focus_bg": "#1E1428",
        "btn_text": "#FFFFFF", "disabled_bg": "#2A2040", "disabled_fg": "#7B6690",
        "tooltip_bg": "#2A2040", "tooltip_fg": "#FF2D95",
        "cell_bg": "#180E24", "menu_bg": "#100C1A", "menu_dropdown": "#180E24",
        "hover_bg": "#180E24",
        "danger": "#F87171", "danger_hover": "#EF4444",
        "agent_steward": "#FF2D95", "agent_operator": "#00F0FF",
        "agent_schema": "#00F0FF", "agent_planner": "#34D399",
        "agent_analyst": "#F472B6", "agent_web": "#FB923C",
        "agent_media": "#C084FC", "agent_dev": "#F97316",
        "agent_ops": "#FDBA74", "agent_fixer": "#F87171",
    },
    "赤焰": {
        "accent": "#EF4444", "accent_hover": "#DC2626", "accent_active": "#B91C1C",
        "accent_rgba": "rgba(239,68,68,0.15)",
        "accent_bg": "rgba(239,68,68,0.08)", "accent_light": "#2C1814",
        "accent_hover_light": "#341E18", "accent_light_2": "#3C241C",
        "bg": "#1A1410", "fg": "#F0E8E0", "hint": "#A09088",
        "secondary_fg": "#B0A098", "section_title": "#D0C0B0",
        "input_bg": "#241A14", "border": "rgba(239,68,68,0.12)", "divider": "#281E18",
        "scroll": "#4A3830", "focus_bg": "#2C1814",
        "btn_text": "#FFFFFF", "disabled_bg": "#382820", "disabled_fg": "#84746C",
        "tooltip_bg": "#382820", "tooltip_fg": "#FCA5A5",
        "cell_bg": "#201810", "menu_bg": "#1A1410", "menu_dropdown": "#201810",
        "hover_bg": "#201810",
        "danger": "#EF4444", "danger_hover": "#B91C1C",
        "agent_steward": "#EF4444", "agent_operator": "#F97316",
        "agent_schema": "#F59E0B", "agent_planner": "#34D399",
        "agent_analyst": "#F472B6", "agent_web": "#FB923C",
        "agent_media": "#C084FC", "agent_dev": "#F97316",
        "agent_ops": "#FDBA74", "agent_fixer": "#DC2626",
    },
    "复古像素": {
        "accent": "#33FF33", "accent_hover": "#2AD42A", "accent_active": "#22AA22",
        "accent_rgba": "rgba(51,255,51,0.15)",
        "accent_bg": "rgba(51,255,51,0.08)", "accent_light": "#0A1A0A",
        "accent_hover_light": "#0E240E", "accent_light_2": "#122E12",
        "bg": "#0A0A0A", "fg": "#C0FFC0", "hint": "#50A050",
        "secondary_fg": "#60A060", "section_title": "#80E080",
        "input_bg": "#0F0F0F", "border": "rgba(51,255,51,0.20)", "divider": "#151515",
        "scroll": "#204020", "focus_bg": "#0A1A0A",
        "btn_text": "#0A0A0A", "disabled_bg": "#1A1A1A", "disabled_fg": "#496F49",
        "tooltip_bg": "#1A1A1A", "tooltip_fg": "#33FF33",
        "cell_bg": "#0D0D0D", "menu_bg": "#0A0A0A", "menu_dropdown": "#0F0F0F",
        "hover_bg": "#0D0D0D",
        "danger": "#FF4444", "danger_hover": "#CC3333",
        "agent_steward": "#33FF33", "agent_operator": "#33FF33",
        "agent_schema": "#33FF33", "agent_planner": "#33FF33",
        "agent_analyst": "#33FF33", "agent_web": "#33FF33",
        "agent_media": "#33FF33", "agent_dev": "#33FF33",
        "agent_ops": "#33FF33", "agent_fixer": "#FF4444",
    },
    "极光幽邃": {
        "accent": "#34D399", "accent_hover": "#2DB884", "accent_active": "#269E6B",
        "accent_rgba": "rgba(52,211,153,0.15)",
        "accent_bg": "rgba(52,211,153,0.08)", "accent_light": "#0F241E",
        "accent_hover_light": "#132C24", "accent_light_2": "#183428",
        "bg": "#0A1628", "fg": "#E0EAF0", "hint": "#7090A8",
        "secondary_fg": "#8AA8C0", "section_title": "#A8C8E0",
        "input_bg": "#0F1E34", "border": "rgba(52,211,153,0.15)", "divider": "#142438",
        "scroll": "#243854", "focus_bg": "#0F241E",
        "btn_text": "#FFFFFF", "disabled_bg": "#1A2E44", "disabled_fg": "#5E7C92",
        "tooltip_bg": "#1A2E44", "tooltip_fg": "#34D399",
        "cell_bg": "#0E1C30", "menu_bg": "#0A1628", "menu_dropdown": "#0E1C30",
        "hover_bg": "#0E1C30",
        "danger": "#F87171", "danger_hover": "#EF4444",
        "agent_steward": "#C084FC", "agent_operator": "#60A5FA",
        "agent_schema": "#38BDF8", "agent_planner": "#34D399",
        "agent_analyst": "#F472B6", "agent_web": "#FB923C",
        "agent_media": "#8B5CF6", "agent_dev": "#F97316",
        "agent_ops": "#FDBA74", "agent_fixer": "#F87171",
    },
    "暗夜": {
        "accent": "#A78BFA", "accent_hover": "#7C3AED", "accent_active": "#6D28D9",
        "accent_rgba": "rgba(167,139,250,0.12)",
        "accent_bg": "rgba(167,139,250,0.08)", "accent_light": "#241E2A",
        "accent_hover_light": "#2A2430", "accent_light_2": "#302A38",
        "bg": "#181418", "fg": "#EDE9ED", "hint": "#A098A0",
        "secondary_fg": "#908898", "section_title": "#D0C8D0",
        "input_bg": "#1F1A1F", "border": "#2E2830", "divider": "#252025",
        "scroll": "#2E2830", "focus_bg": "#241E2A",
        "btn_text": "white", "disabled_bg": "#2E2830", "disabled_fg": "#78707D",
        "tooltip_bg": "#2E2830", "tooltip_fg": "#A78BFA",
        "cell_bg": "#1C181C", "menu_bg": "#181418", "menu_dropdown": "#1E1A20",
        "hover_bg": "#1C181C",
        "danger": "#F87171", "danger_hover": "#EF4444",
        "agent_steward": "#A78BFA", "agent_operator": "#818CF8",
        "agent_schema": "#A78BFA", "agent_planner": "#34D399",
        "agent_analyst": "#F472B6", "agent_web": "#FB923C",
        "agent_media": "#C084FC", "agent_dev": "#F97316",
        "agent_ops": "#FDBA74", "agent_fixer": "#F87171",
    },
    "深色": {
        "accent": "#38BDF8", "accent_hover": "#38BDF8", "accent_active": "#0369A1",
        "accent_rgba": "rgba(56,189,248,0.12)",
        "accent_bg": "rgba(56,189,248,0.08)", "accent_light": "#263348",
        "accent_hover_light": "#263348", "accent_light_2": "#2A3850",
        "bg": "#111827", "fg": "#E2E8F0", "hint": "#94A3B8",
        "secondary_fg": "#94A3B8", "section_title": "#CBD5E1",
        "input_bg": "#1E293B", "border": "#334155", "divider": "#1E293B",
        "scroll": "#334155", "focus_bg": "#263348",
        "btn_text": "white", "disabled_bg": "#1E293B", "disabled_fg": "#677385",
        "tooltip_bg": "#1E293B", "tooltip_fg": "#38BDF8",
        "cell_bg": "#222D3D", "menu_bg": "#111827", "menu_dropdown": "#192230",
        "hover_bg": "#222D3D",
        "danger": "#EF4444", "danger_hover": "#DC2626",
        "agent_steward": "#c084fc", "agent_operator": "#60a5fa",
        "agent_schema": "#38bdf8", "agent_planner": "#4ade80",
        "agent_analyst": "#f472b6", "agent_web": "#fb923c",
        "agent_media": "#c084fc", "agent_dev": "#f97316",
        "agent_ops": "#fdba74", "agent_fixer": "#f87171",
    },

    # ========== 浅色系：3 个主题 ==========
    "现代": {
        "accent": "#6366F1", "accent_hover": "#4F46E5", "accent_active": "#4338CA",
        "accent_rgba": "rgba(99,102,241,0.10)",
        "accent_bg": "rgba(99,102,241,0.06)", "accent_light": "#F0F0FF",
        "accent_hover_light": "#E0E0FF", "accent_light_2": "#E0E0FF",
        "bg": "#F7F7FC", "fg": "#1A1A2E", "hint": "#5C6B7E",
        "secondary_fg": "#374151", "section_title": "#111827",
        "input_bg": "#FFFFFF", "border": "#E5E7EB", "divider": "#F3F4F6",
        "scroll": "#D1D5DB",
        "btn_text": "white", "disabled_bg": "#E5E7EB", "disabled_fg": "#9CA3AF",
        "tooltip_bg": "#1F2937", "tooltip_fg": "#E0E7FF",
        "cell_bg": "#F8F8FF", "menu_bg": "#FFFFFF", "menu_dropdown": "#FFFFFF",
        "hover_bg": "#F0F0FF",
        "danger": "#EF4444", "danger_hover": "#DC2626",
        "agent_steward": "#8B5CF6", "agent_operator": "#3B82F6",
        "agent_schema": "#6366F1", "agent_planner": "#10B981",
        "agent_analyst": "#EC4899", "agent_web": "#F97316",
        "agent_media": "#8B5CF6", "agent_dev": "#F97316",
        "agent_ops": "#F59E0B", "agent_fixer": "#EF4444",
    },
    "默认": {
        "accent": "#0EA5E9", "accent_hover": "#0284C7", "accent_active": "#0369A1",
        "accent_rgba": "rgba(14,165,233,0.10)",
        "accent_bg": "rgba(14,165,233,0.06)", "accent_light": "#F0F9FF",
        "accent_hover_light": "#E0F2FE", "accent_light_2": "#E0F2FE",
        "bg": "#F8FAFC", "fg": "#000000", "hint": "#556678",
        "secondary_fg": "#334155", "section_title": "#1E293B",
        "input_bg": "#FFFFFF", "border": "#E2E8F0", "divider": "#F1F5F9",
        "scroll": "#CBD5E1",
        "btn_text": "white", "disabled_bg": "#E2E8F0", "disabled_fg": "#94A3B8",
        "tooltip_bg": "#1E293B", "tooltip_fg": "#BAE6FD",
        "cell_bg": "#FAFBFC", "menu_bg": "#FFFFFF", "menu_dropdown": "#FFFFFF",
        "hover_bg": "#F0F9FF",
        "danger": "#EF4444", "danger_hover": "#DC2626",
        "agent_steward": "#7c3aed", "agent_operator": "#2563eb",
        "agent_schema": "#0ea5e9", "agent_planner": "#16a34a",
        "agent_analyst": "#db2777", "agent_web": "#ea580c",
        "agent_media": "#9333ea", "agent_dev": "#c2410c",
        "agent_ops": "#d97706", "agent_fixer": "#dc2626",
    },
    "暖调": {
        "accent": "#D97706", "accent_hover": "#B45309", "accent_active": "#92400E",
        "accent_rgba": "rgba(217,119,6,0.10)",
        "accent_bg": "rgba(217,119,6,0.06)", "accent_light": "#FFF7ED",
        "accent_hover_light": "#FFEDD5", "accent_light_2": "#FFEDD5",
        "bg": "#FFFBF7", "fg": "#000000", "hint": "#78716C",
        "secondary_fg": "#44403C", "section_title": "#292524",
        "input_bg": "#FFFFFF", "border": "#E7E5E4", "divider": "#FAFAF9",
        "scroll": "#D6D3D1",
        "btn_text": "white", "disabled_bg": "#E7E5E4", "disabled_fg": "#A8A29E",
        "tooltip_bg": "#292524", "tooltip_fg": "#FCD34D",
        "cell_bg": "#FFFCF8", "menu_bg": "#FFFFFF", "menu_dropdown": "#FFFFFF",
        "hover_bg": "#FFF7ED",
        "danger": "#EF4444", "danger_hover": "#DC2626",
        "agent_steward": "#7c3aed", "agent_operator": "#2563eb",
        "agent_schema": "#0ea5e9", "agent_planner": "#16a34a",
        "agent_analyst": "#db2777", "agent_web": "#d97706",
        "agent_media": "#9333ea", "agent_dev": "#c2410c",
        "agent_ops": "#b45309", "agent_fixer": "#dc2626",
    },
}

# ---------------------------------------------------------------------------
#  数字员工/任务选择器 QSS 模板
# ---------------------------------------------------------------------------

_DIGITAL_PANEL_QSS = """
/* 数字面板根容器 */
#digitalPanel, #tsDialog {{
    background: {bg};
    border: 1px solid {border};
    border-radius: 8px;
}}
/* 标题栏 */
#titleBar {{
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
        stop:0 {panel_title_bg1}, stop:1 {panel_title_bg2});
    border-top-left-radius: 8px;
    border-top-right-radius: 8px;
    border-bottom: 1px solid {border};
}}
#titleLabel {{
    color: {fg};
    font-weight: bold;
    font-size: 13px;
}}
#titleBtn {{
    background: transparent;
    color: {hint};
    border: none;
    font-size: 14px;
    font-weight: bold;
    border-radius: 4px;
}}
#titleBtn:hover {{
    background: {accent_bg};
    color: {fg};
}}
/* 快捷按钮区 */
#quickFrame {{
    background: {accent_light};
    border-bottom: 1px solid {border};
}}
#quickBtn {{
    background: {accent_bg};
    color: {accent};
    border: 1px solid {accent_light_2};
    border-radius: 6px;
    padding: 3px 6px;
    font-size: 11px;
}}
#quickBtn:hover {{
    background: {panel_btn_hover};
    color: {accent_hover};
    border-color: {accent};
}}
/* 对话区 */
#chatDisplay {{
    background: {bg};
    color: {fg};
    border: none;
    padding: 8px;
    font-size: 12px;
}}
QTextEdit#chatDisplay QScrollBar:vertical {{
    background: {bg};
    width: 6px;
    border-radius: 3px;
}}
QTextEdit#chatDisplay QScrollBar::handle:vertical {{
    background: {scroll};
    border-radius: 3px;
    min-height: 20px;
}}
QTextEdit#chatDisplay QScrollBar::add-line:vertical,
QTextEdit#chatDisplay QScrollBar::sub-line:vertical {{
    height: 0;
}}
/* 输入区 */
#inputFrame {{
    background: {accent_light};
    border-top: 1px solid {border};
    border-bottom-left-radius: 8px;
    border-bottom-right-radius: 8px;
}}
#inputEdit {{
    background: {input_bg};
    color: {fg};
    border: 1px solid {border};
    border-radius: 8px;
    padding: 6px 12px;
    font-size: 12px;
}}
#inputEdit:focus {{ border-color: {accent}; }}
#sendBtn {{
    background: {accent};
    color: {btn_text};
    border: none;
    border-radius: 8px;
    padding: 6px 16px;
    font-size: 12px;
    font-weight: bold;
}}
#sendBtn:hover {{ background: {accent_hover}; }}
#sendBtn:disabled {{
    background: {disabled_bg};
    color: {disabled_fg};
}}
#taskBtn {{
    background: {accent_bg};
    color: {accent};
    border: 1px solid {accent_light_2};
    border-radius: 8px;
    font-size: 14px;
}}
#taskBtn:hover {{
    background: {panel_btn_hover};
    color: {accent_hover};
    border-color: {accent};
}}
/* 命令弹窗 */
#cmdPopup {{
    background: {input_bg};
    border: 1px solid {accent};
    border-radius: 6px;
    padding: 2px;
    font-size: 12px;
    color: {fg};
    outline: none;
}}
#cmdPopup::item {{
    padding: 6px 10px;
    border-radius: 4px;
}}
#cmdPopup::item:selected {{
    background: {accent};
    color: {btn_text};
}}
/* 任务选择器 */
#tsContainer {{
    background: {bg};
    border: 2px solid {accent};
    border-radius: 12px;
}}
#tsTitle {{
    color: {fg};
    font-size: 15px;
    font-weight: bold;
}}
#tsCloseBtn {{
    background: transparent;
    color: {hint};
    border: none;
    font-size: 14px;
    font-weight: bold;
    border-radius: 12px;
}}
#tsCloseBtn:hover {{
    background: {panel_btn_hover};
    color: {panel_danger};
}}
#tsSearch {{
    background: {input_bg};
    color: {fg};
    border: 1px solid {border};
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 13px;
}}
#tsSearch:focus {{ border-color: {accent}; }}
#tsList {{
    background: transparent;
    border: none;
    font-size: 12px;
    outline: none;
}}
#tsList::item {{
    padding: 8px 10px;
    border-radius: 6px;
    border-bottom: 1px solid {divider};
    color: {fg};
}}
#tsList::item:selected {{
    background: {accent_light};
    border: 1px solid {accent};
    color: {accent_active};
}}
#tsList::item:hover {{
    background: {accent_bg};
    color: {fg};
}}
#tsHint {{
    color: {hint};
    font-size: 11px;
}}
QToolTip {{
    background: {tooltip_bg};
    color: {tooltip_fg};
    border: 1px solid {accent};
    border-radius: 4px;
    padding: 4px;
}}
"""


def _is_dark_theme(cfg: dict) -> bool:
    """粗略判断是否为深色主题"""
    bg = cfg.get("bg", "#ffffff")
    try:
        r = int(bg[1:3], 16)
        g = int(bg[3:5], 16)
        b = int(bg[5:7], 16)
        return (r + g + b) / 3 < 128
    except (ValueError, IndexError):
        return False


def generate_digital_panel_qss(theme_name: str) -> str:
    """生成数字员工面板的 QSS，基于指定主题配置"""
    cfg = _THEME_CONFIGS.get(theme_name, _THEME_CONFIGS["默认"])
    dark = _is_dark_theme(cfg)
    # 标题栏渐变：从 accent_light 到 accent
    title_bg1 = cfg.get("accent_hover_light", cfg["accent_light"])
    title_bg2 = cfg.get("accent_light", cfg["accent"])
    # 按钮悬停背景
    btn_hover = cfg["accent_bg"].replace("0.06", "0.18").replace("0.08", "0.20")
    # accent_light_2：比 accent_light 更深一点的边框色
    accent_light_2 = cfg.get("accent_light_2", "")
    if not accent_light_2:
        if dark:
            accent_light_2 = cfg.get("focus_bg", cfg.get("accent_light", "#3a3a5c"))
            if accent_light_2 == cfg["accent_light"]:
                accent_light_2 = "#3a3a60"
        else:
            accent_light_2 = cfg.get("border", "#d0d0e0")
    # 危险色
    danger = cfg.get("danger", "#DC2626")

    return _DIGITAL_PANEL_QSS.format(
        bg=cfg["bg"], fg=cfg["fg"], hint=cfg["hint"],
        accent=cfg["accent"], accent_hover=cfg["accent_hover"],
        accent_active=cfg["accent_active"], accent_bg=cfg["accent_bg"],
        accent_light=cfg["accent_light"],
        accent_light_2=accent_light_2,
        panel_title_bg1=title_bg1,
        panel_title_bg2=title_bg2,
        panel_btn_hover=btn_hover,
        panel_danger=danger,
        btn_text=cfg["btn_text"], input_bg=cfg["input_bg"],
        border=cfg["border"], divider=cfg.get("divider", cfg["border"]),
        scroll=cfg["scroll"],
        disabled_bg=cfg["disabled_bg"], disabled_fg=cfg["disabled_fg"],
        tooltip_bg=cfg["tooltip_bg"], tooltip_fg=cfg["tooltip_fg"],
    )


THEMES = {name: _generate_theme(cfg) for name, cfg in _THEME_CONFIGS.items()}

# ---------------------------------------------------------------------------
#  编程式颜色令牌访问 — 供 HTML 渲染、内联样式等场景使用
# ---------------------------------------------------------------------------

# 运行时当前主题名（由 MainWindow.change_theme() 维护）
_current_theme_name: str = "科幻"


def set_current_theme(theme_name: str):
    """设置当前主题名（由 MainWindow.change_theme 调用）"""
    global _current_theme_name
    if theme_name in _THEME_CONFIGS:
        _current_theme_name = theme_name


def get_current_theme() -> str:
    """获取当前主题名"""
    return _current_theme_name


def get_theme_colors(theme_name: str = None) -> dict:
    """获取指定主题的完整颜色令牌字典

    Args:
        theme_name: 主题名称，默认使用当前主题

    Returns:
        dict: 包含 bg, fg, hint, accent, border 等所有颜色令牌的字典
    """
    name = theme_name or _current_theme_name
    cfg = _THEME_CONFIGS.get(name, _THEME_CONFIGS["默认"])
    # 返回副本，防止外部修改内部配置
    result = dict(cfg)
    # P2-6: 补充语义令牌默认值（success/warning，供按钮变体和状态指示使用）
    if not result.get("success"):
        result["success"] = "#22C55E"
    if not result.get("success_hover"):
        result["success_hover"] = "#16A34A"
    if not result.get("warning"):
        result["warning"] = "#F59E0B"
    if not result.get("warning_hover"):
        result["warning_hover"] = "#D97706"
    return result


def is_dark_theme(theme_name: str = None) -> bool:
    """判断指定主题是否为深色主题"""
    name = theme_name or _current_theme_name
    cfg = _THEME_CONFIGS.get(name, _THEME_CONFIGS["默认"])
    return _is_dark_theme(cfg)


def theme_color(key: str, theme_name: str = None) -> str:
    """快捷获取单个主题颜色令牌

    Args:
        key: 颜色令牌名（如 'bg', 'fg', 'accent', 'border' 等）
        theme_name: 主题名称，默认使用当前主题

    Returns:
        str: 颜色值（如 '#1E293B'）
    """
    name = theme_name or _current_theme_name
    cfg = _THEME_CONFIGS.get(name, _THEME_CONFIGS["默认"])
    # P2-6: success/warning 令牌默认值推导（无需在每个主题中显式定义）
    if key in ("success", "success_hover", "warning", "warning_hover"):
        val = cfg.get(key)
        if val:
            return val
        defaults = {"success": "#22C55E", "success_hover": "#16A34A",
                    "warning": "#F59E0B", "warning_hover": "#D97706"}
        return defaults.get(key, "")
    return cfg.get(key, "")


# 智能体 id → 主题令牌映射
_AGENT_TOKEN_MAP = {
    "steward": "agent_steward",
    "data_operator": "agent_operator",
    "schema_manager": "agent_schema",
    "planner": "agent_planner",
    "analyst": "agent_analyst",
    "web_surfer": "agent_web",
    "media_creator": "agent_media",
    "dev_coder": "agent_dev",
    "ops_coder": "agent_ops",
    "fixer": "agent_fixer",
}

# 智能体默认硬编码颜色（当主题中没有对应令牌时的兜底）
_AGENT_FALLBACK_COLORS = {
    "steward": "#a855f7",
    "data_operator": "#58a6ff",
    "schema_manager": "#38bdf8",
    "planner": "#30d158",
    "analyst": "#db61a2",
    "web_surfer": "#f0883e",
    "media_creator": "#c084fc",
    "dev_coder": "#f97316",
    "ops_coder": "#fb923c",
    "fixer": "#ef4444",
}


def get_agent_color(agent_id: str, theme_name: str = None) -> str:
    """获取智能体的主题化颜色

    Args:
        agent_id: 智能体 id（如 'boss', 'game_designer' 等）
        theme_name: 主题名称，默认使用当前主题

    Returns:
        str: 颜色值，如果主题中没有对应令牌则返回兜底颜色
    """
    token = _AGENT_TOKEN_MAP.get(agent_id)
    if token:
        color = theme_color(token, theme_name)
        if color:
            return color
    return _AGENT_FALLBACK_COLORS.get(agent_id, "#58a6ff")


def get_chat_css(theme_name: str = None) -> str:
    """生成聊天区域 HTML 默认样式表（用于 QTextEdit.document().setDefaultStyleSheet()）

    根据 is_dark 动态生成，确保代码块、表格、引用等元素适配当前主题。
    """
    name = theme_name or _current_theme_name
    cfg = _THEME_CONFIGS.get(name, _THEME_CONFIGS["默认"])
    dark = _is_dark_theme(cfg)

    bg = cfg["bg"]
    fg = cfg["fg"]
    hint = cfg["hint"]
    accent = cfg["accent"]
    border = cfg["border"]
    input_bg = cfg["input_bg"]
    accent_light = cfg.get("accent_light", input_bg)

    if dark:
        code_bg = input_bg
        code_color = "#d2a8ff" if name != "暖调" else "#FCD34D"
        table_header_bg = input_bg
        table_border = border
        blockquote_border = accent
        blockquote_color = hint
        link_color = accent
        strong_color = fg
        body_color = fg
    else:
        code_bg = "#f1f5f9"
        code_color = "#6d28d9"
        table_header_bg = "#f1f5f9"
        table_border = "#cbd5e1"
        blockquote_border = accent
        blockquote_color = "#374151"
        link_color = "#0369a1"
        strong_color = "#000000"
        body_color = "#000000"

    return f"""
        body {{ color: {body_color}; }}
        pre {{
            background: transparent;
            border: none;
            padding: 4px 0;
            margin: 4px 0;
            color: {fg};
        }}
        code {{
            background: transparent;
            padding: 0;
            color: {fg};
        }}
        table {{
            border-collapse: collapse;
            margin: 8px 0;
            width: 100%;
        }}
        th {{
            background: {table_header_bg};
            color: {hint};
            padding: 6px 12px;
            border: 1px solid {table_border};
            text-align: left;
            font-weight: bold;
        }}
        td {{
            padding: 6px 12px;
            border: 1px solid {table_border};
            color: {fg};
        }}
        p {{ color: {body_color}; }}
        h1 {{ color: {fg}; font-size: 18px; margin: 12px 0 4px; }}
        h2 {{ color: {fg}; font-size: 15px; margin: 10px 0 4px; }}
        h3 {{ color: {fg}; font-size: 13px; margin: 8px 0 4px; }}
        ul, ol {{ margin: 4px 0; padding-left: 20px; color: {fg}; }}
        li {{ margin: 2px 0; color: {fg}; }}
        blockquote {{
            border-left: 3px solid {blockquote_border};
            padding-left: 12px;
            color: {blockquote_color};
            margin: 8px 0;
        }}
        a {{ color: {link_color}; text-decoration: none; }}
        hr {{ border: none; border-top: 1px solid {border}; margin: 12px 0; }}
        strong {{ color: {strong_color}; }}
        em {{ color: {fg}; }}
        .codehilite {{ background: {code_bg}; }}
        .codehilite pre {{ background: {code_bg}; }}
        .highlight {{ background: {code_bg}; }}
        .highlight pre {{ background: {code_bg}; }}
    """


def get_chat_bubble_css(theme_name: str = None) -> dict:
    """生成聊天气泡 HTML 样式令牌（用于 add_user_message / add_assistant_message 等）

    Returns:
        dict: 包含 user_bubble, assistant_bubble, system_bubble, error_bubble 等样式字典
    """
    name = theme_name or _current_theme_name
    cfg = _THEME_CONFIGS.get(name, _THEME_CONFIGS["默认"])
    dark = _is_dark_theme(cfg)

    accent = cfg["accent"]
    accent_hover = cfg["accent_hover"]
    fg = cfg["fg"]
    hint = cfg["hint"]
    bg = cfg["bg"]
    border = cfg["border"]
    input_bg = cfg["input_bg"]
    accent_light = cfg.get("accent_light", input_bg)

    if dark:
        user_bubble_bg = f"linear-gradient(135deg, {accent_light}, {input_bg})"
        user_bubble_border = accent
        user_name_color = accent
        assistant_bubble_bg = f"linear-gradient(135deg, {input_bg}, {bg})"
        assistant_bubble_border = border
        assistant_name_color = "#7ee787" if name not in ("暖调",) else "#FCD34D"
        system_bubble_bg = input_bg
        system_bubble_border = border
        system_color = hint
        error_bubble_bg = "#2d0f0f"
        error_bubble_border = "#da3633"
        error_color = "#f85149"
        compose_bg = input_bg
        compose_border = border
        send_btn_bg = accent
        send_btn_hover = accent_hover
        send_btn_color = cfg.get("btn_text", "white")
        send_btn_disabled_bg = cfg.get("disabled_bg", "#333")
        send_btn_disabled_color = cfg.get("disabled_fg", "#666")
        chat_bg = bg
        scrollbar_bg = bg
        scrollbar_handle = border
        input_border_focus = accent
        input_border = border
    else:
        user_bubble_bg = f"linear-gradient(135deg, {accent_light}, {input_bg})"
        user_bubble_border = accent
        user_name_color = "#0369a1"
        assistant_bubble_bg = "#ffffff"
        assistant_bubble_border = border
        assistant_name_color = "#166534"
        system_bubble_bg = accent_light
        system_bubble_border = border
        system_color = hint
        error_bubble_bg = "#fff5f5"
        error_bubble_border = "#e53e3e"
        error_color = "#c53030"
        compose_bg = "#ffffff"
        compose_border = border
        send_btn_bg = accent
        send_btn_hover = accent_hover
        send_btn_color = cfg.get("btn_text", "white")
        send_btn_disabled_bg = cfg.get("disabled_bg", "#e2e8f0")
        send_btn_disabled_color = cfg.get("disabled_fg", "#94a3b8")
        chat_bg = bg
        scrollbar_bg = bg
        scrollbar_handle = "#cbd5e1"
        input_border_focus = accent
        input_border = border

    return {
        "user_bubble_bg": user_bubble_bg,
        "user_bubble_border": user_bubble_border,
        "user_name_color": user_name_color,
        "assistant_bubble_bg": assistant_bubble_bg,
        "assistant_bubble_border": assistant_bubble_border,
        "assistant_name_color": assistant_name_color,
        "system_bubble_bg": system_bubble_bg,
        "system_bubble_border": system_bubble_border,
        "system_color": system_color,
        "error_bubble_bg": error_bubble_bg,
        "error_bubble_border": error_bubble_border,
        "error_color": error_color,
        "compose_bg": compose_bg,
        "compose_border": compose_border,
        "send_btn_bg": send_btn_bg,
        "send_btn_hover": send_btn_hover,
        "send_btn_color": send_btn_color,
        "send_btn_disabled_bg": send_btn_disabled_bg,
        "send_btn_disabled_color": send_btn_disabled_color,
        "chat_bg": chat_bg,
        "scrollbar_bg": scrollbar_bg,
        "scrollbar_handle": scrollbar_handle,
        "input_border_focus": input_border_focus,
        "input_border": input_border,
        "fg": fg,
        "hint": hint,
        "bg": bg,
        "border": border,
        "accent": accent,
        "accent_hover": accent_hover,
        "input_bg": input_bg,
        "accent_light": accent_light,
    }


# ---------------------------------------------------------------------------
#  P2-6: 设计令牌常量（字号 / 间距 / 圆角）
#  供代码中内联样式使用，确保跨组件视觉一致性
# ---------------------------------------------------------------------------

# 字号（px）
FONT_SIZE_XS = 11   # 提示文字、辅助说明
FONT_SIZE_SM = 12   # 次要标题、表头
FONT_SIZE_MD = 13   # 正文（默认）
FONT_SIZE_LG = 14   # 区块标题
FONT_SIZE_XL = 16   # 页面标题
FONT_SIZE_2XL = 20  # 大标题

# 间距（px）
SPACING_XS = 4
SPACING_SM = 8
SPACING_MD = 12
SPACING_LG = 16
SPACING_XL = 24
SPACING_2XL = 32

# 圆角（px）
RADIUS_SM = 4    # 小控件（标签、徽章）
RADIUS_MD = 8    # 中等控件（按钮、输入框）
RADIUS_LG = 10   # 大控件（卡片、容器）
RADIUS_XL = 16   # 特大控件（对话框、浮窗）

# 按钮变体标识（配合 QSS [variant="xxx"] 选择器使用）
BTN_VARIANT_PRIMARY = "primary"      # 主按钮（默认，使用 accent 色）
BTN_VARIANT_SECONDARY = "secondary"  # 次要按钮（使用 input_bg + border）
BTN_VARIANT_DANGER = "danger"        # 危险按钮（删除、取消等）
BTN_VARIANT_SUCCESS = "success"      # 成功按钮（确认、执行等）

# 常用字号快捷映射
FONT_WEIGHT_NORMAL = 400
FONT_WEIGHT_MEDIUM = 500
FONT_WEIGHT_SEMIBOLD = 600
FONT_WEIGHT_BOLD = 700


def apply_button_variant(btn, variant: str):
    """为 QPushButton 应用变体样式（P2-8 辅助函数）

    Args:
        btn: QPushButton 实例
        variant: BTN_VARIANT_* 常量之一
    """
    btn.setProperty("variant", variant)
    # 触发样式表重新求值
    btn.style().unpolish(btn)
    btn.style().polish(btn)


# P2-6: 按钮变体样式表（编程式访问，用于需要动态生成样式表的场景）
def get_button_variant_qss(variant: str, theme_name: str = None) -> str:
    """获取指定按钮变体的样式表字符串"""
    t = get_theme_colors(theme_name)
    if variant == BTN_VARIANT_SECONDARY:
        return (f"background-color: {t.get('input_bg')}; color: {t.get('fg')}; "
                f"border: 1px solid {t.get('border')}; border-radius: {RADIUS_MD}px; "
                f"padding: 10px 24px; font-weight: {FONT_WEIGHT_SEMIBOLD};")
    if variant == BTN_VARIANT_DANGER:
        return (f"background-color: {t.get('danger')}; color: white; "
                f"border: none; border-radius: {RADIUS_MD}px; "
                f"padding: 10px 24px; font-weight: {FONT_WEIGHT_SEMIBOLD};")
    if variant == BTN_VARIANT_SUCCESS:
        success = t.get("success", "#22C55E")
        return (f"background-color: {success}; color: white; "
                f"border: none; border-radius: {RADIUS_MD}px; "
                f"padding: 10px 24px; font-weight: {FONT_WEIGHT_SEMIBOLD};")
    # primary（默认）
    return (f"background-color: {t.get('accent')}; color: {t.get('btn_text')}; "
            f"border: none; border-radius: {RADIUS_MD}px; "
            f"padding: 10px 24px; font-weight: {FONT_WEIGHT_SEMIBOLD};")
