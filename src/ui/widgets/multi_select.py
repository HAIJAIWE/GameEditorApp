"""引用表组件 - 从其他类型库中选择多个条目并配置触发等级（如角色的技能列表、天赋列表）"""
from common.logger import get_logger

logger = get_logger()

from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtWidgets import (
    QDialog,
    QDialogButtonBox,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QLineEdit,
    QListWidget,
    QMessageBox,
    QPushButton,
    QSpinBox,
    QTableWidget,
    QTableWidgetItem,
    QVBoxLayout,
    QWidget,
)

REF_TYPE_LABELS = {
    "skills": "技能", "talents": "天赋", "equips": "装备",
    "items": "道具", "monsters": "怪物", "roles": "角色",
    "achievements": "成就"
}
REF_TYPE_PLURAL = {
    "skills": "skills", "talents": "talents", "equips": "equips",
    "items": "items", "monsters": "monsters", "roles": "roles",
    "achievements": "achievements"
}


class RefTableWidget(QWidget):
    """引用表组件：表格展示（名称+等级）+ 增删行 + 从库选择
    存储格式: {"id": "skills_1", "level": 5}  - 仅存 ID 和等级，不冗余字段
    """

    def __init__(self, data_manager, field_name, ref_type, parent=None):
        super().__init__(parent)
        self.data_manager = data_manager
        self.field_name = field_name
        self.ref_type = ref_type
        self.ref_data = []

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        ref_label = REF_TYPE_LABELS.get(ref_type, ref_type)

        header = QHBoxLayout()
        header.addWidget(QLabel(f"{ref_label}列表："))
        header.addStretch()

        self.add_btn = QPushButton(f"+ 添加{ref_label}")
        self.add_btn.clicked.connect(self._on_add)
        header.addWidget(self.add_btn)

        self.remove_btn = QPushButton("- 删除选中")
        self.remove_btn.clicked.connect(self._on_remove)
        header.addWidget(self.remove_btn)

        layout.addLayout(header)

        self.table = QTableWidget(0, 2)
        self.table.setMinimumHeight(80)
        self.table.setHorizontalHeaderLabels(["名称", "等级:"])
        self.table.horizontalHeader().setSectionResizeMode(
            0, QHeaderView.ResizeMode.Stretch
        )
        self.table.horizontalHeader().setSectionResizeMode(
            1, QHeaderView.ResizeMode.Fixed
        )
        self.table.setColumnWidth(1, 80)
        self.table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.table.setEditTriggers(QTableWidget.EditTrigger.DoubleClicked | QTableWidget.EditTrigger.EditKeyPressed)
        self.table.cellChanged.connect(self._on_cell_changed)
        layout.addWidget(self.table)

    def _get_name_by_id(self, item_id):
        plural_key = REF_TYPE_PLURAL.get(self.ref_type, self.ref_type + "s")
        items = self.data_manager.data.get(plural_key, [])
        for item in items:
            if item.get("id") == item_id:
                return item.get("name", item_id)
        return item_id

    def _on_add(self):
        dialog = RefSelectDialog(
            self.data_manager, self.ref_type, self.field_name, self
        )
        dialog.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
        dialog.accepted.connect(lambda d=dialog: self._on_ref_select_accepted(d))
        dialog.show()

    def _on_ref_select_accepted(self, dialog):
        if dialog.selected_id:
                self.ref_data.append({"id": dialog.selected_id, "level": dialog.level_value})
                self._refresh_table()

    def _on_remove(self):
        row = self.table.currentRow()
        if row >= 0 and row < len(self.ref_data):
            self.ref_data.pop(row)
            self._refresh_table()

    def _on_cell_changed(self, row, col):
        if row < 0 or row >= len(self.ref_data) or col != 1:
            return

        try:
            value = int(self.table.item(row, col).text()) if self.table.item(row, col) else 0
            self.ref_data[row]["level"] = max(0, min(999, value))
        except (ValueError, TypeError) as e:
            logger.debug(f"操作失败: {e}")

        self._block_signals(True)
        self._refresh_table()
        self._block_signals(False)

    def _block_signals(self, block):
        self.table.blockSignals(block)

    def _refresh_table(self):
        self.table.setRowCount(0)
        for i, item in enumerate(self.ref_data):
            self.table.insertRow(i)

            item_id = item.get("id", "")
            display_name = self._get_name_by_id(item_id)

            name_item = QTableWidgetItem(display_name)
            name_item.setFlags(name_item.flags() & ~Qt.ItemFlag.ItemIsEditable)
            self.table.setItem(i, 0, name_item)

            level_item = QTableWidgetItem(str(item.get("level", 0)))
            level_item.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
            self.table.setItem(i, 1, level_item)

        header_h = self.table.horizontalHeader().height()
        row_h = self.table.rowHeight(0) if self.table.rowCount() > 0 else 28
        total_h = header_h + max(row_h * self.table.rowCount(), row_h * 2)
        self.table.setMinimumHeight(total_h)
        self.table.setMaximumHeight(total_h + 4)

    def load_data(self, data):
        if isinstance(data, list):
            self.ref_data = []
            for item in data:
                if isinstance(item, dict):
                    if "id" in item:
                        self.ref_data.append({"id": item["id"], "level": item.get("level", 0)})
                    elif "name" in item:
                        self.ref_data.append({"name": item["name"], "level": item.get("level", 0)})
                elif isinstance(item, str):
                    self.ref_data.append({"id": item, "level": 0})
                else:
                    self.ref_data.append(item)
        else:
            self.ref_data = []
        self._refresh_table()

    def get_data(self):
        return list(self.ref_data)

    def clear(self):
        self.ref_data = []
        self._refresh_table()


