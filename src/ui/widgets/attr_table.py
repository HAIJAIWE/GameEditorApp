"""属性列表组件 - 自由输入属性名和数值（类似技能/天赋的增删表格）"""
from common.logger import get_logger

logger = get_logger()

from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import (
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QPushButton,
    QTableWidget,
    QTableWidgetItem,
    QVBoxLayout,
    QWidget,
)

from ui.dialogs.auto_input_dialog import show_text_input_dialog


class AttrTableWidget(QWidget):
    """属性列表组件：表格展示（属性名+数值）+ 增删行 + 自由输入
    存储格式: [{"name": "暴击率", "value": 15}, {"name": "暴击伤害", "value": 50}]
    """

    def __init__(self, parent=None):
        super().__init__(parent)
        self.attr_data = []

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        header = QHBoxLayout()
        header.addWidget(QLabel("属性列表："))
        header.addStretch()

        self.add_btn = QPushButton("+ 添加属性")
        self.add_btn.clicked.connect(self._on_add)
        header.addWidget(self.add_btn)

        self.remove_btn = QPushButton("- 删除选中")
        self.remove_btn.clicked.connect(self._on_remove)
        header.addWidget(self.remove_btn)

        layout.addLayout(header)

        self.table = QTableWidget(0, 2)
        self.table.setMinimumHeight(80)
        self.table.setHorizontalHeaderLabels(["属性名称", "数值"])
        self.table.horizontalHeader().setSectionResizeMode(
            0, QHeaderView.ResizeMode.Stretch
        )
        self.table.horizontalHeader().setSectionResizeMode(
            1, QHeaderView.ResizeMode.Fixed
        )
        self.table.setColumnWidth(1, 100)
        self.table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.table.setEditTriggers(QTableWidget.EditTrigger.DoubleClicked | QTableWidget.EditTrigger.EditKeyPressed)
        self.table.cellChanged.connect(self._on_cell_changed)
        layout.addWidget(self.table)

    def _on_add(self):
        """添加属性 - 弹出对话框输入名称"""
        name, ok = show_text_input_dialog(self, "添加属性", "请输入属性名称：")
        if ok and name.strip():
            self.attr_data.append({"name": name.strip(), "value": 0})
            self._refresh_table()

    def _on_remove(self):
        """删除选中行"""
        row = self.table.currentRow()
        if row >= 0 and row < len(self.attr_data):
            self.attr_data.pop(row)
            self._refresh_table()

    def _on_cell_changed(self, row, col):
        """单元格内容变化时更新数据"""
        if row < 0 or row >= len(self.attr_data):
            return

        self._block_signals(True)

        if col == 0:
            text = self.table.item(row, col).text() if self.table.item(row, col) else ""
            self.attr_data[row]["name"] = text.strip() if text else ""
        elif col == 1:
            try:
                value = float(self.table.item(row, col).text() if self.table.item(row, col) else "0")
                self.attr_data[row]["value"] = value
            except (ValueError, TypeError) as e:
                logger.debug(f"操作失败: {e}")

        self._refresh_table()
        self._block_signals(False)

    def _block_signals(self, block):
        """阻止表格信号"""
        self.table.blockSignals(block)

    def _refresh_table(self):
        """刷新表格显示"""
        self.table.setRowCount(0)
        for i, item in enumerate(self.attr_data):
            self.table.insertRow(i)

            name_item = QTableWidgetItem(item.get("name", ""))
            self.table.setItem(i, 0, name_item)

            value_text = str(item.get("value", 0))
            value_item = QTableWidgetItem(value_text)
            value_item.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
            self.table.setItem(i, 1, value_item)

        header_h = self.table.horizontalHeader().height()
        row_h = self.table.rowHeight(0) if self.table.rowCount() > 0 else 28
        total_h = header_h + max(row_h * self.table.rowCount(), row_h * 2)
        self.table.setMinimumHeight(total_h)
        self.table.setMaximumHeight(total_h + 4)

    def load_data(self, data):
        """加载数据"""
        if isinstance(data, list):
            self.attr_data = []
            for item in data:
                if isinstance(item, dict):
                    self.attr_data.append({
                        "name": item.get("name", ""),
                        "value": item.get("value", 0)
                    })
                elif isinstance(item, str):
                    self.attr_data.append({"name": item, "value": 0})
        else:
            self.attr_data = []
        self._refresh_table()

    def get_data(self):
        """获取数据"""
        return list(self.attr_data)

    def clear(self):
        """清空数据"""
        self.attr_data = []
        self._refresh_table()
