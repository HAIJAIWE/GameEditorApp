"""通用掉落组件 - 支持金钱、经验值、声望等数值型掉落配置"""
from common.logger import get_logger

logger = get_logger()

from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import (
    QComboBox,
    QDialog,
    QDialogButtonBox,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QLineEdit,
    QMessageBox,
    QPushButton,
    QSpinBox,
    QTableWidget,
    QTableWidgetItem,
    QVBoxLayout,
    QWidget,
)

DROP_TYPES = [
    ("gold", "金钱(金币)"),
    ("exp", "经验值"),
    ("reputation", "声望"),
    ("honor", "荣誉点"),
    ("contribution", "贡献度"),
    ("score", "积分"),
    ("custom", "自定义")
]


class GenericDropWidget(QWidget):
    """通用掉落表组件：支持数值型掉落（金钱/经验等）"""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.drop_data = []

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        header = QHBoxLayout()
        header.addWidget(QLabel("通用掉落："))
        header.addStretch()

        self.add_btn = QPushButton("+ 添加掉落")
        self.add_btn.clicked.connect(self._on_add_drop)
        header.addWidget(self.add_btn)

        self.remove_btn = QPushButton("- 删除选中")
        self.remove_btn.clicked.connect(self._on_remove_drop)
        header.addWidget(self.remove_btn)

        layout.addLayout(header)

        self.table = QTableWidget(0, 5)
        self.table.setMinimumHeight(100)
        self.table.setHorizontalHeaderLabels(["类型", "名称", "掉率(%):", "最小:", "最大:"])
        self.table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.Fixed)
        self.table.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        self.table.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeMode.Fixed)
        self.table.horizontalHeader().setSectionResizeMode(3, QHeaderView.ResizeMode.Fixed)
        self.table.horizontalHeader().setSectionResizeMode(4, QHeaderView.ResizeMode.Fixed)
        self.table.setColumnWidth(0, 90)
        self.table.setColumnWidth(2, 70)
        self.table.setColumnWidth(3, 60)
        self.table.setColumnWidth(4, 60)
        self.table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.table.setEditTriggers(QTableWidget.EditTrigger.DoubleClicked | QTableWidget.EditTrigger.EditKeyPressed)
        self.table.cellChanged.connect(self._on_cell_changed)
        layout.addWidget(self.table)

    def _on_add_drop(self):
        dialog = GenericDropDialog(self)
        dialog.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
        dialog.accepted.connect(lambda d=dialog: self._on_generic_drop_accepted(d))
        dialog.show()

    def _on_generic_drop_accepted(self, dialog):
        drop_data = dialog.get_data()
        if drop_data:
            self.drop_data.append(drop_data)
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
                value = self.table.item(row, col).text() if self.table.item(row, col) else ""
                self.drop_data[row]["name"] = value
            elif col == 2:
                value = int(self.table.item(row, col).text()) if self.table.item(row, col) else 0
                self.drop_data[row]["rate"] = max(0, min(100, value))
            elif col == 3:
                value = int(self.table.item(row, col).text()) if self.table.item(row, col) else 0
                self.drop_data[row]["min_val"] = max(0, min(9999999, value))
            elif col == 4:
                value = int(self.table.item(row, col).text()) if self.table.item(row, col) else 0
                self.drop_data[row]["max_val"] = max(0, min(9999999, value))
        except (ValueError, TypeError) as e:
            logger.debug(f"操作失败: {e}")

        self._block_signals(True)
        self._refresh_table()
        self._block_signals(False)

    def _block_signals(self, block):
        self.table.blockSignals(block)

    def _refresh_table(self):
        self.table.setRowCount(0)
        type_map = dict(DROP_TYPES)
        for i, drop in enumerate(self.drop_data):
            self.table.insertRow(i)
            drop_type = drop.get("type", "custom")
            type_label = type_map.get(drop_type, drop_type)
            type_item = QTableWidgetItem(type_label)
            type_item.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
            type_item.setFlags(type_item.flags() & ~Qt.ItemFlag.ItemIsEditable)
            self.table.setItem(i, 0, type_item)

            name_item = QTableWidgetItem(drop.get("name", ""))
            self.table.setItem(i, 1, name_item)

            rate_item = QTableWidgetItem(str(drop.get("rate", 100)))
            rate_item.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
            self.table.setItem(i, 2, rate_item)

            min_item = QTableWidgetItem(str(drop.get("min_val", 0)))
            min_item.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
            self.table.setItem(i, 3, min_item)

            max_item = QTableWidgetItem(str(drop.get("max_val", 0)))
            max_item.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
            self.table.setItem(i, 4, max_item)

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


