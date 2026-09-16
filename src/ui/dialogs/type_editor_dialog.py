"""类型编辑器 — 增删改数据类型和字段

TypeEditorDialog 的 AI 辅助方法拆到 type_editor_ai.py（TypeEditorAIMixin），
两个内部控件类拆到 type_editor_field_widget / type_editor_layout_widget，
内置模板数据外置到 src/data/type_editor_templates.py。
"""
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QColor, QFont
from PyQt6.QtWidgets import (
    QColorDialog,
    QComboBox,
    QDialog,
    QDialogButtonBox,
    QFormLayout,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QMessageBox,
    QPushButton,
    QSplitter,
    QTabWidget,
    QTextBrowser,
    QVBoxLayout,
    QWidget,
)

from common.logger import get_logger
from config.constants import FIELD_TYPE_MAP
from core.type_schema import TypeDef, TypeField, TypeSchema
from data.type_editor_templates import TYPE_TEMPLATES
from ui.dialogs.type_editor_ai import TypeEditorAIMixin
from ui.dialogs.type_editor_field_widget import FieldEditorWidget
from ui.dialogs.type_editor_layout_widget import LayoutEditorWidget
from ui.themes import theme_color

logger = get_logger()

FIELD_TYPES = FIELD_TYPE_MAP


class TypeEditorDialog(TypeEditorAIMixin, QDialog):
    """类型编辑器对话框 — 增删改数据类型与字段"""

    TYPE_TEMPLATES = TYPE_TEMPLATES

    def __init__(self, schema: TypeSchema, library_name: str, parent=None):
        super().__init__(parent)
        self.setFont(QFont("Microsoft YaHei", 10))
        self.schema = schema
        self.library_name = library_name
        self._current_type_index = -1
        self._current_field_index = -1
        self._dirty = False

        self.setFixedSize(1000, 700)
        self.setWindowTitle(f"类型编辑器 — {library_name}")
        self.setup_ui()
    def _build_tools_bar(self, main_layout) -> None:
        """智能工具栏：AI 推荐字段 / 分析数据 / 导入模板 / 联网参考。"""
        tools_bar = QHBoxLayout()
        tools_label = QLabel("🧠 智能助手:")
        tools_label.setStyleSheet("font-weight:bold; font-size:12px;")
        tools_bar.addWidget(tools_label)

        self.ai_suggest_btn = QPushButton("🤖 AI推荐字段")
        self.ai_suggest_btn.setToolTip("根据策划案分析，AI推荐当前类型应该有哪些字段")
        self.ai_suggest_btn.clicked.connect(self.ai_suggest_fields)
        tools_bar.addWidget(self.ai_suggest_btn)

        self.analyze_data_btn = QPushButton("📊 分析现有数据")
        self.analyze_data_btn.setToolTip("分析库中已有数据，发现缺失或冗余的字段")
        self.analyze_data_btn.clicked.connect(self.analyze_existing_data)
        tools_bar.addWidget(self.analyze_data_btn)

        self.import_template_btn = QPushButton("📋 导入模板")
        self.import_template_btn.setToolTip("从预设游戏类型模板导入字段结构（RPG/卡牌/策略/FPS/MOBA）")
        self.import_template_btn.clicked.connect(self.import_from_template)
        tools_bar.addWidget(self.import_template_btn)

        self.web_ref_btn = QPushButton("🔍 联网参考")
        self.web_ref_btn.setToolTip("搜索同类游戏的字段设计作为参考")
        self.web_ref_btn.clicked.connect(self.search_web_reference)
        tools_bar.addWidget(self.web_ref_btn)

        tools_bar.addStretch()
        main_layout.addLayout(tools_bar)
    def _build_left_panel(self, splitter) -> None:
        """左侧面板：数据类型列表 + 添加/删除按钮。"""
        left_panel = QWidget()
        left_layout = QVBoxLayout(left_panel)
        left_layout.setContentsMargins(0, 0, 4, 0)

        type_header = QLabel("数据类型列表")
        type_header.setStyleSheet("font-weight:bold; font-size:13px; padding:4px;")
        left_layout.addWidget(type_header)

        self.type_list = QListWidget()
        self.type_list.setWordWrap(True)
        self.type_list.setMinimumWidth(200)
        for t in self.schema.types:
            color_dot = "● "
            item = QListWidgetItem(f"{color_dot}{t.name}  ({t.id})")
            item.setData(Qt.ItemDataRole.UserRole, t.id)
            item.setForeground(QColor(t.color))
            self.type_list.addItem(item)
        self.type_list.currentRowChanged.connect(self.on_type_selected)
        left_layout.addWidget(self.type_list)

        type_btn_layout = QHBoxLayout()
        self.add_type_btn = QPushButton("+ 添加类型")
        self.add_type_btn.clicked.connect(self.add_type)
        self.del_type_btn = QPushButton("- 删除类型")
        self.del_type_btn.clicked.connect(self.delete_type)
        type_btn_layout.addWidget(self.add_type_btn)
        type_btn_layout.addWidget(self.del_type_btn)
        left_layout.addLayout(type_btn_layout)

        splitter.addWidget(left_panel)
    def _build_right_panel(self, splitter) -> None:
        """右侧面板：基本信息表单 + 字段编辑 + 排版 tab。"""
        right_panel = QWidget()
        right_layout = QVBoxLayout(right_panel)
        right_layout.setContentsMargins(4, 0, 0, 0)

        type_detail_header = QLabel("类型详情")
        type_detail_header.setStyleSheet("font-weight:bold; font-size:13px; padding:4px;")
        right_layout.addWidget(type_detail_header)

        detail_group = QGroupBox("基本信息")
        detail_form = QFormLayout(detail_group)

        self.type_id_edit = QLineEdit()
        self.type_id_edit.setPlaceholderText("英文ID，如 skill, role, card")
        detail_form.addRow("类型ID *:", self.type_id_edit)

        self.type_name_edit = QLineEdit()
        self.type_name_edit.setPlaceholderText("中文名称，如 技能、角色、卡牌")
        detail_form.addRow("显示名 *:", self.type_name_edit)

        self.type_plural_edit = QLineEdit()
        self.type_plural_edit.setPlaceholderText("复数键名，如 skills, cards, roles")
        detail_form.addRow("复数键 *:", self.type_plural_edit)

        self.type_color_btn = QPushButton("选择颜色")
        self.type_color_btn.clicked.connect(self.pick_color)
        self._selected_color = "#4CAF50"
        self._update_color_button()
        detail_form.addRow("标识颜色:", self.type_color_btn)

        right_layout.addWidget(detail_group)

        self.layout_editor = LayoutEditorWidget()
        self.layout_editor.layout_changed.connect(self._mark_dirty)

        self.editor_tabs = QTabWidget()
        self.editor_tabs.setTabPosition(QTabWidget.TabPosition.North)

        fields_tab = QWidget()
        fields_tab_layout = QVBoxLayout(fields_tab)
        fields_tab_layout.setContentsMargins(0, 0, 0, 0)

        fields_group = QGroupBox("字段定义")
        fields_vlayout = QVBoxLayout(fields_group)

        fields_btn_bar = QHBoxLayout()
        self.add_field_btn = QPushButton("+ 添加字段")
        self.add_field_btn.clicked.connect(self.add_field)
        self.del_field_btn = QPushButton("- 删除字段")
        self.del_field_btn.clicked.connect(self.delete_field)
        self.move_up_btn = QPushButton("↑ 上移")
        self.move_up_btn.clicked.connect(lambda: self.move_field(-1))
        self.move_down_btn = QPushButton("↓ 下移")
        self.move_down_btn.clicked.connect(lambda: self.move_field(1))
        fields_btn_bar.addWidget(self.add_field_btn)
        fields_btn_bar.addWidget(self.del_field_btn)
        fields_btn_bar.addWidget(self.move_up_btn)
        fields_btn_bar.addWidget(self.move_down_btn)
        fields_btn_bar.addStretch()
        fields_vlayout.addLayout(fields_btn_bar)

        self.field_list = QListWidget()
        self.field_list.currentRowChanged.connect(self.on_field_selected)
        fields_vlayout.addWidget(self.field_list)

        self.field_editor_container = QWidget()
        self.field_editor_layout = QVBoxLayout(self.field_editor_container)
        self.field_editor_layout.setContentsMargins(0, 0, 0, 0)
        self.current_field_editor: FieldEditorWidget | None = None
        fields_vlayout.addWidget(self.field_editor_container)

        right_layout.addWidget(fields_group)

        fields_tab_layout.addWidget(fields_group)
        self.editor_tabs.addTab(fields_tab, "字段定义")
        self.editor_tabs.addTab(self.layout_editor, "📐 排版")

        right_layout.addWidget(self.editor_tabs)

        splitter.addWidget(right_panel)
    def _build_bottom_bar(self, main_layout) -> None:
        """底部栏：保存并应用 / 取消。"""
        bottom_bar = QHBoxLayout()
        save_btn = QPushButton("💾 保存并应用")
        save_btn.setStyleSheet("font-size:13px; padding:8px 24px;")
        save_btn.clicked.connect(self.accept)
        cancel_btn = QPushButton("取消")
        cancel_btn.clicked.connect(self.reject)
        bottom_bar.addStretch()
        bottom_bar.addWidget(save_btn)
        bottom_bar.addWidget(cancel_btn)
        main_layout.addLayout(bottom_bar)
    def setup_ui(self):
        main_layout = QVBoxLayout(self)

        # ===== 智能工具栏 =====
        self._build_tools_bar(main_layout)

        # 主区域：左类型列表 + 右详情编辑
        splitter = QSplitter(Qt.Orientation.Horizontal)
        self._build_left_panel(splitter)
        self._build_right_panel(splitter)
        splitter.setSizes([250, 650])
        main_layout.addWidget(splitter)

        # 底部操作栏
        self._build_bottom_bar(main_layout)

        if self.schema.types:
            self.type_list.setCurrentRow(0)
    def pick_color(self):
        color = QColorDialog.getColor(QColor(self._selected_color), self, "选择类型颜色")
        if color.isValid():
            self._selected_color = color.name()
            self._update_color_button()
            self._mark_dirty()
    def _update_color_button(self):
        self.type_color_btn.setText(f"  {self._selected_color}")
        self.type_color_btn.setStyleSheet(
            f"background-color:{self._selected_color}; color:white; font-weight:bold;"
        )
    def on_type_selected(self, row):
        if self._current_field_index >= 0 and self.current_field_editor:
            self._mark_dirty()
        if row < 0 or row >= len(self.schema.types):
            return
        t = self.schema.types[row]
        self._current_type_index = row

        self.type_id_edit.setText(t.id)
        self.type_name_edit.setText(t.name)
        self.type_plural_edit.setText(t.plural_key)
        self._selected_color = t.color
        self._update_color_button()

        self.field_list.clear()
        for f in t.form_fields:
            editable_mark = "" if f.editable else " [只读]"
            type_cn = next((cn for ft, cn in FIELD_TYPES if ft == f.type), f.type)
            item = QListWidgetItem(f"{f.label}  [{type_cn}]{editable_mark}")
            item.setData(Qt.ItemDataRole.UserRole, f.name)
            item.setToolTip(f"ID: {f.name}\n显示名: {f.label}\n类型: {f.type}\n可编辑: {f.editable}")
            self.field_list.addItem(item)

        if t.form_fields:
            self.field_list.setCurrentRow(0)
        else:
            self._show_placeholder()

        self._update_layout_editor(t)
    def on_field_selected(self, row):
        if self._current_field_index >= 0 and self.current_field_editor:
            self._mark_dirty()
        if row < 0:
            return
        t = self.schema.types[self._current_type_index]
        if row < len(t.form_fields):
            self._show_field_editor(t.form_fields[row])
            self._current_field_index = row
    def _clear_field_editor(self):
        while self.field_editor_layout.count():
            child = self.field_editor_layout.takeAt(0)
            if child.widget():
                child.widget().deleteLater()
        self.current_field_editor = None
    def _show_placeholder(self):
        self._clear_field_editor()
        placeholder = QLabel("选择一个字段进行编辑，或点击「+ 添加字段」创建新字段")
        placeholder.setAlignment(Qt.AlignmentFlag.AlignCenter)
        placeholder.setStyleSheet(f"color:{theme_color('hint')};")
        self.field_editor_layout.addWidget(placeholder)
    def _show_field_editor(self, field: TypeField):
        self._clear_field_editor()
        editor = FieldEditorWidget(field)
        editor.field_changed.connect(self._mark_dirty)
        self.field_editor_layout.addWidget(editor)
        self.current_field_editor = editor
    def add_type(self):
        dlg = QDialog(self)
        dlg.setWindowTitle("新建数据类型")
        dlg.setMinimumWidth(420)
        layout = QVBoxLayout(dlg)

        form = QFormLayout()
        tid_edit = QLineEdit()
        tid_edit.setPlaceholderText("英文ID，如 card, deck, unit")
        form.addRow("类型ID <span style='color:red'>*</span>（英文）:", tid_edit)

        tname_edit = QLineEdit()
        tname_edit.setPlaceholderText("中文名称，如 卡牌、卡组、单位")
        tname_edit.textChanged.connect(lambda text: tid_edit.setText(
            FieldEditorWidget._chinese_to_pinyin(text)
        ) if text.strip() and not tid_edit.isModified() else None)
        form.addRow("显示名 <span style='color:red'>*</span>（中文）:", tname_edit)

        template_combo = QComboBox()
        template_names = list(self.TYPE_TEMPLATES.keys())
        template_combo.addItems(template_names)
        template_combo.setCurrentIndex(0)
        form.addRow("字段模板:", template_combo)

        template_preview = QTextBrowser()
        template_preview.setMaximumHeight(120)
        template_preview.setReadOnly(True)

        def update_preview():
            key = template_combo.currentText()
            fields = self.TYPE_TEMPLATES.get(key, [])
            lines = []
            for f in fields:
                type_cn = next((cn for ft, cn in FIELD_TYPES if ft == f.type), f.type)
                lines.append(f"  · {f.label} ({f.name}) — {type_cn}")
            template_preview.setPlainText("\n".join(lines))

        template_combo.currentIndexChanged.connect(update_preview)
        form.addRow("模板预览:", template_preview)
        update_preview()

        layout.addLayout(form)

        btn_box = QDialogButtonBox(QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel)
        btn_box.accepted.connect(dlg.accept)
        btn_box.rejected.connect(dlg.reject)
        layout.addWidget(btn_box)

        if dlg.exec() != QDialog.DialogCode.Accepted:
            return

        new_id = tid_edit.text().strip()
        new_name = tname_edit.text().strip()
        if not new_id or not new_name:
            QMessageBox.warning(self, "必填", "类型ID和显示名都必须填写！")
            return

        tid = new_id.replace(" ", "_").lower()
        import re
        if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', tid):
            QMessageBox.warning(self, "格式错误", f"类型ID「{tid}」必须是英文、数字或下划线，且以字母开头。")
            return

        existing_ids = [t.id for t in self.schema.types]
        if tid in existing_ids:
            QMessageBox.warning(self, "已存在", f"类型 '{tid}' 已存在！")
            return

        selected_template = template_combo.currentText()
        template_fields = self.TYPE_TEMPLATES.get(selected_template, [])
        new_fields = [TypeField(
            name=f.name, label=f.label, type=f.type, editable=f.editable,
            values=f.values, from_=f.from_, to=f.to
        ) for f in template_fields]

        new_type = TypeDef(
            id=tid,
            name=new_name,
            plural_key=f"{tid}s",
            color="#607D8B",
            form_fields=new_fields,
            ai_context={
                "role_description": f"你是一位资深游戏数据设计师，精通{new_name}相关的数据结构和数值平衡。",
                "field_descriptions": "\n".join(
                    [f"- {f.name}（{f.label}）" for f in new_fields if f.name != "id"]
                ),
                "special_notes": f"创建{new_name}时，确保每个字段都有实际用途。",
                "json_example": [],
                "default_prompt": f"请设计一个完整的{new_name}，包括所有定义的字段。",
            }
        )
        self.schema.types.append(new_type)
        self._rebuild_type_list()
        self.type_list.setCurrentRow(len(self.schema.types) - 1)
        self._mark_dirty()
    def delete_type(self):
        idx = self.type_list.currentRow()
        if idx < 0 or idx >= len(self.schema.types):
            return
        t = self.schema.types[idx]
        reply = QMessageBox.question(
            self, "确认删除",
            f"确定要删除类型「{t.name}」吗？\n\n该类型的所有字段都将被删除。此操作不可撤销。",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        if reply != QMessageBox.StandardButton.Yes:
            return
        del self.schema.types[idx]
        self._rebuild_type_list()
        if self.schema.types:
            new_idx = min(idx, len(self.schema.types) - 1)
            self.type_list.setCurrentRow(new_idx)
        else:
            self._show_placeholder()
            self.field_list.clear()
        self._mark_dirty()
    def add_field(self):
        if self._current_type_index < 0:
            QMessageBox.information(self, "提示", "请先选择或创建一个数据类型")
            return
        t = self.schema.types[self._current_type_index]

        new_field = TypeField(name=f"field_{len(t.form_fields)}", label="新字段", type="entry")
        t.form_fields.append(new_field)
        self._refresh_field_list()
        self.field_list.setCurrentRow(len(t.form_fields) - 1)
        self._mark_dirty()
    def delete_field(self):
        if self._current_field_index < 0:
            return
        t = self.schema.types[self._current_type_index]
        if self._current_field_index < len(t.form_fields):
            field = t.form_fields[self._current_field_index]
            if field.name == "id":
                QMessageBox.warning(
                    self, "不能删除 ID 字段",
                    "id 字段是每条数据的唯一标识，系统会自动生成 id 值。\n\n"
                    "如果你不想让用户在表单中看到它：\n"
                    "把「可在表单中编辑」取消勾选，并改标签为 \"ID:\" 即可。\n\n"
                    "建议：保留 id 字段，它不会影响你的使用。"
                )
                return
            del t.form_fields[self._current_field_index]
            self._refresh_field_list()
            new_idx = min(self._current_field_index, len(t.form_fields) - 1)
            if t.form_fields:
                self.field_list.setCurrentRow(new_idx)
            else:
                self._show_placeholder()
            self._mark_dirty()
    def move_field(self, direction):
        if self._current_field_index < 0:
            return
        t = self.schema.types[self._current_type_index]
        old_idx = self._current_field_index
        new_idx = old_idx + direction
        if 0 <= new_idx < len(t.form_fields):
            t.form_fields[old_idx], t.form_fields[new_idx] = t.form_fields[new_idx], t.form_fields[old_idx]
            self._refresh_field_list()
            self.field_list.setCurrentRow(new_idx)
            self._current_field_index = new_idx
            self._mark_dirty()
    def _rebuild_type_list(self):
        self.type_list.clear()
        for t in self.schema.types:
            color_dot = "● "
            item = QListWidgetItem(f"{color_dot}{t.name}  ({t.id})")
            item.setData(Qt.ItemDataRole.UserRole, t.id)
            item.setForeground(QColor(t.color))
            self.type_list.addItem(item)
    def _refresh_field_list(self):
        t = self.schema.types[self._current_type_index]
        current_key = None
        if self._current_field_index >= 0 and self._current_field_index < len(t.form_fields):
            current_key = t.form_fields[self._current_field_index].name

        self.field_list.blockSignals(True)
        self.field_list.clear()
        for f in t.form_fields:
            editable_mark = "" if f.editable else " [只读]"
            item = QListWidgetItem(f"{f.label} ({f.type}){editable_mark}")
            item.setData(Qt.ItemDataRole.UserRole, f.name)
            self.field_list.addItem(item)

        if current_key:
            for i, f in enumerate(t.form_fields):
                if f.name == current_key:
                    self.field_list.setCurrentRow(i)
                    break
        self.field_list.blockSignals(False)
    def _mark_dirty(self):
        self._dirty = True

        if self._current_type_index >= 0 and self._current_type_index < len(self.schema.types):
            t = self.schema.types[self._current_type_index]
            t.id = self.type_id_edit.text().strip().replace(" ", "_").lower()
            t.name = self.type_name_edit.text().strip()
            t.plural_key = self.type_plural_edit.text().strip().replace(" ", "_").lower()
            t.color = self._selected_color

            if self.current_field_editor and self._current_field_index >= 0:
                new_field = self.current_field_editor.get_field()
                old_key = self.current_field_editor.original_key
                if self._current_field_index < len(t.form_fields):
                    t.form_fields[self._current_field_index] = new_field
                    if old_key != new_field.name:
                        self._refresh_field_list()
    def get_schema(self) -> TypeSchema:
        self._mark_dirty()
        self._save_layout()
        return self.schema
    def accept(self):
        self._mark_dirty()
        self._save_layout()
        super().accept()
    def _save_layout(self):
        self.layout_editor.save()
    def _update_layout_editor(self, t):
        if t:
            fields = [
                {"name": f.name, "label": f.label, "type": f.type, "editable": f.editable}
                for f in t.form_fields
            ]
            self.layout_editor.set_data_type(t.id, fields)
    @staticmethod
    def edit(schema: TypeSchema, library_name: str, parent=None) -> bool:
        dlg = TypeEditorDialog(schema, library_name, parent)
        result = dlg.exec()
        return result == QDialog.DialogCode.Accepted
