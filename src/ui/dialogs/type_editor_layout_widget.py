"""编辑器布局（分组）编辑控件 —— 自 type_editor_dialog.py 拆出，代码逐行原样搬运（逻辑未改动）"""

from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QFormLayout,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QPushButton,
    QVBoxLayout,
    QWidget,
)

from common.logger import get_logger
from config.constants import FIELD_TYPE_MAP
from core.editor_layout import EditorLayout

logger = get_logger()

FIELD_TYPES = FIELD_TYPE_MAP


class LayoutEditorWidget(QWidget):
    """编辑器排版编辑器 — 管理分区、图标、折叠、字段分配"""
    layout_changed = pyqtSignal()

    def __init__(self, data_type: str = "", fields: list = None, parent=None):
        super().__init__(parent)
        self.data_type = data_type
        self.all_fields = fields or []
        self._groups: list[dict] = []
        self._suppress_change = False
        self.setup_ui()

    def setup_ui(self):
        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        left = QVBoxLayout()

        hint = QLabel("📐 编辑器排版 — 拖拽字段到分区，或编辑分区属性")
        hint.setStyleSheet("font-weight:bold;font-size:12px;color:#555;padding:4px;")
        left.addWidget(hint)

        btn_bar = QHBoxLayout()
        self.add_section_btn = QPushButton("+ 添加分区")
        self.add_section_btn.clicked.connect(self._add_section)
        self.del_section_btn = QPushButton("- 删除分区")
        self.del_section_btn.clicked.connect(self._remove_section)
        self.move_up_btn = QPushButton("↑ 上移")
        self.move_up_btn.clicked.connect(lambda: self._move_section(-1))
        self.move_down_btn = QPushButton("↓ 下移")
        self.move_down_btn.clicked.connect(lambda: self._move_section(1))
        self.auto_btn = QPushButton("🪄 自动生成")
        self.auto_btn.setToolTip("根据字段列表自动生成简单的单分区布局")
        self.auto_btn.clicked.connect(self._auto_create)
        btn_bar.addWidget(self.add_section_btn)
        btn_bar.addWidget(self.del_section_btn)
        btn_bar.addWidget(self.move_up_btn)
        btn_bar.addWidget(self.move_down_btn)
        btn_bar.addWidget(self.auto_btn)
        btn_bar.addStretch()
        left.addLayout(btn_bar)

        self.section_list = QListWidget()
        self.section_list.setMinimumWidth(220)
        self.section_list.currentRowChanged.connect(self._on_section_selected)
        left.addWidget(self.section_list)

        layout.addLayout(left)

        right = QVBoxLayout()

        self.editor_group = QGroupBox("分区属性")
        self.editor_form = QFormLayout()
        self.editor_group.setLayout(self.editor_form)

        self.sec_title_edit = QLineEdit()
        self.sec_title_edit.setPlaceholderText("如：基础信息、数值配置")
        self.sec_title_edit.textChanged.connect(self._on_sec_attr_changed)
        self.editor_form.addRow("标题:", self.sec_title_edit)

        icon_layout = QHBoxLayout()
        self.sec_icon_edit = QLineEdit()
        self.sec_icon_edit.setPlaceholderText("📌 / ⚔️ / 🎯")
        self.sec_icon_edit.setMaximumWidth(80)
        self.sec_icon_edit.textChanged.connect(self._on_sec_attr_changed)
        icon_layout.addWidget(self.sec_icon_edit)
        icon_layout.addStretch()
        self.editor_form.addRow("图标:", icon_layout)

        self.sec_collapsed_check = QCheckBox("默认折叠")
        self.sec_collapsed_check.toggled.connect(self._on_sec_attr_changed)
        self.editor_form.addRow("", self.sec_collapsed_check)

        self.sec_layout_combo = QComboBox()
        self.sec_layout_combo.addItem("表单（单列）", "form")
        self.sec_layout_combo.addItem("网格（双列）", "grid")
        self.sec_layout_combo.currentIndexChanged.connect(self._on_sec_attr_changed)
        self.editor_form.addRow("布局:", self.sec_layout_combo)

        right.addWidget(self.editor_group)

        fields_group = QGroupBox("分区内的字段（勾选 = 加入此分区）")
        fields_vlayout = QVBoxLayout()
        fields_group.setLayout(fields_vlayout)

        self.fields_check_area = QWidget()
        self.fields_check_layout = QVBoxLayout(self.fields_check_area)
        self.fields_check_layout.setContentsMargins(4, 4, 4, 4)
        self.fields_check_layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        fields_vlayout.addWidget(self.fields_check_area)

        unalloc_group = QGroupBox("未分配字段（不在任何分区）")
        unalloc_layout = QVBoxLayout()
        self.unalloc_label = QLabel()
        self.unalloc_label.setWordWrap(True)
        self.unalloc_label.setStyleSheet("color:#e67e22;font-size:11px;")
        unalloc_layout.addWidget(self.unalloc_label)
        unalloc_group.setLayout(unalloc_layout)
        fields_vlayout.addWidget(unalloc_group)

        right.addWidget(fields_group)
        layout.addLayout(right, 1)

    def set_data_type(self, data_type: str, all_fields: list):
        self.data_type = data_type
        self.all_fields = all_fields
        self._suppress_change = True
        groups = EditorLayout.get_groups(data_type)
        self._groups = [dict(g) for g in groups]
        self._rebuild_section_list()
        self._suppress_change = False
        if self._groups:
            self.section_list.setCurrentRow(0)
        else:
            self._clear_editor()

    def _rebuild_section_list(self):
        self.section_list.clear()
        for g in self._groups:
            title = g.get("title", "未命名分区")
            icon = g.get("icon", "")
            flds = g.get("fields", [])
            layout_type = g.get("layout", "form")
            collapsed = g.get("collapsed", False)
            extra = []
            if collapsed:
                extra.append("折叠")
            if layout_type == "grid":
                extra.append("网格")
            extra_str = f"  [{', '.join(extra)}]" if extra else ""
            item = QListWidgetItem(f"{icon} {title}{extra_str}  ({len(flds)}字段)")
            item.setData(Qt.ItemDataRole.UserRole, g.get("title", ""))
            self.section_list.addItem(item)

    def _clear_editor(self):
        self._suppress_change = True
        self.sec_title_edit.clear()
        self.sec_icon_edit.clear()
        self.sec_collapsed_check.setChecked(False)
        self.sec_layout_combo.setCurrentIndex(0)
        self._suppress_change = False
        self._clear_field_checks()

    def _on_section_selected(self, row):
        if row < 0 or row >= len(self._groups):
            self._clear_editor()
            return
        group = self._groups[row]
        self._suppress_change = True
        self.sec_title_edit.setText(group.get("title", ""))
        self.sec_icon_edit.setText(group.get("icon", ""))
        self.sec_collapsed_check.setChecked(group.get("collapsed", False))
        layout_type = group.get("layout", "form")
        idx = self.sec_layout_combo.findData(layout_type)
        if idx >= 0:
            self.sec_layout_combo.setCurrentIndex(idx)
        else:
            self.sec_layout_combo.setCurrentIndex(0)
        self._suppress_change = False
        self._rebuild_field_checks(group)

    def _rebuild_field_checks(self, group=None):
        self._clear_field_checks()
        if group is None:
            return
        current_fields = set(group.get("fields", []))
        for f in self.all_fields:
            fname = f.get("name", f.get("id", ""))
            if not fname:
                continue
            cb = QCheckBox(f"{f.get('label', fname)}  ({fname})")
            cb.setChecked(fname in current_fields)
            cb.toggled.connect(lambda checked, fn=fname: self._on_field_toggled(fn, checked))
            self.fields_check_layout.addWidget(cb)

        self._update_unalloc_label()

    def _clear_field_checks(self):
        while self.fields_check_layout.count():
            item = self.fields_check_layout.takeAt(0)
            if item.widget():
                item.widget().deleteLater()

    def _on_field_toggled(self, field_name: str, checked: bool):
        if self._suppress_change:
            return
        row = self.section_list.currentRow()
        if row < 0 or row >= len(self._groups):
            return
        group = self._groups[row]
        fields = group.setdefault("fields", [])
        if checked:
            if field_name not in fields:
                fields.append(field_name)
        else:
            if field_name in fields:
                fields.remove(field_name)
        self._rebuild_section_list()
        self.section_list.setCurrentRow(row)
        self.layout_changed.emit()

    def _update_unalloc_label(self):
        allocated = set()
        for g in self._groups:
            for f in g.get("fields", []):
                allocated.add(f)
        all_names = [f.get("name", f.get("id", "")) for f in self.all_fields if f.get("name") or f.get("id")]
        unalloc = [n for n in all_names if n not in allocated]
        if unalloc:
            self.unalloc_label.setText("⚠️ 未分区字段: " + ", ".join(unalloc))
        else:
            self.unalloc_label.setText("✅ 所有字段已分配")

    def _on_sec_attr_changed(self):
        if self._suppress_change:
            return
        row = self.section_list.currentRow()
        if row < 0 or row >= len(self._groups):
            return
        group = self._groups[row]
        group["title"] = self.sec_title_edit.text()
        group["icon"] = self.sec_icon_edit.text()
        group["collapsed"] = self.sec_collapsed_check.isChecked()
        group["layout"] = self.sec_layout_combo.currentData()
        self._rebuild_section_list()
        self.section_list.setCurrentRow(row)
        self.layout_changed.emit()

    def _add_section(self):
        title = f"新分区{len(self._groups) + 1}"
        self._groups.append({
            "title": title, "icon": "📌", "collapsed": False,
            "fields": [], "layout": "form"
        })
        self._rebuild_section_list()
        self.section_list.setCurrentRow(len(self._groups) - 1)
        self.layout_changed.emit()

    def _remove_section(self):
        row = self.section_list.currentRow()
        if row < 0 or row >= len(self._groups):
            return
        self._groups.pop(row)
        self._rebuild_section_list()
        self.layout_changed.emit()

    def _move_section(self, delta):
        row = self.section_list.currentRow()
        if row < 0 or row >= len(self._groups):
            return
        new_row = row + delta
        if 0 <= new_row < len(self._groups):
            self._groups[new_row], self._groups[row] = self._groups[row], self._groups[new_row]
            self._rebuild_section_list()
            self.section_list.setCurrentRow(new_row)
            self.layout_changed.emit()

    def _auto_create(self):
        self._groups = [{
            "title": "全部字段", "icon": "📌", "collapsed": False,
            "fields": [f.get("name", f.get("id", "")) for f in self.all_fields if f.get("name") or f.get("id")],
            "layout": "form"
        }]
        self._rebuild_section_list()
        if self._groups:
            self.section_list.setCurrentRow(0)
        self.layout_changed.emit()

    def get_groups(self) -> list[dict]:
        return [dict(g) for g in self._groups]

    def save(self):
        if self.data_type and self._groups:
            EditorLayout.set_layout(self.data_type, self._groups)
        elif self.data_type:
            EditorLayout.remove_layout(self.data_type)
