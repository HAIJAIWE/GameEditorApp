"""策划书卡片组件 — 基于 QPushButton 保证点击可靠，接入8主题"""
from __future__ import annotations

from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QAction
from PyQt6.QtWidgets import QHBoxLayout, QLabel, QMenu, QProgressBar, QPushButton, QVBoxLayout

from common.logger import get_logger

from .ceshu_theme import (
    ceshu_badge_status_qss,
    ceshu_badge_type_qss,
    ceshu_card_date_qss,
    ceshu_card_label_qss,
    ceshu_card_qss,
    ceshu_progress_qss,
)


class CeshuCard(QPushButton):
    """策划书卡片：游戏名 + 类型标签 + 状态badge + 日期 + 进度条 + 右键菜单"""

    STATUS_LABELS = {
        "draft": "草稿", "in_progress": "进行中",
        "review": "评审中", "final": "已确认",
    }

    # 右键菜单信号
    rename_requested = pyqtSignal(str)   # ceshu_id
    delete_requested = pyqtSignal(str)   # ceshu_id
    duplicate_requested = pyqtSignal(str) # ceshu_id
    derive_requested = pyqtSignal(str)    # P8: 派生新版本

    def __init__(self, info: dict | None = None, parent=None):
        super().__init__(parent)
        self._ceshu_id = ""
        self._status = "draft"
        self._selected = False
        self._version_label_text = ""  # P8: 版本标签文本
        self._is_active = True
        self._is_main = True
        self.setMinimumSize(220, 160)
        self.setMaximumWidth(300)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self.customContextMenuRequested.connect(self._show_context_menu)
        self._setup_inner()
        if info:
            self.set_data(info)
        self.clicked.connect(self._on_click)
        self._apply_theme()

    def _setup_inner(self) -> None:
        layout = QVBoxLayout(self)
        layout.setContentsMargins(4, 4, 4, 4)
        layout.setSpacing(5)

        self._name_label = QLabel()
        layout.addWidget(self._name_label)

        badges = QHBoxLayout()
        self._type_label = QLabel()
        badges.addWidget(self._type_label)
        self._status_label = QLabel()
        badges.addWidget(self._status_label)
        # P8: 版本标签
        self._version_label = QLabel()
        self._version_label.setStyleSheet(
            "background: rgba(79, 140, 247, 0.15); color: #4f8cf7; "
            "padding: 1px 6px; border-radius: 8px; font-size: 10px; border: none;"
        )
        badges.addWidget(self._version_label)
        badges.addStretch()
        layout.addLayout(badges)

        self._date_label = QLabel()
        layout.addWidget(self._date_label)

        self._progress = QProgressBar()
        self._progress.setMaximum(100)
        self._progress.setMaximumHeight(6)
        self._progress.setTextVisible(False)
        layout.addWidget(self._progress)
        layout.addStretch()

    def set_data(self, info: dict) -> None:
        self._ceshu_id = info.get("ceshu_id", "")
        self._name_label.setText(info.get("name", "未命名"))
        game_type = info.get("game_type", "")
        self._type_label.setText(game_type if game_type else "未分类")
        self._status = info.get("status", "draft")
        updated = info.get("updated_at", "")
        if len(updated) > 16:
            updated = updated[:16]
        self._date_label.setText(updated if updated else "")
        progress = info.get("progress", 0)
        self._progress.setValue(int(progress * 100))
        # P8: 版本信息
        self._version_label_text = info.get("version_label", "")
        self._is_active = info.get("is_active", True)
        self._is_main = info.get("is_main", True)
        self._refresh_version_label()
        self._apply_theme()

    def _refresh_version_label(self) -> None:
        """P8: 刷新版本标签显示"""
        if not self._version_label_text:
            self._version_label.setText("")
            self._version_label.setVisible(False)
            return
        suffix = "主" if self._is_main else "子"
        star = " ★" if self._is_active else ""
        text = f"{self._version_label_text} ({suffix}){star}"
        self._version_label.setText(text)
        self._version_label.setVisible(True)

    def set_selected(self, selected: bool) -> None:
        """设置选中状态（视觉高亮）"""
        self._selected = selected
        self._apply_theme()

    @property
    def ceshu_id(self) -> str:
        return self._ceshu_id

    def _apply_theme(self) -> None:
        """应用当前主题色"""
        self.setStyleSheet(ceshu_card_qss(selected=self._selected))
        self._name_label.setStyleSheet(ceshu_card_label_qss())
        self._type_label.setStyleSheet(ceshu_badge_type_qss())
        self._status_label.setText(self.STATUS_LABELS.get(self._status, self._status))
        self._status_label.setStyleSheet(ceshu_badge_status_qss(self._status))
        self._date_label.setStyleSheet(ceshu_card_date_qss())
        self._progress.setStyleSheet(ceshu_progress_qss())

    def _show_context_menu(self, pos) -> None:
        """右键菜单：重命名 / 复制 / 派生新版本 / 删除"""
        menu = QMenu(self)
        rename_action = QAction("重命名", self)
        rename_action.triggered.connect(lambda: self.rename_requested.emit(self._ceshu_id))
        menu.addAction(rename_action)

        duplicate_action = QAction("复制（独立副本）", self)
        duplicate_action.triggered.connect(lambda: self.duplicate_requested.emit(self._ceshu_id))
        menu.addAction(duplicate_action)

        # P8: 派生新版本
        derive_action = QAction("派生新版本（v1.x 子策划）", self)
        derive_action.triggered.connect(lambda: self.derive_requested.emit(self._ceshu_id))
        menu.addAction(derive_action)

        menu.addSeparator()

        delete_action = QAction("删除", self)
        delete_action.triggered.connect(lambda: self.delete_requested.emit(self._ceshu_id))
        menu.addAction(delete_action)

        menu.exec(self.mapToGlobal(pos))

    def _on_click(self) -> None:
        get_logger().debug(f"[CeshuCard] clicked: {self._ceshu_id}")
