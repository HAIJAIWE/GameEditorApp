"""策划书模块主题样式 — Tabler 风格：加粗线条 + 10px 圆角 + 左侧 accent 色条"""
from __future__ import annotations

from ui.themes import theme_color

# ── 全局设计令牌 ──
_R = "10px"     # 大圆角
_r = "6px"      # 小圆角


def _accent():    return theme_color('accent')
def _bg():        return theme_color('input_bg')
def _fg():        return theme_color('fg')
def _border():    return theme_color('border')
def _hint():      return theme_color('hint')
def _divider():   return theme_color('divider')
def _hover():     return theme_color('accent_light')
def _section():   return theme_color('section_title')
def _btn_text():  return theme_color('btn_text') or 'white'
def _fixer():     return theme_color('agent_fixer')
def _planner():   return theme_color('agent_planner')
def _steward():   return theme_color('agent_steward')
def _hover_alt(): return theme_color('accent_hover_light')
def _secondary(): return theme_color('secondary_fg')
def _scroll():    return theme_color('scroll')


# ── 卡片 ──
def ceshu_card_qss(selected: bool = False) -> str:
    base_border = _accent() if selected else _border()
    base_bg = _hover() if selected else _bg()
    left_accent = f"border-left:3px solid {_accent()};" if selected else ""
    return f"""
        QPushButton {{ border:1px solid {base_border}; border-radius:{_R};
            background:{base_bg}; text-align:left; padding:16px 18px; {left_accent} }}
        QPushButton:hover {{ border-color:{_accent()}; background:{_hover()};
            border-left:3px solid {_accent()}; }}
    """

def ceshu_card_label_qss() -> str:
    return f"font-size:14px; font-weight:500; color:{_fg()}; border:none; background:transparent;"

def ceshu_card_date_qss() -> str:
    return f"color:{_hint()}; font-size:11px; border:none; background:transparent;"

def ceshu_badge_type_qss() -> str:
    return f"background:{_hover()}; color:{_accent()}; padding:3px 10px; border-radius:{_r}; font-size:11px;"

def ceshu_badge_status_qss(status: str) -> str:
    tokens = {"draft":("hint","divider"),"in_progress":("accent","accent_light"),
              "review":("agent_ops","accent_hover_light"),"final":("agent_planner","accent_hover_light")}
    fk, bk = tokens.get(status, ("hint","divider"))
    f, b = theme_color(fk) or _hint(), theme_color(bk) or _divider()
    return f"background:{b}; color:{f}; padding:3px 10px; border-radius:{_r}; font-size:11px;"

def ceshu_progress_qss() -> str:
    return f"""QProgressBar {{ border:none; background:{_divider()}; border-radius:5px; }}
        QProgressBar::chunk {{ background:{_accent()}; border-radius:5px; }}"""


# ── 首页 ──
def ceshu_home_title_qss() -> str:
    return f"color:{_fg()};"

def ceshu_home_search_qss() -> str:
    return f"""
        QLineEdit {{ border:1px solid {_border()}; border-radius:{_R}; padding:8px 14px;
            background:{_bg()}; color:{_fg()}; }}
        QLineEdit:focus {{ border-color:{_accent()}; }}"""

def ceshu_home_btn_new_qss() -> str:
    return f"""
        QPushButton {{ background:{_accent()}; color:{_btn_text()};
            border:none; border-radius:{_R}; padding:10px 22px; font-size:13px; }}
        QPushButton:hover {{ background:{theme_color('accent_hover')}; }}"""

def ceshu_home_sep_qss() -> str:
    return f"background:{_divider()};"

def ceshu_home_section_label_qss() -> str:
    return f"font-size:13px; font-weight:500; color:{_hint()};"

def ceshu_home_recent_btn_qss() -> str:
    return f"""
        QPushButton {{ background:{_divider()}; border:1px solid {_border()};
            border-radius:{_r}; padding:8px 14px; font-size:12px; color:{_fg()}; }}
        QPushButton:hover {{ background:{_hover()}; border-color:{_accent()}; }}"""

def ceshu_home_empty_qss() -> str:
    return f"color:{_hint()}; font-size:14px; padding:40px;"

def ceshu_home_ai_card_qss() -> str:
    """首页 AI 入口卡片样式 — 突出显示，引导用户和 AI 聊想法"""
    return f"""
        QFrame#AiEntryCard {{
            background: qlineargradient(x1:0, y1:0, x2:1, y2:1,
                stop:0 {_accent()}, stop:1 {theme_color('accent_hover')});
            border: none; border-radius: 14px;
        }}
        QFrame#AiEntryCard QLabel#AiTitle {{
            color: white; font-size: 16px; font-weight: 600;
            background: transparent; border: none;
        }}
        QFrame#AiEntryCard QLabel#AiHint {{
            color: rgba(255,255,255,0.85); font-size: 12px;
            background: transparent; border: none;
        }}
        QFrame#AiEntryCard QLineEdit#AiInput {{
            background: rgba(255,255,255,0.95); border: none;
            border-radius: 8px; padding: 10px 14px; color: #333;
            font-size: 13px;
        }}
        QFrame#AiEntryCard QPushButton#AiBtn {{
            background: white; color: {_accent()};
            border: none; border-radius: 8px;
            padding: 10px 20px; font-size: 13px; font-weight: 600;
        }}
        QFrame#AiEntryCard QPushButton#AiBtn:hover {{
            background: #f0f0f0;
        }}
    """


