"""关系矩阵编辑器 - 可视化配置属性依赖关系"""
from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtWidgets import (
    QComboBox,
    QDoubleSpinBox,
    QFrame,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QPushButton,
    QScrollArea,
    QTableWidget,
    QVBoxLayout,
    QWidget,
)

from core.attr_system import AttributeSystem
from ui.themes import theme_color


class RelationMatrixEditor(QWidget):
    """
    关系矩阵编辑器

    功能：
    1. 矩阵式显示所有属性关系
    2. 行=派生属性，列=基础属性
    3. 单元格=系数值
    4. 实时同步到数据模型
    """

    # 信号
    relations_changed = pyqtSignal()  # 关系变化时发出

    def __init__(self, attr_system: AttributeSystem, parent=None):
        super().__init__(parent)
        self.attr_system = attr_system
        self.coeff_spins: dict[str, dict[str, QDoubleSpinBox]] = {}  # {derived_attr: {base_attr: spin}}
        self._setup_ui()
        self._refresh_matrix()

    def _setup_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # 顶部工具栏
        toolbar = self._create_toolbar()
        layout.addWidget(toolbar)

        # 关系矩阵（使用滚动区域）
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        scroll.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        scroll.setStyleSheet("""
            QScrollArea {
                border: none;
                background-color: transparent;
            }
        """)

        self.matrix_widget = QWidget()
        matrix_layout = QVBoxLayout(self.matrix_widget)
        matrix_layout.setContentsMargins(0, 0, 0, 0)
        matrix_layout.setSpacing(0)

        # 矩阵表格
        self.matrix_table = QTableWidget()
        self.matrix_table.setStyleSheet(f"""
            QTableWidget {{
                background-color: {theme_color('input_bg')};
                border: 1px solid {theme_color('border')};
                border-radius: 4px;
                gridline-color: {theme_color('divider')};
                font-size: 13px;
            }}
            QHeaderView::section {{
                background-color: {theme_color('bg')};
                color: {theme_color('secondary_fg')};
                padding: 8px;
                border: 1px solid {theme_color('border')};
                font-weight: bold;
            }}
            QTableWidget::item {{
                padding: 4px;
            }}
        """)
        matrix_layout.addWidget(self.matrix_table)

        scroll.setWidget(self.matrix_widget)
        layout.addWidget(scroll)

        # 底部提示
        hint = QLabel("💡 点击单元格修改系数，修改后关系会自动更新")
        hint.setStyleSheet(f"""
            QLabel {{
                color: {theme_color('hint')};
                font-size: 11px;
                padding: 4px 8px;
                background-color: {theme_color('accent_light')};
                border-radius: 4px;
                border: 1px solid {theme_color('border')};
            }}
        """)
        layout.addWidget(hint)

    def _create_toolbar(self) -> QFrame:
        """创建工具栏"""
        frame = QFrame()
        frame.setStyleSheet(f"""
            QFrame {{
                background-color: {theme_color('accent_light')};
                border: 1px solid {theme_color('border')};
                border-radius: 6px;
            }}
        """)
        layout = QHBoxLayout(frame)
        layout.setContentsMargins(8, 6, 8, 6)
        layout.setSpacing(6)

        layout.addWidget(QLabel("<b>📊 属性关系矩阵</b>"))
        layout.addStretch()

        # 筛选下拉
        layout.addWidget(QLabel("筛选:"))
        self.filter_combo = QComboBox()
        self.filter_combo.addItems(["全部", "基础属性", "派生属性", "战斗属性"])
        self.filter_combo.setStyleSheet(f"""
            QComboBox {{
                background: white;
                border: 1px solid {theme_color('border')};
                border-radius: 4px;
                padding: 3px 8px;
            }}
        """)
        self.filter_combo.currentIndexChanged.connect(self._refresh_matrix)
        layout.addWidget(self.filter_combo)

        # 清空按钮
        clear_btn = QPushButton("️ 清空系数")
        clear_btn.setStyleSheet(f"""
            QPushButton {{
                background-color: {theme_color('danger')};
                color: white;
                border: none;
                border-radius: 4px;
                padding: 4px 12px;
                font-weight: bold;
            }}
            QPushButton:hover {{
                background-color: {theme_color('danger_hover')};
            }}
        """)
        clear_btn.clicked.connect(self._on_clear_coeffs)
        layout.addWidget(clear_btn)

        return frame

    def _refresh_matrix(self):
        """刷新关系矩阵"""
        # 获取基础属性列表（列）
        base_attrs = self.attr_system.base_attributes

        # 获取派生/战斗属性列表（行）
        derived_attrs = self.attr_system.derived_attributes + self.attr_system.combat_attributes

        # 清空
        self.matrix_table.clear()
        self.coeff_spins = {}

        # 设置行列数
        self.matrix_table.setRowCount(len(derived_attrs))
        self.matrix_table.setColumnCount(len(base_attrs))

        # 设置表头
        self.matrix_table.setHorizontalHeaderLabels(base_attrs)
        self.matrix_table.setVerticalHeaderLabels([self.attr_system.attributes[a].display_name for a in derived_attrs])

        # 填充单元格
        for row_idx, derived_attr in enumerate(derived_attrs):
            for col_idx, base_attr in enumerate(base_attrs):
                # 获取当前系数
                attr = self.attr_system.attributes.get(derived_attr)
                coeff = 0
                if attr:
                    coeff = attr.formula.coefficients.get(base_attr, 0)

                # 创建系数输入框
                spin = QDoubleSpinBox()
                spin.setRange(-999, 999)
                spin.setDecimals(1)
                spin.setSingleStep(0.5)
                spin.setValue(coeff)
                spin.setStyleSheet(f"""
                    QDoubleSpinBox {{
                        background: white;
                        border: 1px solid {theme_color('border')};
                        border-radius: 4px;
                        padding: 2px 4px;
                        font-family: 'Consolas', monospace;
                        font-size: 12px;
                        color: {theme_color('fg')};
                    }}
                    QDoubleSpinBox:focus {{
                        border-color: {theme_color('accent')};
                    }}
                    QDoubleSpinBox::up-button, QDoubleSpinBox::down-button {{
                        background-color: {theme_color('accent_light')};
                        border: none;
                        width: 16px;
                    }}
                """)
                spin.setFixedHeight(30)
                spin.valueChanged.connect(self._on_coeff_changed)

                self.matrix_table.setCellWidget(row_idx, col_idx, spin)

                if derived_attr not in self.coeff_spins:
                    self.coeff_spins[derived_attr] = {}
                self.coeff_spins[derived_attr][base_attr] = spin

        # 自适应列宽
        self.matrix_table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
        self.matrix_table.verticalHeader().setSectionResizeMode(QHeaderView.ResizeMode.ResizeToContents)

        # 设置最小高度
        self.matrix_table.setMinimumHeight(max(200, len(derived_attrs) * 35 + 40))

    def _on_coeff_changed(self):
        """系数修改时同步到数据模型"""
        for derived_attr, spins in self.coeff_spins.items():
            formula = {}
            for base_attr, spin in spins.items():
                val = spin.value()
                if val != 0:
                    formula[base_attr] = val

            attr = self.attr_system.attributes.get(derived_attr)
            if attr:
                attr.formula.coefficients = formula

        self.relations_changed.emit()

    def _on_clear_coeffs(self):
        """清空所有系数"""
        for _derived_attr, spins in self.coeff_spins.items():
            for _base_attr, spin in spins.items():
                spin.setValue(0)

        self._on_coeff_changed()

    def get_relations_summary(self) -> str:
        """获取关系摘要文本"""
        lines = []
        for derived_attr, spins in self.coeff_spins.items():
            parts = []
            for base_attr, spin in spins.items():
                val = spin.value()
                if val != 0:
                    parts.append(f"{base_attr}×{val}")
            if parts:
                lines.append(f"{derived_attr} = {' + '.join(parts)}")

        return "\n".join(lines) if lines else "暂无关系配置"
