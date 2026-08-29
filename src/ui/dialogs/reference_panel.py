"""数据关联预览 - 查看数据引用和被引用关系"""
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QFont
from PyQt6.QtWidgets import QDialog, QLabel, QPushButton, QTabWidget, QTreeWidget, QTreeWidgetItem, QVBoxLayout, QWidget

from config.constants import _type_registry
from ui.themes import theme_color

DATA_TYPE_LABELS = _type_registry.names

REFERENCE_FIELDS = {
    "role": ["skills", "equips", "talents", "buffs"],
    "monster": ["skills", "drops", "buffs"],
    "skill": ["equips", "buffs", "condition"],
    "equip": ["skills", "buffs"],
}


class ReferencePanel(QDialog):
    """数据关联预览面板"""

    def __init__(self, data_manager, data_type, item_id, parent=None):
        super().__init__(parent)
        self.setFont(QFont("Microsoft YaHei", 10))
        self.data_manager = data_manager
        self.data_type = data_type
        self.item_id = item_id
        self.item_data = self._find_item()

        type_label = DATA_TYPE_LABELS.get(data_type, data_type)
        item_name = self.item_data.get("name", "未知") if self.item_data else "未知"
        self.setWindowTitle(f"关联预览 - {type_label}: {item_name}")
        self.setMinimumSize(550, 420)
        self._setup_ui()

    def _find_item(self):
        schema = self.data_manager.config.get_type_schema()
        plural_key = self.data_type + "s"
        if schema:
            for t in schema.types:
                if t.id == self.data_type:
                    plural_key = t.plural_key
                    break
        items = self.data_manager.data.get(plural_key, [])
        for item in items:
            if item.get("id") == self.item_id:
                return item
        return None

    def _setup_ui(self):
        layout = QVBoxLayout(self)

        if not self.item_data:
            hint = QLabel("未找到该数据")
            hint.setAlignment(Qt.AlignmentFlag.AlignCenter)
            layout.addWidget(hint)
            return

        item_name = self.item_data.get("name", "未知")
        header = QLabel(f"📋 {item_name} 的关联数据")
        header.setStyleSheet("font-weight: 700; font-size: 15px; margin-bottom: 8px;")
        layout.addWidget(header)

        self.tab_widget = QTabWidget()
        layout.addWidget(self.tab_widget, 1)

        used_by_tab = self._build_used_by_tab()
        self.tab_widget.addTab(used_by_tab, "被谁引用")

        references_tab = self._build_references_tab()
        self.tab_widget.addTab(references_tab, "引用了谁")

        similar_tab = self._build_similar_tab()
        self.tab_widget.addTab(similar_tab, "相似数据")

        close_btn = QPushButton("关闭")
        close_btn.clicked.connect(self.accept)
        layout.addWidget(close_btn, alignment=Qt.AlignmentFlag.AlignRight)

    def _build_used_by_tab(self):
        widget = QWidget()
        layout = QVBoxLayout(widget)

        refs = self._find_used_by()
        if not refs:
            hint = QLabel("没有其他数据引用此项")
            hint.setAlignment(Qt.AlignmentFlag.AlignCenter)
            hint.setStyleSheet(f"color: {theme_color('hint')}; font-size: 13px;")
            layout.addWidget(hint)
            return widget

        tree = QTreeWidget()
        tree.setHeaderLabels(["数据类型", "名称", "引用字段"])
        tree.setColumnWidth(0, 120)
        tree.setColumnWidth(1, 200)

        for ref_type, ref_items in refs.items():
            type_label = DATA_TYPE_LABELS.get(ref_type, ref_type)
            parent_item = QTreeWidgetItem(tree, [type_label, f"({len(ref_items)}项)", ""])
            parent_item.setExpanded(True)

            for ref in ref_items:
                QTreeWidgetItem(parent_item, [
                    "", ref.get("name", "未知"), ref.get("_ref_field", "")
                ])

        layout.addWidget(tree)
        return widget

    def _build_references_tab(self):
        widget = QWidget()
        layout = QVBoxLayout(widget)

        refs = self._find_references()
        if not refs:
            hint = QLabel("此项没有引用其他数据")
            hint.setAlignment(Qt.AlignmentFlag.AlignCenter)
            hint.setStyleSheet(f"color: {theme_color('hint')}; font-size: 13px;")
            layout.addWidget(hint)
            return widget

        tree = QTreeWidget()
        tree.setHeaderLabels(["引用字段", "数据类型", "名称"])
        tree.setColumnWidth(0, 120)
        tree.setColumnWidth(1, 100)

        for field_name, ref_list in refs.items():
            parent_item = QTreeWidgetItem(tree, [field_name, f"({len(ref_list)}项)", ""])
            parent_item.setExpanded(True)

            for ref in ref_list:
                type_label = DATA_TYPE_LABELS.get(ref.get("_type", ""), ref.get("_type", ""))
                QTreeWidgetItem(parent_item, [
                    "", type_label, ref.get("name", "未知")
                ])

        layout.addWidget(tree)
        return widget

    def _build_similar_tab(self):
        widget = QWidget()
        layout = QVBoxLayout(widget)

        similar = self._find_similar()
        if not similar:
            hint = QLabel("没有找到相似数据")
            hint.setAlignment(Qt.AlignmentFlag.AlignCenter)
            hint.setStyleSheet(f"color: {theme_color('hint')}; font-size: 13px;")
            layout.addWidget(hint)
            return widget

        tree = QTreeWidget()
        tree.setHeaderLabels(["名称", "相似度", "共有字段"])
        tree.setColumnWidth(0, 200)
        tree.setColumnWidth(1, 80)

        for sim in similar:
            QTreeWidgetItem(tree, [
                sim.get("name", "未知"),
                sim.get("similarity", ""),
                sim.get("common_fields", "")
            ])

        layout.addWidget(tree)
        return widget

    def _find_used_by(self):
        result = {}
        item_name = self.item_data.get("name", "")
        if not item_name:
            return result

        all_data = self.data_manager.data

        for data_type, items in all_data.items():
            if not isinstance(items, list):
                continue
            base_type = data_type.rstrip("s")
            ref_fields = REFERENCE_FIELDS.get(base_type, [])

            matched = []
            for other in items:
                if other.get("id") == self.item_id:
                    continue
                for field in ref_fields:
                    val = other.get(field, "")
                    if not val:
                        continue
                    if isinstance(val, str) and item_name in val:
                        matched.append({**other, "_ref_field": field})
                        break
                    elif isinstance(val, list) and item_name in val:
                        matched.append({**other, "_ref_field": field})
                        break

            if matched:
                result[base_type] = matched

        return result

    def _find_references(self):
        result = {}
        ref_fields = REFERENCE_FIELDS.get(self.data_type, [])

        for field in ref_fields:
            val = self.item_data.get(field, "")
            if not val:
                continue

            names = []
            if isinstance(val, str):
                names = [n.strip() for n in val.replace("、", ",").replace("，", ",").split(",") if n.strip()]
            elif isinstance(val, list):
                names = [str(n).strip() for n in val if n]

            if not names:
                continue

            found = []
            for data_type, items in self.data_manager.data.items():
                if not isinstance(items, list):
                    continue
                base_type = data_type.rstrip("s")
                for item in items:
                    if item.get("name", "") in names:
                        found.append({**item, "_type": base_type})

            if found:
                result[field] = found

        return result

    def _find_similar(self):
        similar = []
        schema = self.data_manager.config.get_type_schema()
        plural_key = self.data_type + "s"
        if schema:
            for t in schema.types:
                if t.id == self.data_type:
                    plural_key = t.plural_key
                    break

        items = self.data_manager.data.get(plural_key, [])
        my_fields = set(k for k, v in self.item_data.items() if v and k != "id")

        for other in items:
            if other.get("id") == self.item_id:
                continue
            other_fields = set(k for k, v in other.items() if v and k != "id")
            common = my_fields & other_fields
            if len(common) >= 2:
                total = len(my_fields | other_fields)
                similarity = f"{len(common) * 100 // max(total, 1)}%"
                similar.append({
                    "name": other.get("name", "未知"),
                    "similarity": similarity,
                    "common_fields": ", ".join(sorted(common)[:5])
                })

        similar.sort(key=lambda x: int(x["similarity"].rstrip("%")), reverse=True)
        return similar[:20]
