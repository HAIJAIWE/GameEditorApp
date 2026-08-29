"""关系查看面板 - 表格式展示主体关联数据"""
from common.logger import get_logger

logger = get_logger()

from PyQt6.QtCore import Qt, QTimer, pyqtSignal
from PyQt6.QtGui import QBrush, QColor, QFont
from PyQt6.QtWidgets import (
    QAbstractItemView,
    QComboBox,
    QGroupBox,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QPushButton,
    QSplitter,
    QTableWidget,
    QTableWidgetItem,
    QVBoxLayout,
    QWidget,
)

from ui.themes import theme_color

DATA_TYPE_LABELS = {
    "role": "角色", "job": "职业", "monster": "怪物",
    "skill": "技能", "equip": "装备", "item": "道具",
    "buff": "Buff", "talent": "天赋", "achievement": "成就",
    "story": "剧情", "task": "任务", "dialog": "对话",
}

TYPE_COLORS = {
    "role": "#3B82F6", "job": "#6366F1", "monster": "#EF4444",
    "skill": "#A855F7", "equip": "#F59E0B", "item": "#10B981",
    "buff": "#EC4899", "talent": "#8B5CF6", "achievement": "#F97316",
    "story": "#14B8A6", "task": "#06B6D4", "dialog": "#84CC16",
}

REFERENCE_FIELDS = {
    "role": ["skills", "talents", "buffs"],
    "job": ["base_job_from", "unlock_condition"],
    "monster": ["skills", "talents", "buffs"],
    "equip": ["buffs"],
    "skill": ["buffs"],
    "talent": ["owner", "unlock_condition"],
    "item": ["buffs"],
    "buff": ["source"],
    "story": ["dialog_ids", "prev_story", "next_story", "condition"],
    "task": ["dialog_id"],
    "dialog": ["next_dialog", "condition"],
}