# ── 编辑器工具栏 ──
def ceshu_editor_btn_back_qss() -> str:
    return f"""
        QPushButton {{ border:1px solid {_border()}; border-radius:{_r}; padding:6px 14px;
            background:{_bg()}; font-size:12px; color:{_fg()}; }}
        QPushButton:hover {{ background:{_hover()}; }}"""

def ceshu_editor_btn_save_qss() -> str:
    return f"""
        QPushButton {{ background:{_accent()}; color:{_btn_text()};
            border:none; border-radius:{_r}; padding:7px 18px; font-size:12px; }}
        QPushButton:hover {{ background:{theme_color('accent_hover')}; }}"""

def ceshu_editor_btn_export_qss() -> str:
    return f"""
        QPushButton {{ border:1px solid {_accent()}; color:{_accent()};
            border-radius:{_r}; padding:7px 18px; font-size:12px; background:{_bg()}; }}
        QPushButton:hover {{ background:{_hover()}; }}"""

def ceshu_editor_title_qss() -> str:
    return f"color:{_fg()};"


# ── 表单 ──
def ceshu_form_input_qss() -> str:
    return f"""
        QLineEdit,QTextEdit,QComboBox {{ border:1px solid {_border()}; border-radius:{_r};
            padding:6px 10px; background:{_bg()}; color:{_fg()}; }}
        QLineEdit:focus,QTextEdit:focus,QComboBox:focus {{ border-color:{_accent()};
            border-left:3px solid {_accent()}; }}"""

def ceshu_form_label_qss() -> str:
    return f"color:{_secondary()}; font-size:12px;"


# ── 章节折叠标题 ──
def ceshu_group_box_qss() -> str:
    return f"""
        QGroupBox {{ font-weight:bold; font-size:13px; color:{_fg()};
            border:1px solid {_border()}; border-radius:{_R}; margin-top:12px;
            padding-top:24px; background:{_bg()}; }}
        QGroupBox::title {{ subcontrol-origin:margin; left:12px; padding:0 6px;
            color:{_section()}; }}
        QGroupBox::indicator {{ width:14px; height:14px; }}"""


# ── 游戏系统编辑器 ──
def ceshu_systems_add_btn_qss() -> str:
    return f"""
        QPushButton {{ background:{_hover()}; color:{_accent()};
            border:1px solid {_accent()}; border-radius:{_r}; padding:5px 14px; font-size:12px; }}
        QPushButton:hover {{ background:{_hover_alt()}; }}"""

def ceshu_systems_del_btn_qss() -> str:
    return f"""
        QPushButton {{ border:none; color:{_fixer()}; font-size:14px; }}
        QPushButton:hover {{ background:{_hover()}; border-radius:{_r}; }}"""


# ── AI 面板 ──
def ceshu_ai_agent_label_qss() -> str:
    return f"color:{_steward()};"

def ceshu_ai_status_qss() -> str:
    return f"color:{_planner()}; font-size:11px;"

def ceshu_ai_chat_qss() -> str:
    return f"border:none; font-size:12px; padding:8px; background:{theme_color('bg')}; color:{_fg()};"

def ceshu_ai_input_qss() -> str:
    return f"""
        QLineEdit {{ border:1px solid {_border()}; border-radius:{_R}; padding:10px 14px;
            font-size:13px; background:{_bg()}; color:{_fg()}; }}
        QLineEdit:focus {{ border-color:{_accent()}; }}"""

def ceshu_ai_send_btn_qss() -> str:
    return f"""
        QPushButton {{ background:{_steward()}; color:white; border:none;
            border-radius:{_R}; padding:10px 18px; font-size:13px; }}
        QPushButton:hover {{ background:{theme_color('accent_hover')}; }}"""

def ceshu_ai_min_btn_qss() -> str:
    return f"""
        QPushButton {{ border:1px solid {_border()}; border-radius:{_r};
            background:{_bg()}; color:{_fg()}; }}
        QPushButton:hover {{ background:{_hover()}; }}"""

def ceshu_ai_sep_qss() -> str:
    return f"color:{_divider()};"


# ── 预览 ──
def ceshu_preview_empty_qss() -> str:
    return f"color:{_hint()}; font-size:13px;"

def ceshu_preview_tab_qss() -> str:
    return f"color:{_hint()}; font-size:13px; padding:20px;"


# ── 竞品图 ──
def ceshu_competitive_chart_qss() -> str:
    return f"background:{_bg()};"


# ── 滚动条 ──
def ceshu_scroll_area_qss() -> str:
    return f"""
        QScrollArea {{ border:none; background:{theme_color('bg')}; }}
        QScrollBar:vertical {{ background:{_divider()}; width:8px; border-radius:4px; }}
        QScrollBar::handle:vertical {{ background:{_scroll()}; border-radius:4px; min-height:30px; }}"""


def apply_ceshu_theme(widget) -> None:
    if hasattr(widget, '_apply_theme') and callable(widget._apply_theme):
        widget._apply_theme()
