"""AI字段填充按钮 — 表单旁的"AI帮我填"按钮，接入8主题 + Lucide图标"""
from __future__ import annotations

from PyQt6.QtCore import QSize, Qt, QTimer, pyqtSignal
from PyQt6.QtWidgets import QPushButton

from common.lucide_icon import get_icon

from .ceshu_theme import theme_color


class AIFieldButton(QPushButton):
    """AI 填充按钮 — 点击触发 AI 辅助填写

    防重入：点击后进入 busy 状态并禁用，外部 AI 完成后调用 set_busy(False) 恢复。
    安全兜底：若 60 秒后仍处于 busy，自动恢复（防止上层未回调导致按钮永久禁用）。
    """

    ai_fill_requested = pyqtSignal(str)  # field_path
    _BUSY_TIMEOUT_MS = 60_000  # 60 秒安全兜底

    def __init__(self, field_path: str = "", parent=None):
        super().__init__(parent)
        self._field_path = field_path
        self._busy = False
        self._safety_timer = QTimer(self)
        self._safety_timer.setSingleShot(True)
        self._safety_timer.timeout.connect(lambda: self.set_busy(False) if self._busy else None)
        self.setFixedSize(26, 26)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setToolTip(f"AI帮我填: {field_path}")
        self.clicked.connect(self._on_clicked)
        self._apply_theme()

    def is_busy(self) -> bool:
        """是否处于 AI 请求中（禁用状态）"""
        return self._busy

    def set_busy(self, busy: bool) -> None:
        """设置 busy 状态。busy=True 时禁用按钮并显示加载提示；False 恢复。"""
        self._busy = bool(busy)
        self.setEnabled(not self._busy)
        if self._busy:
            self.setToolTip("AI生成中，请稍候...")
            self.setCursor(Qt.CursorShape.WaitCursor)
            self._safety_timer.start(self._BUSY_TIMEOUT_MS)
        else:
            self.setToolTip(f"AI帮我填: {self._field_path}")
            self.setCursor(Qt.CursorShape.PointingHandCursor)
            if self._safety_timer.isActive():
                self._safety_timer.stop()

    def _on_clicked(self) -> None:
        """点击回调 — busy 状态下忽略，避免重复触发 AI 请求。"""
        if self._busy:
            return
        self.set_busy(True)
        self.ai_fill_requested.emit(self._field_path)

    def _apply_theme(self) -> None:
        accent = theme_color('agent_steward')
        bg = theme_color('accent_light')
        hover = theme_color('accent_hover_light')
        self.setStyleSheet(f"""
            QPushButton {{
                border: 1px solid {accent}; border-radius: 13px;
                background: {bg};
            }}
            QPushButton:hover {{
                background: {hover};
            }}
            QPushButton:disabled {{
                background: {bg};
                color: {accent};
            }}
        """)
        self.setIcon(get_icon("bot", accent, 14))
        self.setIconSize(QSize(14, 14))
