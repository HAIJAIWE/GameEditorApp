"""RPG属性系统 - 可视化公式编辑器（系数配置版）"""
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QColor, QFont
from PyQt6.QtWidgets import (
    QDialog,
    QDoubleSpinBox,
    QFrame,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QPushButton,
    QTableWidget,
    QTableWidgetItem,
    QVBoxLayout,
)

from ui.dialogs.auto_input_dialog import show_text_input_dialog
from ui.themes import theme_color


class FormulaBuilderDialog(QDialog):
    """公式构建器对话框 - 可视化设置属性关系"""

    @property
    def _STYLE_VALUE_SPIN(self):
        return f"""
        QDoubleSpinBox {{
            background: white;
            border: 1px solid {theme_color('border')};
            border-radius: 4px;
            padding: 4px;
            font-family: 'Consolas', monospace;
            font-size: 14px;
            color: {theme_color('fg')};
        }}
        QDoubleSpinBox:focus {{
            border-color: {theme_color('accent')};
        }}
        QDoubleSpinBox::up-button, QDoubleSpinBox::down-button {{
            background-color: {theme_color('accent_light')};
            border: none;
            width: 18px;
        }}
        QDoubleSpinBox::up-button:hover, QDoubleSpinBox::down-button:hover {{
            background-color: {theme_color('border')};
        }}
    """

    @property
    def _STYLE_TABLE(self):
        return f"""
        QTableWidget {{
            background-color: {theme_color('input_bg')};
            border: 1px solid {theme_color('border')};
            border-radius: 4px;
            gridline-color: {theme_color('divider')};
            font-size: 14px;
        }}
        QHeaderView::section {{
            background-color: {theme_color('bg')};
            color: {theme_color('secondary_fg')};
            padding: 8px;
            border: 1px solid {theme_color('border')};
            font-weight: bold;
            font-size: 13px;
        }}
        QTableWidget::item {{
            padding: 4px;
        }}
    """

    @property
    def _STYLE_ACTION_BTN(self):
        return """
        QPushButton {
            color: white;
            border: none;
            border-radius: 4px;
            padding: 8px 20px;
            font-weight: bold;
        }
    """

    @property
    def _STYLE_TREE(self):
        return f"""
        QTreeWidget {{
            border: 1px solid {theme_color('border')};
            border-radius: 4px;
            font-size: 13px;
        }}
        QTreeWidget::item {{
            padding: 4px;
        }}
        QTreeWidget::item:hover {{
            background-color: {theme_color('accent_bg')};
        }}
        QTreeWidget::item:selected {{
            background-color: {theme_color('accent')};
            color: white;
        }}
    """

    @property
    def _STYLE_OP_BTN(self):
        return f"""
        QPushButton {{
            background-color: {theme_color('accent')};
            color: white;
            border: none;
            border-radius: 4px;
            font-size: 16px;
            font-weight: bold;
        }}
        QPushButton:hover {{
            background-color: {theme_color('accent_hover')};
        }}
    """

    @property
    def _STYLE_NUM_BTN(self):
        return f"""
        QPushButton {{
            background-color: {theme_color('accent')};
            color: white;
            border: none;
            border-radius: 4px;
            padding: 4px 12px;
            font-weight: bold;
        }}
        QPushButton:hover {{
            background-color: {theme_color('accent_hover')};
        }}
    """

    @property
    def _STYLE_TEMPLATE_BTN(self):
        return f"""
        QPushButton {{
            background-color: {theme_color('accent_bg')};
            border: 1px solid {theme_color('border')};
            border-radius: 4px;
            padding: 4px 8px;
        }}
        QPushButton:hover {{
            background-color: {theme_color('accent_light')};
        }}
    """

    # 基础属性
    BASE_ATTRS = ["力量", "智力", "敏捷", "体质"]

    # 基础属性对派生属性的默认影响系数
    BASE_ATTR_EFFECTS = {
        "HP": {"力量": 10, "体质": 20, "敏捷": 5},
        "MP": {"智力": 15, "体质": 5},
        "物攻": {"力量": 2, "敏捷": 1},
        "物防": {"力量": 0.5, "敏捷": 0.5, "体质": 2},
        "魔攻": {"智力": 3},
        "魔防": {"智力": 1, "体质": 1},
        "速度": {"敏捷": 2},
        "暴击率": {"敏捷": 0.4},
        "暴击伤害": {"敏捷": 0.5},
        "命中率": {"敏捷": 0.3},
        "闪避率": {"敏捷": 0.4},
        "回血/回合": {},
        "回蓝/回合": {},
        "经验值": {},
        "金钱倍率": {},
        "掉落稀有倍率": {},
    }

    def __init__(self, available_attrs: list[str], current_formula: str = "", parent=None, current_attr: str = ""):
        super().__init__(parent)
        self.available_attrs = available_attrs
        self.current_formula = current_formula
        self.current_attr = current_attr  # 当前正在编辑的派生属性名
        self.coeff_spins: dict[str, QDoubleSpinBox] = {}
        self.formula_display = None
        self.formula_preview = None
        self.desc_label = None
        # 基础属性列表（可自定义）
        self.base_attrs = list(self.BASE_ATTRS)
        self._setup_ui()

    def _setup_ui(self):
        self.setWindowTitle(f"公式编辑器 - {self.current_attr}")
        self.setMinimumWidth(550)
        self.setMinimumHeight(500)

        layout = QVBoxLayout(self)
        layout.setSpacing(10)

        # 顶部：公式预览
        formula_frame = QFrame()
        formula_frame.setStyleSheet(f"""
            QFrame {{
                background-color: {theme_color('bg')};
                border: 1px solid {theme_color('border')};
                border-radius: 6px;
            }}
        """)
        formula_layout = QHBoxLayout(formula_frame)
        formula_layout.setContentsMargins(10, 8, 10, 8)

        formula_layout.addWidget(QLabel(f"📐 <b>{self.current_attr}</b> = "))
        self.formula_preview = QLabel("=力量*10+体质*20")
        self.formula_preview.setStyleSheet(f"QLabel {{ color: {theme_color('accent')}; font-family: Consolas; font-size: 16px; font-weight: bold; }}")
        formula_layout.addWidget(self.formula_preview)
        formula_layout.addStretch()
        layout.addWidget(formula_frame)

        # 基础属性管理区域
        attr_mgr_frame = QFrame()
        attr_mgr_frame.setStyleSheet(f"""
            QFrame {{
                background-color: {theme_color('bg')};
                border: 1px solid {theme_color('border')};
                border-radius: 6px;
            }}
        """)
        attr_mgr_layout = QVBoxLayout(attr_mgr_frame)
        attr_mgr_layout.setContentsMargins(10, 8, 10, 8)
        attr_mgr_layout.setSpacing(6)

        # 标题行
        title_layout = QHBoxLayout()
        title_layout.addWidget(QLabel("<b>🔧 基础属性管理</b>"))
        title_layout.addStretch()

        add_attr_btn = QPushButton("+ 添加属性")
        add_attr_btn.setStyleSheet(f"""
            QPushButton {{
                background-color: {theme_color('accent')};
                color: white;
                border: none;
                border-radius: 4px;
                padding: 4px 12px;
                font-weight: bold;
                font-size: 12px;
            }}
            QPushButton:hover {{
                background-color: {theme_color('accent_hover')};
            }}
        """)
        add_attr_btn.clicked.connect(self._on_add_base_attr)
        title_layout.addWidget(add_attr_btn)
        attr_mgr_layout.addLayout(title_layout)

        # 属性标签列表
        self.attr_tags_layout = QHBoxLayout()
        self.attr_tags_layout.setSpacing(4)
        self._refresh_attr_tags()
        attr_mgr_layout.addLayout(self.attr_tags_layout)

        layout.addWidget(attr_mgr_frame)

        # 提示文字
        hint = QLabel(f'💡 在表格中设置系数，例如：设置"力量=10"表示 1点力量增加10点{self.current_attr}')
        hint.setStyleSheet(f"""
            QLabel {{
                color: {theme_color('hint')};
                font-size: 12px;
                padding: 6px 10px;
                background-color: {theme_color('bg')};
                border-radius: 4px;
                border: 1px solid {theme_color('border')};
            }}
        """)
        layout.addWidget(hint)

        # 创建系数表格
        self.coeff_table = QTableWidget()
        self.coeff_table.setStyleSheet(self._STYLE_TABLE)
        self.coeff_table.setColumnCount(2)
        self.coeff_table.setHorizontalHeaderLabels(["基础属性", "系数 (每点增加的值)"])
        self.coeff_table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        self.coeff_table.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        self.coeff_table.verticalHeader().setVisible(False)

        self._refresh_coeff_table()

        self.coeff_table.setMinimumHeight(220)
        layout.addWidget(self.coeff_table)

        # 公式说明文字
        self.desc_label = QLabel("")
        self.desc_label.setStyleSheet(f"""
            QLabel {{
                color: {theme_color('hint')};
                font-size: 12px;
                padding: 6px 10px;
            }}
        """)
        layout.addWidget(self.desc_label)

        # 底部按钮
        self._add_action_buttons(layout)

        # 初始化公式显示
        self._update_formula_from_coeffs()

    def _refresh_attr_tags(self):
        """刷新属性标签显示"""
        # 清空现有标签
        while self.attr_tags_layout.count():
            item = self.attr_tags_layout.takeAt(0)
            if item.widget():
                item.widget().deleteLater()

        for attr in self.base_attrs:
            tag_frame = QFrame()
            tag_frame.setStyleSheet(f"""
                QFrame {{
                    background-color: {theme_color('input_bg')};
                    border: 1px solid {theme_color('scroll')};
                    border-radius: 12px;
                }}
            """)
            tag_layout = QHBoxLayout(tag_frame)
            tag_layout.setContentsMargins(8, 3, 4, 3)
            tag_layout.setSpacing(4)

            label = QLabel(attr)
            label.setStyleSheet(f"QLabel {{ color: {theme_color('fg')}; font-size: 12px; }}")
            tag_layout.addWidget(label)

            # 删除按钮
            del_btn = QPushButton("×")
            del_btn.setFixedSize(16, 16)
            del_btn.setStyleSheet(f"""
                QPushButton {{
                    background-color: transparent;
                    border: none;
                    color: {theme_color('hint')};
                    font-size: 14px;
                    font-weight: bold;
                    padding: 0;
                }}
                QPushButton:hover {{
                    color: {theme_color('danger')};
                }}
            """)
            del_btn.clicked.connect(lambda checked, a=attr: self._on_remove_base_attr(a))
            tag_layout.addWidget(del_btn)

            self.attr_tags_layout.addWidget(tag_frame)

        self.attr_tags_layout.addStretch()

    def _on_add_base_attr(self):
        """添加新的基础属性"""
        name, ok = show_text_input_dialog(self, "添加基础属性", "请输入属性名称:")
        if ok and name.strip():
            new_name = name.strip()
            if new_name in self.base_attrs:
                from PyQt6.QtWidgets import QMessageBox
                QMessageBox.warning(self, '提示', f'属性"{new_name}"已存在')
                return
            self.base_attrs.append(new_name)
            self._refresh_attr_tags()
            self._refresh_coeff_table()
            self._update_formula_from_coeffs()

    def _on_remove_base_attr(self, attr_name: str):
        """删除基础属性"""
        if len(self.base_attrs) <= 1:
            from PyQt6.QtWidgets import QMessageBox
            QMessageBox.warning(self, "提示", "至少需要保留一个基础属性")
            return

        self.base_attrs.remove(attr_name)
        if attr_name in self.coeff_spins:
            del self.coeff_spins[attr_name]
        self._refresh_attr_tags()
        self._refresh_coeff_table()
        self._update_formula_from_coeffs()

    def _refresh_coeff_table(self):
        """刷新系数表格"""
        self.coeff_table.clear()
        self.coeff_table.setRowCount(0)
        self.coeff_spins: dict[str, QDoubleSpinBox] = {}

        default_coeffs = self.BASE_ATTR_EFFECTS.get(self.current_attr, {})

        for row_idx, base_attr in enumerate(self.base_attrs):
            self.coeff_table.insertRow(row_idx)

            # 属性名称
            name_item = QTableWidgetItem(base_attr)
            name_item.setFlags(name_item.flags() & ~Qt.ItemFlag.ItemIsEditable)
            name_item.setForeground(QColor(theme_color('fg')))
            name_item.setFont(QFont("Microsoft YaHei", 12, QFont.Weight.Bold))
            self.coeff_table.setItem(row_idx, 0, name_item)

            # 系数输入框
            coeff = default_coeffs.get(base_attr, 0)
            spin = QDoubleSpinBox()
            spin.setRange(-999, 999)
            spin.setDecimals(1)
            spin.setSingleStep(0.5)
            spin.setValue(coeff)
            spin.setStyleSheet(self._STYLE_VALUE_SPIN)
            spin.setFixedHeight(36)
            spin.valueChanged.connect(self._update_formula_from_coeffs)
            self.coeff_table.setCellWidget(row_idx, 1, spin)
            self.coeff_spins[base_attr] = spin

        self.coeff_table.setMinimumHeight(max(180, len(self.base_attrs) * 45 + 40))

    def _update_formula_from_coeffs(self):
        """从系数表格生成公式"""
        parts = []
        for base_attr in self.BASE_ATTRS:
            spin = self.coeff_spins.get(base_attr)
            if spin:
                val = spin.value()
                if val != 0:
                    if val == int(val):
                        val_str = str(int(val))
                    else:
                        val_str = str(val)
                    parts.append(f"{base_attr}*{val_str}")

        if parts:
            formula = "=" + "+".join(parts)
        else:
            formula = "=0"

        if self.formula_preview:
            self.formula_preview.setText(formula)

        # 同时更新隐藏的 formula_display（兼容旧接口）
        if self.formula_display:
            self.formula_display.setText(formula)

    def _add_action_buttons(self, layout: QVBoxLayout):
        btn_layout = QHBoxLayout()

        clear_btn = QPushButton("清空")
        clear_btn.setStyleSheet(self._STYLE_ACTION_BTN + f"QPushButton {{ background-color: {theme_color('danger')}; }} QPushButton:hover {{ background-color: {theme_color('danger_hover')}; }}")
        clear_btn.clicked.connect(self._clear_formula)
        btn_layout.addWidget(clear_btn)

        btn_layout.addStretch()

        cancel_btn = QPushButton("取消")
        cancel_btn.setStyleSheet(self._STYLE_ACTION_BTN + f"QPushButton {{ background-color: {theme_color('disabled_fg')}; }} QPushButton:hover {{ background-color: {theme_color('hint')}; }}")
        cancel_btn.clicked.connect(self.reject)
        btn_layout.addWidget(cancel_btn)

        ok_btn = QPushButton("确定")
        ok_btn.setStyleSheet(self._STYLE_ACTION_BTN + f"""
            QPushButton {{
                background-color: {theme_color('accent')};
                padding: 8px 30px;
            }}
            QPushButton:hover {{ background-color: {theme_color('accent_hover')}; }}
        """)
        ok_btn.clicked.connect(self.accept)
        btn_layout.addWidget(ok_btn)

        layout.addLayout(btn_layout)

    def _clear_formula(self):
        for spin in self.coeff_spins.values():
            spin.setValue(0)

    def get_formula(self) -> str:
        """获取当前公式"""
        parts = []
        for base_attr in self.BASE_ATTRS:
            spin = self.coeff_spins.get(base_attr)
            if spin:
                val = spin.value()
                if val != 0:
                    if val == int(val):
                        val_str = str(int(val))
                    else:
                        val_str = str(val)
                    parts.append(f"{base_attr}*{val_str}")

        if parts:
            return "=" + "+".join(parts)
        return "=0"
