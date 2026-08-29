"""字段配置管理界面"""
import json

from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import (
    QComboBox,
    QDialog,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QMessageBox,
    QPushButton,
    QSpinBox,
    QVBoxLayout,
)

from common.logger import get_logger
from config.constants import FIELD_TYPE_MAP
from config.settings import get_config
from ui.themes import theme_color

FIELD_TYPE_CN = FIELD_TYPE_MAP


class FieldConfigDialog(QDialog):
    """字段配置管理对话框"""

    def __init__(self, data_type: str, parent=None):
        """初始化对话框

        Args:
            data_type: 数据类型
            parent: 父组件
        """
        super().__init__(parent)
        self.data_type = data_type
        self.config = get_config()
        self.logger = get_logger()
        self.setup_ui()
        self.setWindowTitle(f"字段配置 - {self.data_type}")
        self.setMinimumSize(600, 400)

    def setup_ui(self):
        """设置UI"""
        layout = QVBoxLayout(self)

        # 字段列表
        self.field_list = QListWidget()
        self.field_list.itemSelectionChanged.connect(self._on_field_selected)
        layout.addWidget(QLabel("字段列表："))
        layout.addWidget(self.field_list)

        # 字段属性编辑
        property_layout = QVBoxLayout()

        # 规则提示
        rule_label = QLabel()
        rule_label.setText("""<font color="#e74c3c"><b>⚠️ 规则：</b></font>
<ul>
<li><b style="color:green">显示标签</b> → 可以用中文（如「力量」「斗能」）</li>
<li><b style="color:#e74c3c">内部ID</b> → 必须英文或下划线（如 power, dou_neng）</li>
<li><b style="color:blue">下拉选项</b> → 可以全中文</li>
</ul>""")
        rule_label.setWordWrap(True)
        property_layout.addWidget(rule_label)

        # 字段名称
        name_layout = QHBoxLayout()
        name_layout.addWidget(QLabel("内部ID（必须英文）："))
        self.name_edit = QLineEdit()
        self.name_edit.setPlaceholderText("必须英文：如 name / hp / atk / dou_neng")
        self.name_edit.textChanged.connect(self._validate_field_id)
        name_layout.addWidget(self.name_edit)
        property_layout.addLayout(name_layout)

        # 字段标签
        label_layout = QHBoxLayout()
        label_layout.addWidget(QLabel("字段标签："))
        self.label_edit = QLineEdit()
        label_layout.addWidget(self.label_edit)
        property_layout.addLayout(label_layout)

        # 字段类型
        type_layout = QHBoxLayout()
        type_layout.addWidget(QLabel("字段类型："))
        self.type_combo = QComboBox()
        for ft, cn in FIELD_TYPE_CN:
            self.type_combo.addItem(cn, ft)
        type_layout.addWidget(self.type_combo)
        property_layout.addLayout(type_layout)

        # 可编辑性
        editable_layout = QHBoxLayout()
        editable_layout.addWidget(QLabel("可编辑："))
        self.editable_combo = QComboBox()
        self.editable_combo.addItems(['是', '否'])
        self.editable_combo.setCurrentText('是')
        editable_layout.addWidget(self.editable_combo)
        property_layout.addLayout(editable_layout)

        # 下拉选项（combobox类型）
        values_layout = QHBoxLayout()
        values_layout.addWidget(QLabel("下拉选项："))
        self.values_edit = QLineEdit()
        self.values_edit.setPlaceholderText("用逗号分隔多个选项")
        values_layout.addWidget(self.values_edit)
        property_layout.addLayout(values_layout)

        # 数值范围（spinbox类型）
        range_layout = QHBoxLayout()
        range_layout.addWidget(QLabel("最小值："))
        self.min_spin = QSpinBox()
        self.min_spin.setMinimum(0)
        range_layout.addWidget(self.min_spin)
        range_layout.addWidget(QLabel("最大值："))
        self.max_spin = QSpinBox()
        self.max_spin.setMinimum(0)
        self.max_spin.setMaximum(99999)
        self.max_spin.setValue(9999)
        range_layout.addWidget(self.max_spin)
        property_layout.addLayout(range_layout)

        layout.addLayout(property_layout)

        # 按钮
        button_layout = QHBoxLayout()

        self.add_btn = QPushButton("添加字段")
        self.add_btn.clicked.connect(self._on_add_field)
        button_layout.addWidget(self.add_btn)

        self.edit_btn = QPushButton("编辑字段")
        self.edit_btn.clicked.connect(self._on_edit_field)
        self.edit_btn.setEnabled(False)
        button_layout.addWidget(self.edit_btn)

        self.delete_btn = QPushButton("删除字段")
        self.delete_btn.clicked.connect(self._on_delete_field)
        self.delete_btn.setEnabled(False)
        button_layout.addWidget(self.delete_btn)

        button_layout.addStretch()

        self.ok_btn = QPushButton("确定")
        self.ok_btn.clicked.connect(self.accept)
        button_layout.addWidget(self.ok_btn)

        self.cancel_btn = QPushButton("取消")
        self.cancel_btn.clicked.connect(self.reject)
        button_layout.addWidget(self.cancel_btn)

        layout.addLayout(button_layout)

        # 加载字段列表
        self._load_fields()

    def _load_fields(self):
        """加载字段列表"""
        self.field_list.clear()
        if self.data_type in self.config.fields_config:
            for field in self.config.fields_config[self.data_type]:
                type_cn = next((cn for ft, cn in FIELD_TYPE_CN if ft == field.get('type', 'entry')), field.get('type', ''))
                item = QListWidgetItem(f"[{field.get('name', '')}] {field['label']}  [{type_cn}]")
                item.setData(Qt.ItemDataRole.UserRole, field)
                item.setToolTip(f"内部ID: {field.get('name', '')} (英文，程序内部使用)\n显示名: {field['label']} (中文，界面显示)\n类型: {type_cn}")
                self.field_list.addItem(item)

    def _on_field_selected(self):
        """选择字段时的处理"""
        selected_items = self.field_list.selectedItems()
        if selected_items:
            field = selected_items[0].data(Qt.ItemDataRole.UserRole)
            self.name_edit.setText(field.get('name', ''))
            self.label_edit.setText(field.get('label', ''))
            field_type = field.get('type', 'entry')
            idx = self.type_combo.findData(field_type)
            if idx >= 0:
                self.type_combo.setCurrentIndex(idx)
            self.editable_combo.setCurrentText('是' if field.get('editable', True) else '否')

            # 加载下拉选项
            if 'values' in field and field['values']:
                self.values_edit.setText(','.join(field['values']))
            else:
                self.values_edit.setText('')

            # 加载数值范围
            self.min_spin.setValue(field.get('from_', 0))
            self.max_spin.setValue(field.get('to', 9999))

            self.edit_btn.setEnabled(True)
            self.delete_btn.setEnabled(True)
        else:
            self.edit_btn.setEnabled(False)
            self.delete_btn.setEnabled(False)

    def _on_add_field(self):
        """添加字段"""
        name = self.name_edit.text().strip()
        label = self.label_edit.text().strip()
        field_type = self.type_combo.currentData() or "entry"
        editable = self.editable_combo.currentText() == '是'

        if not name or not label:
            QMessageBox.warning(self, "提示", "请填写字段名称和标签")
            return

        # 检查字段名是否已存在
        if self.data_type in self.config.fields_config:
            for field in self.config.fields_config[self.data_type]:
                if field['name'] == name:
                    QMessageBox.warning(self, "提示", "字段名称已存在")
                    return

        # 创建字段配置
        field = {
            'name': name,
            'label': label,
            'type': field_type,
            'editable': editable
        }

        # 添加下拉选项
        if field_type == 'combobox':
            values = [v.strip() for v in self.values_edit.text().split(',') if v.strip()]
            if values:
                field['values'] = values

        # 添加数值范围
        if field_type == 'spinbox':
            field['from_'] = self.min_spin.value()
            field['to'] = self.max_spin.value()

        # 添加到配置
        if self.data_type not in self.config.fields_config:
            self.config.fields_config[self.data_type] = []
        self.config.fields_config[self.data_type].append(field)

        # 保存配置
        self._save_fields_config()

        # 刷新列表
        self._load_fields()

        QMessageBox.information(self, "提示", "字段添加成功")

    def _on_edit_field(self):
        """编辑字段"""
        selected_items = self.field_list.selectedItems()
        if not selected_items:
            return

        field = selected_items[0].data(Qt.ItemDataRole.UserRole)
        original_name = field['name']

        name = self.name_edit.text().strip()
        label = self.label_edit.text().strip()
        field_type = self.type_combo.currentData() or "entry"
        editable = self.editable_combo.currentText() == '是'

        if not name or not label:
            QMessageBox.warning(self, "提示", "请填写字段名称和标签")
            return

        # 检查字段名是否已存在（排除当前字段）
        if self.data_type in self.config.fields_config:
            for f in self.config.fields_config[self.data_type]:
                if f['name'] == name and f['name'] != original_name:
                    QMessageBox.warning(self, "提示", "字段名称已存在")
                    return

        # 更新字段配置
        field['name'] = name
        field['label'] = label
        field['type'] = field_type
        field['editable'] = editable

        # 更新下拉选项
        if field_type == 'combobox':
            values = [v.strip() for v in self.values_edit.text().split(',') if v.strip()]
            if values:
                field['values'] = values
            elif 'values' in field:
                del field['values']
        else:
            if 'values' in field:
                del field['values']

        # 更新数值范围
        if field_type == 'spinbox':
            field['from_'] = self.min_spin.value()
            field['to'] = self.max_spin.value()
        else:
            if 'from_' in field:
                del field['from_']
            if 'to' in field:
                del field['to']

        # 保存配置
        self._save_fields_config()

        # 刷新列表
        self._load_fields()

        QMessageBox.information(self, "提示", "字段编辑成功")

    def _on_delete_field(self):
        """删除字段"""
        selected_items = self.field_list.selectedItems()
        if not selected_items:
            return

        field = selected_items[0].data(Qt.ItemDataRole.UserRole)

        # 确认删除
        reply = QMessageBox.question(
            self, "确认删除", f"确定要删除字段 '{field['label']}' 吗？",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )

        if reply == QMessageBox.StandardButton.Yes:
            # 从配置中删除
            if self.data_type in self.config.fields_config:
                self.config.fields_config[self.data_type] = [
                    f for f in self.config.fields_config[self.data_type]
                    if f['name'] != field['name']
                ]

            # 保存配置
            self._save_fields_config()

            # 刷新列表
            self._load_fields()

            QMessageBox.information(self, "提示", "字段删除成功")

    def _save_fields_config(self):
        """保存字段配置"""
        try:
            with open(self.config.fields_config_file, 'w', encoding='utf-8') as f:
                json.dump(self.config.fields_config, f, ensure_ascii=False, indent=2)
            self.logger.info(f"字段配置保存成功: {self.data_type}")
        except Exception as e:
            self.logger.error(f"字段配置保存失败: {e}")
            QMessageBox.warning(self, "错误", f"保存字段配置失败: {str(e)}")

    def _validate_field_id(self, text):
        import re
        if not text:
            self.name_edit.setStyleSheet("")
            return
        if re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', text):
            self.name_edit.setStyleSheet(f"QLineEdit {{ border: 2px solid {theme_color('success')}; }}")
        else:
            self.name_edit.setStyleSheet(f"QLineEdit {{ border: 2px solid {theme_color('danger')}; background-color: {theme_color('accent_light')}; }}")


# 导入json模块
