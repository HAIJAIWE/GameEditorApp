"""显示类型选择对话框 — 控制首页数据概览卡片 / 标签页显示哪些数据类型

- 列出当前库 schema 的全部数据类型，勾选要显示的
- 全不选 = 首页概览区隐藏（不影响数据本身）
- 返回 None 表示「全部显示」（恢复默认）
"""
from __future__ import annotations

from PyQt6.QtWidgets import (
    QCheckBox,
    QDialog,
    QDialogButtonBox,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QScrollArea,
    QVBoxLayout,
    QWidget,
)

from ui.themes import theme_color


class TypeVisibilityDialog(QDialog):
    """勾选要显示的数据类型"""

    def __init__(self, schema, current_types=None, parent=None):
        super().__init__(parent)
        self.setWindowTitle("选择显示的数据类型")
        self.setMinimumSize(420, 480)
        self._schema = schema
        self._types: list[tuple[str, str]] = []
        self._checkboxes: list[tuple[str, QCheckBox]] = []

        if schema and hasattr(schema, 'types'):
            self._types = [(t.id, t.name) for t in schema.types]

        # 当前勾选集合：None 或空 = 全部勾选
        current = set(current_types or [])
        checked_ids = {tid for tid, _ in self._types} if not current else current

        self._setup_ui(checked_ids)

    def _setup_ui(self, checked_ids: set[str]) -> None:
        layout = QVBoxLayout(self)
        layout.setSpacing(10)

        hint = QLabel(
            "勾选要在首页数据概览区显示的类型，未勾选的类型不会丢失数据，\n"
            "只是不在概览区显示。"
        )
        hint.setStyleSheet(f"color: {theme_color('hint')}; font-size: 12px;")
        hint.setWordWrap(True)
        layout.addWidget(hint)

        # 工具按钮行
        btn_row = QHBoxLayout()
        select_all_btn = QPushButton("全选")
        clear_btn = QPushButton("清空")
        select_all_btn.clicked.connect(self._select_all)
        clear_btn.clicked.connect(self._clear_all)
        btn_row.addWidget(select_all_btn)
        btn_row.addWidget(clear_btn)
        btn_row.addStretch()
        layout.addLayout(btn_row)

        # 勾选列表（滚动区）
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        container = QWidget()
        list_layout = QVBoxLayout(container)
        list_layout.setContentsMargins(4, 4, 4, 4)
        list_layout.setSpacing(6)

        for tid, tname in self._types:
            cb = QCheckBox(f"{tname} ({tid})")
            cb.setChecked(tid in checked_ids)
            cb.setStyleSheet(
                f"font-size: 13px; color: {theme_color('fg')}; spacing: 6px;")
            list_layout.addWidget(cb)
            self._checkboxes.append((tid, cb))

        list_layout.addStretch()
        scroll.setWidget(container)
        layout.addWidget(scroll, 1)

        # 统计标签
        self._count_label = QLabel("")
        self._count_label.setStyleSheet(
            f"color: {theme_color('hint')}; font-size: 12px;")
        layout.addWidget(self._count_label)
        for _, cb in self._checkboxes:
            cb.toggled.connect(self._update_count)
        self._update_count()

        btns = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel)
        btns.accepted.connect(self.accept)
        btns.rejected.connect(self.reject)
        layout.addWidget(btns)

    def _select_all(self) -> None:
        for _, cb in self._checkboxes:
            cb.setChecked(True)

    def _clear_all(self) -> None:
        for _, cb in self._checkboxes:
            cb.setChecked(False)

    def _update_count(self) -> None:
        checked = sum(1 for _, cb in self._checkboxes if cb.isChecked())
        self._count_label.setText(f"已选择 {checked}/{len(self._checkboxes)} 个类型")

    def result_types(self):
        """返回勾选的类型 ID 列表；全部勾选时返回 None（=显示全部）"""
        checked = [tid for tid, cb in self._checkboxes if cb.isChecked()]
        if not checked:
            return []
        if len(checked) == len(self._checkboxes):
            return None  # 全部勾选 = 默认显示全部
        return checked
