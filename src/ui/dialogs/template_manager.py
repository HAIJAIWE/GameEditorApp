"""模板管理对话框"""
from PyQt6.QtGui import QFont
from PyQt6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QDialog,
    QFormLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListWidget,
    QMessageBox,
    QPushButton,
    QSpinBox,
    QVBoxLayout,
    QWidget,
)

from common.logger import get_logger
from config.constants import FIELD_TYPE_MAP, _type_registry
from config.settings import get_config
from ui.dialogs.auto_input_dialog import show_text_input_dialog


class TemplateManagerDialog(QDialog):
    """模板管理对话框"""

    def __init__(self, main_window, parent=None):
        """初始化模板对话框

        Args:
            main_window: 主窗口实例
            parent: 父窗口
        """
        super().__init__(parent)
        self.setFont(QFont("Microsoft YaHei", 10))
        self.main_window = main_window
        self.config = get_config()
        self.logger = get_logger()

        # 从中央类型注册表动态获取（与 constants.py 保持一致）
        self.data_type_map = {v: k for k, v in _type_registry.names.items()}
        self.data_type_display = list(self.data_type_map.keys())

        self.field_type_display = [cn for _, cn in FIELD_TYPE_MAP]
        self.field_type_map = {cn: ft for ft, cn in FIELD_TYPE_MAP}
        self.field_type_map_reverse = {v: k for k, v in self.field_type_map.items()}

        self.current_config = {k: list(v) for k, v in self.config.fields_config.items()}

        self.setup_ui()

    def setup_ui(self):
        """设置UI"""
        self.setWindowTitle("模板管理器")
        self.setMinimumSize(900, 700)

        layout = QVBoxLayout(self)

        top_frame = QHBoxLayout()

        top_frame.addWidget(QLabel("当前模板:"))
        self.template_var = QComboBox()
        self.template_var.addItems(self.config.get_all_templates())
        self.template_var.setCurrentText(self.config.current_template_name)
        self.template_var.currentTextChanged.connect(self.apply_template_and_refresh)
        top_frame.addWidget(self.template_var)

        save_template_btn = QPushButton("保存为模板")
        save_template_btn.clicked.connect(self.save_current_as_template)
        top_frame.addWidget(save_template_btn)

        delete_template_btn = QPushButton("删除模板")
        delete_template_btn.clicked.connect(self.delete_template)
        top_frame.addWidget(delete_template_btn)

        top_frame.addSpacing(20)

        top_frame.addWidget(QLabel("选择数据类型:"))
        self.current_type_var = QComboBox()
        self.current_type_var.addItems(self.data_type_display)
        self.current_type_var.setCurrentText("技能")
        self.current_type_var.currentTextChanged.connect(self.populate_field_list)
        top_frame.addWidget(self.current_type_var)

        layout.addLayout(top_frame)

        main_frame = QHBoxLayout()

        left_frame = QWidget()
        left_layout = QVBoxLayout(left_frame)
        left_layout.addWidget(QLabel("字段列表"))

        self.field_list = QListWidget()
        self.field_list.itemSelectionChanged.connect(self.load_selected_field)
        left_layout.addWidget(self.field_list)

        field_button_frame = QHBoxLayout()
        add_btn = QPushButton("添加")
        add_btn.clicked.connect(self.add_field)
        field_button_frame.addWidget(add_btn)

        delete_btn = QPushButton("删除")
        delete_btn.clicked.connect(self.delete_field)
        field_button_frame.addWidget(delete_btn)

        up_btn = QPushButton("上移")
        up_btn.clicked.connect(self.move_up)
        field_button_frame.addWidget(up_btn)

        down_btn = QPushButton("下移")
        down_btn.clicked.connect(self.move_down)
        field_button_frame.addWidget(down_btn)

        reset_btn = QPushButton("恢复默认")
        reset_btn.clicked.connect(self.reset_default)
        field_button_frame.addWidget(reset_btn)

        left_layout.addLayout(field_button_frame)
        main_frame.addWidget(left_frame, 1)

        right_frame = QWidget()
        right_layout = QVBoxLayout(right_frame)
        right_layout.addWidget(QLabel("字段编辑"))

        form_layout = QFormLayout()

        self.edit_name = QLineEdit()
        form_layout.addRow("字段名:", self.edit_name)

        self.edit_label = QLineEdit()
        form_layout.addRow("显示标签:", self.edit_label)

        self.edit_type = QComboBox()
        self.edit_type.addItems(self.field_type_display)
        self.edit_type.currentTextChanged.connect(self.update_edit_options)
        form_layout.addRow("字段类型:", self.edit_type)

        self.edit_editable = QCheckBox("可编辑")
        self.edit_editable.setChecked(True)
        form_layout.addRow("", self.edit_editable)

        self.combobox_frame = QWidget()
        combo_layout = QFormLayout(self.combobox_frame)
        self.edit_values = QLineEdit()
        combo_layout.addRow("选项值(逗号分隔):", self.edit_values)

        self.spinbox_frame = QWidget()
        spin_layout = QHBoxLayout(self.spinbox_frame)
        spin_layout.addWidget(QLabel("范围:"))
        self.edit_from = QSpinBox()
        self.edit_from.setRange(0, 999999)
        spin_layout.addWidget(self.edit_from)
        spin_layout.addWidget(QLabel("-"))
        self.edit_to = QSpinBox()
        self.edit_to.setRange(0, 999999)
        self.edit_to.setValue(9999)
        spin_layout.addWidget(self.edit_to)
        spin_layout.addStretch()

        form_layout.addRow(self.combobox_frame)
        form_layout.addRow(self.spinbox_frame)

        right_layout.addLayout(form_layout)

        save_field_btn = QPushButton("保存字段")
        save_field_btn.clicked.connect(self.save_current_field)
        right_layout.addWidget(save_field_btn)

        right_layout.addStretch()
        main_frame.addWidget(right_frame, 1)

        layout.addLayout(main_frame)

        bottom_frame = QHBoxLayout()
        save_all_btn = QPushButton("保存")
        save_all_btn.clicked.connect(self.save_all)
        bottom_frame.addWidget(save_all_btn)

        close_btn = QPushButton("关闭")
        close_btn.clicked.connect(self.accept)
        bottom_frame.addWidget(close_btn)

        layout.addLayout(bottom_frame)

        self.update_edit_options()
        self.populate_field_list()

    def apply_template_and_refresh(self):
        """应用模板并刷新（热加载，无需重启）"""
        template_name = self.template_var.currentText()
        if template_name:
            if self.config.apply_template(template_name):
                # 保存配置立即
                self.config.save_fields_config()
                self._toast(f"已应用模板: {template_name}")
                self.current_config = {k: list(v) for k, v in self.config.fields_config.items()}
                self.populate_field_list()

                # 通知主窗口热加载模板
                if hasattr(self.main_window, 'hot_reload_template'):
                    self.main_window.hot_reload_template()
            else:
                QMessageBox.warning(self, "错误", "应用模板失败!")

    def save_current_as_template(self):
        """保存当前为模板"""
        template_name, ok = show_text_input_dialog(self, "保存模板", "请输入模板名称:")
        if ok and template_name:
            template_data = {
                "description": "自定义模板",
                "fields": {},
                "ai_prompts": {}
            }
            for data_type in self.data_type_map.values():
                if data_type in self.current_config:
                    template_data["fields"][data_type] = {}
                    for field in self.current_config[data_type]:
                        template_data["fields"][data_type][field["name"]] = field["label"]
            if self.config.save_template(template_name, template_data):
                self._toast(f"模板已保存: {template_name}")
                self.template_var.clear()
                self.template_var.addItems(self.config.get_all_templates())
            else:
                QMessageBox.warning(self, "错误", "保存模板失败!")

    def delete_template(self):
        """删除当前选中的模板"""
        template_name = self.template_var.currentText()
        if not template_name:
            return
        if self.config.delete_template(template_name):
            self._toast(f"模板已删除: {template_name}")
            self.template_var.clear()
            self.template_var.addItems(self.config.get_all_templates())
        else:
            QMessageBox.warning(self, "错误", "无法删除该模板（预设模板不允许删除）")

    def _toast(self, message, duration=3000):
        """在状态栏显示临时提示"""
        try:
            if hasattr(self.main_window, 'show_toast'):
                self.main_window.show_toast(message, duration)
        except Exception:
            self.logger.exception("模板数据加载失败")

    def populate_field_list(self):
        """填充字段列表"""
        self.field_list.clear()
        dtype_display = self.current_type_var.currentText()
        dtype = self.data_type_map.get(dtype_display, 'skill')
        if dtype in self.current_config:
            for field in self.current_config[dtype]:
                self.field_list.addItem(f"{field['name']} - {field['label']}")

    def load_selected_field(self):
        """加载选中的字段"""
        selection = self.field_list.selectedItems()
        if not selection:
            return
        idx = self.field_list.row(selection[0])
        dtype_display = self.current_type_var.currentText()
        dtype = self.data_type_map.get(dtype_display, 'skill')
        if dtype in self.current_config and idx < len(self.current_config[dtype]):
            field = self.current_config[dtype][idx]
            self.edit_name.setText(field['name'])
            self.edit_label.setText(field['label'])
            ftype = field['type']
            self.edit_type.setCurrentText(self.field_type_map_reverse.get(ftype, ftype))
            self.edit_editable.setChecked(field.get('editable', True))
            self.edit_values.setText(','.join(field.get('values', [])))
            self.edit_from.setValue(field.get('from_', 0))
            self.edit_to.setValue(field.get('to', 9999))

    def save_current_field(self):
        """保存当前字段"""
        selection = self.field_list.selectedItems()
        idx = self.field_list.row(selection[0]) if selection else None
        dtype_display = self.current_type_var.currentText()
        dtype = self.data_type_map.get(dtype_display, 'skill')
        if dtype not in self.current_config:
            return

        ftype_display = self.edit_type.currentText()
        ftype = self.field_type_map.get(ftype_display, ftype_display)

        field = {
            'name': self.edit_name.text(),
            'label': self.edit_label.text(),
            'type': ftype,
            'editable': self.edit_editable.isChecked()
        }

        if ftype == 'combobox' or ftype == 'template':
            vals = self.edit_values.text().split(',')
            field['values'] = [v.strip() for v in vals if v.strip()]
        elif ftype == 'spinbox':
            field['from_'] = self.edit_from.value()
            field['to'] = self.edit_to.value()

        if idx is not None and idx < len(self.current_config[dtype]):
            self.current_config[dtype][idx] = field
        else:
            self.current_config[dtype].append(field)

        self.populate_field_list()
        self._toast("字段已保存")

    def add_field(self):
        """添加字段"""
        self.field_list.clearSelection()
        self.edit_name.setText('')
        self.edit_label.setText('')
        self.edit_type.setCurrentText('文本输入')
        self.edit_editable.setChecked(True)
        self.edit_values.setText('')
        self.edit_from.setValue(0)
        self.edit_to.setValue(9999)

    def delete_field(self):
        """删除字段"""
        selection = self.field_list.selectedItems()
        if not selection:
            QMessageBox.warning(self, "警告", "请先选择要删除的字段")
            return
        idx = self.field_list.row(selection[0])
        dtype_display = self.current_type_var.currentText()
        dtype = self.data_type_map.get(dtype_display, 'skill')
        if dtype in self.current_config and idx < len(self.current_config[dtype]):
            del self.current_config[dtype][idx]
            self.populate_field_list()

    def move_up(self):
        """上移字段"""
        selection = self.field_list.selectedItems()
        if not selection:
            return
        idx = self.field_list.row(selection[0])
        if idx == 0:
            return
        dtype_display = self.current_type_var.currentText()
        dtype = self.data_type_map.get(dtype_display, 'skill')
        if dtype in self.current_config and idx < len(self.current_config[dtype]):
            self.current_config[dtype][idx], self.current_config[dtype][idx-1] = self.current_config[dtype][idx-1], self.current_config[dtype][idx]
            self.populate_field_list()
            self.field_list.setCurrentRow(idx-1)

    def move_down(self):
        """下移字段"""
        selection = self.field_list.selectedItems()
        if not selection:
            return
        idx = self.field_list.row(selection[0])
        dtype_display = self.current_type_var.currentText()
        dtype = self.data_type_map.get(dtype_display, 'skill')
        if idx >= len(self.current_config.get(dtype, [])) - 1:
            return
        if dtype in self.current_config and idx < len(self.current_config[dtype]):
            self.current_config[dtype][idx], self.current_config[dtype][idx+1] = self.current_config[dtype][idx+1], self.current_config[dtype][idx]
            self.populate_field_list()
            self.field_list.setCurrentRow(idx+1)

    def reset_default(self):
        """恢复默认"""
        reply = QMessageBox.question(
            self, "确认", "确定要恢复所有默认配置吗？",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        if reply == QMessageBox.StandardButton.Yes:
            # 字段定义统一由 type_schema 管理，恢复默认即从 type_schema 重新派生
            schema = self.config.get_type_schema()
            if schema:
                self.current_config = {
                    t.id: [f.to_dict() for f in t.form_fields]
                    for t in schema.types
                }
            else:
                self.current_config = {}
            self.populate_field_list()

    def update_edit_options(self):
        """更新编辑选项"""
        ftype_display = self.edit_type.currentText()
        ftype = self.field_type_map.get(ftype_display, ftype_display)
        if ftype == 'combobox' or ftype == 'template':
            self.combobox_frame.show()
            self.spinbox_frame.hide()
        elif ftype == 'spinbox':
            self.spinbox_frame.show()
            self.combobox_frame.hide()
        else:
            self.combobox_frame.hide()
            self.spinbox_frame.hide()

    def save_all(self):
        """保存所有（热加载）"""
        try:
            self.config.fields_config = self.current_config
            self.config.save_fields_config()

            # 尝试热加载
            self._toast("配置已保存，正在刷新界面...", 4000)

            # 通知主窗口热加载
            if hasattr(self.main_window, 'hot_reload_template'):
                self.main_window.hot_reload_template()

            self.accept()
        except Exception as e:
            self.logger.error(f"保存配置失败: {e}", exc_info=True)
            QMessageBox.warning(self, "错误", f"保存配置失败: {e}")
