"""可展开任务行 — 单击摘要行展开/折叠详情面板，支持 QPropertyAnimation 过渡"""

from __future__ import annotations

from PyQt6.QtCore import (
    QEasingCurve,
    QPropertyAnimation,
    Qt,
    pyqtSignal,
)
from PyQt6.QtGui import QFont
from PyQt6.QtWidgets import (
    QFrame,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QVBoxLayout,
)


class TaskRowWidget(QFrame):
    """单条任务的可展开卡片行

    布局:
      ┌─ summary_row (clickable) ──────────────────────┐
      │ icon  [priority]  任务内容摘要  [status]  ▼/▲  │
      ├─ detail_panel (animated height) ───────────────┤
      │  完整内容文本                                    │
      │  状态 / 优先级 badges                          │
      │  [完成]  [删除]  按钮                           │
      └─────────────────────────────────────────────────┘
    """

    ANIM_DURATION = 200  # ms
    # 外部可订阅的信号
    status_changed = pyqtSignal(str, str)   # task_id, new_status
    task_deleted = pyqtSignal(str)          # task_id

    def __init__(self, task: dict, is_active: bool = False, theme: dict | None = None, parent=None):
        super().__init__(parent)
        self._task = task
        self._tid = task.get("id", "")
        self._expanded = False
        self._theme = theme or {}
        self._anim: QPropertyAnimation | None = None

        self._build_ui()
        self.set_active(is_active)
        self._apply_style()

    # ── public API ──

    def set_active(self, active: bool):
        self._active = active
        self._apply_style()

    def update_task(self, task: dict):
        self._task = task
        self._tid = task.get("id", "")
        self._refresh_summary()
        self._refresh_detail()

    @property
    def task_id(self) -> str:
        return self._tid

    # ── UI building ──

    def _build_ui(self):
        self.setObjectName("taskRow")
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        # ── summary row (always visible) ──
        self._summary = QFrame()
        self._summary.setObjectName("taskRowSummary")
        summary_layout = QHBoxLayout(self._summary)
        summary_layout.setContentsMargins(8, 6, 8, 6)
        summary_layout.setSpacing(8)

        self._icon_label = QLabel()
        self._icon_label.setFixedWidth(20)
        summary_layout.addWidget(self._icon_label)

        self._pri_label = QLabel()
        self._pri_label.setFixedWidth(24)
        summary_layout.addWidget(self._pri_label)

        self._content_label = QLabel()
        self._content_label.setWordWrap(False)
        self._content_label.setFont(QFont("Microsoft YaHei", 9))
        summary_layout.addWidget(self._content_label, stretch=1)

        self._status_badge = QLabel()
        self._status_badge.setFixedHeight(20)
        self._status_badge.setFont(QFont("Microsoft YaHei", 8))
        summary_layout.addWidget(self._status_badge)

        self._chevron_label = QLabel("▼")
        self._chevron_label.setFixedWidth(16)
        self._chevron_label.setFont(QFont("Segoe UI", 8))
        self._chevron_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        summary_layout.addWidget(self._chevron_label)

        self._summary.mousePressEvent = lambda e: self._toggle() if e.button() == Qt.MouseButton.LeftButton else None
        root.addWidget(self._summary)

        # ── detail panel (animated) ──
        self._detail = QFrame()
        self._detail.setObjectName("taskRowDetail")
        self._detail.setMaximumHeight(0)
        self._detail.setVisible(False)
        detail_layout = QVBoxLayout(self._detail)
        detail_layout.setContentsMargins(10, 4, 10, 8)
        detail_layout.setSpacing(6)

        # full content (word wrapped)
        self._full_content = QLabel()
        self._full_content.setObjectName("taskRowFullContent")
        self._full_content.setWordWrap(True)
        self._full_content.setFont(QFont("Microsoft YaHei", 9))
        detail_layout.addWidget(self._full_content)

        # separator line
        sep = QFrame()
        sep.setFrameShape(QFrame.Shape.HLine)
        sep.setStyleSheet("border: none; border-top: 1px solid palette(mid);")
        detail_layout.addWidget(sep)

        # meta row: status + priority + action buttons
        meta_row = QHBoxLayout()
        meta_row.setSpacing(8)

        self._detail_status = QLabel()
        self._detail_status.setFont(QFont("Microsoft YaHei", 8))
        meta_row.addWidget(self._detail_status)

        self._detail_priority = QLabel()
        self._detail_priority.setFont(QFont("Microsoft YaHei", 8))
        meta_row.addWidget(self._detail_priority)

        meta_row.addStretch()

        self._btn_complete = QPushButton("✓ 完成")
        self._btn_complete.setFixedHeight(22)
        self._btn_complete.setFont(QFont("Microsoft YaHei", 8))
        self._btn_complete.setCursor(Qt.CursorShape.PointingHandCursor)
        self._btn_complete.clicked.connect(self._mark_complete)
        meta_row.addWidget(self._btn_complete)

        self._btn_delete = QPushButton("🗑")
        self._btn_delete.setFixedSize(22, 22)
        self._btn_delete.setFont(QFont("Microsoft YaHei", 8))
        self._btn_delete.setCursor(Qt.CursorShape.PointingHandCursor)
        self._btn_delete.clicked.connect(self._delete_task)
        meta_row.addWidget(self._btn_delete)

        detail_layout.addLayout(meta_row)
        root.addWidget(self._detail)

        self._refresh_summary()
        self._refresh_detail()

    # ── toggle logic ──

    def _toggle(self):
        if self._expanded:
            self._collapse()
        else:
            self._expand()

    def _expand(self):
        if self._expanded:
            return
        self._expanded = True
        self._chevron_label.setText("▲")
        self._detail.setVisible(True)

        # 求详情面板自然高度
        self._detail.setMaximumHeight(2000)
        natural = self._detail.sizeHint().height()
        self._detail.setMaximumHeight(0)

        self._animate_to(natural)

    def _collapse(self):
        if not self._expanded:
            return
        self._expanded = False
        self._chevron_label.setText("▼")
        self._animate_to(0)

    def _animate_to(self, target_h: int):
        if self._anim and self._anim.state() == QPropertyAnimation.State.Running:
            self._anim.stop()
        anim = QPropertyAnimation(self._detail, b"maximumHeight")
        anim.setDuration(self.ANIM_DURATION)
        anim.setStartValue(self._detail.maximumHeight())
        anim.setEndValue(target_h)
        anim.setEasingCurve(QEasingCurve.Type.InOutCubic)
        anim.finished.connect(self._on_anim_finished)
        self._anim = anim
        anim.start()

    def _on_anim_finished(self):
        if not self._expanded:
            self._detail.setVisible(False)

    # ── actions ──

    def _mark_complete(self):
        self.status_changed.emit(self._tid, "completed")

    def _delete_task(self):
        self.task_deleted.emit(self._tid)

    # ── rendering helpers ──

    def _refresh_summary(self):
        t = self._task
        status_icons = {"in_progress": "⋯", "pending": "·", "completed": "✓"}
        status_colors = {"in_progress": "#d29922", "pending": "#8b949e", "completed": "#3fb950"}
        priority_labels = {"high": "[高]", "medium": "[中]", "low": "[低]"}

        s = t.get("status", "pending")
        sc = status_colors.get(s, "#8b949e")

        self._icon_label.setText(status_icons.get(s, "·"))
        self._icon_label.setStyleSheet(f"color: {sc}; font-size: 14px; font-weight: bold;")

        pm = priority_labels.get(t.get("priority", ""), "")
        self._pri_label.setText(pm)
        self._pri_label.setStyleSheet(f"color: {sc}; font-size: 11px;")

        content = t.get("content", "")
        self._content_label.setText(content)
        self._content_label.setStyleSheet(f"color: {sc}; font-size: 13px;")

        status_names = {"pending": "待处理", "in_progress": "进行中", "completed": "已完成"}
        self._status_badge.setText(status_names.get(s, s))
        self._status_badge.setStyleSheet(f"""
            color: {sc}; background: {sc}18; border: 1px solid {sc}44;
            border-radius: 4px; padding: 1px 6px; font-size: 11px;
        """)

    def _refresh_detail(self):
        t = self._task
        sc_map = {"in_progress": "#d29922", "pending": "#8b949e", "completed": "#3fb950"}
        s = t.get("status", "pending")
        sc = sc_map.get(s, "#8b949e")
        nm_map = {"pending": "待处理", "in_progress": "进行中", "completed": "已完成"}
        pr_map = {"high": "高优先级", "medium": "中优先级", "low": "低优先级"}

        self._full_content.setText(t.get("content", ""))
        self._full_content.setStyleSheet("color: palette(text); font-size: 13px; line-height: 1.5;")

        self._detail_status.setText(f"状态: {nm_map.get(s, s)}")
        self._detail_status.setStyleSheet(f"color: {sc}; padding: 2px 6px; border-radius: 3px;")

        pr = t.get("priority", "medium")
        self._detail_priority.setText(f"优先级: {pr_map.get(pr, pr)}")
        pr_colors = {"high": "#f85149", "medium": "#d29922", "low": "#58a6ff"}
        self._detail_priority.setStyleSheet(f"color: {pr_colors.get(pr, '#888')}; padding: 2px 6px;")

        is_done = s == "completed"
        self._btn_complete.setVisible(not is_done)

    def _apply_style(self):
        try:
            from ui.themes import get_theme_colors
            tc = get_theme_colors()
            _bg = tc.get("input_bg", "#161b22")
            _hover = tc.get("hover", "#1c2333")
            _active = tc.get("accent", "#58a6ff") + "22"
            _active_border = tc.get("accent", "#58a6ff") + "66"
            _fg = tc.get("fg", "#e6edf3")
        except Exception:
            _bg, _hover, _active, _active_border, _fg = "#161b22", "#1c2333", "#1a3a5c", "#2a5298", "#e6edf3"

        active = getattr(self, '_active', False)

        self.setStyleSheet(f"""
            QFrame#taskRow {{ border: none; border-radius: 6px; }}
            QFrame#taskRowSummary {{
                background: {_active if active else _bg};
                border: {'1px solid ' + _active_border if active else '1px solid transparent'};
                border-radius: 6px;
            }}
            QFrame#taskRowSummary:hover {{
                background: {_bg if not active else _active};
                border: 1px solid {_active_border};
            }}
            QFrame#taskRowDetail {{
                background: {_bg};
                border: 1px solid {_active_border + '44'};
                border-top: none;
                border-radius: 0 0 6px 6px;
            }}
            QFrame#taskRowDetail QLabel#taskRowFullContent {{
                color: {_fg};
            }}
        """)

        # style buttons
        for btn in [self._btn_complete, self._btn_delete]:
            btn.setStyleSheet(f"""
                QPushButton {{
                    background: {_bg}; color: {_fg};
                    border: 1px solid {_active_border};
                    border-radius: 4px; padding: 2px 8px;
                }}
                QPushButton:hover {{
                    background: {_active};
                }}
            """)
