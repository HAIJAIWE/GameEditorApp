"""装备/Buff预览窗口 - 左侧数据列表 + 右侧检查器"""
from PyQt6.QtCore import QMimeData, Qt, pyqtSignal
from PyQt6.QtGui import QDrag, QPixmap
from PyQt6.QtWidgets import (
    QApplication,
    QComboBox,
    QFrame,
    QHBoxLayout,
    QInputDialog,
    QLabel,
    QMessageBox,
    QPushButton,
    QScrollArea,
    QSizePolicy,
    QStackedWidget,
    QTabWidget,
    QVBoxLayout,
    QWidget,
)

from common.logger import get_logger
from core.attr_system import AttributeSystem
from ui.dialogs.auto_input_dialog import show_text_input_dialog
from ui.themes import theme_color

logger = get_logger()

# 英文属性名到中文的映射
ATTR_EN_TO_CN = {
    "strength": "力量",
    "intelligence": "智力",
    "agility": "敏捷",
    "constitution": "体质",
    "spirit": "精神",
    "hp": "HP",
    "mp": "MP",
    "physical_attack": "物攻",
    "magic_attack": "魔攻",
    "physical_defense": "物防",
    "magic_defense": "魔防",
    "speed": "速度",
    "crit_rate": "暴击率",
    "crit_damage": "暴击伤害",
    "hit_rate": "命中率",
    "dodge_rate": "闪避率",
    "hp_regen": "回血/回合",
    "mp_regen": "回蓝/回合",
    "fire_resist": "火抗",
    "ice_resist": "冰抗",
    "lightning_resist": "雷抗",
    "poison_resist": "毒抗",
    "spell_power": "法术强度",
    "cooldown_reduce": "冷却缩减",
    "attack_speed": "攻速",
    "move_speed": "移速",
    "block_rate": "格挡率",
    "penetration": "穿透",
    "life_steal": "吸血",
}


def translate_attr_name(name: str) -> str:
    """将英文属性名翻译为中文，如果不是英文则原样返回"""
    return ATTR_EN_TO_CN.get(name.lower(), name)


# ── 共享样式（动态主题化） ────────────────────────────────────
def _sub_label_style():
    return f"QLabel {{ color: {theme_color('hint')}; font-size: 11px; }}"

def _section_title_style():
    return f"QLabel {{ color: {theme_color('secondary_fg')}; font-size: 12px; font-weight: bold; }}"

def _frame_border_style():
    return f"QFrame {{ background-color: {theme_color('bg')}; border: 1px solid {theme_color('border')}; border-radius: 4px; }}"

def _diff_label_default_style():
    return f"QLabel {{ color: {theme_color('hint')}; font-size: 11px; font-family: Consolas; }}"

def _diff_label_positive_style():
    return f"QLabel {{ color: {theme_color('accent')}; font-size: 11px; font-weight: bold; font-family: Consolas; }}"

def _toggle_btn_style():
    return f"""
    QPushButton {{
        padding: 4px 12px;
        border: 1px solid {theme_color('border')};
        border-radius: 3px;
        background-color: {theme_color('input_bg')};
        font-size: 11px;
    }}
    QPushButton:checked {{
        background-color: {theme_color('accent')};
        color: {theme_color('btn_text') or 'white'};
    }}
    QPushButton:hover {{ border-color: {theme_color('accent')}; }}
"""


class DataItem:
    """数据项基类（装备/Buff）"""
    def __init__(self, item_id: str, name: str, slot: str, bonuses: dict[str, float] = None,
                 percentage_bonuses: dict[str, float] = None, rarity: str = "普通", desc: str = ""):
        self.item_id = item_id
        self.name = name
        self.slot = slot
        self.bonuses = bonuses or {}
        self.percentage_bonuses = percentage_bonuses or {}
        self.rarity = rarity
        self.desc = desc

    def to_dict(self) -> dict:
        return {
            "id": self.item_id,
            "name": self.name,
            "slot": self.slot,
            "bonuses": self.bonuses,
            "percentage_bonuses": self.percentage_bonuses,
            "rarity": self.rarity,
            "desc": self.desc,
        }

    @classmethod
    def from_dict(cls, data: dict) -> DataItem:
        return cls(
            item_id=data.get("id", ""),
            name=data.get("name", ""),
            slot=data.get("slot", ""),
            bonuses=data.get("bonuses", {}),
            percentage_bonuses=data.get("percentage_bonuses", {}),
            rarity=data.get("rarity", "普通"),
            desc=data.get("desc", ""),
        )

    @staticmethod
    def _rarity_color(rarity: str) -> str:
        return {"普通": "#999999", "优秀": "#1eff00", "稀有": "#0070dd",
                "史诗": "#a335ee", "传说": "#ff8000"}.get(rarity, "#fff")