class RelationTablePanel(QWidget):
    """关系查看面板 — 表格式展示"""

    jump_requested = pyqtSignal(str, str)

    def __init__(self, data_manager, initial_type=None, initial_id=None, parent=None):
        super().__init__(parent)
        self.data_manager = data_manager
        self._initial_type = initial_type
        self._initial_id = initial_id
        self._all_data = {}
        self._id_map = {}
        self._setup_ui()
        self._timer = QTimer()
        self._timer.setSingleShot(True)
        self._timer.timeout.connect(self._refresh)

    def _setup_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(8, 8, 8, 8)

        picker = QHBoxLayout()

        type_label = QLabel("类型:")
        type_label.setStyleSheet("font-family:'Microsoft YaHei',sans-serif;font-size:13px;")
        picker.addWidget(type_label)

        self.type_combo = QComboBox()
        self.type_combo.setStyleSheet("font-family:'Microsoft YaHei',sans-serif;font-size:13px;min-width:100px;")
        self._type_ids = []
        try:
            schema = None
            if hasattr(self.data_manager, 'config') and self.data_manager.config:
                schema = self.data_manager.config.get_type_schema()
            if schema and hasattr(schema, 'types'):
                for t in schema.types:
                    self.type_combo.addItem(DATA_TYPE_LABELS.get(t.id, t.name), t.id)
                    self._type_ids.append(t.id)
        except Exception as e:
            logger.warning(f"操作失败: {e}")
        if not self._type_ids:
            self._type_ids = ["role","skill","monster","equip","item","buff",
                              "talent","story","task","dialog","job","achievement"]
            for dt in self._type_ids:
                self.type_combo.addItem(DATA_TYPE_LABELS.get(dt, dt), dt)
        self.type_combo.currentIndexChanged.connect(self._on_type_changed)
        picker.addWidget(self.type_combo)

        item_label = QLabel("主体:")
        item_label.setStyleSheet("font-family:'Microsoft YaHei',sans-serif;font-size:13px;")
        picker.addWidget(item_label)

        self.item_combo = QComboBox()
        self.item_combo.setStyleSheet("font-family:'Microsoft YaHei',sans-serif;font-size:13px;min-width:180px;")
        self.item_combo.currentIndexChanged.connect(self._on_item_changed)
        picker.addWidget(self.item_combo)

        picker.addStretch()

        refresh_btn = QPushButton("刷新")
        refresh_btn.setStyleSheet("font-family:'Microsoft YaHei',sans-serif;font-size:12px;")
        refresh_btn.clicked.connect(self._refresh)
        picker.addWidget(refresh_btn)

        layout.addLayout(picker)

        splitter = QSplitter(Qt.Orientation.Vertical)

        self.subject_group = QGroupBox("主体信息")
        self.subject_group.setStyleSheet(
            f"QGroupBox{{font-family:'Microsoft YaHei',sans-serif;font-size:13px;font-weight:bold;"
            f"border:2px solid {theme_color('accent')};border-radius:6px;margin-top:10px;padding-top:16px;}}"
            f"QGroupBox::title{{subcontrol-origin:margin;left:12px;padding:0 6px;color:{theme_color('accent')};}}")
        subject_layout = QVBoxLayout(self.subject_group)
        self.subject_label = QLabel()
        self.subject_label.setStyleSheet(
            "font-family:'Microsoft YaHei',sans-serif;font-size:18px;font-weight:bold;padding:4px 0;")
        self.subject_label.setWordWrap(True)
        subject_layout.addWidget(self.subject_label)
        self.subject_detail = QLabel()
        self.subject_detail.setStyleSheet(
            f"font-family:'Microsoft YaHei',sans-serif;font-size:12px;color:{theme_color('hint')};padding:2px 0;")
        self.subject_detail.setWordWrap(True)
        subject_layout.addWidget(self.subject_detail)
        splitter.addWidget(self.subject_group)

        self.relations_group = QGroupBox("关联数据")
        self.relations_group.setStyleSheet(
            f"QGroupBox{{font-family:'Microsoft YaHei',sans-serif;font-size:13px;font-weight:bold;"
            f"border:2px solid {theme_color('border')};border-radius:6px;margin-top:10px;padding-top:16px;}}"
            f"QGroupBox::title{{subcontrol-origin:margin;left:12px;padding:0 6px;}}")
        rel_layout = QVBoxLayout(self.relations_group)
        self.table = QTableWidget()
        self.table.setStyleSheet(f"""
            QTableWidget{{font-family:'Microsoft YaHei',sans-serif;font-size:12px;
                border:1px solid {theme_color('border')};gridline-color:{theme_color('divider')};}}
            QTableWidget::item{{padding:6px 8px;}}
            QTableWidget::item:hover{{background-color:{theme_color('accent_bg')};}}
            QTableWidget::item:selected{{background-color:{theme_color('accent_light')};color:{theme_color('fg')};}}
            QHeaderView::section{{font-family:'Microsoft YaHei',sans-serif;font-size:12px;
                font-weight:bold;background-color:{theme_color('bg')};border-bottom:2px solid {theme_color('border')};
                padding:8px;}}
        """)
        self.table.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self.table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        self.table.setAlternatingRowColors(True)
        self.table.doubleClicked.connect(self._on_table_double_click)
        rel_layout.addWidget(self.table)
        splitter.addWidget(self.relations_group)

        splitter.setStretchFactor(0, 1)
        splitter.setStretchFactor(1, 3)
        layout.addWidget(splitter, 1)

        self._on_type_changed(0)

    def _on_type_changed(self, idx):
        data_type = self.type_combo.currentData()
        self.item_combo.clear()
        if not data_type:
            return
        self._load_all_data()
        plural = data_type + "s"
        schema = getattr(self.data_manager, 'config', None)
        if schema and hasattr(schema, 'get_type_schema'):
            try:
                s = schema.get_type_schema()
                if s:
                    for t in s.types:
                        if t.id == data_type:
                            plural = t.plural_key
                            break
            except Exception as e:
                logger.warning(f"操作失败: {e}")
        items = self._all_data.get(plural, [])
        if not isinstance(items, list):
            items = []
        found = False
        for item in items:
            if not isinstance(item, dict):
                continue
            name = item.get("name", "???")
            iid = item.get("id", "")
            self.item_combo.addItem(f"{name} ({iid})", iid)
            if self._initial_id and str(iid) == str(self._initial_id):
                self.item_combo.setCurrentIndex(self.item_combo.count() - 1)
                found = True
        if items and not found:
            self._on_item_changed(0)

    def _on_item_changed(self, idx):
        dt = self.type_combo.currentData()
        iid = self.item_combo.currentData()
        if dt and iid:
            self._show_subject(dt, iid)

    def _load_all_data(self):
        try:
            raw = getattr(self.data_manager, 'data', None) or {}
            self._all_data = {
                k: [{kk: vv for kk, vv in item.items()} for item in v
                    if isinstance(item, dict)]
                for k, v in raw.items() if isinstance(v, list)
            }
        except Exception:
            self._all_data = {}
        self._id_map = {}
        for dt_key, items in self._all_data.items():
            base_type = dt_key.rstrip("s")
            for item in items:
                if not isinstance(item, dict):
                    continue
                item["_base_type"] = base_type
                self._id_map[item.get("id", "")] = item

    def _show_subject(self, data_type, item_id):
        plural = data_type + "s"
        schema = getattr(self.data_manager, 'config', None)
        if schema and hasattr(schema, 'get_type_schema'):
            try:
                s = schema.get_type_schema()
                if s:
                    for t in s.types:
                        if t.id == data_type:
                            plural = t.plural_key
                            break
            except Exception as e:
                logger.warning(f"操作失败: {e}")
        items = self._all_data.get(plural, [])
        subject = None
        for item in items:
            if isinstance(item, dict) and str(item.get("id","")) == str(item_id):
                subject = item
                break
        if not subject:
            self.subject_label.setText("未找到数据")
            self.subject_detail.setText("")
            self.table.setRowCount(0)
            return

        type_label = DATA_TYPE_LABELS.get(data_type, data_type)
        color = TYPE_COLORS.get(data_type, "#64748B")
        self.subject_group.setStyleSheet(
            f"QGroupBox{{font-family:'Microsoft YaHei',sans-serif;font-size:13px;font-weight:bold;"
            f"border:2px solid {color};border-radius:6px;margin-top:10px;padding-top:16px;}}"
            f"QGroupBox::title{{subcontrol-origin:margin;left:12px;padding:0 6px;color:{color};}}")
        self.subject_label.setText(f"{subject.get('name','???')}")

        details = []
        for k, v in subject.items():
            if k.startswith("_") or k in ("id","name"):
                continue
            if isinstance(v, list):
                if v and isinstance(v[0], dict):
                    items = []
                    for x in v:
                        xid = x.get("id", "")
                        xname = x.get("name", xid)
                        if xid:
                            items.append(f"{xname}({xid})")
                        else:
                            items.append(xname)
                    details.append(f"{k}: {', '.join(items)}")
                else:
                    details.append(f"{k}: {', '.join(str(x) for x in v)}")
            elif isinstance(v, str) and v:
                details.append(f"{k}: {v}")
            elif isinstance(v, (int, float)):
                details.append(f"{k}: {v}")
        self.subject_detail.setText(" | ".join(details[:8]))

        ref_fields = REFERENCE_FIELDS.get(data_type, [])
        rows = []
        for field in ref_fields:
            val = subject.get(field, "")
            if not val:
                continue
            tokens = self._parse_tokens(val)

            for token in tokens:
                resolved = self._resolve_token(token)
                if not resolved:
                    if isinstance(token, dict):
                        display = token.get("name", token.get("id", str(token)))
                    else:
                        display = str(token)
                    rows.append([field, display, "-", "-", "-", "-"])
                    continue
                resolved_item, resolved_type = resolved
                rtype_label = DATA_TYPE_LABELS.get(resolved_type, resolved_type)
                detail = resolved_item.get("desc", resolved_item.get("description", ""))
                if not detail:
                    detail = resolved_item.get("effect", resolved_item.get("type", ""))
                rows.append([
                    field,
                    resolved_item.get("name", token),
                    rtype_label,
                    resolved_item.get("id", ""),
                    detail,
                    TYPE_COLORS.get(resolved_type, "#64748B"),
                ])

        self.table.setColumnCount(5)
        self.table.setHorizontalHeaderLabels(["来源字段", "关联名称", "类型", "ID", "描述"])
        self.table.setRowCount(len(rows))
        for ri, row in enumerate(rows):
            for ci in range(5):
                item = QTableWidgetItem(str(row[ci]))
                item.setFont(QFont("Microsoft YaHei", 10 if ci == 1 else 9))
                if ci == 2:
                    item.setForeground(QBrush(QColor(row[5])))
                self.table.setItem(ri, ci, item)
            self.table.setRowHeight(ri, 28)

        header = self.table.horizontalHeader()
        header.setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        header.setSectionResizeMode(2, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(3, QHeaderView.ResizeMode.ResizeToContents)
        header.setSectionResizeMode(4, QHeaderView.ResizeMode.Stretch)

        count = len(rows)
        self.relations_group.setTitle(f"关联数据 ({count} 项)" if count else "关联数据（无）")

    def _parse_tokens(self, val):
        if isinstance(val, list):
            tokens = []
            for t in val:
                if isinstance(t, dict):
                    tokens.append(t)
                elif t:
                    tokens.append(str(t).strip())
            return tokens
        if isinstance(val, dict):
            return [val]
        if not isinstance(val, str):
            return []
        for sep in ("、", "，", ",", ";"):
            val = val.replace(sep, ",")
        return [t.strip() for t in val.split(",") if t.strip()]

    def _resolve_token(self, token):
        """解析 token 字符串/字典为 (item, type) 元组"""
        if isinstance(token, dict):
            token_id = token.get("id", "")
        else:
            token_id = str(token).strip()

        if not token_id:
            return None

        item = self._id_map.get(token_id)
        if item:
            return item, item.get("_base_type", "")
        return None

    def _on_table_double_click(self, index):
        row = index.row()
        id_item = self.table.item(row, 3)
        type_item = self.table.item(row, 2)
        if id_item and type_item:
            iid = id_item.text()
            type_label = type_item.text()
            for dt, label in DATA_TYPE_LABELS.items():
                if label == type_label:
                    self.jump_requested.emit(dt, iid)
                    return

    def _refresh(self):
        self._load_all_data()
        self._on_type_changed(self.type_combo.currentIndex())

    def showEvent(self, event):
        super().showEvent(event)
        self._load_all_data()
        if not self._initial_type:
            return
        for i in range(self.type_combo.count()):
            if self.type_combo.itemData(i) == self._initial_type:
                self.type_combo.setCurrentIndex(i)
                break
        self._initial_type = None
        self._initial_id = None

    def open_for_item(self, data_type, item_id):
        self._load_all_data()
        for i in range(self.type_combo.count()):
            if self.type_combo.itemData(i) == data_type:
                self.type_combo.setCurrentIndex(i)
                break
        for i in range(self.item_combo.count()):
            if str(self.item_combo.itemData(i)) == str(item_id):
                self.item_combo.setCurrentIndex(i)
                break
