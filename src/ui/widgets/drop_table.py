"""掉落表组件 - 支持从装备库/道具库引用并配置掉率数量"""
from common.logger import get_logger

logger = get_logger()

from PyQt6.QtCore import Qt  # noqa: E402  # 延迟导入：避免模块级循环导入
from PyQt6.QtWidgets import (  # noqa: E402  # 延迟导入：避免模块级循环导入
    QDialog,
    QDialogButtonBox,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QListWidget,
    QMessageBox,
    QPushButton,
    QSpinBox,
    QTableWidget,
    QTableWidgetItem,
    QVBoxLayout,
    QWidget,
)


class DropTableWidget(QWidget):
    """掉落表组件：表格展示 + 增删行 + 引用选择"""

    def __init__(self, data_manager, data_type, parent=None):
        super().__init__(parent)
        self.data_manager = data_manager
        self.data_type = data_type
        self.drop_data = []

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        header = QHBoxLayout()
        header.addWidget(QLabel(f"{'装备' if data_type == 'equip_drops' else '道具'}掉落表："))
        header.addStretch()

        self.add_btn = QPushButton("+ 添加掉落")
        self.add_btn.clicked.connect(self._on_add_drop)
        header.addWidget(self.add_btn)

        self.remove_btn = QPushButton("- 删除选中")
        self.remove_btn.clicked.connect(self._on_remove_drop)
        header.addWidget(self.remove_btn)

        layout.addLayout(header)

        self.table = QTableWidget(0, 4)
        self.table.setMinimumHeight(100)
        self.table.setHorizontalHeaderLabels(["名称", "掉率(%):", "最小:", "最大:"])
        self.table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
        self.table.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.Fixed)
        self.table.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeMode.Fixed)
        self.table.horizontalHeader().setSectionResizeMode(3, QHeaderView.ResizeMode.Fixed)
        self.table.setColumnWidth(1, 70)
        self.table.setColumnWidth(2, 55)
        self.table.setColumnWidth(3, 55)
        self.table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.table.setEditTriggers(QTableWidget.EditTrigger.DoubleClicked | QTableWidget.EditTrigger.EditKeyPressed)
        self.table.cellChanged.connect(self._on_cell_changed)
        layout.addWidget(self.table)

    def _on_add_drop(self):
        dialog = DropSelectDialog(self.data_manager, self.data_type, self)
        dialog.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
        dialog.accepted.connect(lambda d=dialog: self._on_drop_select_accepted(d))
        dialog.show()

    def _on_drop_select_accepted(self, dialog):
        name = dialog.selected_name
        rate = dialog.rate_spin.value()
        count_min = dialog.count_min_spin.value()
        count_max = dialog.count_max_spin.value()
        if name:
            self.drop_data.append({
                "name": name, "rate": rate,
                "count_min": count_min, "count_max": count_max
            })
            self._refresh_table()

    def _on_remove_drop(self):
        row = self.table.currentRow()
        if row >= 0 and row < len(self.drop_data):
            self.drop_data.pop(row)
            self._refresh_table()

    def _on_cell_changed(self, row, col):
        if row < 0 or row >= len(self.drop_data):
            return

        try:
            if col == 1:
                value = int(self.table.item(row, col).text()) if self.table.item(row, col) else 0
                self.drop_data[row]["rate"] = max(0, min(100, value))
            elif col == 2:
                value = int(self.table.item(row, col).text()) if self.table.item(row, col) else 1
                self.drop_data[row]["count_min"] = max(1, min(999, value))
            elif col == 3:
                value = int(self.table.item(row, col).text()) if self.table.item(row, col) else 1
                self.drop_data[row]["count_max"] = max(1, min(999, value))
        except (ValueError, TypeError) as e:
            logger.debug(f"操作失败: {e}")

        self._block_signals(True)
        self._refresh_table()
        self._block_signals(False)

    def _block_signals(self, block):
        self.table.blockSignals(block)

    def _refresh_table(self):
        self.table.setRowCount(0)
        for i, drop in enumerate(self.drop_data):
            self.table.insertRow(i)
            name_item = QTableWidgetItem(drop.get("name", ""))
            name_item.setFlags(name_item.flags() & ~Qt.ItemFlag.ItemIsEditable)
            self.table.setItem(i, 0, name_item)

            rate_item = QTableWidgetItem(str(drop.get("rate", 0)))
            rate_item.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
            self.table.setItem(i, 1, rate_item)

            min_item = QTableWidgetItem(str(drop.get("count_min", 1)))
            min_item.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
            self.table.setItem(i, 2, min_item)

            max_item = QTableWidgetItem(str(drop.get("count_max", 1)))
            max_item.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
            self.table.setItem(i, 3, max_item)

        header_h = self.table.horizontalHeader().height()
        row_h = self.table.rowHeight(0) if self.table.rowCount() > 0 else 28
        total_h = header_h + max(row_h * self.table.rowCount(), row_h * 2)
        self.table.setMinimumHeight(total_h)
        self.table.setMaximumHeight(total_h + 4)

    def load_data(self, data):
        self.drop_data = data if isinstance(data, list) else []
        self._refresh_table()

    def get_data(self):
        return list(self.drop_data)

    def clear(self):
        self.drop_data = []
        self._refresh_table()


class DropSelectDialog(QDialog):
    """选择掉落物品对话框"""

    def __init__(self, data_manager, drop_type, parent=None):
        super().__init__(parent)
        self.data_manager = data_manager
        self.drop_type = drop_type
        self.selected_name = ""
        self.setWindowTitle("选择掉落物品")
        self.setMinimumSize(350, 400)

        layout = QVBoxLayout(self)

        layout.addWidget(QLabel("从库中选择："))

        self.list_widget = QListWidget()

        if drop_type == "equip_drops":
            items = data_manager.data.get("equips", [])
        else:
            items = data_manager.data.get("items", [])

        for item in items:
            name = item.get("name", "")
            if name:
                self.list_widget.addItem(name)

        layout.addWidget(self.list_widget)

        rate_layout = QHBoxLayout()
        rate_layout.addWidget(QLabel("掉率(%):"))
        self.rate_spin = QSpinBox()
        self.rate_spin.setRange(0, 100)
        self.rate_spin.setValue(10)
        rate_layout.addWidget(self.rate_spin)
        rate_layout.addStretch()
        layout.addLayout(rate_layout)

        count_layout = QHBoxLayout()
        count_layout.addWidget(QLabel("数量范围:"))
        self.count_min_spin = QSpinBox()
        self.count_min_spin.setRange(1, 999)
        self.count_min_spin.setValue(1)
        count_layout.addWidget(self.count_min_spin)
        count_layout.addWidget(QLabel("~"))
        self.count_max_spin = QSpinBox()
        self.count_max_spin.setRange(1, 999)
        self.count_max_spin.setValue(1)
        count_layout.addWidget(self.count_max_spin)
        count_layout.addStretch()
        layout.addLayout(count_layout)

        self.count_min_spin.valueChanged.connect(self._on_count_min_changed)

        buttons = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel
        )
        buttons.accepted.connect(self._on_accept)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)

    def _on_count_min_changed(self, val):
        if self.count_max_spin.value() < val:
            self.count_max_spin.setValue(val)

    def _on_accept(self):
        item = self.list_widget.currentItem()
        if not item:
            QMessageBox.warning(self, "提示", "请先选择一个物品")
            return
        self.selected_name = item.text()
        if self.count_min_spin.value() > self.count_max_spin.value():
            QMessageBox.warning(self, "提示", "最小数量不能大于最大数量")
            return
        self.accept()
