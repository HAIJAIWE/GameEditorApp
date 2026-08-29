"""可折叠分组组件 - 支持标题栏点击折叠/展开，Lucide图标 + 主题自适应"""
from PyQt6.QtCore import QSize, Qt
from PyQt6.QtWidgets import QFrame, QHBoxLayout, QLabel, QPushButton, QVBoxLayout, QWidget

from common.lucide_icon import get_icon


class CollapsibleSection(QWidget):
    """可折叠分组：点击标题栏折叠/展开内容

    背景色通过 QSS 对象名称 (#sectionHeader, #sectionContent) 继承主题配色，
    不硬编码颜色，自动适配暗色/亮色主题。
    """

    def __init__(self, title: str, icon: str = "", parent=None, collapsed: bool = False):
        super().__init__(parent)
        self._is_collapsed = collapsed
        self._icon = icon
        self._title = title

        self._setup_ui()

    def _setup_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 6)
        layout.setSpacing(0)

        self._header = QFrame()
        self._header.setObjectName("sectionHeader")
        self._header.setFixedHeight(36)
        self._header.setCursor(Qt.CursorShape.PointingHandCursor)

        header_layout = QHBoxLayout(self._header)
        header_layout.setContentsMargins(12, 0, 10, 0)

        self._toggle_btn = QPushButton()
        self._toggle_btn.setFixedSize(18, 18)
        self._toggle_btn.setFlat(True)
        self._toggle_btn.setObjectName("sectionToggle")
        self._toggle_btn.setIcon(get_icon("chevron-down", "#888", 16))
        self._toggle_btn.setIconSize(QSize(16, 16))
        header_layout.addWidget(self._toggle_btn)

        icon_text = f"{self._icon} " if self._icon else ""
        self._title_label = QLabel(f"{icon_text}{self._title}")
        self._title_label.setObjectName("sectionTitle")
        title_font = self._title_label.font()
        title_font.setBold(True)
        title_font.setPointSize(10)
        self._title_label.setFont(title_font)
        header_layout.addWidget(self._title_label)

        header_layout.addStretch()
        layout.addWidget(self._header)

        self._content_area = QWidget()
        self._content_layout = QVBoxLayout(self._content_area)
        self._content_layout.setContentsMargins(14, 10, 14, 10)
        self._content_layout.setSpacing(8)

        self._content_frame = QFrame()
        self._content_frame.setObjectName("sectionContent")
        frame_layout = QVBoxLayout(self._content_frame)
        frame_layout.setContentsMargins(8, 8, 8, 8)
        frame_layout.setSpacing(8)
        frame_layout.addWidget(self._content_area)

        layout.addWidget(self._content_frame)

        self._header.mousePressEvent = lambda e: self.toggle() if e.button() == Qt.MouseButton.LeftButton else None

        if self._is_collapsed:
            self._content_frame.setVisible(False)

    def toggle(self):
        self._is_collapsed = not self._is_collapsed
        self._toggle_btn.setIcon(get_icon(
            "chevron-right" if self._is_collapsed else "chevron-down", "#888", 16))
        self._toggle_btn.setIconSize(QSize(16, 16))
        self._content_frame.setVisible(not self._is_collapsed)

    def add_widget(self, widget):
        self._content_layout.addWidget(widget)

    def add_layout(self, layout):
        self._content_layout.addLayout(layout)

    def is_collapsed(self):
        return self._is_collapsed

    def set_collapsed(self, collapsed: bool):
        if self._is_collapsed != collapsed:
            self.toggle()