class DraggableItemFrame(QFrame):
    """可拖拽的装备/Buff卡片"""
    def __init__(self, item: DataItem, parent=None):
        super().__init__(parent)
        self._item = item
        self._drag_start_pos = None

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self._drag_start_pos = event.pos()
            event.accept()
        else:
            super().mousePressEvent(event)

    def mouseReleaseEvent(self, event):
        self._drag_start_pos = None
        super().mouseReleaseEvent(event)

    def mouseMoveEvent(self, event):
        if not (event.buttons() & Qt.MouseButton.LeftButton):
            return
        if self._drag_start_pos is None:
            return
        if (event.pos() - self._drag_start_pos).manhattanLength() < QApplication.startDragDistance():
            return

        # 渲染卡片内容为pixmap作为拖拽视觉反馈
        pixmap = QPixmap(self.size())
        self.render(pixmap)

        # 开始拖拽
        mime_data = QMimeData()
        mime_data.setText(f"data:{self._item.slot}:{self._item.item_id}")
        drag = QDrag(self)
        drag.setMimeData(mime_data)
        drag.setPixmap(pixmap)
        drag.setHotSpot(event.pos())
        drag.exec(Qt.DropAction.CopyAction)
        self._drag_start_pos = None


class DataListWidget(QWidget):
    """左侧数据列表（装备/Buff）"""
    def __init__(self, attr_system: AttributeSystem, data_type: str = "equip", parent=None):
        super().__init__(parent)
        self.attr_system = attr_system
        self.data_type = data_type
        self.items: list[DataItem] = []
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)

        # 外层垂直布局：标题行 + 滚动区域
        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.setSpacing(0)

        # 标题行（不滚动）
        header = QHBoxLayout()
        type_label = "装备" if data_type == "equip" else "Buff"
        hl = QLabel(f"{type_label}列表")
        hl.setStyleSheet(_section_title_style())
        header.addWidget(hl)
        header.addStretch()

        self.slot_filter = QComboBox()
        self.slot_filter.setMinimumWidth(80)
        self.slot_filter.setMaximumWidth(120)
        self.slot_filter.setStyleSheet(f"""
            QComboBox {{ 
                font-size: 11px; 
                padding: 2px 4px;
                background-color: {theme_color('input_bg')};
                border: 1px solid {theme_color('border')};
                border-radius: 3px;
                color: {theme_color('fg')};
            }}
        """)
        if data_type == "equip":
            self.slot_filter.addItem("全部", "all")
            for s in ["武器", "头盔", "胸甲", "手套", "靴子", "饰品", "戒指"]:
                self.slot_filter.addItem(s, s)
        else:
            self.slot_filter.addItem("全部", "all")
            for s in ["增益", "减益", "光环"]:
                self.slot_filter.addItem(s, s)
        self.slot_filter.currentIndexChanged.connect(self._refresh_list)
        header.addWidget(self.slot_filter)

        add_btn = QPushButton("+ 添加")
        add_btn.setStyleSheet(f"""
            QPushButton {{ background-color: {theme_color('accent')}; color: {theme_color('btn_text') or 'white'}; border: none; border-radius: 3px; padding: 2px 8px; font-size: 11px; }}
            QPushButton:hover {{ background-color: {theme_color('accent_hover')}; }}
        """)
        add_btn.clicked.connect(self._on_add_item)
        header.addWidget(add_btn)
        main_layout.addLayout(header)

        # 滚动区域（只包含数据项）
        scroll_area = QScrollArea()
        scroll_area.setWidgetResizable(True)
        scroll_area.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        scroll_area.setAlignment(Qt.AlignmentFlag.AlignTop)
        scroll_area.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        scroll_area.setStyleSheet(f"""
            QScrollArea {{
                background-color: {theme_color('bg')};
                border: none;
            }}
            QScrollBar:vertical {{
                background: {theme_color('border')}; width: 10px; border-radius: 5px;
            }}
            QScrollBar::handle:vertical {{
                background: {theme_color('scroll')}; border-radius: 5px; min-height: 20px;
            }}
        """)
        main_layout.addWidget(scroll_area)

        self.content_widget = QWidget()
        scroll_area.setWidget(self.content_widget)

        content_layout = QVBoxLayout(self.content_widget)
        content_layout.setContentsMargins(6, 6, 6, 6)
        content_layout.setSpacing(4)

        # 数据项容器
        self.item_container = QVBoxLayout()
        self.item_container.setSpacing(4)
        self.item_container.setContentsMargins(0, 0, 0, 0)
        content_layout.addLayout(self.item_container)
        content_layout.addStretch()

    def startDrag(self, item: DataItem):
        mime_data = QMimeData()
        mime_data.setText(f"data:{item.slot}:{item.item_id}")
        drag = QDrag(self)
        drag.setMimeData(mime_data)
        drag.exec(Qt.DropAction.CopyAction)

    def add_item(self, item: DataItem):
        self.items.append(item)
        self._refresh_list()

    def remove_item(self, item_id: str):
        self.items = [it for it in self.items if it.item_id != item_id]
        self._refresh_list()

    def get_item(self, item_id: str) -> DataItem:
        for item in self.items:
            if item.item_id == item_id:
                return item
        return None

    def _refresh_list(self):
        while self.item_container.count() > 0:
            child = self.item_container.takeAt(0)
            if child.widget():
                child.widget().deleteLater()
            elif child.layout():
                self._clear_layout(child.layout())

        slot_filter = self.slot_filter.currentData()

        for item in self.items:
            if slot_filter != "all" and item.slot != slot_filter:
                continue

            frame = DraggableItemFrame(item)
            rarity_color = DataItem._rarity_color(item.rarity)
            frame.setFixedHeight(48)
            frame.setStyleSheet(f"""
                QFrame {{
                    background-color: {theme_color('input_bg')};
                    border: 1px solid {theme_color('border')};
                    border-radius: 4px;
                }}
                QFrame:hover {{
                    background-color: {theme_color('accent_light')};
                    border-color: {theme_color('border')};
                }}
            f""")

            hbox = QHBoxLayout(frame)
            hbox.setContentsMargins(10, 6, 28, 6)
            hbox.setSpacing(8)

            name_label = QLabel(item.name)
            name_label.setStyleSheet(f"QLabel {{ color: {rarity_color}; font-weight: bold; font-size: 12px; }}")
            name_label.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)
            hbox.addWidget(name_label)

            slot_label = QLabel(f"·{item.slot}")
            slot_label.setStyleSheet(_sub_label_style())
            slot_label.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)
            hbox.addWidget(slot_label)

            bonus_parts = []
            for attr_name, val in item.bonuses.items():
                if val != 0:
                    cn_name = translate_attr_name(attr_name)
                    sign = "+" if val > 0 else ""
                    bonus_parts.append(f"{cn_name}{sign}{val:.0f}")
            for attr_name, pct in item.percentage_bonuses.items():
                if pct != 0:
                    cn_name = translate_attr_name(attr_name)
                    sign = "+" if pct > 0 else ""
                    bonus_parts.append(f"{cn_name}{sign}{pct:.0f}%")

            if bonus_parts:
                bonus_text = "  ".join(bonus_parts[:4])
                bonus_label = QLabel(bonus_text)
                bonus_label.setStyleSheet(f"QLabel {{ color: {theme_color('accent')}; font-size: 10px; }}")
                bonus_label.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)
            else:
                bonus_label = QLabel("暂无属性")
                bonus_label.setStyleSheet(f"QLabel {{ color: {theme_color('disabled_fg')}; font-size: 10px; }}")
                bonus_label.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)

            hbox.addStretch()
            hbox.addWidget(bonus_label)

            del_btn = QPushButton("✕")
            del_btn.setParent(frame)
            del_btn.setGeometry(frame.width() - 20, 2, 18, 18)
            del_btn.setStyleSheet(f"""
                QPushButton {{
                    background: transparent;
                    color: {theme_color('disabled_fg')};
                    border: none;
                    font-size: 11px;
                }}
                QPushButton:hover {{
                    color: {theme_color('danger')};
                }}
            """)
            del_btn.clicked.connect(lambda checked, iid=item.item_id: self.remove_item(iid))
            del_btn.show()

            self.item_container.addWidget(frame)

    def _clear_layout(self, layout):
        while layout.count():
            child = layout.takeAt(0)
            if child.widget():
                child.widget().deleteLater()
            elif child.layout():
                self._clear_layout(child.layout())

    def _on_add_item(self):
        name, ok = show_text_input_dialog(self, f"添加{'装备' if self.data_type == 'equip' else 'Buff'}", "名称:")
        if not ok or not name:
            return

        slot_options = ["武器", "头盔", "胸甲", "手套", "靴子", "饰品", "戒指"] if self.data_type == "equip" else ["增益", "减益", "光环"]
        slot, ok = QInputDialog.getItem(self, "类型", "类型:", slot_options, 0, False)
        if not ok:
            return

        rarity, ok = QInputDialog.getItem(self, "稀有度", "稀有度:",
                                           ["普通", "优秀", "稀有", "史诗", "传说"], 0, False)
        if not ok:
            return

        bonuses = {}
        pct_bonuses = {}
        for attr_name in self.attr_system.base_attributes:
            attr = self.attr_system.attributes.get(attr_name)
            val, ok = QInputDialog.getDouble(self, f"{attr.display_name}加成",
                                              f"{attr.display_name} 固定加成:", 0, 0, 10000, 0)
            if ok and val > 0:
                bonuses[attr_name] = val
            pct, ok = QInputDialog.getDouble(self, f"{attr.display_name}百分比",
                                              f"{attr.display_name} 百分比加成:", 0, 0, 500, 1)
            if ok and pct > 0:
                pct_bonuses[attr_name] = pct

        self.add_item(DataItem(f"{self.data_type}_{len(self.items)+1:03d}", name, slot, bonuses, pct_bonuses, rarity=rarity))


