"""类型编辑器 — 增删改数据类型和字段"""
from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QColor, QFont
from PyQt6.QtWidgets import (
    QCheckBox,
    QColorDialog,
    QComboBox,
    QDialog,
    QDialogButtonBox,
    QFormLayout,
    QGroupBox,
    QHBoxLayout,
    QInputDialog,
    QLabel,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QMessageBox,
    QPushButton,
    QSpinBox,
    QSplitter,
    QTabWidget,
    QTextBrowser,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from common.logger import get_logger
from config.constants import FIELD_TYPE_MAP
from core.editor_layout import EditorLayout
from core.type_schema import TypeDef, TypeField, TypeSchema
from ui.themes import theme_color

logger = get_logger()

FIELD_TYPES = FIELD_TYPE_MAP


class FieldEditorWidget(QWidget):
    field_changed = pyqtSignal()

    def __init__(self, field: TypeField = None, parent=None):
        super().__init__(parent)
        self._original_key = field.name if field else ""
        self._suppress_change = False
        self.setup_ui(field or TypeField(name="", label="", type="entry"))

    def setup_ui(self, field: TypeField):
        layout = QFormLayout(self)
        layout.setContentsMargins(8, 4, 8, 4)

        rule_label = QLabel()
        rule_label.setText("""<font color="#e74c3c"><b>⚠️ 重要规则：</b></font>
<ul>
<li><b style="color:green">显示名</b> → 可以用中文（如「力量」「斗能」）</li>
<li><b style="color:#e74c3c">字段ID</b> → 必须英文或下划线（如 power, dou_neng）</li>
<li><b style="color:blue">下拉选项</b> → 可以全中文（如「普通」「传说」）</li>
</ul>""")
        rule_label.setWordWrap(True)
        layout.addRow(rule_label)

        self.name_edit = QLineEdit(field.name)
        self.name_edit.setPlaceholderText("必须英文：如 name / hp / atk / dou_neng")
        self.name_edit.textChanged.connect(self._validate_field_id)
        self.name_edit.textChanged.connect(self.field_changed.emit)

        name_row_layout = QHBoxLayout()
        name_row_layout.addWidget(self.name_edit)
        self.pinyin_btn = QPushButton("拼音")
        self.pinyin_btn.setToolTip("中文→拼音\n例如：「攻击力」→ gong_ji_li\n支持任意汉字（基于 pypinyin 库）")
        self.pinyin_btn.setFixedWidth(50)
        self.pinyin_btn.clicked.connect(self._auto_pinyin)
        name_row_layout.addWidget(self.pinyin_btn)
        self.trans_btn = QPushButton("英译")
        self.trans_btn.setToolTip("中文→英文翻译（游戏术语对照）\n例如：「攻击力」→ atk\n「生命值」→ hp\n不在词库则回退拼音")
        self.trans_btn.setFixedWidth(50)
        self.trans_btn.clicked.connect(self._auto_translate)
        name_row_layout.addWidget(self.trans_btn)
        name_widget = QWidget()
        name_widget.setLayout(name_row_layout)
        layout.addRow("字段ID <font color='red'>*</font>（必须英文）:", name_widget)

        self.label_edit = QLineEdit(field.label)
        self.label_edit.setPlaceholderText("可以中文：如 生命值、斗能、赋能等级")
        self.label_edit.textChanged.connect(self.field_changed.emit)
        layout.addRow("显示名（可以中文）:", self.label_edit)

        self.type_combo = QComboBox()
        for ftype, fname in FIELD_TYPES:
            self.type_combo.addItem(fname, ftype)
        idx = next((i for i, (t, _) in enumerate(FIELD_TYPES) if t == field.type), 0)
        self.type_combo.setCurrentIndex(idx)
        self.type_combo.currentIndexChanged.connect(self._on_type_changed)
        layout.addRow("控件类型:", self.type_combo)

        self.editable_check = QCheckBox("可在表单中编辑（勾选=数据表单里可修改，不勾选=表单里只读）")
        self.editable_check.setChecked(field.editable)
        self.editable_check.toggled.connect(self.field_changed.emit)
        layout.addRow("", self.editable_check)

        values_label = QLabel("选项值（逗号分隔，仅下拉选择需要）:")
        self.values_edit = QLineEdit(",".join(field.values) if field.values else "")
        self.values_edit.setPlaceholderText("如：战士,法师,牧师")
        self.values_edit.textChanged.connect(self.field_changed.emit)
        self._values_row = -1
        layout.addRow(values_label, self.values_edit)

        range_layout = QHBoxLayout()
        self.from_spin = QSpinBox()
        self.from_spin.setRange(-99999, 99999)
        self.from_spin.setValue(field.from_ if field.from_ is not None else 0)
        self.to_spin = QSpinBox()
        self.to_spin.setRange(-99999, 999999)
        self.to_spin.setValue(field.to if field.to is not None else 100)
        self.from_spin.valueChanged.connect(self.field_changed.emit)
        self.to_spin.valueChanged.connect(self.field_changed.emit)
        range_layout.addWidget(QLabel("最小值:"))
        range_layout.addWidget(self.from_spin)
        range_layout.addWidget(QLabel("最大值:"))
        range_layout.addWidget(self.to_spin)
        self._range_widget = QWidget()
        self._range_widget.setLayout(range_layout)
        layout.addRow(self._range_widget)

        self._on_type_changed()

    def _on_type_changed(self):
        ftype = self.type_combo.currentData()
        is_select = (ftype == "combobox")
        is_numeric = ftype in ("spinbox", "double_spin")

        parent_layout = self.layout()
        row_idx = None
        for i in range(parent_layout.rowCount()):
            item = parent_layout.itemAt(i, QFormLayout.ItemRole.FieldRole)
            if item and item.widget() == self.values_edit:
                row_idx = i
                break

        if row_idx is not None:
            parent_layout.itemAt(row_idx, QFormLayout.ItemRole.LabelRole).widget().setVisible(is_select)
            self.values_edit.setVisible(is_select)

        self._range_widget.setVisible(is_numeric)
        self.field_changed.emit()

    def _validate_field_id(self, text):
        import re
        if not text:
            self.name_edit.setStyleSheet("")
            return
        if re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', text):
            self.name_edit.setStyleSheet(f"QLineEdit {{ border: 2px solid {theme_color('accent')}; }}")
        else:
            self.name_edit.setStyleSheet(f"QLineEdit {{ border: 2px solid {theme_color('danger')}; background-color: {theme_color('accent_light')}; }}")

    def _auto_pinyin(self):
        chinese_text = self.label_edit.text().strip()
        if not chinese_text:
            self.name_edit.clear()
            return
        result = self._chinese_to_pinyin(chinese_text)
        if result:
            self.name_edit.setText(result)

    def _auto_translate(self):
        chinese_text = self.label_edit.text().strip()
        if not chinese_text:
            self.name_edit.clear()
            return
        result = self._translate_game_terms(chinese_text)
        if result:
            self.name_edit.setText(result)

    @staticmethod
    def _chinese_to_pinyin(text: str) -> str:
        """中文→拼音：攻击力 → gong_ji_li"""
        try:
            from pypinyin import Style, lazy_pinyin
            syllables = lazy_pinyin(text, style=Style.NORMAL)
            result = "_".join(s for s in syllables if s)
            import re
            result = re.sub(r'[^a-zA-Z0-9_]+', '_', result)
            result = re.sub(r'_+', '_', result).strip('_')
            return result.lower()
        except ImportError as e:
            logger.debug(f"操作失败: {e}")

        if any('\u4e00' <= ch <= '\u9fff' for ch in text):
            return ""
        import re
        result = re.sub(r'[^a-zA-Z0-9_]+', '_', text).strip('_').lower()
        return result

    GAME_TERMS_CN = {
        '攻击力': 'atk', '攻击': 'atk', '伤害': 'dmg', '攻击速度': 'atk_speed',
        '生命值': 'hp', '生命': 'hp', '血量': 'hp', '体力': 'stamina',
        '防御力': 'def', '防御': 'def', '护甲': 'armor', '魔抗': 'magic_resist',
        '魔法值': 'mp', '法力': 'mp', '魔力': 'mana', '魔法攻击': 'magic_atk',
        '速度': 'speed', '移动速度': 'move_speed', '攻速': 'atk_speed',
        '暴击率': 'crit_rate', '暴击伤害': 'crit_dmg', '暴击': 'crit',
        '命中率': 'hit_rate', '命中': 'hit', '闪避': 'dodge', '闪避率': 'dodge_rate',
        '力量': 'str', '敏捷': 'agi', '智力': 'int', '体质': 'vit', '精神': 'spi',
        '幸运': 'luck', '魅力': 'cha', '耐力': 'endurance',
        '经验值': 'exp', '经验': 'exp', '等级': 'level', '品质': 'quality',
        '稀有度': 'rarity', '星级': 'star', '强化等级': 'enhance_level',
        '冷却时间': 'cooldown', '冷却': 'cd', '持续时间': 'duration',
        '范围': 'range', '射程': 'range', '消耗': 'cost', '费用': 'cost',
        '价格': 'price', '价值': 'value', '金币': 'gold', '钻石': 'diamond',
        '名称': 'name', '描述': 'desc', '类型': 'type', '分类': 'category',
        '标签': 'tags', '图标': 'icon', '图片': 'image', '模型': 'model',
        'ID': 'id', '编号': 'id', '职业': 'job', '种族': 'race',
        '性别': 'gender', '年龄': 'age', '阵营': 'faction', '势力': 'faction',
        '技能': 'skill', '天赋': 'talent', '被动': 'passive', '主动': 'active',
        '效果': 'effect', '状态': 'status', '增益': 'buff', '减益': 'debuff',
        '治疗': 'heal', '回复': 'regen', '护盾': 'shield',
        '物理': 'physical', '魔法': 'magic', '元素': 'element',
        '火': 'fire', '冰': 'ice', '雷': 'thunder', '风': 'wind', '光': 'light',
        '暗': 'dark', '毒': 'poison', '圣': 'holy', '死': 'death', '龙': 'dragon',
        '战士': 'warrior', '法师': 'mage', '牧师': 'priest', '刺客': 'assassin',
        '射手': 'archer', '坦克': 'tank', '辅助': 'support', '召唤师': 'summoner',
        '普通': 'common', '稀有': 'rare', '史诗': 'epic', '传说': 'legendary',
        '武器': 'weapon', '装备': 'equip', '防具': 'armor', '饰品': 'accessory',
        '消耗品': 'consumable', '道具': 'item', '材料': 'material',
        '任务': 'quest', '成就': 'achievement', '奖励': 'reward',
        '近战': 'melee', '远程': 'ranged', '单体': 'single', '群体': 'aoe',
        '解锁': 'unlock', '条件': 'condition', '需求': 'require',
        '数量': 'count', '总数': 'total', '上限': 'max', '下限': 'min',
        '伤害减免': 'dmg_reduce', '穿透': 'penetration', '吸血': 'lifesteal',
        '反伤': 'reflect', '斩杀': 'execute', '火焰': 'fire',
        '冰霜': 'frost', '闪电': 'lightning', '暗影': 'shadow',
        '毒素': 'poison', '神圣': 'holy', '增幅': 'boost',
        '倍率': 'multiplier', '精通': 'mastery', '强度': 'power',
        '容量': 'capacity', '抗性': 'resist', '持续伤害': 'dot',
    }

    _cedict_loaded = False
    _cedict_instance = None
    _term_keys_sorted = None

    @classmethod
    def _ensure_cedict(cls):
        if cls._cedict_loaded:
            return
        cls._cedict_loaded = True
        try:
            from core.cedict import load_cedict
            cls._cedict_instance = load_cedict()
            cls._cedict_instance._load()
        except Exception as e:
            logger.warning(f"操作失败: {e}")

    @classmethod
    def _term_keys(cls):
        if cls._term_keys_sorted is None:
            cls._term_keys_sorted = sorted(cls.GAME_TERMS_CN.keys(), key=len, reverse=True)
        return cls._term_keys_sorted

    @classmethod
    def _cedict_translate_word(cls, word: str) -> str:
        cls._ensure_cedict()
        if not cls._cedict_instance:
            return ''
        en_def = cls._cedict_instance.translate(word)
        if not en_def:
            return ''
        import re
        short = en_def.split('/')[0].split(';')[0].split(',')[0].strip()
        short = re.sub(r'[()（）].*$', '', short).strip()
        tokens = short.split()
        skip_words = {'a', 'an', 'the', 'to', 'of', 'in', 'on', 'at', 'by', 'for',
                      'be', 'is', 'are', 'was', 'were', 'or', 'and', 'not', 'with',
                      'from', 'that', 'this', 'it', 'its', 'used', 'also'}
        key_tokens = [t for t in tokens if t.lower() not in skip_words and len(t) > 1]
        if key_tokens:
            short = key_tokens[0]
        elif tokens:
            short = tokens[0]
        short = re.sub(r'[^a-zA-Z0-9_]+', '_', short)
        short = re.sub(r'_+', '_', short).strip('_').lower()
        return short

    @classmethod
    def _translate_game_terms(cls, text: str) -> str:
        """中文→英文: 游戏术语 > CEDICT词典 > pinyin"""
        import re

        remaining = text
        result = []
        sorted_keys = cls._term_keys()

        while remaining:
            matched = False
            for key in sorted_keys:
                if remaining.startswith(key):
                    result.append(cls.GAME_TERMS_CN[key])
                    remaining = remaining[len(key):]
                    matched = True
                    break
            if matched:
                continue

            ch = remaining[0]
            if '\u4e00' <= ch <= '\u9fff':
                segments = []
                try:
                    import jieba
                    segments = list(jieba.cut(remaining))
                except ImportError:
                    segments = list(remaining)

                for seg in segments:
                    seg = seg.strip()
                    if not seg:
                        continue
                    en = cls._cedict_translate_word(seg)
                    if en:
                        result.append(en)
                    else:
                        ch_parts = []
                        for c in seg:
                            if '\u4e00' <= c <= '\u9fff':
                                pinyin = cls._chinese_to_pinyin(c)
                                if pinyin:
                                    ch_parts.append(pinyin)
                            elif 'a' <= c.lower() <= 'z' or '0' <= c <= '9':
                                ch_parts.append(c.lower())
                        if ch_parts:
                            result.append('_'.join(ch_parts))
                break
            elif 'a' <= ch.lower() <= 'z' or '0' <= ch <= '9':
                result.append(ch.lower())
                remaining = remaining[1:]
            else:
                remaining = remaining[1:]

        final = '_'.join(r for r in result if r)
        final = re.sub(r'_+', '_', final).strip('_').lower()
        return final

    def get_field(self) -> TypeField:
        ftype = self.type_combo.currentData()
        vals_str = self.values_edit.text().strip()
        values = [v.strip() for v in vals_str.split(",") if v.strip()] if vals_str else None

        return TypeField(
            name=self.name_edit.text().strip().replace(" ", "_"),
            label=self.label_edit.text().strip(),
            type=ftype,
            editable=self.editable_check.isChecked(),
            values=values,
            from_=self.from_spin.value() if ftype in ("spinbox", "double_spin") else None,
            to=self.to_spin.value() if ftype in ("spinbox", "double_spin") else None,
        )

    @property
    def original_key(self):
        return self._original_key


class LayoutEditorWidget(QWidget):
    """编辑器排版编辑器 — 管理分区、图标、折叠、字段分配"""
    layout_changed = pyqtSignal()

    def __init__(self, data_type: str = "", fields: list = None, parent=None):
        super().__init__(parent)
        self.data_type = data_type
        self.all_fields = fields or []
        self._groups = []
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


class TypeEditorDialog(QDialog):
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
        self.current_field_editor = None
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

    TYPE_TEMPLATES = {
        "通用数据（默认）": [
            TypeField(name="id", label="ID:", type="entry", editable=False),
            TypeField(name="name", label="名称:", type="entry", editable=True),
            TypeField(name="type", label="分类:", type="combobox", editable=True,
                      values=["请修改为你的分类选项"]),
            TypeField(name="rarity", label="稀有度:", type="combobox", editable=True,
                      values=["普通", "稀有", "史诗", "传说"]),
            TypeField(name="tags", label="标签:", type="tags", editable=True),
            TypeField(name="value", label="数值:", type="spinbox", editable=True,
                      from_=0, to=9999),
            TypeField(name="desc", label="描述:", type="desc", editable=True),
            TypeField(name="image", label="图片:", type="image", editable=True),
        ],
        "RPG角色": [
            TypeField("id", "ID:", "entry", False),
            TypeField("name", "名称:", "entry", True),
            TypeField("job", "职业:", "combobox", True, values=["战士","法师","牧师","刺客"]),
            TypeField("race", "种族:", "combobox", True, values=["人类","精灵","兽人","亡灵"]),
            TypeField("hp", "生命:", "spinbox", True, from_=50, to=20000),
            TypeField("mp", "法力:", "spinbox", True, from_=0, to=5000),
            TypeField("atk", "攻击:", "spinbox", True, from_=5, to=1000),
            TypeField("def_", "防御:", "spinbox", True, from_=0, to=800),
            TypeField("category", "定位:", "combobox", True, values=["坦克","输出","辅助","治疗"]),
            TypeField("tags", "标签:", "tags", True),
            TypeField("desc", "描述:", "desc", True),
        ],
        "RPG技能": [
            TypeField("id", "ID:", "entry", False),
            TypeField("name", "名称:", "entry", True),
            TypeField("type", "技能类型:", "combobox", True, values=["攻击","治疗","防御","控制","增益"]),
            TypeField("value", "数值:", "spinbox", True, from_=0, to=9999),
            TypeField("cd", "冷却:", "spinbox", True, from_=0, to=120),
            TypeField("target", "目标:", "combobox", True, values=["单体敌人","群体敌人","自身","全体友方"]),
            TypeField("consume", "消耗:", "combobox", True, values=["无消耗","法力","体力","怒气"]),
            TypeField("effect", "效果:", "combobox", True, values=["直接伤害","持续伤害","护盾","眩晕","治疗"]),
            TypeField("tags", "标签:", "tags", True),
            TypeField("desc", "描述:", "desc", True),
        ],
        "卡牌TCG": [
            TypeField("id", "ID:", "entry", False),
            TypeField("name", "名称:", "entry", True),
            TypeField("cost", "费用:", "spinbox", True, from_=0, to=10),
            TypeField("atk", "攻击:", "spinbox", True, from_=0, to=12),
            TypeField("hp", "生命:", "spinbox", True, from_=1, to=12),
            TypeField("card_type", "卡牌类型:", "combobox", True, values=["随从","法术","武器"]),
            TypeField("rarity", "稀有度:", "combobox", True, values=["普通","稀有","史诗","传说"]),
            TypeField("class_", "职业限制:", "combobox", True, values=["中立","战士","法师","盗贼","德鲁伊"]),
            TypeField("keywords", "关键词:", "tags", True),
            TypeField("desc", "描述:", "desc", True),
        ],
        "策略SLG单位": [
            TypeField("id", "ID:", "entry", False),
            TypeField("name", "名称:", "entry", True),
            TypeField("tier", "等级:", "spinbox", True, from_=1, to=3),
            TypeField("unit_type", "单位类型:", "combobox", True, values=["步兵","骑兵","弓兵","攻城","飞行"]),
            TypeField("hp", "生命:", "spinbox", True, from_=10, to=5000),
            TypeField("atk", "攻击:", "spinbox", True, from_=1, to=500),
            TypeField("move_speed", "移速:", "spinbox", True, from_=1, to=10),
            TypeField("range", "射程:", "combobox", True, values=["近战","短程","中程","远程","攻城"]),
            TypeField("cost", "造价:", "spinbox", True, from_=20, to=1000),
            TypeField("counters", "克制:", "tags", True),
            TypeField("desc", "描述:", "desc", True),
        ],
        "FPS武器": [
            TypeField("id", "ID:", "entry", False),
            TypeField("name", "名称:", "entry", True),
            TypeField("weapon_type", "武器类型:", "combobox", True, values=["手枪","步枪","冲锋枪","狙击枪","霰弹枪","机枪"]),
            TypeField("damage", "单发伤害:", "double_spin", True, from_=10, to=150),
            TypeField("fire_rate", "射速(RPM):", "spinbox", True, from_=100, to=1200),
            TypeField("mag_size", "弹匣容量:", "spinbox", True, from_=5, to=100),
            TypeField("reload_time", "换弹时间(s):", "double_spin", True, from_=0.5, to=6.0),
            TypeField("accuracy", "精度:", "double_spin", True, from_=50, to=100),
            TypeField("range_", "有效距离:", "combobox", True, values=["近距离","中距离","远距离","超远距离"]),
            TypeField("desc", "描述:", "desc", True),
        ],
        "MOBA英雄": [
            TypeField("id", "ID:", "entry", False),
            TypeField("name", "名称:", "entry", True),
            TypeField("role", "定位:", "combobox", True, values=["坦克","战士","刺客","法师","射手","辅助"]),
            TypeField("base_hp", "基础生命:", "spinbox", True, from_=450, to=700),
            TypeField("base_ad", "基础物攻:", "spinbox", True, from_=40, to=80),
            TypeField("base_armor", "基础护甲:", "spinbox", True, from_=20, to=45),
            TypeField("base_mr", "基础魔抗:", "spinbox", True, from_=25, to=45),
            TypeField("move_speed", "移动速度:", "double_spin", True, from_=300, to=350),
            TypeField("attack_range", "攻击范围:", "combobox", True, values=["近战","远程"]),
            TypeField("difficulty", "难度:", "combobox", True, values=["简单","中等","困难"]),
            TypeField("tags", "标签:", "tags", True),
            TypeField("desc", "描述:", "desc", True),
        ],
        "空白（手动创建）": [
            TypeField(name="id", label="ID:", type="entry", editable=False),
            TypeField(name="name", label="名称:", type="entry", editable=True),
        ],
    }

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

    def ai_suggest_fields(self):
        """AI根据策划案推荐当前类型的字段"""
        if self._current_type_index < 0:
            QMessageBox.information(self, "提示", "请先选择一个数据类型")
            return
        t = self.schema.types[self._current_type_index]

        from config.settings import get_config
        config = get_config()
        planning_dir = config.active_planning_dir

        plan_context = ""
        if planning_dir and planning_dir.exists():
            docs_file = config.config_dir / "planning_docs_v3.json"
            if docs_file.exists():
                try:
                    import json as _j
                    with open(docs_file, encoding="utf-8") as _f:
                        docs_data = _j.load(_f)
                    if isinstance(docs_data, list) and docs_data:
                        doc = docs_data[0]
                        concept = doc.get("game_concept", "")[:500]
                        gameplay = doc.get("gameplay", "")[:400]
                        systems = doc.get("systems", "")[:300]
                        plan_context = f"【游戏理念】{concept}\n【核心玩法】{gameplay}\n【系统设计】{systems}"
                except Exception:
                    get_logger().exception("AI推荐字段加载失败")

        existing_fields_info = ""
        if t.form_fields:
            existing_fields_info = "\n当前已有字段：\n"
            for f in t.form_fields:
                existing_fields_info += f"  - {f.name} ({f.label}, {f.type})\n"

        prompt = f"""你是一位资深游戏数据架构师，专精于为各类游戏设计完整、专业的数据类型字段系统。

你的任务：为游戏中的「{t.name}」类型设计一套完整的字段定义。

{plan_context}

当前已有的字段（可能不完整）：
{existing_fields_info if existing_fields_info else "(无，新建类型)"}

请设计 8~18 个字段，必须包含以下类型组合来保证信息的完整性：
- 身份类(2~3个): id, name, (可选)alias/nickname
- 分类类(2~3个): type, category, sub_type, kind
- 品质类(1~2个): rarity, quality, level, tier, grade
- 数值类(2~5个): 根据游戏类型，定义核心属性的数值字段（如攻击/防御/生命/费用/速度/冷却等）
- 描述类(1~2个): desc, description, detail, lore, flavor_text
- 标签类(1个): tags, keywords, traits, attributes
- 视觉类(0~2个): image, icon, model, portrait (非必须但建议有)
- 扩展类(2~4个): 其他此类型专属的字段

输出严格的JSON数组格式（只输出JSON，不要额外解释）：
```json
[
  {{"name": "英文ID", "label": "中文显示名:", "type": "控件类型", "editable": true/false, "values": ["选项1","选项2"], "from_": 最小值, "to_": 最大值}},
  ...
]
```

字段类型可选：entry, combobox, spinbox, double_spin, tags, template, desc, content, achievement_desc, image, image_desc, image_tags, dialog

关键规则：
1. id字段必须放在第一位，type="entry", editable=false
2. 下拉选择(combobox)必须提供3个以上的values选项
3. 数值字段(spinbox/double_spin)必须提供合理的from_和to_
4. 字段label以中文冒号结尾，如"攻击力:"、"稀有度:"
5. 字段名用英文下划线，如"atk_power"、"rarity_level"
6. 核心数值字段要给实际游戏常用的范围，不要随便填0~9999
7. 所有字段都应该对此类型有实际用途，避免无意义字段
8. 字段按重要程度排序（ID→名称→分类→核心数值→品质→标签→描述→图片）"""

        from features.ai import show_ai_generate_dialog
        result = show_ai_generate_dialog(self, data_type="planning", initial_prompt=prompt)

        if result and 'desc' in result and result['desc']:
            import json
            import re
            json_match = re.search(r'\[[\s\S]*?\]', result['desc'])
            if not json_match:
                json_match = re.search(r'```json\s*(\[[\s\S]*?\])\s*```', result['desc'])
            if json_match:
                try:
                    new_fields_data = json.loads(json_match.group(1))
                    new_fields = []
                    for fd in new_fields_data:
                        new_fields.append(TypeField(
                            name=fd.get("name", ""),
                            label=fd.get("label", ""),
                            type=fd.get("type", "entry"),
                            editable=fd.get("editable", True),
                            values=fd.get("values"),
                            from_=fd.get("from_"),
                            to=fd.get("to"),
                        ))

                    confirm = QMessageBox.question(
                        self, "确认添加",
                        f"AI 推荐了 {len(new_fields)} 个字段。\n\n"
                        f"是否替换「{t.name}」的所有字段？\n\n"
                        f"(现有 {len(t.form_fields)} 个字段将被替换)",
                        QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                        QMessageBox.StandardButton.No
                    )
                    if confirm == QMessageBox.StandardButton.Yes:
                        t.form_fields = new_fields
                        self.on_type_selected(self._current_type_index)
                        self._mark_dirty()
                        QMessageBox.information(self, "成功", f"已应用 {len(new_fields)} 个AI推荐的字段！")
                except (json.JSONDecodeError, KeyError):
                    QMessageBox.warning(self, "解析失败", "AI返回的字段格式有误，无法解析。")

    def analyze_existing_data(self):
        """分析库中已有数据，发现缺失或冗余的字段"""
        if self._current_type_index < 0:
            QMessageBox.information(self, "提示", "请先选择一个数据类型")
            return
        t = self.schema.types[self._current_type_index]
        plural_key = t.plural_key

        from config.settings import get_config
        config = get_config()
        dm = config.data_manager
        data_list = dm.data.get(plural_key, [])

        if not data_list:
            QMessageBox.information(self, "提示", f"当前库中「{t.name}」还没有任何数据。建议先用 AI 推荐字段或从模板导入。")
            return

        field_names_in_schema = [f.name for f in t.form_fields]
        field_names_in_data = set()
        field_usage_count = {}
        for item in data_list:
            for key in item.keys():
                if key not in ("id",):
                    field_names_in_data.add(key)
                    field_usage_count[key] = field_usage_count.get(key, 0) + 1
                    val = item.get(key, "")
                    if val is None or (isinstance(val, str) and not val.strip()) or val == 0:
                        pass

        missing_in_schema = [k for k in field_names_in_data if k not in field_names_in_schema]
        unused_in_schema = [f.name for f in t.form_fields if f.name not in field_names_in_data and f.name != "id"]

        report = f"📊 数据分析报告 — 「{t.name}」（共 {len(data_list)} 条数据）\n\n"
        report += f"Schema 定义字段数: {len(field_names_in_schema)}\n"
        report += f"数据实际使用字段: {len(field_names_in_data)}\n\n"

        if missing_in_schema:
            report += f"⚠️ 数据中有但 Schema 缺少的字段 ({len(missing_in_schema)} 个):\n"
            for k in missing_in_schema:
                count = field_usage_count.get(k, 0)
                pct = count / len(data_list) * 100
                report += f"  · {k} — {count}条使用 ({pct:.0f}%)\n"
            report += "\n💡 建议: 这些字段可能需要添加到 Schema 中\n\n"

        if unused_in_schema:
            report += f"📋 Schema 有但数据未使用的字段 ({len(unused_in_schema)} 个):\n"
            for k in unused_in_schema:
                report += f"  · {k}\n"
            report += "\n💡 建议: 考虑删除这些字段或检查是否有数据没填写\n\n"

        popular_fields = sorted(field_usage_count.items(), key=lambda x: -x[1])[:10]
        report += "🔥 使用率最高的字段:\n"
        for k, c in popular_fields:
            report += f"  · {k}: {c}/{len(data_list)} ({c/len(data_list)*100:.0f}%)\n"

        dialog = QDialog(self, Qt.WindowType.Dialog)
        dialog.setWindowTitle(f"数据分析 — {t.name}")
        dialog.setMinimumSize(500, 400)
        layout = QVBoxLayout(dialog)

        text_edit = QTextEdit()
        text_edit.setPlainText(report)
        text_edit.setReadOnly(True)
        layout.addWidget(text_edit)

        btn_layout = QHBoxLayout()
        add_missing_btn = QPushButton("+ 补充缺失字段到Schema")
        btn_layout.addWidget(add_missing_btn)
        btn_layout.addStretch()
        close_btn = QPushButton("关闭")
        btn_layout.addWidget(close_btn)
        layout.addLayout(btn_layout)

        def on_add_missing():
            for k in missing_in_schema:
                guess_type = "entry"
                all_numeric = True
                for item in data_list[:20]:
                    v = item.get(k)
                    if v is not None and not isinstance(v, (int, float)):
                        all_numeric = False
                        break
                if all_numeric and any(isinstance(item.get(k), (int, float)) for item in data_list[:10] if item.get(k) is not None):
                    guess_type = "spinbox"

                new_field = TypeField(
                    name=k.replace(" ", "_").lower(),
                    label=k,
                    type=guess_type,
                    editable=True,
                )
                t.form_fields.append(new_field)
            self.on_type_selected(self._current_type_index)
            self._mark_dirty()
            dialog.accept()

        add_missing_btn.clicked.connect(on_add_missing)
        close_btn.clicked.connect(dialog.reject)
        dialog.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
        dialog.show()

    def import_from_template(self):
        """从预设游戏类型模板导入字段"""
        if self._current_type_index < 0:
            QMessageBox.information(self, "提示", "请先选择一个数据类型")
            return
        t = self.schema.types[self._current_type_index]

        items = [k for k in self.TYPE_TEMPLATES.keys() if k != "空白（手动创建）"]
        choice, ok = QInputDialog.getItem(self, "导入模板", f"为「{t.name}」选择字段模板：", items, 0, False)
        if not ok or not choice:
            return

        template_fields = self.TYPE_TEMPLATES[choice]
        confirm = QMessageBox.question(
            self, "确认导入",
            f"将用「{choice}」模板的 {len(template_fields)} 个字段\n"
            f"替换「{t.name}」当前的 {len(t.form_fields)} 个字段？\n\n"
            f"提示：你可以之后再手动调整或让AI优化。",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        if confirm == QMessageBox.StandardButton.Yes:
            t.form_fields = [
                TypeField(name=f.name, label=f.label, type=f.type, editable=f.editable,
                         values=f.values, from_=f.from_, to=f.to)
                for f in template_fields
            ]
            self.on_type_selected(self._current_type_index)
            self._mark_dirty()
            QMessageBox.information(self, "导入成功", f"已从「{choice}」模板导入 {len(template_fields)} 个字段！")

    def search_web_reference(self):
        """联网搜索同类游戏的字段设计参考"""
        if self._current_type_index < 0:
            QMessageBox.information(self, "提示", "请先选择一个数据类型")
            return
        t = self.schema.types[self._current_type_index]

        dialog = QDialog(self, Qt.WindowType.Dialog)
        dialog.setWindowTitle(f"联网搜索 — {t.name} 字段设计参考")
        dialog.setMinimumSize(600, 500)
        layout = QVBoxLayout(dialog)

        search_input = QLineEdit()
        search_input.setPlaceholderText(f"搜索关键词，如：「{t.name} 数据结构」「游戏{t.name}字段设计」...")
        layout.addWidget(search_input)

        result_browser = QTextBrowser()
        result_browser.setOpenExternalLinks(True)
        layout.addWidget(result_browser)

        def do_search():
            query = search_input.text().strip() or f"游戏 {t.name} 数据结构 字段设计"
            result_browser.append(f"<b>🔍 正在搜索: {query}</b>\n<br>")
            result_browser.append("⏳ 正在获取参考信息...<br>")

            try:
                from common.web_fetcher import WebFetcher
                fetcher = WebFetcher(timeout=15)

                urls_to_try = [
                    f"https://www.google.com/search?q={query.replace(' ', '+')}+game+data+structure",
                    f"https://zh.wikipedia.org/wiki/{query}",
                ]

                found_content = []
                for url in urls_to_try:
                    try:
                        content = fetcher.fetch(url)
                        if content and len(content) > 200:
                            preview = content[:800].replace("\n", "<br>")
                            found_content.append(f"<b>来源:</b> {url}<br><br>{preview}<br><hr><br>")
                    except Exception as e:
                        found_content.append(f"<i>{url}: 获取失败 - {e}</i><br><br>")

                if found_content:
                    result_browser.clear()
                    for fc in found_content:
                        result_browser.append(fc)
                else:
                    result_browser.append("<br>⚠️ 未找到足够的参考信息。<br><br>"
                                   "<b>建议：</b><br>"
                                   "· 尝试更具体的关键词<br>"
                                   "· 使用「AI推荐字段」功能<br>"
                                   "· 从预设模板导入后手动调整<br>")
            except ImportError:
                result_browser.append("<br>⚠️ 网络工具暂不可用。<br><br>"
                               "建议使用其他智能工具：<br>"
                               "· 🤖 AI推荐字段 — 根据策划案自动生成<br>"
                               "· 📋 导入模板 — 使用预设的专业模板<br>"
                               "· 📊 分析数据 — 基于已有数据推断字段<br>")

        search_btn = QPushButton("🔍 开始搜索")
        search_btn.clicked.connect(do_search)
        layout.addWidget(search_btn)

        dialog.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
        dialog.show()

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
