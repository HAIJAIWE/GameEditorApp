"""批量操作对话框 - 多选数据统一修改"""
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QFont
from PyQt6.QtWidgets import (
    QComboBox,
    QDialog,
    QFrame,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QMessageBox,
    QPushButton,
    QSpinBox,
    QVBoxLayout,
    QWidget,
)

from ui.themes import theme_color

DATA_TYPE_LABELS = {
    "role": "角色", "job": "职业", "monster": "怪物",
    "skill": "技能", "equip": "装备", "item": "道具",
    "buff": "Buff", "talent": "天赋", "achievement": "成就",
}


class BatchEditDialog(QDialog):
    """批量操作对话框"""

    def __init__(self, data_manager, data_type, parent=None):
        super().__init__(parent)
        self.setFont(QFont("Microsoft YaHei", 10))
        self.data_manager = data_manager
        self.data_type = data_type
        self.schema = data_manager.config.get_type_schema()
        self.plural_key = data_type + "s"
        if self.schema:
            for t in self.schema.types:
                if t.id == data_type:
                    self.plural_key = t.plural_key
                    break

        type_label = DATA_TYPE_LABELS.get(data_type, data_type)
        self.setWindowTitle(f"批量操作 - {type_label}")
        self.setMinimumSize(650, 500)
        self._items = []
        self._setup_ui()

    def _setup_ui(self):
        layout = QVBoxLayout(self)

        select_layout = QHBoxLayout()
        select_all_btn = QPushButton("全选")
        select_all_btn.clicked.connect(self._select_all)
        select_layout.addWidget(select_all_btn)

        deselect_all_btn = QPushButton("全不选")
        deselect_all_btn.clicked.connect(self._deselect_all)
        select_layout.addWidget(deselect_all_btn)

        select_layout.addStretch()
        layout.addLayout(select_layout)

        self.item_list = QListWidget()
        self.item_list.setStyleSheet("QListWidget { max-height: 200px; }")
        self._load_items()
        layout.addWidget(self.item_list)

        sep = QFrame()
        sep.setFrameShape(QFrame.Shape.HLine)
        layout.addWidget(sep)

        op_label = QLabel("批量操作：")
        op_label.setStyleSheet("font-weight: 700; font-size: 14px;")
        layout.addWidget(op_label)

        self.op_combo = QComboBox()
        self.op_combo.addItem("设置字段值", "set_value")
        self.op_combo.addItem("追加字段值（文本）", "append_value")
        self.op_combo.addItem("数值增减", "adjust_number")
        self.op_combo.addItem("添加标签", "add_tag")
        self.op_combo.addItem("删除选中项", "delete_selected")
        self.op_combo.currentIndexChanged.connect(self._on_op_changed)
        layout.addWidget(self.op_combo)

        self.op_config = QWidget()
        self.op_config_layout = QVBoxLayout(self.op_config)
        self.op_config_layout.setContentsMargins(0, 0, 0, 0)
        layout.addWidget(self.op_config)

        self._build_set_value_ui()

        bottom_layout = QHBoxLayout()
        bottom_layout.addStretch()

        self.apply_btn = QPushButton("应用")
        self.apply_btn.clicked.connect(self._on_apply)
        bottom_layout.addWidget(self.apply_btn)

        cancel_btn = QPushButton("取消")
        cancel_btn.clicked.connect(self.reject)
        bottom_layout.addWidget(cancel_btn)
        layout.addLayout(bottom_layout)

    def _load_items(self):
        items = self.data_manager.data.get(self.plural_key, [])
        self._items = items
        for item in items:
            name = item.get("name", "未命名")
            cb = QListWidgetItem(f"ID:{item.get('id', '')} | {name}")
            cb.setCheckState(Qt.CheckState.Checked)
            cb.setData(Qt.ItemDataRole.UserRole, item)
            self.item_list.addItem(cb)

    def _select_all(self):
        for i in range(self.item_list.count()):
            self.item_list.item(i).setCheckState(Qt.CheckState.Checked)

    def _deselect_all(self):
        for i in range(self.item_list.count()):
            self.item_list.item(i).setCheckState(Qt.CheckState.Unchecked)

    def _get_selected_items(self):
        result = []
        for i in range(self.item_list.count()):
            item = self.item_list.item(i)
            if item.checkState() == Qt.CheckState.Checked:
                result.append(item.data(Qt.ItemDataRole.UserRole))
        return result

    def _on_op_changed(self, index):
        while self.op_config_layout.count():
            child = self.op_config_layout.takeAt(0)
            if child.widget():
                child.widget().deleteLater()

        op = self.op_combo.currentData()
        if op == "set_value":
            self._build_set_value_ui()
        elif op == "append_value":
            self._build_append_ui()
        elif op == "adjust_number":
            self._build_adjust_ui()
        elif op == "add_tag":
            self._build_tag_ui()
        elif op == "delete_selected":
            hint = QLabel("将删除上方勾选的所有数据项，此操作不可撤销！")
            hint.setStyleSheet(f"color: {theme_color('danger')}; font-weight: 600;")
            self.op_config_layout.addWidget(hint)

    def _build_set_value_ui(self):
        row = QHBoxLayout()
        row.addWidget(QLabel("字段:"))
        self.field_combo = QComboBox()
        self._populate_fields(self.field_combo)
        row.addWidget(self.field_combo, 1)
        row.addWidget(QLabel("值:"))
        self.value_edit = QLineEdit()
        self.value_edit.setPlaceholderText("输入新的字段值")
        row.addWidget(self.value_edit, 1)
        self.op_config_layout.addLayout(row)

    def _build_append_ui(self):
        row = QHBoxLayout()
        row.addWidget(QLabel("字段:"))
        self.append_field_combo = QComboBox()
        self._populate_fields(self.append_field_combo)
        row.addWidget(self.append_field_combo, 1)
        row.addWidget(QLabel("追加内容:"))
        self.append_edit = QLineEdit()
        self.append_edit.setPlaceholderText("追加到字段末尾")
        row.addWidget(self.append_edit, 1)
        self.op_config_layout.addLayout(row)

        sep_row = QHBoxLayout()
        self.append_separator = QLineEdit(",")
        sep_label = QLabel("分隔符:")
        sep_row.addWidget(sep_label)
        sep_row.addWidget(self.append_separator)
        sep_row.addStretch()
        self.op_config_layout.addLayout(sep_row)

    def _build_adjust_ui(self):
        row = QHBoxLayout()
        row.addWidget(QLabel("数值字段:"))
        self.num_field_combo = QComboBox()
        self._populate_fields(self.num_field_combo)
        row.addWidget(self.num_field_combo, 1)
        row.addWidget(QLabel("调整量:"))
        self.num_adjust = QSpinBox()
        self.num_adjust.setRange(-99999, 99999)
        self.num_adjust.setValue(0)
        row.addWidget(self.num_adjust)
        self.op_config_layout.addLayout(row)

        mode_row = QHBoxLayout()
        self.adjust_mode = QComboBox()
        self.adjust_mode.addItem("加/减", "add")
        self.adjust_mode.addItem("乘以", "multiply")
        self.adjust_mode.addItem("设为", "set")
        mode_row.addWidget(QLabel("模式:"))
        mode_row.addWidget(self.adjust_mode)
        mode_row.addStretch()
        self.op_config_layout.addLayout(mode_row)

    def _build_tag_ui(self):
        row = QHBoxLayout()
        row.addWidget(QLabel("标签字段:"))
        self.tag_field_combo = QComboBox()
        self._populate_fields(self.tag_field_combo)
        row.addWidget(self.tag_field_combo, 1)
        row.addWidget(QLabel("添加标签:"))
        self.tag_edit = QLineEdit()
        self.tag_edit.setPlaceholderText("输入标签内容")
        row.addWidget(self.tag_edit, 1)
        self.op_config_layout.addLayout(row)

    def _populate_fields(self, combo):
        combo.clear()
        if self.schema:
            type_def = self.schema.get_type(self.data_type)
            if type_def:
                for field in type_def.form_fields:
                    combo.addItem(field.name, field.name)
                return
        combo.addItem("name", "name")
        combo.addItem("type", "type")
        combo.addItem("tags", "tags")

    def _on_apply(self):
        selected = self._get_selected_items()
        if not selected:
            QMessageBox.warning(self, "提示", "请至少选择一项数据")
            return

        op = self.op_combo.currentData()
        count = 0

        if op == "set_value":
            field = self.field_combo.currentData()
            value = self.value_edit.text()
            if not field:
                QMessageBox.warning(self, "提示", "请选择字段")
                return
            for item in selected:
                item[field] = value
                self.data_manager.update_item(self.plural_key, item.get("id"), item)
                count += 1

        elif op == "append_value":
            field = self.append_field_combo.currentData()
            value = self.append_edit.text()
            sep = self.append_separator.text()
            if not field or not value:
                QMessageBox.warning(self, "提示", "请填写字段和追加内容")
                return
            for item in selected:
                old = str(item.get(field, ""))
                item[field] = old + sep + value if old else value
                self.data_manager.update_item(self.plural_key, item.get("id"), item)
                count += 1

        elif op == "adjust_number":
            field = self.num_field_combo.currentData()
            mode = self.adjust_mode.currentData()
            adj = self.num_adjust.value()
            if not field:
                QMessageBox.warning(self, "提示", "请选择字段")
                return
            for item in selected:
                try:
                    old_val = float(str(item.get(field, "0")).replace("%", "").strip())
                except ValueError:
                    continue
                if mode == "add":
                    new_val = old_val + adj
                elif mode == "multiply":
                    new_val = old_val * adj if adj != 0 else old_val
                else:
                    new_val = adj
                item[field] = str(int(new_val)) if new_val == int(new_val) else str(new_val)
                self.data_manager.update_item(self.plural_key, item.get("id"), item)
                count += 1

        elif op == "add_tag":
            field = self.tag_field_combo.currentData()
            tag = self.tag_edit.text()
            if not field or not tag:
                QMessageBox.warning(self, "提示", "请填写字段和标签")
                return
            for item in selected:
                old = str(item.get(field, ""))
                item[field] = old + "," + tag if old else tag
                self.data_manager.update_item(self.plural_key, item.get("id"), item)
                count += 1

        elif op == "delete_selected":
            reply = QMessageBox.question(
                self, "确认删除",
                f"确定要删除 {len(selected)} 项数据吗？\n此操作不可撤销！",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
            )
            if reply != QMessageBox.StandardButton.Yes:
                return
            for item in selected:
                self.data_manager.delete_item(self.plural_key, item.get("id"))
                count += 1

        self.accept()
        QMessageBox.information(self, "完成", f"已处理 {count} 项数据")
