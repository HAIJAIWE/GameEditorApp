"""实时属性预览窗口 - 滑块控制 + 自动计算"""
from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtWidgets import (
    QDoubleSpinBox,
    QFrame,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QScrollArea,
    QSlider,
    QSpinBox,
    QVBoxLayout,
    QWidget,
)

from core.attr_system import AttributeSystem, AttrType
from core.buff_system import BuffSystem
from core.equipment_system import EquipmentSystem
from ui.themes import theme_color


class LivePreviewWidget(QWidget):
    """
    实时属性预览窗口

    功能：
    1. 显示所有基础属性的当前值（滑块控制）
    2. 自动计算所有派生/战斗属性
    3. 显示计算公式和计算过程
    4. 支持等级、装备和Buff加成预览
    5. 支持重置数值
    """

    # 信号：当预览数据变化时发出
    preview_changed = pyqtSignal(dict)  # 发送 {attr_name: value, ...}

    def __init__(self, attr_system: AttributeSystem, parent=None):
        super().__init__(parent)
        self.attr_system = attr_system
        self.sliders = {}
        self.result_labels = {}
        self.process_text = None

        # 装备和Buff系统
        self.equipment = EquipmentSystem()
        self.buff_system = BuffSystem()
        self.level = 1

        self._setup_ui()
        self._update_preview()

    def _setup_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # 使用滚动区域包裹所有内容
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        scroll.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        scroll.setStyleSheet("""
            QScrollArea {
                border: none;
                background-color: transparent;
            }
        """)

        content_widget = QWidget()
        content_layout = QVBoxLayout(content_widget)
        content_layout.setSpacing(12)

        # === 1. 基础属性滑块区 ===
        base_frame = self._create_section_frame(" 基础属性（拖拽滑块调整数值）")
        base_layout = QVBoxLayout(base_frame)
        base_layout.setSpacing(8)

        for attr_name in self.attr_system.base_attributes:
            attr = self.attr_system.attributes[attr_name]
            slider_row = self._create_slider_row(attr_name, attr)
            base_layout.addWidget(slider_row)

        content_layout.addWidget(base_frame)

        # === 1.5 等级、装备、Buff设置区 ===
        bonus_frame = self._create_section_frame("⚡ 外部加成预览（等级/装备/Buff）")
        bonus_layout = QVBoxLayout(bonus_frame)
        bonus_layout.setSpacing(10)

        # 等级设置
        level_row = QHBoxLayout()
        level_row.addWidget(QLabel("等级:"))
        self.level_spin = QSpinBox()
        self.level_spin.setRange(1, 200)
        self.level_spin.setValue(1)
        self.level_spin.valueChanged.connect(self._on_bonus_changed)
        level_row.addWidget(self.level_spin)
        level_row.addStretch()
        bonus_layout.addLayout(level_row)

        # 装备加成设置（简化版：直接设置固定加成）
        equip_label = QLabel("装备加成 (力量+X, 智力+X, 敏捷+X, 体质+X):")
        equip_label.setStyleSheet(f"QLabel {{ color: {theme_color('hint')}; font-size: 11px; }}")
        bonus_layout.addWidget(equip_label)

        equip_layout = QHBoxLayout()
        self.equip_bonuses = {}
        for attr_name in self.attr_system.base_attributes:
            attr = self.attr_system.attributes[attr_name]
            row = QHBoxLayout()
            row.addWidget(QLabel(f"{attr.display_name}:"))
            spin = QSpinBox()
            spin.setRange(0, 10000)
            spin.setValue(0)
            spin.valueChanged.connect(self._on_bonus_changed)
            row.addWidget(spin)
            equip_layout.addLayout(row)
            self.equip_bonuses[attr_name] = spin
        bonus_layout.addLayout(equip_layout)

        # Buff加成设置
        buff_label = QLabel("Buff加成 (百分比%):")
        buff_label.setStyleSheet(f"QLabel {{ color: {theme_color('hint')}; font-size: 11px; }}")
        bonus_layout.addWidget(buff_label)

        buff_layout = QHBoxLayout()
        self.buff_bonuses = {}
        for attr_name in self.attr_system.base_attributes:
            attr = self.attr_system.attributes[attr_name]
            row = QHBoxLayout()
            row.addWidget(QLabel(f"{attr.display_name}:"))
            spin = QDoubleSpinBox()
            spin.setRange(0, 500)
            spin.setValue(0)
            spin.setDecimals(1)
            spin.valueChanged.connect(self._on_bonus_changed)
            row.addWidget(spin)
            buff_layout.addLayout(row)
            self.buff_bonuses[attr_name] = spin
        bonus_layout.addLayout(buff_layout)

        content_layout.addWidget(bonus_frame)

        # === 2. 计算结果区 ===
        result_frame = self._create_section_frame("📊 派生属性计算结果")
        result_layout = QVBoxLayout(result_frame)
        result_layout.setSpacing(4)

        # 派生属性
        derived_label = QLabel("【派生属性】")
        derived_label.setStyleSheet(f"QLabel {{ color: {theme_color('hint')}; font-size: 11px; font-weight: bold; }}")
        result_layout.addWidget(derived_label)

        for attr_name in self.attr_system.derived_attributes:
            attr = self.attr_system.attributes[attr_name]
            label = self._create_result_label(attr_name, attr)
            result_layout.addWidget(label)
            self.result_labels[attr_name] = label

        # 战斗属性
        if self.attr_system.combat_attributes:
            combat_label = QLabel("【战斗属性】")
            combat_label.setStyleSheet(f"QLabel {{ color: {theme_color('hint')}; font-size: 11px; font-weight: bold; margin-top: 8px; }}")
            result_layout.addWidget(combat_label)

            for attr_name in self.attr_system.combat_attributes:
                attr = self.attr_system.attributes[attr_name]
                label = self._create_result_label(attr_name, attr)
                result_layout.addWidget(label)
                self.result_labels[attr_name] = label

        content_layout.addWidget(result_frame)

        # === 3. 公式展开区 ===
        formula_frame = self._create_section_frame("📋 计算过程")
        formula_layout = QVBoxLayout(formula_frame)
        formula_layout.setSpacing(2)

        self.process_text = QLabel("")
        self.process_text.setStyleSheet(f"""
            QLabel {{
                color: {theme_color('fg')};
                font-family: 'Consolas', monospace;
                font-size: 11px;
                padding: 6px;
                background-color: {theme_color('input_bg')};
                border-radius: 4px;
                border: 1px solid {theme_color('border')};
            }}
        """)
        self.process_text.setWordWrap(True)
        formula_layout.addWidget(self.process_text)

        content_layout.addWidget(formula_frame)

        # === 4. 操作按钮 ===
        btn_layout = QHBoxLayout()

        reset_btn = QPushButton("🔄 重置数值")
        reset_btn.setStyleSheet(f"""
            QPushButton {{
                background-color: {theme_color('input_bg')};
                color: {theme_color('fg')};
                border: 1px solid {theme_color('scroll')};
                border-radius: 4px;
                padding: 6px 16px;
                font-weight: bold;
            }}
            QPushButton:hover {{
                background-color: {theme_color('border')};
            }}
        """)
        reset_btn.clicked.connect(self._on_reset)
        btn_layout.addWidget(reset_btn)

        btn_layout.addStretch()
        content_layout.addLayout(btn_layout)

        content_layout.addStretch()

        scroll.setWidget(content_widget)
        layout.addWidget(scroll)

    def _create_section_frame(self, title: str) -> QFrame:
        """创建带标题的分区框架"""
        frame = QFrame()
        frame.setStyleSheet(f"""
            QFrame {{
                background-color: {theme_color('bg')};
                border: 1px solid {theme_color('border')};
                border-radius: 6px;
            }}
        """)

        layout = QVBoxLayout(frame)
        layout.setContentsMargins(10, 8, 10, 8)
        layout.setSpacing(4)

        title_label = QLabel(title)
        title_label.setStyleSheet(f"QLabel {{ color: {theme_color('secondary_fg')}; font-size: 13px; font-weight: bold; }}")
        layout.addWidget(title_label)

        return frame

    def _create_slider_row(self, attr_name: str, attr) -> QWidget:
        """创建滑块行"""
        row = QFrame()
        row.setStyleSheet("QFrame { background: transparent; }")
        row_layout = QHBoxLayout(row)
        row_layout.setContentsMargins(0, 2, 0, 2)
        row_layout.setSpacing(8)

        # 属性名称
        name_label = QLabel(f"{attr.display_name}:")
        name_label.setStyleSheet(f"QLabel {{ color: {theme_color('fg')}; font-weight: bold; min-width: 60px; }}")
        row_layout.addWidget(name_label)

        # 滑块
        slider = QSlider(Qt.Orientation.Horizontal)
        slider.setRange(int(attr.min_value), int(attr.max_value or 99999))
        slider.setValue(int(attr.default_value))
        slider.setMinimumWidth(150)
        slider.setMaximumWidth(300)
        slider.setStyleSheet(f"""
            QSlider::groove:horizontal {{
                height: 8px;
                background: {theme_color('border')};
                border-radius: 4px;
            }}
            QSlider::handle:horizontal {{
                width: 18px;
                height: 18px;
                margin: -5px 0;
                background: {theme_color('accent')};
                border-radius: 9px;
                border: 2px solid {theme_color('accent_hover')};
            }}
            QSlider::handle:horizontal:hover {{
                background: {theme_color('accent_hover')};
            }}
        """)
        slider.valueChanged.connect(self._on_slider_changed)
        row_layout.addWidget(slider)
        self.sliders[attr_name] = slider

        # 当前值显示
        value_label = QLabel(str(int(attr.default_value)))
        value_label.setStyleSheet(f"QLabel {{ color: {theme_color('accent')}; font-family: Consolas; font-weight: bold; font-size: 14px; min-width: 40px; }}")
        value_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        row_layout.addWidget(value_label)
        slider._value_label = value_label

        return row

    def _create_result_label(self, attr_name: str, attr) -> QLabel:
        """创建结果标签"""
        label = QLabel(f"{attr.display_name}: 0")
        label.setStyleSheet(f"""
            QLabel {{
                color: {theme_color('fg')};
                padding: 3px 8px;
                background-color: {theme_color('accent_light')};
                border-radius: 4px;
                font-size: 12px;
            }}
        """)
        return label

    def _on_bonus_changed(self):
        """加成值变化时重新计算"""
        self._update_preview()

    def _on_slider_changed(self):
        """滑块值变化时重新计算"""
        self._update_preview()

    def _get_base_values(self) -> dict[str, float]:
        """获取当前基础属性值（供装备预览使用）"""
        values = {}
        for attr_name, slider in self.sliders.items():
            values[attr_name] = float(slider.value())
        return values

    def _on_reset(self):
        """重置所有基础属性为默认值"""
        for attr_name, slider in self.sliders.items():
            attr = self.attr_system.attributes.get(attr_name)
            if attr:
                slider.setValue(int(attr.default_value))

        # 重置加成设置
        self.level_spin.setValue(1)
        for spin in self.equip_bonuses.values():
            spin.setValue(0)
        for spin in self.buff_bonuses.values():
            spin.setValue(0)

        self._update_preview()

    def _update_preview(self):
        """更新预览显示"""
        # 1. 收集当前基础属性值
        base_values = {}
        for attr_name, slider in self.sliders.items():
            value = slider.value()
            base_values[attr_name] = float(value)

            # 更新滑块旁的数值显示
            value_label = getattr(slider, "_value_label", None)
            if value_label:
                value_label.setText(str(value))

        # 1.5 应用等级、装备和Buff加成
        self.level = self.level_spin.value()

        # 装备固定加成
        for attr_name, spin in self.equip_bonuses.items():
            bonus = spin.value()
            if bonus > 0:
                base_values[attr_name] = base_values.get(attr_name, 0) + bonus

        # Buff百分比加成
        for attr_name, spin in self.buff_bonuses.items():
            pct = spin.value()
            if pct > 0:
                base_values[attr_name] = base_values.get(attr_name, 0) * (1 + pct / 100.0)

        # 2. 计算所有派生属性
        try:
            results = self.attr_system.calculate_all(base_values)
        except Exception:
            return

        # 3. 更新结果显示
        for attr_name, label in self.result_labels.items():
            value = results.get(attr_name, 0)
            attr = self.attr_system.attributes.get(attr_name)

            # 格式化显示
            if value == int(value):
                value_str = str(int(value))
            else:
                value_str = f"{value:.1f}"

            label.setText(f"{attr.display_name}: {value_str}")

            # 根据属性类型设置颜色
            if attr.attr_type == AttrType.COMBAT:
                label.setStyleSheet(f"""
                    QLabel {{
                        color: {theme_color('accent')};
                        padding: 3px 8px;
                        background-color: {theme_color('accent_bg')};
                        border-radius: 4px;
                        font-size: 12px;
                        font-weight: bold;
                    }}
                """)
            else:
                label.setStyleSheet(f"""
                    QLabel {{
                        color: {theme_color('accent_active')};
                        padding: 3px 8px;
                        background-color: {theme_color('bg')};
                        border-radius: 4px;
                        font-size: 12px;
                        font-weight: bold;
                    }}
                """)

        # 4. 更新计算过程
        process_lines = []
        process_lines.append("─── 基础属性 ───")
        for attr_name in self.attr_system.base_attributes:
            attr = self.attr_system.attributes[attr_name]
            process_lines.append(f"  {attr.display_name} = {int(base_values.get(attr_name, 0))}")

        # 显示加成信息
        has_bonus = False
        if self.level > 1:
            process_lines.append(f"\n─── 等级加成 (Lv.{self.level}) ───")
            has_bonus = True
        if any(spin.value() > 0 for spin in self.equip_bonuses.values()):
            process_lines.append("\n─── 装备加成 ───")
            for attr_name, spin in self.equip_bonuses.items():
                if spin.value() > 0:
                    attr = self.attr_system.attributes.get(attr_name)
                    process_lines.append(f"  {attr.display_name} +{spin.value()}")
            has_bonus = True
        if any(spin.value() > 0 for spin in self.buff_bonuses.values()):
            process_lines.append("\n─── Buff加成 ───")
            for attr_name, spin in self.buff_bonuses.items():
                if spin.value() > 0:
                    attr = self.attr_system.attributes.get(attr_name)
                    process_lines.append(f"  {attr.display_name} +{spin.value()}%")
            has_bonus = True

        if has_bonus:
            process_lines.append("")

        process_lines.append("─── 派生属性 ───")
        for attr_name in self.attr_system.derived_attributes + self.attr_system.combat_attributes:
            attr = self.attr_system.attributes.get(attr_name)
            if not attr:
                continue
            value = results.get(attr_name, 0)
            formula_str = attr.formula.to_string(attr.display_name)
            process_lines.append(f"  {formula_str}")
            process_lines.append(f"    → {value:.1f}")

        self.process_text.setText("\n".join(process_lines))

        # 5. 发出信号
        self.preview_changed.emit(results)

    def get_current_values(self) -> dict[str, float]:
        """获取当前所有属性值"""
        base_values = {}
        for attr_name, slider in self.sliders.items():
            base_values[attr_name] = float(slider.value())

        try:
            return self.attr_system.calculate_all(base_values)
        except Exception:
            return base_values

    def set_base_values(self, values: dict[str, float]):
        """设置基础属性值（用于加载存档）"""
        for attr_name, value in values.items():
            if attr_name in self.sliders:
                self.sliders[attr_name].setValue(int(value))
        self._update_preview()
