"""动态表单组件 - 根据字段配置生成分区折叠卡片式表单"""
from typing import Optional

from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtWidgets import (
    QComboBox,
    QDoubleSpinBox,
    QFileDialog,
    QFormLayout,
    QGridLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMessageBox,
    QPushButton,
    QScrollArea,
    QSpinBox,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from common.logger import get_logger
from config.settings import get_config
from core.style_manager import get_style_manager

from .attr_conversion import AttrConversionWidget
from .attr_table import AttrTableWidget
from .attribute_panel import AttributePanelWidget
from .collapsible_section import CollapsibleSection
from .drop_table import DropTableWidget
from .generic_drop import GenericDropWidget
from .multi_select import RefTableWidget

FIELD_GROUPS = {
    'job': [
        {
            'title': '基础信息', 'icon': '📌', 'collapsed': False,
            'fields': ['id', 'name', 'job_tier', 'base_job_from', 'type', 'desc']
        },
        {
            'title': '武器 & 加成', 'icon': '⚔️', 'collapsed': False,
            'fields': ['weapons', 'hp_bonus', 'mp_bonus', 'atk_bonus', 'def_bonus'],
            'layout': 'grid'
        },
        {
            'title': '机制 & 资源', 'icon': '⚙️', 'collapsed': False,
            'fields': ['mechanism', 'resource_type']
        },
        {
            'title': '属性列表', 'icon': '📋', 'collapsed': False,
            'fields': ['attr_list']
        },
        {
            'title': '技能体系', 'icon': '🎯', 'collapsed': True,
            'fields': ['core_skills', 'passives', 'skill_types']
        },
        {
            'title': '难度 & 风格', 'icon': '📊', 'collapsed': True,
            'fields': ['difficulty', 'playstyle', 'growth_type', 'inherent_buffs']
        },
        {
            'title': '进阶 & 标签', 'icon': '🏆', 'collapsed': True,
            'fields': ['unlock_condition', 'evolve_jobs', 'tags']
        },
    ],
    'role': [
        {
            'title': '基础信息', 'icon': '📌', 'collapsed': False,
            'fields': ['id', 'name', 'job', 'race', 'faction', 'category']
        },
        {
            'title': '属性面板 (RPG三层体系)', 'icon': '⚔️', 'collapsed': False,
            'type': 'attribute_panel'
        },
        {
            'title': '技能 & 天赋', 'icon': '🎯', 'collapsed': False,
            'fields': ['skills', 'talents', 'buffs']
        },
        {
            'title': '特殊机制', 'icon': '⚙️', 'collapsed': True,
            'fields': ['mechanism']
        },
        {
            'title': '描述 & 图片', 'icon': '📝', 'collapsed': True,
            'fields': ['tags', 'template', 'desc', 'image', 'image_desc', 'image_tags']
        },
    ],
    'monster': [
        {
            'title': '基础信息', 'icon': '📌', 'collapsed': False,
            'fields': ['id', 'name', 'level', 'type', 'category', 'difficulty', 'behavior']
        },
        {
            'title': '属性面板 (RPG三层体系)', 'icon': '⚔️', 'collapsed': False,
            'type': 'attribute_panel'
        },
        {
            'title': '技能 & 天赋', 'icon': '🎯', 'collapsed': False,
            'fields': ['skills', 'talents', 'buffs']
        },
        {
            'title': '特殊机制', 'icon': '⚙️', 'collapsed': True,
            'fields': ['mechanism']
        },
        {
            'title': '掉落配置', 'icon': '💎', 'collapsed': False,
            'fields': ['generic_drops', 'equip_drops', 'item_drops', 'title_drops']
        },
        {
            'title': '描述 & 图片', 'icon': '📝', 'collapsed': True,
            'fields': ['tags', 'template', 'desc', 'image', 'image_desc', 'image_tags']
        },
    ],
    'skill': [
        {
            'title': '基础信息', 'icon': '📌', 'collapsed': False,
            'fields': ['id', 'name', 'type', 'category', 'target']
        },
        {
            'title': '数值配置', 'icon': '⚔️', 'collapsed': False,
            'fields': ['value', 'multiplier', 'cd', 'damage_type', 'consume', 'effect'],
            'layout': 'grid'
        },
        {
            'title': '关联 Buff', 'icon': '🛡️', 'collapsed': False,
            'fields': ['buffs']
        },
        {
            'title': '描述 & 图片', 'icon': '📝', 'collapsed': True,
            'fields': ['tags', 'template', 'desc', 'image', 'image_desc', 'image_tags']
        },
    ],
    'talent': [
        {
            'title': '基础信息', 'icon': '📌', 'collapsed': False,
            'fields': ['id', 'name', 'type', 'category']
        },
        {
            'title': '数值配置', 'icon': '⚔️', 'collapsed': False,
            'fields': ['value', 'multiplier', 'cd', 'damage_type', 'consume', 'effect'],
            'layout': 'grid'
        },
        {
            'title': '描述 & 图片', 'icon': '📝', 'collapsed': True,
            'fields': ['tags', 'template', 'desc', 'image', 'image_desc', 'image_tags']
        },
    ],
    'equip': [
        {
            'title': '基础信息', 'icon': '📌', 'collapsed': False,
            'fields': ['id', 'name', 'part', 'rare', 'job', 'category']
        },
        {
            'title': '数值配置', 'icon': '⚔️', 'collapsed': False,
            'fields': ['value', 'effect'],
            'layout': 'grid'
        },
        {
            'title': '关联 Buff', 'icon': '🛡️', 'collapsed': False,
            'fields': ['buffs']
        },
        {
            'title': '描述 & 图片', 'icon': '📝', 'collapsed': True,
            'fields': ['tags', 'template', 'desc', 'image', 'image_desc', 'image_tags']
        },
    ],
    'item': [
        {
            'title': '基础信息', 'icon': '📌', 'collapsed': False,
            'fields': ['id', 'name', 'type', 'rare', 'category']
        },
        {
            'title': '数值配置', 'icon': '⚔️', 'collapsed': False,
            'fields': ['value', 'effect'],
            'layout': 'grid'
        },
        {
            'title': '关联 Buff', 'icon': '🛡️', 'collapsed': False,
            'fields': ['buffs']
        },
        {
            'title': '描述 & 图片', 'icon': '📝', 'collapsed': True,
            'fields': ['tags', 'template', 'desc', 'image', 'image_desc', 'image_tags']
        },
    ],
}

STAT_HINTS = {
    'role': {
        '坦克': {'hp': (1500, 3000), 'atk': (80, 150), 'def': (100, 200), 'mp': (100, 500)},
        '输出': {'hp': (400, 800), 'atk': (180, 300), 'def': (20, 60), 'mp': (200, 600)},
        '辅助': {'hp': (500, 900), 'atk': (60, 120), 'def': (30, 70), 'mp': (500, 1000)},
        '治疗': {'hp': (500, 800), 'atk': (50, 100), 'def': (30, 60), 'mp': (600, 1200)},
        '控制': {'hp': (500, 900), 'atk': (100, 180), 'def': (30, 70), 'mp': (400, 800)},
    },
    'monster': {
        '普通': {'hp': (100, 500), 'atk': (20, 80), 'def': (10, 50), 'exp': (30, 150)},
        '精英': {'hp': (2000, 8000), 'atk': (200, 500), 'def': (80, 200), 'exp': (500, 2000)},
        'Boss': {'hp': (5000, 50000), 'atk': (400, 1500), 'def': (150, 500), 'exp': (1000, 10000)},
        '稀有': {'hp': (800, 3000), 'atk': (150, 400), 'def': (60, 150), 'exp': (200, 800)},
    },
}

STAT_LABELS = {
    'hp': '❤️ HP', 'mp': '💧 MP', 'atk': '⚔️ ATK', 'def': '🛡️ DEF', 'exp': '⭐ EXP',
    'value': '📊 数值', 'multiplier': '✖️ 倍率', 'cd': '⏱️ CD',
}


class DynamicFormWidget(QWidget):
    """动态表单组件 - 分区折叠卡片式布局"""

    data_changed = pyqtSignal(dict)

    def __init__(self, data_type, data_manager=None, parent=None):
        super().__init__(parent)
        self.data_type = data_type
        self.data_manager = data_manager
        self.config = get_config()
        self.logger = get_logger()
        self.current_data = None
        self.widgets = {}
        self.field_containers = {}
        self.sections = {}

        self.setup_ui()

    def setup_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(6, 6, 6, 6)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setStyleSheet("QScrollArea { border: none; }")

        self._scroll_content = QWidget()
        self._main_layout = QVBoxLayout(self._scroll_content)
        self._main_layout.setSpacing(6)
        self._main_layout.setContentsMargins(4, 4, 4, 4)

        self._build_form()

        self._main_layout.addStretch()
        scroll.setWidget(self._scroll_content)
        layout.addWidget(scroll)

    def _build_form(self):
        all_fields = self.config.get_fields_config()
        fields = all_fields.get(self.data_type, [])
        if not fields:
            return

        field_map = {f['name']: f for f in fields}
        grouped_fields = set()
        _sm = get_style_manager()

        def _styled_label(raw_label: str) -> str:
            """根据当前游戏风格解析字段标签术语"""
            return _sm.resolve_field_label(raw_label)

        groups = FIELD_GROUPS.get(self.data_type, [])

        if groups:
            for group in groups:
                section = CollapsibleSection(
                    group['title'],
                    icon=group.get('icon', ''),
                    collapsed=group.get('collapsed', False)
                )
                self.sections[group['title']] = section

                if group.get('type') == 'attribute_panel':
                    attr_panel = AttributePanelWidget(attr_type=self.data_type, parent=self)
                    attr_panel.data_changed.connect(self._on_attr_changed)
                    self.widgets['__attribute_panel__'] = attr_panel
                    section.add_widget(attr_panel)

                elif group.get('layout') == 'grid':
                    grid = QGridLayout()
                    grid.setSpacing(8)
                    col = 0
                    row = 0
                    max_cols = 2
                    group_field_names = group.get('fields', [])

                    for fname in group_field_names:
                        if fname not in field_map:
                            continue
                        grouped_fields.add(fname)
                        field = field_map[fname]
                        widget = self._create_field_widget(field)
                        if widget:
                            self.widgets[fname] = widget
                            label_text = STAT_LABELS.get(fname, _styled_label(field['label']))
                            label = QLabel(label_text)
                            label.setObjectName("formLabel")
                            grid.addWidget(label, row, col * 2)
                            grid.addWidget(widget, row, col * 2 + 1)
                            col += 1
                            if col >= max_cols:
                                col = 0
                                row += 1

                    if group_field_names and self.data_type in STAT_HINTS:
                        hint_label = self._create_stat_hint()
                        if hint_label:
                            grid.addWidget(hint_label, row + 1, 0, 1, max_cols * 2)

                    section.add_layout(grid)
                else:
                    form = QFormLayout()
                    form.setSpacing(8)
                    form.setLabelAlignment(Qt.AlignmentFlag.AlignRight)

                    group_field_names = group.get('fields', [])
                    for fname in group_field_names:
                        if fname not in field_map:
                            continue
                        grouped_fields.add(fname)
                        field = field_map[fname]
                        widget = self._create_field_widget(field)
                        if widget:
                            self.widgets[fname] = widget
                            label = QLabel(_styled_label(field['label']))
                            label.setObjectName("formLabel")
                            form.addRow(label, widget)

                    section.add_layout(form)

                self._main_layout.addWidget(section)

        # P0-2 防御性兜底：复杂字段类型即使漏配 FIELD_GROUPS 也强制包 CollapsibleSection
        _COMPLEX_TYPES = {'multiselect', 'droptable', 'attrtable',
                          'genericdrop', 'attrconversion'}
        for field in fields:
            if field['name'] not in grouped_fields:
                widget = self._create_field_widget(field)
                if widget:
                    self.widgets[field['name']] = widget
                    label = QLabel(_styled_label(field['label']))
                    label.setObjectName("formLabel")
                    if field.get('type') in _COMPLEX_TYPES:
                        section = CollapsibleSection(
                            _styled_label(field['label']), icon='📋', collapsed=False
                        )
                        section.add_widget(widget)
                        self._main_layout.addWidget(section)
                    else:
                        form_row = QFormLayout()
                        form_row.addRow(label, widget)
                        self._main_layout.addLayout(form_row)

    def _on_attr_changed(self):
        self.data_changed.emit(self.get_data())

    def _create_stat_hint(self):
        hint_label = QLabel()
        hint_label.setObjectName("statHint")
        hint_label.setWordWrap(True)
        hint_label.setText("💡 选择分类后显示属性参考范围")
        return hint_label

    def _update_stat_hints(self):
        if self.data_type not in STAT_HINTS:
            return

        category_widget = self.widgets.get('category')
        if not category_widget or not isinstance(category_widget, QComboBox):
            return

        category = category_widget.currentText()
        hints = STAT_HINTS[self.data_type].get(category)
        hint_label = self._scroll_content.findChild(QLabel, "statHint")
        if not hint_label:
            return

        if not hints:
            hint_label.setText("💡 暂无该分类的属性参考")
            return

        parts = []
        stat_names = {'hp': 'HP', 'mp': 'MP', 'atk': 'ATK', 'def': 'DEF', 'exp': 'EXP'}
        for stat, (lo, hi) in hints.items():
            name = stat_names.get(stat, stat)
            current_widget = self.widgets.get(stat)
            current_val = current_widget.value() if isinstance(current_widget, QSpinBox) else None
            if current_val is not None:
                in_range = lo <= current_val <= hi
                mark = "✅" if in_range else "⚠️"
                parts.append(f"{mark} {name}: {lo}~{hi} (当前{current_val})")
            else:
                parts.append(f"💡 {name}: {lo}~{hi}")

        hint_label.setText("  ".join(parts))

    def _create_field_widget(self, field):
        field_type = field['type']
        editable = field.get('editable', True)

        if field_type == 'entry':
            widget = QLineEdit()
            widget.setReadOnly(not editable)
        elif field_type == 'combobox':
            widget = QComboBox()
            widget.setEditable(False)
            values = field.get('values', [])
            widget.addItems(values)
            if field.get('name') == 'category':
                widget.currentTextChanged.connect(lambda _: self._update_stat_hints())
        elif field_type == 'droptable':
            widget = DropTableWidget(self.data_manager, field['name'], self)
        elif field_type == 'genericdrop':
            widget = GenericDropWidget(self)
        elif field_type == 'multiselect':
            ref_type = field.get('ref_type', 'skills')
            widget = RefTableWidget(self.data_manager, field['name'], ref_type, self)
        elif field_type == 'attrtable':
            widget = AttrTableWidget(self)
        elif field_type == 'attrconversion':
            widget = AttrConversionWidget(self)
        elif field_type == 'spinbox':
            widget = QSpinBox()
            widget.setMinimum(field.get('from_', 0))
            widget.setMaximum(field.get('to', 9999))
            if field.get('name') in ('hp', 'mp', 'atk', 'def', 'exp', 'value'):
                widget.valueChanged.connect(lambda _: self._update_stat_hints())
        elif field_type == 'double_spin':
            widget = QDoubleSpinBox()
            widget.setMinimum(float(field.get('from_', 0)))
            widget.setMaximum(float(field.get('to', 9999)))
            widget.setDecimals(2)
            widget.setSingleStep(0.5)
        elif field_type == 'formula_builder':
            widget = self._create_formula_widget(field)
        elif field_type == 'tags':
            widget = QLineEdit()
            widget.setPlaceholderText("多个标签用逗号分隔")
        elif field_type == 'template':
            widget = self._create_template_widget(field)
        elif field_type in ('desc', 'content', 'achievement_desc'):
            widget = self._create_desc_widget(field)
        elif field_type == 'image':
            widget = self._create_image_widget()
        elif field_type == 'image_desc':
            widget = QTextEdit()
            widget.setMaximumHeight(60)
        elif field_type == 'image_tags':
            widget = self._create_image_tags_widget()
        elif field_type == 'dialog':
            widget = self._create_dialog_widget()
        else:
            widget = QLineEdit()

        return widget

    def _create_template_widget(self, field):
        container = QWidget()
        layout = QVBoxLayout(container)
        layout.setContentsMargins(0, 0, 0, 0)
        combo = QComboBox()
        combo.setEditable(True)
        values = field.get('values', [])
        combo.addItems(values)
        combo.currentTextChanged.connect(lambda: self._on_template_changed(combo))
        layout.addWidget(combo)
        return container

    def _create_formula_widget(self, field):
        container = QWidget()
        layout = QHBoxLayout(container)
        layout.setContentsMargins(0, 0, 0, 0)
        formula_edit = QLineEdit()
        formula_edit.setReadOnly(True)
        formula_edit.setPlaceholderText("点击编辑公式...")
        layout.addWidget(formula_edit)
        edit_btn = QPushButton("编辑公式")
        def open_formula_builder():
            from config.constants import ALL_ATTR_NAMES

            from .formula_builder import FormulaBuilderDialog
            dlg = FormulaBuilderDialog(
                available_attrs=list(ALL_ATTR_NAMES),
                current_formula=formula_edit.text(),
                parent=self,
                current_attr=field.get('label', self.data_type)
            )
            dlg.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
            dlg.accepted.connect(lambda d=dlg, fe=formula_edit: fe.setText(d.get_formula()))
            dlg.show()
        edit_btn.clicked.connect(open_formula_builder)
        layout.addWidget(edit_btn)
        return container

    def _find_child_widget(self, container: QWidget) -> Optional[QWidget]:
        """容器中逐级查找子控件：QComboBox → QTextEdit → QLineEdit"""
        widget = container.findChild(QComboBox)
        if widget:
            return widget
        widget = container.findChild(QTextEdit)
        if widget:
            return widget
        widget = container.findChild(QLineEdit)
        if widget:
            return widget
        return None

    def _on_template_changed(self, combo):
        template_text = combo.currentText()
        if not template_text:
            return
        desc = self._apply_desc_template(template_text)
        if desc and 'desc' in self.widgets:
            desc_widget = self.widgets['desc']
            if isinstance(desc_widget, QTextEdit):
                desc_widget.setPlainText(desc)

    def _apply_desc_template(self, template_text):
        return template_text

    def _create_desc_widget(self, field):
        container = QWidget()
        layout = QVBoxLayout(container)
        layout.setContentsMargins(0, 0, 0, 0)
        text_edit = QTextEdit()
        text_edit.setMaximumHeight(120)
        layout.addWidget(text_edit)
        button_layout = QHBoxLayout()
        ai_gen_btn = QPushButton("AI生成")
        ai_gen_btn.clicked.connect(self._on_ai_generate)
        button_layout.addWidget(ai_gen_btn)
        ai_img_btn = QPushButton("AI生图")
        ai_img_btn.clicked.connect(self._on_ai_image)
        button_layout.addWidget(ai_img_btn)
        button_layout.addStretch()
        layout.addLayout(button_layout)
        return container

    def _create_image_tags_widget(self):
        container = QWidget()
        layout = QVBoxLayout(container)
        layout.setContentsMargins(0, 0, 0, 0)
        line_edit = QLineEdit()
        line_edit.setPlaceholderText("多个标签用逗号分隔")
        layout.addWidget(line_edit)
        button_layout = QHBoxLayout()
        auto_gen_btn = QPushButton("自动生成")
        auto_gen_btn.clicked.connect(self._on_auto_generate_image_info)
        button_layout.addWidget(auto_gen_btn)
        ai_analyze_btn = QPushButton("AI分析")
        ai_analyze_btn.clicked.connect(self._on_ai_analyze_image)
        button_layout.addWidget(ai_analyze_btn)
        button_layout.addStretch()
        layout.addLayout(button_layout)
        return container

    def _create_dialog_widget(self):
        container = QWidget()
        layout = QHBoxLayout(container)
        layout.setContentsMargins(0, 0, 0, 0)
        line_edit = QLineEdit()
        line_edit.setReadOnly(True)
        layout.addWidget(line_edit)
        select_btn = QPushButton("选择对话")
        select_btn.clicked.connect(self._on_select_dialog)
        layout.addWidget(select_btn)
        return container

    def _create_image_widget(self):
        container = QWidget()
        layout = QVBoxLayout(container)
        layout.setContentsMargins(0, 0, 0, 0)
        path_layout = QHBoxLayout()
        self.image_path_edit = QLineEdit()
        self.image_path_edit.setReadOnly(True)
        path_layout.addWidget(self.image_path_edit)
        select_btn = QPushButton("选择图片")
        select_btn.clicked.connect(self._select_image)
        path_layout.addWidget(select_btn)
        layout.addLayout(path_layout)
        from ui.components import LazyImageLabel
        self.image_preview = LazyImageLabel()
        self.image_preview.set_target_size(self.image_preview.minimumSizeHint())
        layout.addWidget(self.image_preview)
        return container

    def _select_image(self):
        file_path, _ = QFileDialog.getOpenFileName(
            self, "选择图片", "", "图片文件 (*.png *.jpg *.jpeg *.bmp *.gif)"
        )
        if file_path:
            self.image_path_edit.setText(file_path)
            self.image_preview.load_image(file_path)

    def _on_ai_generate(self):
        from features.ai import generate_desc_only
        result = generate_desc_only(self, self.data_type)
        if result:
            desc_edit = self.findChild(QTextEdit)
            if desc_edit:
                desc_edit.setPlainText(result)

    def _on_ai_image(self):
        QMessageBox.information(self, "提示", "AI图片生成功能需要配置API密钥")

    def _on_auto_generate_image_info(self):
        data = self.get_data()
        name = data.get('name', '')
        info = {
            'desc': f'{name}的图片描述',
            'tags': f'{name},图片,游戏'
        }
        for field_name, widget in self.widgets.items():
            if 'image_desc' in field_name.lower() or ('img' in field_name.lower() and 'desc' in field_name.lower()):
                if isinstance(widget, QTextEdit):
                    widget.setPlainText(info['desc'])
            elif 'image_tags' in field_name.lower() or ('img' in field_name.lower() and 'tag' in field_name.lower()):
                if isinstance(widget, QLineEdit):
                    widget.setText(info['tags'])

    def _on_ai_analyze_image(self):
        """AI分析图片 — 通过 common.ai_client 尝试生成图片描述"""
        from common.ai_client import generate_text
        from common.logger import get_logger
        from config.settings import get_config

        # 找到当前图片路径
        image_path = ""
        if hasattr(self, 'image_path_edit'):
            image_path = self.image_path_edit.text()
        if not image_path:
            QMessageBox.warning(self, "提示", "请先选择一张图片")
            return

        try:
            config = get_config()
            if not config.enabled:
                QMessageBox.information(self, "提示", "请先在设置中启用API并配置API Key")
                return
            prompt = f"请描述这张图片的内容，提取主要视觉元素作为标签: {image_path}"
            success, result = generate_text(config, prompt)
            if success and result:
                # 填充到 tags 输入框
                for name, widget in self.widgets.items():
                    if 'image_tags' in name.lower() or ('img' in name.lower() and 'tag' in name.lower()):
                        if isinstance(widget, QLineEdit):
                            current = widget.text()
                            new_tags = result.strip()[:200]
                            widget.setText(f"{current}{', ' if current else ''}{new_tags}")
                            QMessageBox.information(self, "AI分析完成", f"已生成标签: {new_tags[:80]}...")
                            return
            QMessageBox.information(self, "提示", f"AI分析未能生成结果：{result if not success else '请检查API配置'}")
        except Exception as e:
            get_logger().warning("AI图片分析失败: %s", e)
            QMessageBox.warning(self, "提示", "AI分析失败，请检查API配置")

    def _on_select_dialog(self):
        """选择对话 — 从当前数据源选择一条 dialog 数据"""
        main_window = self.window()
        if not hasattr(main_window, 'data_manager'):
            QMessageBox.warning(self, "提示", "无法访问数据管理器")
            return

        data_manager = main_window.data_manager
        all_data = getattr(data_manager, 'data', None) or {}
        dialogs = all_data.get('dialogs', [])

        if not dialogs:
            QMessageBox.information(self, "提示", "没有可用的对话数据，请先在「对话」类型中创建数据")
            return

        from PyQt6.QtWidgets import QDialog, QHBoxLayout, QListWidget, QVBoxLayout
        dlg = QDialog(self)
        dlg.setWindowTitle("选择对话")
        dlg.setMinimumSize(400, 300)

        layout = QVBoxLayout(dlg)
        list_widget = QListWidget()
        for d in dialogs:
            name = d.get('name', d.get('id', '未命名'))
            list_widget.addItem(f"{d.get('id', '?')} — {name}")
        layout.addWidget(list_widget)

        btn_row = QHBoxLayout()
        ok_btn = QPushButton("确定")
        cancel_btn = QPushButton("取消")

        result = [None]
        def on_ok():
            row = list_widget.currentRow()
            if row >= 0:
                result[0] = dialogs[row]
            dlg.accept()

        ok_btn.clicked.connect(on_ok)
        cancel_btn.clicked.connect(dlg.reject)
        btn_row.addStretch()
        btn_row.addWidget(ok_btn)
        btn_row.addWidget(cancel_btn)
        layout.addLayout(btn_row)

        if dlg.exec() and result[0]:
            # 填充到对应的字段
            for name, widget in self.widgets.items():
                if 'dialog' in name.lower():
                    if isinstance(widget, QLineEdit):
                        widget.setText(result[0].get('id', ''))
                        break

    def load_data(self, data):
        self.current_data = data.copy()

        attr_panel = self.widgets.get('__attribute_panel__')
        if attr_panel:
            attr_panel.load_data(data)

        for field_name, widget in self.widgets.items():
            if field_name == '__attribute_panel__':
                continue
            value = data.get(field_name, "")
            if isinstance(widget, QLineEdit):
                widget.setText(str(value))
            elif isinstance(widget, QComboBox):
                if widget.isEditable():
                    widget.setEditText(str(value))
                else:
                    index = widget.findText(str(value))
                    if index >= 0:
                        widget.setCurrentIndex(index)
            elif isinstance(widget, QSpinBox):
                try:
                    widget.setValue(int(value))
                except (ValueError, TypeError):
                    widget.setValue(0)
            elif isinstance(widget, QDoubleSpinBox):
                try:
                    widget.setValue(float(value))
                except (ValueError, TypeError):
                    widget.setValue(0.0)
            elif isinstance(widget, QTextEdit):
                widget.setPlainText(str(value))
            elif hasattr(widget, 'load_data'):
                widget.load_data(value if value else [])
            elif isinstance(widget, QWidget):
                if hasattr(widget, 'image_path_edit'):
                    widget.image_path_edit.setText(str(value))
                    widget.image_preview.load_image(str(value))
                else:
                    child = self._find_child_widget(widget)
                    if isinstance(child, QComboBox):
                        if child.isEditable():
                            child.setEditText(str(value))
                        else:
                            index = child.findText(str(value))
                            if index >= 0:
                                child.setCurrentIndex(index)
                    elif isinstance(child, QTextEdit):
                        child.setPlainText(str(value))
                    elif isinstance(child, QLineEdit):
                        child.setText(str(value))
        self._update_stat_hints()

    def get_data(self):
        if not self.current_data:
            return {}
        data = self.current_data.copy()

        attr_panel = self.widgets.get('__attribute_panel__')
        if attr_panel:
            data.update(attr_panel.get_data())

        for field_name, widget in self.widgets.items():
            if field_name == '__attribute_panel__':
                continue
            if isinstance(widget, QLineEdit):
                data[field_name] = widget.text()
            elif isinstance(widget, QComboBox):
                if widget.isEditable():
                    data[field_name] = widget.currentText()
                else:
                    data[field_name] = widget.currentText()
            elif isinstance(widget, QSpinBox):
                data[field_name] = widget.value()
            elif isinstance(widget, QTextEdit):
                data[field_name] = widget.toPlainText()
            elif hasattr(widget, 'get_data'):
                data[field_name] = widget.get_data()
            elif isinstance(widget, QWidget):
                if hasattr(widget, 'image_path_edit'):
                    data[field_name] = widget.image_path_edit.text()
                else:
                    child = self._find_child_widget(widget)
                    if isinstance(child, QComboBox):
                        data[field_name] = child.currentText()
                    elif isinstance(child, QTextEdit):
                        data[field_name] = child.toPlainText()
                    elif isinstance(child, QLineEdit):
                        data[field_name] = child.text()
        return data

    def get_form_data(self):
        return self.get_data()

    def clear(self):
        self.current_data = None
        attr_panel = self.widgets.get('__attribute_panel__')
        if attr_panel:
            attr_panel.clear()

        for field_name, widget in self.widgets.items():
            if field_name == '__attribute_panel__':
                continue
            if isinstance(widget, QLineEdit):
                widget.clear()
            elif isinstance(widget, QComboBox):
                if widget.isEditable():
                    widget.setEditText("")
                else:
                    widget.setCurrentIndex(0)
            elif isinstance(widget, QSpinBox):
                widget.setValue(0)
            elif isinstance(widget, QDoubleSpinBox):
                widget.setValue(0.0)
            elif isinstance(widget, QTextEdit):
                widget.clear()
            elif hasattr(widget, 'clear'):
                widget.clear()
            elif isinstance(widget, QWidget):
                if hasattr(widget, 'image_path_edit'):
                    widget.image_path_edit.clear()
                    widget.image_preview.clear()
                else:
                    child = self._find_child_widget(widget)
                    if isinstance(child, QComboBox):
                        child.setCurrentIndex(0)
                    elif isinstance(child, QTextEdit):
                        child.clear()
                    elif isinstance(child, QLineEdit):
                        child.clear()