class DropArea(QFrame):
    """拖拽放置区域"""
    item_dropped = pyqtSignal(str)
    item_removed = pyqtSignal()

    def __init__(self, slot_name: str, parent=None):
        super().__init__(parent)
        self.slot_name = slot_name
        self.current_item: DataItem = None
        self.setAcceptDrops(True)
        self.setFixedHeight(44)
        self.setStyleSheet(self._normal_style())

        layout = QHBoxLayout(self)
        layout.setContentsMargins(8, 6, 8, 6)

        self.slot_label = QLabel(slot_name)
        self.slot_label.setStyleSheet(f"QLabel {{ color: {theme_color('hint')}; font-size: 11px; font-weight: bold; }}")
        layout.addWidget(self.slot_label)
        layout.addStretch()

        self.item_label = QLabel("拖拽到此处")
        self.item_label.setStyleSheet(_sub_label_style())
        layout.addWidget(self.item_label)

        self.unequip_btn = QPushButton("✖")
        self.unequip_btn.setStyleSheet(f"QPushButton {{ background-color: {theme_color('danger')}; color: white; border: none; border-radius: 3px; padding: 1px 6px; font-size: 10px; }}")
        self.unequip_btn.hide()
        self.unequip_btn.clicked.connect(self._on_unequip)
        layout.addWidget(self.unequip_btn)

    def dragEnterEvent(self, event):
        if event.mimeData().hasText() and event.mimeData().text().startswith("data:"):
            event.acceptProposedAction()
            self.setStyleSheet(self._hover_style())

    def dragLeaveEvent(self, event):
        self.setStyleSheet(self._normal_style())

    def dropEvent(self, event):
        self.setStyleSheet(self._normal_style())
        data = event.mimeData().text()
        if data.startswith("data:"):
            parts = data.split(":")
            if len(parts) >= 3:
                self.item_dropped.emit(parts[2])

    def _normal_style(self):
        return f"QFrame {{ background-color: {theme_color('input_bg')}; border: 1.5px dashed {theme_color('border')}; border-radius: 4px; }}"

    def _hover_style(self):
        return f"QFrame {{ background-color: {theme_color('accent_bg')}; border: 1.5px dashed {theme_color('accent')}; border-radius: 4px; }}"

    def set_equipped_item(self, item: DataItem):
        self.current_item = item
        if item:
            color = DataItem._rarity_color(item.rarity)
            self.item_label.setText(f"{item.name}")
            self.item_label.setStyleSheet(f"QLabel {{ color: {color}; font-size: 11px; font-weight: bold; }}")
            self.unequip_btn.show()
        else:
            self.item_label.setText("拖拽到此处")
            self.item_label.setStyleSheet(_sub_label_style())
            self.unequip_btn.hide()

    def _on_unequip(self):
        self.current_item = None
        self.item_removed.emit()
        self.set_equipped_item(None)


