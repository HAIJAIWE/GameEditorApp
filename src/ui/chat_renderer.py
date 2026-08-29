"""AI 对话渲染层 — Markdown → HTML + 代码高亮 + 气泡/步骤渲染"""
from __future__ import annotations

from datetime import datetime
import html as html_mod
from typing import Optional

import markdown as md_lib
from pygments.formatters import HtmlFormatter


class ChatRenderer:
    """对话渲染器，所有渲染逻辑集中在这里"""

    # Pygments CSS 缓存
    _pygments_css: Optional[str] = None

    @classmethod
    def get_pygments_css(cls) -> str:
        if cls._pygments_css is None:
            try:
                cls._pygments_css = HtmlFormatter(style="material").get_style_defs(".codehilite")
            except Exception:
                cls._pygments_css = ""
        return cls._pygments_css

    @staticmethod
    def render_markdown(text: str) -> str:
        """Markdown → HTML（含代码高亮）"""
        if not text:
            return ""
        try:
            return md_lib.markdown(
                text,
                extensions=[
                    "codehilite",   # Pygments 代码高亮
                    "fenced_code",  # ``` 代码块
                    "tables",       # 表格
                    "sane_lists",   # 列表
                    "nl2br",        # 换行转 <br>
                ],
            )
        except Exception:
            return html_mod.escape(text).replace("\n", "<br>")

    # ── 气泡渲染 ──────────────────────────────────────────────

    def render_user_bubble(self, text: str, timestamp: str = "") -> str:
        """用户消息气泡"""
        if not timestamp:
            timestamp = datetime.now().strftime("%H:%M:%S")
        content = self.render_markdown(text)
        from ui.themes import get_chat_bubble_css, theme_color
        b = get_chat_bubble_css()
        fg = theme_color("fg")
        return (
            f'<div style="margin:8px 0;display:flex;justify-content:flex-end;">'
            f'<div style="max-width:80%;">'
            f'<div style="color:{b["user_name_color"]};font-size:14px;margin-bottom:4px;text-align:right;">'
            f'你 · {timestamp}</div>'
            f'<div style="background:{b["user_bubble_bg"]};color:{fg};'
            f'padding:12px 16px;border-radius:16px 16px 4px 16px;font-size:14px;'
            f'border:1px solid {b["user_bubble_border"]};line-height:1.55;">'
            f'{content}</div></div></div>'
        )

    def render_assistant_bubble(self, text: str, timestamp: str = "",
                                conv_id: str = "") -> str:
        """助手消息气泡"""
        if not timestamp:
            timestamp = datetime.now().strftime("%H:%M:%S")
        content = self.render_markdown(text)
        from ui.themes import get_chat_bubble_css, theme_color
        b = get_chat_bubble_css()
        fg = theme_color("fg")
        hint = theme_color("hint")
        rollback_html = ""
        if conv_id:
            rollback_html = (
                f'<div style="margin-top:4px;text-align:right;">'
                f'<a href="conv://rollback/{conv_id}" '
                f'style="color:{hint};font-size:12px;text-decoration:none;cursor:pointer;">'
                f'↩ 回退此对话</a></div>'
            )
        return (
            f'<div style="margin:8px 0;display:flex;justify-content:flex-start;">'
            f'<div style="max-width:80%;">'
            f'<div style="color:{b["assistant_name_color"]};font-size:14px;margin-bottom:4px;">'
            f'助手 · {timestamp}</div>'
            f'<div style="background:{b["assistant_bubble_bg"]};color:{fg};'
            f'padding:12px 16px;border-radius:16px 16px 16px 4px;font-size:14px;'
            f'border:1px solid {b["assistant_bubble_border"]};line-height:1.55;">'
            f'{content}</div>'
            f'{rollback_html}</div></div>'
        )

    @staticmethod
    def render_system_message(text: str) -> str:
        """系统消息（居中）"""
        from ui.themes import theme_color
        hint = theme_color("hint")
        safe = html_mod.escape(text)
        return (
            f'<div style="margin:4px 0;text-align:center;">'
            f'<span style="color:{hint};font-size:14px;font-style:italic;">'
            f'{safe}</span></div>'
        )

    @staticmethod
    def render_error_message(text: str) -> str:
        """错误消息"""
        from ui.themes import get_chat_bubble_css
        b = get_chat_bubble_css()
        safe = html_mod.escape(text)
        return (
            f'<div style="margin:8px 4px;text-align:center;">'
            f'<span style="color:{b["error_color"]};font-size:14px;font-weight:bold;">'
            f'{safe}</span></div>'
        )

    # ── 可折叠步骤块 ──────────────────────────────────────────

    @staticmethod
    def render_collapsible_step(title: str, detail: str, step_id: int,
                                expanded: bool = False, error: bool = False) -> str:
        """可折叠步骤块 HTML"""
        safe_title = html_mod.escape(title)
        safe_detail = html_mod.escape(detail).replace("\n", "<br>")
        try:
            from ui.themes import get_theme_colors
            c = get_theme_colors()
            accent = c.get("error_color", "#f85149") if error else c["accent"]
            fg = c["fg"]
            hint = c["hint"]
        except Exception:
            accent = "#f85149" if error else "#58a6ff"
            fg = "#c9d1d9"
            hint = "#8b949e"

        arrow = "▼" if expanded else "▶"
        detail_html = ""
        if expanded:
            detail_html = (
                f'<div style="margin-top:4px;border-left:2px solid {accent};'
                f'padding:8px 12px;border-radius:0 6px 6px 0;font-size:13px;color:{fg};'
                f'font-family:Consolas,monospace;max-height:600px;overflow-y:auto;'
                f'background:{hint}08;">'
                f'{safe_detail}</div>'
            )
        return (
            f'<div class="step_{step_id}" style="margin:6px 0;">'
            f'<a href="step://toggle/{step_id}" style="color:{accent};'
            f'text-decoration:none;font-size:14px;cursor:pointer;">'
            f'{arrow} {safe_title}</a>{detail_html}</div>'
        )

    # ── 历史条目渲染（统一入口） ──────────────────────────────

    def render_entry(self, entry: dict) -> str:
        """根据历史条目类型渲染为 HTML"""
        t = entry.get("type", "")
        text = entry.get("text", "")
        ts = entry.get("timestamp", "")
        if t == "user":
            return self.render_user_bubble(text, ts)
        elif t == "assistant":
            return self.render_assistant_bubble(text, ts, entry.get("conv_id", ""))
        elif t == "system":
            return self.render_system_message(text)
        elif t == "error":
            return self.render_error_message(text)
        return html_mod.escape(text).replace("\n", "<br>")
