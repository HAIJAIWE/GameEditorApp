"""快捷键参考对话框"""
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QFont
from PyQt6.QtWidgets import (
    QDialog,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QPushButton,
    QTableWidget,
    QTableWidgetItem,
    QVBoxLayout,
)

from common.shortcuts import DEFAULT_SHORTCUTS
from ui.themes import theme_color

CATEGORY_LABELS = {
    "file": "文件操作",
    "edit": "编辑操作",
    "data": "数据操作",
    "view": "视图操作",
    "ai": "AI 辅助",
    "navigation": "导航操作",
    "general": "通用",
}


class ShortcutsDialog(QDialog):
    """快捷键参考对话框"""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("快捷键参考")
        self.setMinimumSize(500, 400)
        self.setup_ui()

    def setup_ui(self):
        layout = QVBoxLayout(self)
        layout.setSpacing(12)

        title = QLabel("⌨️ 快捷键参考")
        title.setStyleSheet("font-size: 16px; font-weight: 700;")
        layout.addWidget(title)

        # 按分类分组的表格
        categories = {}
        for sid, sc in DEFAULT_SHORTCUTS.items():
            cat = sc.category or "general"
            categories.setdefault(cat, []).append((sid, sc))

        table = QTableWidget()
        table.setColumnCount(3)
        table.setHorizontalHeaderLabels(["快捷键", "操作", "说明"])
        table.horizontalHeader().setStretchLastSection(True)
        table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        table.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.ResizeToContents)
        table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        table.setAlternatingRowColors(True)
        table.verticalHeader().setVisible(False)

        rows = []
        for cat in ["file", "edit", "data", "view", "ai", "navigation"]:
            sc_list = categories.get(cat, [])
            if not sc_list:
                continue
            label = CATEGORY_LABELS.get(cat, cat)
            rows.append((None, label, ""))  # category header
            for sid, sc in sorted(sc_list, key=lambda x: x[1].action_id):
                rows.append((sc.key_sequence, sc.description or sc.action_id, ""))

        table.setRowCount(len(rows))
        for i, (key, action, desc) in enumerate(rows):
            if key is None:
                # 分类标题行
                item = QTableWidgetItem(action)
                font = QFont("Microsoft YaHei", 10)
                font.setBold(True)
                item.setFont(font)
                item.setFlags(item.flags() & ~Qt.ItemFlag.ItemIsSelectable)
                table.setItem(i, 0, item)
                table.setItem(i, 1, QTableWidgetItem(""))
                table.setItem(i, 2, QTableWidgetItem(""))
                table.setRowHeight(i, 28)
            else:
                table.setItem(i, 0, QTableWidgetItem(key))
                table.setItem(i, 1, QTableWidgetItem(action))
                table.setItem(i, 2, QTableWidgetItem(desc))

        layout.addWidget(table)

        btn = QPushButton("关闭")
        btn.setStyleSheet(f"""
            QPushButton {{
                background: {theme_color('accent')}; color: white;
                border: none; border-radius: 6px; padding: 6px 20px;
                font-weight: 600;
            }}
            QPushButton:hover {{ background: {theme_color('accent_hover')}; }}
        """)
        btn.clicked.connect(self.accept)

        btn_row = QHBoxLayout()
        btn_row.addStretch()
        btn_row.addWidget(btn)
        layout.addLayout(btn_row)