class InspectorPanel(QWidget):
    """右侧检查器面板 - 支持装备槽/Buff槽切换"""
    def __init__(self, attr_system: AttributeSystem, parent=None):
        super().__init__(parent)
        self.logger = get_logger()
        self.attr_system = attr_system
        self.equipped: dict[str, DataItem] = {}
        self.active_buffs: list[DataItem] = []
        self.base_values: dict[str, float] = {}
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(6)

        # 顶部切换按钮
        switch_bar = QHBoxLayout()
        switch_bar.setContentsMargins(4, 2, 4, 2)
        switch_bar.setSpacing(4)

        self.equip_btn = QPushButton("⚔ 装备槽")
        self.equip_btn.setCheckable(True)
        self.equip_btn.setChecked(True)
        self.equip_btn.setStyleSheet(_toggle_btn_style())
        self.equip_btn.clicked.connect(lambda: self._switch_panel("equip"))
        switch_bar.addWidget(self.equip_btn)

        self.buff_btn = QPushButton("🛡 Buff槽")
        self.buff_btn.setCheckable(True)
        self.buff_btn.setStyleSheet(_toggle_btn_style())
        self.buff_btn.clicked.connect(lambda: self._switch_panel("buff"))
        switch_bar.addWidget(self.buff_btn)

        switch_bar.addStretch()
        layout.addLayout(switch_bar)

        # 可切换的堆栈面板
        self.stack = QStackedWidget()

        # === 装备槽面板 ===
        equip_widget = QWidget()
        equip_layout = QVBoxLayout(equip_widget)
        equip_layout.setContentsMargins(0, 0, 0, 0)
        equip_layout.setSpacing(4)

        slots_frame, slots_layout = self._section_frame(" 装备槽")
        slots_layout.setSpacing(4)

        self.slots: dict[str, DropArea] = {}
        slot_names = ["武器", "头盔", "胸甲", "手套", "靴子", "饰品", "戒指"]
        for slot_name in slot_names:
            area = DropArea(slot_name)
            area.item_dropped.connect(self._on_equip_dropped)
            area.item_removed.connect(self._on_equip_removed)
            slots_layout.addWidget(area)
            self.slots[slot_name] = area

        equip_layout.addWidget(slots_frame)
        self.stack.addWidget(equip_widget)

        # === Buff槽面板 ===
        buff_widget = QWidget()
        buff_layout = QVBoxLayout(buff_widget)
        buff_layout.setContentsMargins(0, 0, 0, 0)
        buff_layout.setSpacing(4)

        buffs_frame, buffs_layout = self._section_frame(" 已激活Buff")
        buffs_layout.setSpacing(4)

        self.buff_scroll = QScrollArea()
        self.buff_scroll.setWidgetResizable(True)
        self.buff_scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.buff_scroll.setMinimumHeight(180)
        self.buff_scroll.setStyleSheet(f"""
            QScrollArea {{ background-color: transparent; border: none; }}
            QScrollBar:vertical {{ background: {theme_color('border')}; width: 8px; border-radius: 4px; }}
            QScrollBar::handle:vertical {{ background: {theme_color('scroll')}; border-radius: 4px; min-height: 20px; }}
        """)

        self.buff_container = QWidget()
        self.buff_container_layout = QVBoxLayout(self.buff_container)
        self.buff_container_layout.setContentsMargins(4, 4, 4, 4)
        self.buff_container_layout.setSpacing(4)
        self.buff_container_layout.addStretch()
        self.buff_scroll.setWidget(self.buff_container)
        buffs_layout.addWidget(self.buff_scroll)

        buff_layout.addWidget(buffs_frame)
        self.stack.addWidget(buff_widget)

        layout.addWidget(self.stack)

        # 属性对比区域（始终显示）
        compare_frame, compare_layout = self._section_frame(" 属性对比")
        compare_layout.setSpacing(2)

        self.compare_labels: dict[str, dict] = {}
        all_attrs = (self.attr_system.base_attributes +
                     self.attr_system.derived_attributes +
                     self.attr_system.combat_attributes)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        scroll.setMinimumHeight(120)
        scroll.setMaximumHeight(200)
        scroll.setStyleSheet(f"""
            QScrollArea {{
                background-color: {theme_color('bg')};
                border: 1px solid {theme_color('border')};
                border-radius: 4px;
            }}
            QScrollBar:vertical {{
                background: {theme_color('border')}; width: 10px; border-radius: 5px;
            }}
            QScrollBar::handle:vertical {{
                background: {theme_color('scroll')}; border-radius: 5px; min-height: 20px;
            }}
        """)

        scroll_content = QWidget()
        scroll_layout = QVBoxLayout(scroll_content)
        scroll_layout.setSpacing(1)

        for attr_name in all_attrs:
            attr = self.attr_system.attributes.get(attr_name)
            if not attr:
                continue

            row = QHBoxLayout()
            name_label = QLabel(attr.display_name)
            name_label.setFixedWidth(55)
            name_label.setStyleSheet("QLabel { font-size: 11px; }")
            row.addWidget(name_label)
            row.addStretch()

            base_label = QLabel("0")
            base_label.setFixedWidth(35)
            base_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
            base_label.setStyleSheet(f"QLabel {{ color: {theme_color('hint')}; font-size: 11px; font-family: Consolas; }}")
            row.addWidget(base_label)

            arrow = QLabel("→")
            arrow.setStyleSheet(f"QLabel {{ color: {theme_color('hint')}; font-size: 10px; }}")
            row.addWidget(arrow)

            final_label = QLabel("0")
            final_label.setFixedWidth(35)
            final_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
            final_label.setStyleSheet(_diff_label_positive_style())
            row.addWidget(final_label)

            diff_label = QLabel("+0")
            diff_label.setFixedWidth(35)
            diff_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
            diff_label.setStyleSheet(_diff_label_default_style())
            row.addWidget(diff_label)

            scroll_layout.addLayout(row)
            self.compare_labels[attr_name] = {"base": base_label, "final": final_label, "diff": diff_label}

        scroll_layout.addStretch()
        scroll.setWidget(scroll_content)
        compare_layout.addWidget(scroll)

        layout.addWidget(compare_frame)

    def _switch_panel(self, panel_type: str):
        """切换装备槽/Buff槽面板"""
        self.equip_btn.setChecked(panel_type == "equip")
        self.buff_btn.setChecked(panel_type == "buff")
        if panel_type == "equip":
            self.stack.setCurrentIndex(0)
        else:
            self.stack.setCurrentIndex(1)

    def _section_frame(self, title: str) -> tuple:
        """返回 (frame, layout)"""
        frame = QFrame()
        frame.setStyleSheet(f"QFrame {{ background-color: {theme_color('bg')}; border: 1px solid {theme_color('border')}; border-radius: 6px; }}")
        f_layout = QVBoxLayout()
        f_layout.setContentsMargins(8, 6, 8, 6)
        f_layout.setSpacing(4)
        t = QLabel(title)
        t.setStyleSheet(_section_title_style())
        f_layout.addWidget(t)
        frame.setLayout(f_layout)
        return frame, f_layout

    def set_base_values(self, values: dict[str, float]):
        self.base_values = dict(values)
        self._update_comparison()

    def _on_equip_dropped(self, item_id: str):
        sender = self.sender()
        if not isinstance(sender, DropArea):
            return
        slot_name = sender.slot_name

        preview = self._find_preview()
        if not preview:
            return

        item = preview.equip_list.get_item(item_id)
        if not item:
            return

        if item.slot != slot_name:
            QMessageBox.warning(self, "错误", f"{item.name} 不能放置到 {slot_name}！")
            return

        self.equipped[slot_name] = item
        sender.set_equipped_item(item)
        self._update_comparison()

    def _on_buff_dropped(self, item_id: str):
        preview = self._find_preview()
        if not preview:
            return

        item = preview.buff_list.get_item(item_id)
        if not item:
            return

        # 添加到激活的Buff列表（允许重复）
        self.active_buffs.append(item)
        self._add_buff_card(item)
        self._update_comparison()

    def _add_buff_card(self, item: DataItem):
        """在Buff槽面板中添加一张Buff卡片"""
        card = QFrame()
        rarity_color = DataItem._rarity_color(item.rarity)
        card.setFixedHeight(40)
        card.setStyleSheet(f"""
            QFrame {{
                background-color: {theme_color('input_bg')};
                border: 1px solid {theme_color('border')};
                border-radius: 3px;
            }}
            QFrame:hover {{ background-color: {theme_color('accent_light')}; }}
        f""")

        hbox = QHBoxLayout(card)
        hbox.setContentsMargins(8, 4, 20, 4)
        hbox.setSpacing(6)

        name_label = QLabel(item.name)
        name_label.setStyleSheet(f"QLabel {{ color: {rarity_color}; font-weight: bold; font-size: 11px; }}")
        name_label.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)
        hbox.addWidget(name_label)

        slot_label = QLabel(f"·{item.slot}")
        slot_label.setStyleSheet(f"QLabel {{ color: {theme_color('hint')}; font-size: 10px; }}")
        slot_label.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)
        hbox.addWidget(slot_label)

        bonus_parts = []
        for attr_name, val in item.bonuses.items():
            if val != 0:
                cn_name = translate_attr_name(attr_name)
                sign = "+" if val > 0 else ""
                bonus_parts.append(f"{cn_name}{sign}{val:.0f}")

        if bonus_parts:
            bonus_text = "  ".join(bonus_parts[:3])
            bonus_label = QLabel(bonus_text)
            bonus_label.setStyleSheet(f"QLabel {{ color: {theme_color('accent')}; font-size: 9px; }}")
            bonus_label.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)
        else:
            bonus_label = QLabel("")
            bonus_label.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)

        hbox.addStretch()
        hbox.addWidget(bonus_label)

        del_btn = QPushButton("✕")
        del_btn.setParent(card)
        del_btn.setGeometry(card.width() - 18, 2, 16, 16)
        del_btn.setStyleSheet(f"""
            QPushButton {{ background: transparent; color: {theme_color('disabled_fg')}; border: none; font-size: 10px; }}
            QPushButton:hover {{ color: {theme_color('danger')}; }}
        """)
        del_btn.clicked.connect(lambda checked, idx=len(self.active_buffs)-1: self._remove_buff(idx))
        del_btn.show()

        # 插入到stretch之前
        self.buff_container_layout.insertWidget(self.buff_container_layout.count() - 1, card)

    def _remove_buff(self, index: int):
        """移除指定索引的Buff"""
        if 0 <= index < len(self.active_buffs):
            self.active_buffs.pop(index)
            self._refresh_buff_display()
            self._update_comparison()

    def _refresh_buff_display(self):
        """刷新Buff显示"""
        while self.buff_container_layout.count() > 1:
            child = self.buff_container_layout.takeAt(0)
            if child.widget():
                child.widget().deleteLater()

        for buff in self.active_buffs:
            self._add_buff_card(buff)

    def _find_preview(self):
        """向上查找 EquipmentPreviewWidget"""
        preview = self.parent()
        while preview and type(preview).__name__ != 'EquipmentPreviewWidget':
            preview = preview.parent()
        return preview

    def _on_equip_removed(self):
        sender = self.sender()
        if not isinstance(sender, DropArea):
            return
        slot_name = sender.slot_name
        if slot_name in self.equipped:
            del self.equipped[slot_name]
        self._update_comparison()

    def _update_comparison(self):
        if not hasattr(self, 'base_values') or not self.base_values:
            return

        enhanced = dict(self.base_values)
        for item in self.equipped.values():
            for attr_name, bonus in item.bonuses.items():
                enhanced[attr_name] = enhanced.get(attr_name, 0) + bonus
            for attr_name, pct in item.percentage_bonuses.items():
                enhanced[attr_name] = enhanced.get(attr_name, 0) * (1 + pct / 100.0)

        try:
            base_results = self.attr_system.calculate_all(self.base_values)
            enhanced_results = self.attr_system.calculate_all(enhanced)
        except Exception:
            self.logger.warning("装备数据校验失败")
            return

        all_attrs = (self.attr_system.base_attributes +
                     self.attr_system.derived_attributes +
                     self.attr_system.combat_attributes)
        for attr_name in all_attrs:
            if attr_name not in self.compare_labels:
                continue
            base_val = base_results.get(attr_name, 0)
            final_val = enhanced_results.get(attr_name, 0)
            diff = final_val - base_val

            b = f"{base_val:.0f}" if base_val == int(base_val) else f"{base_val:.1f}"
            f = f"{final_val:.0f}" if final_val == int(final_val) else f"{final_val:.1f}"
            self.compare_labels[attr_name]["base"].setText(b)
            self.compare_labels[attr_name]["final"].setText(f)

            if diff > 0:
                d = f"+{diff:.0f}" if diff == int(diff) else f"+{diff:.1f}"
                self.compare_labels[attr_name]["diff"].setText(d)
                self.compare_labels[attr_name]["diff"].setStyleSheet(_diff_label_positive_style())
            elif diff < 0:
                d = f"{diff:.0f}" if diff == int(diff) else f"{diff:.1f}"
                self.compare_labels[attr_name]["diff"].setText(d)
                self.compare_labels[attr_name]["diff"].setStyleSheet(f"QLabel {{ color: {theme_color('danger')}; font-size: 11px; font-weight: bold; font-family: Consolas; }}")
            else:
                self.compare_labels[attr_name]["diff"].setText("0")
                self.compare_labels[attr_name]["diff"].setStyleSheet(_diff_label_default_style())


