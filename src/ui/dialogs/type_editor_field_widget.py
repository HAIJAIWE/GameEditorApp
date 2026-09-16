"""单个字段编辑器控件（含拼音/翻译辅助） —— 自 type_editor_dialog.py 拆出，代码逐行原样搬运（逻辑未改动）"""

from PyQt6.QtCore import pyqtSignal
from PyQt6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QFormLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QPushButton,
    QSpinBox,
    QWidget,
)

from common.logger import get_logger
from config.constants import FIELD_TYPE_MAP
from core.type_schema import TypeField
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
        self.from_spin.setValue(int(field.from_) if field.from_ is not None else 0)
        self.to_spin = QSpinBox()
        self.to_spin.setRange(-99999, 999999)
        self.to_spin.setValue(int(field.to) if field.to is not None else 100)
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