class GenericDropDialog(QDialog):
    """添加通用掉落对话框"""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("添加通用掉落")
        self.setMinimumSize(400, 300)
        self.selected_type = "gold"

        layout = QVBoxLayout(self)

        type_layout = QHBoxLayout()
        type_layout.addWidget(QLabel("掉落类型:"))
        self.type_combo = QComboBox()
        for type_id, type_name in DROP_TYPES:
            self.type_combo.addItem(type_name, type_id)
        self.type_combo.currentIndexChanged.connect(self._on_type_changed)
        type_layout.addWidget(self.type_combo)
        layout.addLayout(type_layout)

        name_layout = QHBoxLayout()
        name_layout.addWidget(QLabel("名称(可选):"))
        self.name_edit = QLineEdit()
        self.name_edit.setPlaceholderText("例如：金币、经验值等，留空则使用默认名称")
        name_layout.addWidget(self.name_edit)
        layout.addLayout(name_layout)

        rate_layout = QHBoxLayout()
        rate_layout.addWidget(QLabel("掉率(%):"))
        self.rate_spin = QSpinBox()
        self.rate_spin.setRange(0, 100)
        self.rate_spin.setValue(100)
        rate_layout.addWidget(self.rate_spin)
        rate_layout.addStretch()
        layout.addLayout(rate_layout)

        value_layout = QHBoxLayout()
        value_layout.addWidget(QLabel("数量范围:"))
        self.min_spin = QSpinBox()
        self.min_spin.setRange(0, 9999999)
        self.min_spin.setValue(10)
        value_layout.addWidget(self.min_spin)
        value_layout.addWidget(QLabel("~"))
        self.max_spin = QSpinBox()
        self.max_spin.setRange(0, 9999999)
        self.max_spin.setValue(20)
        value_layout.addWidget(self.max_spin)
        value_layout.addStretch()
        layout.addLayout(value_layout)

        self.min_spin.valueChanged.connect(self._on_min_changed)

        buttons = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel
        )
        buttons.accepted.connect(self._on_accept)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)

        self._update_defaults()

    def _on_type_changed(self, index):
        self.selected_type = self.type_combo.itemData(index)
        self._update_defaults()

    def _update_defaults(self):
        defaults = {
            "gold": ("金币", 100, 10, 50),
            "exp": ("经验值", 100, 50, 200),
            "reputation": ("声望", 50, 5, 20),
            "honor": ("荣誉点", 30, 1, 10),
            "contribution": ("贡献度", 80, 5, 15),
            "score": ("积分", 100, 10, 100),
            "custom": ("", 100, 1, 10)
        }
        default_name, default_rate, default_min, default_max = defaults.get(
            self.selected_type, ("", 100, 1, 10)
        )
        self.name_edit.setPlaceholderText(
            f"例如：{default_name}，留空则使用默认名称" if default_name else "请输入名称"
        )
        if not self.name_edit.text():
            self.rate_spin.setValue(default_rate)
            self.min_spin.setValue(default_min)
            self.max_spin.setValue(default_max)

    def _on_min_changed(self, val):
        if self.max_spin.value() < val:
            self.max_spin.setValue(val)

    def _on_accept(self):
        if self.min_spin.value() > self.max_spin.value():
            QMessageBox.warning(self, "提示", "最小值不能大于最大值")
            return

        type_map = dict(DROP_TYPES)
        type_name = type_map.get(self.selected_type, self.selected_type)
        display_name = self.name_edit.text().strip() if self.name_edit.text().strip() else type_name

        self.dialog_data = {
            "type": self.selected_type,
            "name": display_name,
            "rate": self.rate_spin.value(),
            "min_val": self.min_spin.value(),
            "max_val": self.max_spin.value()
        }
        self.accept()

    def get_data(self):
        return getattr(self, 'dialog_data', None)