class EquipmentPreviewWidget(QWidget):
    """
    装备/Buff预览主窗口
    左侧: 数据列表（装备/Buff）
    右侧: 检查器面板（放置槽 + 属性对比）
    """
    def __init__(self, attr_system: AttributeSystem, parent=None):
        super().__init__(parent)
        self.attr_system = attr_system

        layout = QVBoxLayout(self)
        layout.setContentsMargins(6, 6, 6, 6)
        layout.setSpacing(6)

        title = QLabel("装备/Buff预览 - 拖拽数据到右侧检查器")
        title.setStyleSheet(f"QLabel {{ color: {theme_color('secondary_fg')}; font-size: 13px; font-weight: bold; }}")
        layout.addWidget(title)

        content = QHBoxLayout()
        content.setContentsMargins(0, 0, 0, 0)
        content.setSpacing(6)

        # 左侧：数据列表（支持装备和Buff标签页）
        left_frame = QFrame()
        left_frame.setFrameShape(QFrame.Shape.StyledPanel)
        left_frame.setStyleSheet(_frame_border_style())
        left_layout = QVBoxLayout(left_frame)
        left_layout.setContentsMargins(4, 4, 4, 4)
        left_layout.setSpacing(4)

        self.tab_widget = QTabWidget()
        self.tab_widget.setStyleSheet(f"""
            QTabWidget::pane {{ border: none; }}
            QTabBar::tab {{
                padding: 4px 12px;
                margin-right: 2px;
                border: 1px solid {theme_color('border')};
                border-bottom: none;
                border-top-left-radius: 3px;
                border-top-right-radius: 3px;
                background-color: {theme_color('input_bg')};
                font-size: 11px;
            }}
            QTabBar::tab:selected {{
                background-color: {theme_color('bg')};
                font-weight: bold;
            }}
        """)

        self.equip_list = DataListWidget(self.attr_system, "equip")
        self.tab_widget.addTab(self.equip_list, "⚔ 装备")

        self.buff_list = DataListWidget(self.attr_system, "buff")
        self.tab_widget.addTab(self.buff_list, "🛡 Buff")

        left_layout.addWidget(self.tab_widget)
        content.addWidget(left_frame, stretch=45)

        # 右侧：检查器面板
        right_frame = QFrame()
        right_frame.setFrameShape(QFrame.Shape.StyledPanel)
        right_frame.setStyleSheet(_frame_border_style())
        right_layout = QVBoxLayout(right_frame)
        right_layout.setContentsMargins(4, 4, 4, 4)
        right_layout.setSpacing(4)

        self.inspector = InspectorPanel(self.attr_system)
        right_layout.addWidget(self.inspector)
        content.addWidget(right_frame, stretch=55)

        layout.addLayout(content)

    def set_base_values(self, values: dict[str, float]):
        self.inspector.set_base_values(values)

    def load_from_library(self, equips_data: list[dict] = None, buffs_data: list[dict] = None):
        """从库数据加载装备和Buff
        
        Args:
            equips_data: 库中的 equips 数组（data.json 格式）
            buffs_data: 库中的 buffs 数组（data.json 格式）
        """
        # 清空现有数据
        self.equip_list.items.clear()
        self.buff_list.items.clear()

        if equips_data:
            for equip_data in equips_data:
                item = self._equip_dict_to_data_item(equip_data)
                if item:
                    self.equip_list.items.append(item)
            self.equip_list._refresh_list()

        if buffs_data:
            for buff_data in buffs_data:
                item = self._buff_dict_to_data_item(buff_data)
                if item:
                    self.buff_list.items.append(item)
            self.buff_list._refresh_list()

    def _equip_dict_to_data_item(self, data: dict) -> DataItem:
        """将库中的装备数据转换为 DataItem"""
        bonuses = {}
        pct_bonuses = {}

        # 基础属性加成（从 base_attrs）
        base_attrs = data.get("base_attrs", {})
        if isinstance(base_attrs, dict):
            for attr_name, val in base_attrs.items():
                try:
                    bonuses[attr_name] = float(val)
                except (ValueError, TypeError) as e:
                    logger.debug(f"操作失败: {e}")

        # 额外属性加成（从 extra_attrs）
        extra_attrs = data.get("extra_attrs", {})
        if isinstance(extra_attrs, dict):
            for attr_name, val in extra_attrs.items():
                try:
                    bonuses[attr_name] = float(val)
                except (ValueError, TypeError) as e:
                    logger.debug(f"操作失败: {e}")

        return DataItem(
            item_id=data.get("id", f"equip_{len(self.equip_list.items)}"),
            name=data.get("name", "未命名装备"),
            slot=data.get("part", "饰品"),
            bonuses=bonuses,
            percentage_bonuses=pct_bonuses,
            rarity=data.get("rarity", data.get("rare", "普通")),
            desc=data.get("desc", ""),
        )

    def _buff_dict_to_data_item(self, data: dict) -> DataItem:
        """将库中的Buff数据转换为 DataItem"""
        bonuses = {}
        pct_bonuses = {}

        # Buff 数值作为固定加成
        value = data.get("value", 0)
        effect_type = data.get("effect_type", "")

        if value != 0:
            # 根据效果类型映射到属性
            attr_mapping = {
                "属性提升": "力量",
                "属性降低": "力量",
                "持续伤害": "物攻",
                "持续治疗": "体质",
                "护盾": "体质",
                "加速": "敏捷",
                "减速": "敏捷",
            }
            attr_name = attr_mapping.get(effect_type, "力量")
            bonuses[attr_name] = float(value)

        return DataItem(
            item_id=data.get("id", f"buff_{len(self.buff_list.items)}"),
            name=data.get("name", "未命名Buff"),
            slot=data.get("type", "增益"),
            bonuses=bonuses,
            percentage_bonuses=pct_bonuses,
            rarity="普通",
            desc=data.get("desc", ""),
        )