class RefSelectDialog(QDialog):
    """选择引用条目对话框（选名称+设触发等级）"""

    def __init__(self, data_manager, ref_type, field_name, parent=None):
        super().__init__(parent)
        self.data_manager = data_manager
        self.ref_type = ref_type
        self.selected_id = ""
        self.level_value = 0
        self._id_name_map = {}

        ref_cn = REF_TYPE_LABELS.get(ref_type, ref_type)
        self.setWindowTitle(f"选择{ref_cn}")
        self.setMinimumSize(380, 450)

        layout = QVBoxLayout(self)

        search_layout = QHBoxLayout()
        search_layout.addWidget(QLabel("搜索:"))
        self.search_edit = QLineEdit()
        self.search_edit.setPlaceholderText("输入名称过滤...")
        self.search_edit.textChanged.connect(self._on_search_changed)
        # P4-15: 统一搜索防抖（150ms，与 data_tab.py 一致）
        self._search_timer = QTimer(self)
        self._search_timer.setSingleShot(True)
        self._search_timer.timeout.connect(self._do_search)
        search_layout.addWidget(self.search_edit)
        layout.addLayout(search_layout)

        self.list_widget = QListWidget()
        plural_key = REF_TYPE_PLURAL.get(ref_type, ref_type + "s")
        items = self.data_manager.data.get(plural_key, [])

        self._all_items = []
        self._id_name_map = {}
        for item in items:
            name = item.get("name", "")
            item_id = item.get("id", "")
            if name:
                self._id_name_map[item_id] = name
                self._all_items.append((item_id, name))

        for item_id, name in self._all_items:
            self.list_widget.addItem(name)
        layout.addWidget(self.list_widget)

        count_layout = QHBoxLayout()
        count_layout.addWidget(QLabel("等级:"))
        self.count_spin = QSpinBox()
        self.count_spin.setRange(0, 999)
        self.count_spin.setValue(0)
        count_layout.addWidget(self.count_spin)
        count_layout.addStretch()
        layout.addLayout(count_layout)

        buttons = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel
        )
        buttons.accepted.connect(self._on_accept)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)

    def _on_search_changed(self, text):
        """P4-15: 搜索框文本变化时启动防抖定时器"""
        self._search_timer.start(150)

    def _do_search(self):
        """P4-15: 执行搜索过滤（防抖后触发）"""
        kw = self.search_edit.text().strip().lower()
        self.list_widget.clear()
        filtered = [(iid, n) for iid, n in self._all_items if kw in n.lower()]
        for _item_id, name in filtered:
            self.list_widget.addItem(name)

    def _on_accept(self):
        item = self.list_widget.currentItem()
        if not item:
            QMessageBox.warning(self, "提示", "请先选择一个条目")
            return
        selected_name = item.text()
        for item_id, name in self._all_items:
            if name == selected_name:
                self.selected_id = item_id
                break
        self.level_value = self.count_spin.value()
        self.accept()
