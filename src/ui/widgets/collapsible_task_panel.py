"""可折叠任务面板 — QPropertyAnimation 平滑过渡 + 折叠态保留摘要信息"""

from __future__ import annotations

from PyQt6.QtCore import (
    QEasingCurve,
    QPropertyAnimation,
    Qt,
    pyqtSignal,
)
from PyQt6.QtGui import QEnterEvent, QFont, QMouseEvent
from PyQt6.QtWidgets import (
    QFrame,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QScrollArea,
    QSizePolicy,
    QVBoxLayout,
    QWidget,
)

from common.lucide_icon import get_icon


class _ClickableFrame(QFrame):
    """可点击的 QFrame — 确保 mousePressEvent 永远生效（替代实例属性赋值）"""

    clicked = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)

    def mousePressEvent(self, event: QMouseEvent):
        if event.button() == Qt.MouseButton.LeftButton:
            self.clicked.emit()
            event.accept()
        else:
            super().mousePressEvent(event)

    def enterEvent(self, event: QEnterEvent):
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        super().enterEvent(event)


class CollapsibleTaskPanel(QWidget):
    """可折叠任务面板

    特性：
    - QPropertyAnimation 驱动 250ms 缓入缓出过渡
    - 折叠时保留标题栏 + 任务摘要（如 "3个任务 · 1个进行中"）
    - 展开时完整展示所有任务内容（内含 QScrollArea 支持滚动）
    - Chevron 图标旋转动画跟随折叠状态
    - 主题无关样式（由调用方通过 setStyleSheet 设置）
    """

    ANIM_DURATION = 250  # ms

    toggled = pyqtSignal(bool)  # True = expanded, False = collapsed

    def __init__(self, title: str = "任务工作区", parent=None):
        super().__init__(parent)
        self._expanded = False
        self._title = title
        self._summary = ""
        self._content_max_h = 200
        self._anim: QPropertyAnimation | None = None

        self._setup_ui()
        self._apply_initial_state()

    # ── public API ──

    def toggle(self, animated: bool = True):
        """切换折叠/展开"""
        if self._expanded:
            self.collapse(animated)
        else:
            self.expand(animated)

    def expand(self, animated: bool = True):
        """展开面板（滚动位置复位到顶部）"""
        if self._expanded:
            return
        self._expanded = True
        self._update_chevron()
        self._collapse_summary.setVisible(False)
        self._content.setVisible(True)
        if hasattr(self, '_scroll_area'):
            self._scroll_area.verticalScrollBar().setValue(0)
        if animated:
            self._animate_to(self._content_max_h)
        else:
            self._content.setMaximumHeight(self._content_max_h)
        self.toggled.emit(True)

    def collapse(self, animated: bool = True):
        """折叠面板"""
        if not self._expanded:
            return
        self._expanded = False
        self._update_chevron()
        self._collapse_summary.setVisible(True)
        if animated:
            self._animate_to(0)
        else:
            self._content.setMaximumHeight(0)
            self._content.setVisible(False)
        self.toggled.emit(False)

    def set_summary(self, text: str):
        """设置折叠态摘要文字"""
        self._summary = text
        self._collapse_summary.setText(text)

    @property
    def content_layout(self) -> QVBoxLayout:
        """返回内容区域布局，供调用方填充任务列表"""
        return self._content_layout

    @property
    def is_expanded(self) -> bool:
        return self._expanded

    def set_content_height(self, h: int):
        """设置内容区展开后的目标高度"""
        self._content_max_h = max(h, 40)
        if self._expanded:
            self._content.setMaximumHeight(self._content_max_h)

    # ── theme support ──

    def set_title_style(self, style: str):
        self._title_label.setStyleSheet(style)

    def set_summary_style(self, style: str):
        self._collapse_summary.setStyleSheet(style)

    def set_chevron_color(self, color: str):
        self._chevron_hint = color
        self._update_chevron()

    # ── internal ──

    def _setup_ui(self):
        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        # ── header bar (always visible, clickable, emits clicked signal) ──
        header = _ClickableFrame()
        header.setObjectName("collapsibleHeader")
        self._header_bar = header
        header_layout = QHBoxLayout(header)
        header_layout.setContentsMargins(12, 8, 8, 6)
        header_layout.setSpacing(8)

        self._title_label = QLabel(self._title)
        self._title_label.setFont(QFont("Microsoft YaHei", 10, QFont.Weight.Bold))
        header_layout.addWidget(self._title_label)

        self._collapse_summary = QLabel()
        self._collapse_summary.setFont(QFont("Microsoft YaHei", 9))
        self._collapse_summary.setStyleSheet("color: palette(mid); font-size: 12px;")
        # 让 summary 标签不拦截鼠标事件，传递到父 QFrame
        self._collapse_summary.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents, True)
        header_layout.addWidget(self._collapse_summary, stretch=1)

        # chevron toggle button
        self._chevron_btn = QPushButton()
        self._chevron_btn.setObjectName("collapsibleChevron")
        self._chevron_btn.setFlat(True)
        self._chevron_btn.setFixedSize(24, 24)
        self._chevron_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._chevron_btn.setToolTip("展开/折叠任务面板")
        self._chevron_btn.clicked.connect(lambda: self.toggle())
        self._chevron_hint = "#888"
        self._update_chevron()
        header_layout.addWidget(self._chevron_btn)

        # 整个标题栏可点击（_ClickableFrame.clicked 信号）
        header.clicked.connect(lambda: self.toggle())
        header.setMinimumHeight(32)

        root.addWidget(header)

        # ── card-style content area (animated height + scrollable) ──
        self._content = QFrame()
        self._content.setObjectName("collapsibleContent")
        content_root = QVBoxLayout(self._content)
        content_root.setContentsMargins(0, 0, 0, 0)
        content_root.setSpacing(0)

        self._scroll_area = QScrollArea()
        self._scroll_area.setObjectName("collapsibleScrollArea")
        self._scroll_area.setWidgetResizable(True)
        self._scroll_area.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self._scroll_area.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        self._scroll_area.setFrameShape(QFrame.Shape.NoFrame)
        self._scroll_content = QWidget()
        self._scroll_content.setObjectName("collapsibleScrollContent")
        self._content_layout = QVBoxLayout(self._scroll_content)
        self._content_layout.setContentsMargins(10, 6, 10, 10)
        self._content_layout.setSpacing(4)
        self._scroll_area.setWidget(self._scroll_content)
        content_root.addWidget(self._scroll_area)

        root.addWidget(self._content)

        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Preferred)

    def _apply_initial_state(self):
        self._expanded = False
        self._content.setMaximumHeight(0)
        self._content.setVisible(False)
        self._collapse_summary.setVisible(True)

    def _update_chevron(self):
        icon_name = "chevron-up" if self._expanded else "chevron-down"
        try:
            self._chevron_btn.setIcon(get_icon(icon_name, self._chevron_hint, 16))
        except Exception:
            self._chevron_btn.setText("▲" if self._expanded else "▼")

    def _animate_to(self, target_h: int):
        if self._anim and self._anim.state() == QPropertyAnimation.State.Running:
            self._anim.stop()
        anim = QPropertyAnimation(self._content, b"maximumHeight")
        anim.setDuration(self.ANIM_DURATION)
        anim.setStartValue(self._content.maximumHeight())
        anim.setEndValue(target_h)
        anim.setEasingCurve(QEasingCurve.Type.InOutCubic)
        anim.finished.connect(self._on_anim_finished)
        self._anim = anim
        anim.start()

    def _on_anim_finished(self):
        if not self._expanded:
            self._content.setVisible(False)
