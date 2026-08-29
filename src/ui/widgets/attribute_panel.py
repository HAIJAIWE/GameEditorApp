"""RPG属性系统 - Excel 风格公式计算（真·Excel体验版）"""
import ast
import operator
import re

from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QColor, QFont
from PyQt6.QtWidgets import (
    QComboBox,
    QFrame,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QMessageBox,
    QPushButton,
    QTableWidget,
    QTableWidgetItem,
    QVBoxLayout,
    QWidget,
)

from common.logger import get_logger
from config.constants import ALL_ATTR_NAMES
from ui.dialogs.auto_input_dialog import show_text_input_dialog
from ui.themes import theme_color

from .formula_builder import FormulaBuilderDialog


class AttributePanelWidget(QWidget):
    """Excel 风格属性面板 - 真正的表格编辑体验"""

    data_changed = pyqtSignal()

    ATTR_TEMPLATES = {
        'role': {
            '新手': [
                {"name": "力量", "category": "基础", "formula": "5"},
                {"name": "智力", "category": "基础", "formula": "5"},
                {"name": "敏捷", "category": "基础", "formula": "5"},
                {"name": "体质", "category": "基础", "formula": "5"},
                {"name": "HP", "category": "派生", "formula": "=力量*10+体质*20+敏捷*5"},
                {"name": "MP", "category": "派生", "formula": "=智力*15+体质*5"},
                {"name": "物攻", "category": "派生", "formula": "=力量*2+敏捷*1"},
                {"name": "物防", "category": "派生", "formula": "=力量*0.5+敏捷*0.5+体质*2"},
                {"name": "魔攻", "category": "派生", "formula": "=智力*3"},
                {"name": "魔防", "category": "派生", "formula": "=智力*1+体质*1"},
                {"name": "速度", "category": "派生", "formula": "=敏捷*2"},
                {"name": "暴击率", "category": "战斗", "formula": "=8.0"},
                {"name": "暴击伤害", "category": "战斗", "formula": "=154.0"},
                {"name": "命中率", "category": "战斗", "formula": "=88.0"},
                {"name": "闪避率", "category": "战斗", "formula": "=6.0"},
                {"name": "回血/回合", "category": "战斗", "formula": "=6"},
                {"name": "回蓝/回合", "category": "战斗", "formula": "=3"},
            ],
            '战士': [
                {"name": "力量", "category": "基础", "formula": "12"},
                {"name": "智力", "category": "基础", "formula": "3"},
                {"name": "敏捷", "category": "基础", "formula": "5"},
                {"name": "体质", "category": "基础", "formula": "10"},
                {"name": "HP", "category": "派生", "formula": "=力量*10+体质*20+敏捷*5"},
                {"name": "MP", "category": "派生", "formula": "=智力*15+体质*5"},
                {"name": "物攻", "category": "派生", "formula": "=力量*2+敏捷*1"},
                {"name": "物防", "category": "派生", "formula": "=力量*0.5+敏捷*0.5+体质*2"},
                {"name": "魔攻", "category": "派生", "formula": "=智力*3"},
                {"name": "魔防", "category": "派生", "formula": "=智力*1+体质*1"},
                {"name": "速度", "category": "派生", "formula": "=敏捷*2"},
                {"name": "暴击率", "category": "战斗", "formula": "=12.0"},
                {"name": "暴击伤害", "category": "战斗", "formula": "=161.0"},
                {"name": "命中率", "category": "战斗", "formula": "=89.5"},
                {"name": "闪避率", "category": "战斗", "formula": "=4.8"},
                {"name": "回血/回合", "category": "战斗", "formula": "=8"},
                {"name": "回蓝/回合", "category": "战斗", "formula": "=2"},
            ],
            '法师': [
                {"name": "力量", "category": "基础", "formula": "3"},
                {"name": "智力", "category": "基础", "formula": "14"},
                {"name": "敏捷", "category": "基础", "formula": "4"},
                {"name": "体质", "category": "基础", "formula": "4"},
                {"name": "HP", "category": "派生", "formula": "=力量*10+体质*20+敏捷*5"},
                {"name": "MP", "category": "派生", "formula": "=智力*15+体质*5"},
                {"name": "物攻", "category": "派生", "formula": "=力量*2+敏捷*1"},
                {"name": "物防", "category": "派生", "formula": "=力量*0.5+敏捷*0.5+体质*2"},
                {"name": "魔攻", "category": "派生", "formula": "=智力*3"},
                {"name": "魔防", "category": "派生", "formula": "=智力*1+体质*1"},
                {"name": "速度", "category": "派生", "formula": "=敏捷*2"},
                {"name": "暴击率", "category": "战斗", "formula": "=6.4"},
                {"name": "暴击伤害", "category": "战斗", "formula": "=154.0"},
                {"name": "命中率", "category": "战斗", "formula": "=87.4"},
                {"name": "闪避率", "category": "战斗", "formula": "=4.8"},
                {"name": "回血/回合", "category": "战斗", "formula": "=4"},
                {"name": "回蓝/回合", "category": "战斗", "formula": "=8"},
            ],
            '刺客': [
                {"name": "力量", "category": "基础", "formula": "6"},
                {"name": "智力", "category": "基础", "formula": "4"},
                {"name": "敏捷", "category": "基础", "formula": "14"},
                {"name": "体质", "category": "基础", "formula": "5"},
                {"name": "HP", "category": "派生", "formula": "=力量*10+体质*20+敏捷*5"},
                {"name": "MP", "category": "派生", "formula": "=智力*15+体质*5"},
                {"name": "物攻", "category": "派生", "formula": "=力量*2+敏捷*1"},
                {"name": "物防", "category": "派生", "formula": "=力量*0.5+敏捷*0.5+体质*2"},
                {"name": "魔攻", "category": "派生", "formula": "=智力*3"},
                {"name": "魔防", "category": "派生", "formula": "=智力*1+体质*1"},
                {"name": "速度", "category": "派生", "formula": "=敏捷*2"},
                {"name": "暴击率", "category": "战斗", "formula": "=17.6"},
                {"name": "暴击伤害", "category": "战斗", "formula": "=161.0"},
                {"name": "命中率", "category": "战斗", "formula": "=91.6"},
                {"name": "闪避率", "category": "战斗", "formula": "=13.2"},
                {"name": "回血/回合", "category": "战斗", "formula": "=4"},
                {"name": "回蓝/回合", "category": "战斗", "formula": "=4"},
            ],
            '射手': [
                {"name": "力量", "category": "基础", "formula": "5"},
                {"name": "智力", "category": "基础", "formula": "4"},
                {"name": "敏捷", "category": "基础", "formula": "12"},
                {"name": "体质", "category": "基础", "formula": "6"},
                {"name": "HP", "category": "派生", "formula": "=力量*10+体质*20+敏捷*5"},
                {"name": "MP", "category": "派生", "formula": "=智力*15+体质*5"},
                {"name": "物攻", "category": "派生", "formula": "=力量*2+敏捷*1"},
                {"name": "物防", "category": "派生", "formula": "=力量*0.5+敏捷*0.5+体质*2"},
                {"name": "魔攻", "category": "派生", "formula": "=智力*3"},
                {"name": "魔防", "category": "派生", "formula": "=智力*1+体质*1"},
                {"name": "速度", "category": "派生", "formula": "=敏捷*2"},
                {"name": "暴击率", "category": "战斗", "formula": "=14.4"},
                {"name": "暴击伤害", "category": "战斗", "formula": "=159.0"},
                {"name": "命中率", "category": "战斗", "formula": "=90.4"},
                {"name": "闪避率", "category": "战斗", "formula": "=10.8"},
                {"name": "回血/回合", "category": "战斗", "formula": "=5"},
                {"name": "回蓝/回合", "category": "战斗", "formula": "=4"},
            ],
            '牧师': [
                {"name": "力量", "category": "基础", "formula": "3"},
                {"name": "智力", "category": "基础", "formula": "12"},
                {"name": "敏捷", "category": "基础", "formula": "4"},
                {"name": "体质", "category": "基础", "formula": "8"},
                {"name": "HP", "category": "派生", "formula": "=力量*10+体质*20+敏捷*5"},
                {"name": "MP", "category": "派生", "formula": "=智力*15+体质*5"},
                {"name": "物攻", "category": "派生", "formula": "=力量*2+敏捷*1"},
                {"name": "物防", "category": "派生", "formula": "=力量*0.5+敏捷*0.5+体质*2"},
                {"name": "魔攻", "category": "派生", "formula": "=智力*3"},
                {"name": "魔防", "category": "派生", "formula": "=智力*1+体质*1"},
                {"name": "速度", "category": "派生", "formula": "=敏捷*2"},
                {"name": "暴击率", "category": "战斗", "formula": "=6.4"},
                {"name": "暴击伤害", "category": "战斗", "formula": "=154.0"},
                {"name": "命中率", "category": "战斗", "formula": "=87.4"},
                {"name": "闪避率", "category": "战斗", "formula": "=4.8"},
                {"name": "回血/回合", "category": "战斗", "formula": "=7"},
                {"name": "回蓝/回合", "category": "战斗", "formula": "=7"},
            ],
            '坦克': [
                {"name": "力量", "category": "基础", "formula": "8"},
                {"name": "智力", "category": "基础", "formula": "3"},
                {"name": "敏捷", "category": "基础", "formula": "3"},
                {"name": "体质", "category": "基础", "formula": "14"},
                {"name": "HP", "category": "派生", "formula": "=力量*10+体质*20+敏捷*5"},
                {"name": "MP", "category": "派生", "formula": "=智力*15+体质*5"},
                {"name": "物攻", "category": "派生", "formula": "=力量*2+敏捷*1"},
                {"name": "物防", "category": "派生", "formula": "=力量*0.5+敏捷*0.5+体质*2"},
                {"name": "魔攻", "category": "派生", "formula": "=智力*3"},
                {"name": "魔防", "category": "派生", "formula": "=智力*1+体质*1"},
                {"name": "速度", "category": "派生", "formula": "=敏捷*2"},
                {"name": "暴击率", "category": "战斗", "formula": "=4.8"},
                {"name": "暴击伤害", "category": "战斗", "formula": "=153.0"},
                {"name": "命中率", "category": "战斗", "formula": "=86.8"},
                {"name": "闪避率", "category": "战斗", "formula": "=3.6"},
                {"name": "回血/回合", "category": "战斗", "formula": "=12"},
                {"name": "回蓝/回合", "category": "战斗", "formula": "=2"},
            ],
        },
        'monster': {
            '小怪': [
                {"name": "力量", "category": "基础", "formula": "3"},
                {"name": "智力", "category": "基础", "formula": "2"},
                {"name": "敏捷", "category": "基础", "formula": "3"},
                {"name": "体质", "category": "基础", "formula": "4"},
                {"name": "HP", "category": "派生", "formula": "=力量*10+体质*20+敏捷*5"},
                {"name": "MP", "category": "派生", "formula": "=智力*15+体质*5"},
                {"name": "物攻", "category": "派生", "formula": "=力量*2+敏捷*1"},
                {"name": "物防", "category": "派生", "formula": "=力量*0.5+敏捷*0.5+体质*2"},
                {"name": "魔攻", "category": "派生", "formula": "=智力*3"},
                {"name": "魔防", "category": "派生", "formula": "=智力*1+体质*1"},
                {"name": "速度", "category": "派生", "formula": "=敏捷*2"},
                {"name": "暴击率", "category": "战斗", "formula": "=4.0"},
                {"name": "暴击伤害", "category": "战斗", "formula": "=152.0"},
                {"name": "命中率", "category": "战斗", "formula": "=86.5"},
                {"name": "闪避率", "category": "战斗", "formula": "=3.0"},
                {"name": "回血/回合", "category": "战斗", "formula": "=4"},
                {"name": "回蓝/回合", "category": "战斗", "formula": "=1"},
            ],
            '普通怪': [
                {"name": "力量", "category": "基础", "formula": "6"},
                {"name": "智力", "category": "基础", "formula": "4"},
                {"name": "敏捷", "category": "基础", "formula": "6"},
                {"name": "体质", "category": "基础", "formula": "8"},
                {"name": "HP", "category": "派生", "formula": "=力量*10+体质*20+敏捷*5"},
                {"name": "MP", "category": "派生", "formula": "=智力*15+体质*5"},
                {"name": "物攻", "category": "派生", "formula": "=力量*2+敏捷*1"},
                {"name": "物防", "category": "派生", "formula": "=力量*0.5+敏捷*0.5+体质*2"},
                {"name": "魔攻", "category": "派生", "formula": "=智力*3"},
                {"name": "魔防", "category": "派生", "formula": "=智力*1+体质*1"},
                {"name": "速度", "category": "派生", "formula": "=敏捷*2"},
                {"name": "暴击率", "category": "战斗", "formula": "=8.0"},
                {"name": "暴击伤害", "category": "战斗", "formula": "=157.0"},
                {"name": "命中率", "category": "战斗", "formula": "=88.0"},
                {"name": "闪避率", "category": "战斗", "formula": "=6.0"},
                {"name": "回血/回合", "category": "战斗", "formula": "=9"},
                {"name": "回蓝/回合", "category": "战斗", "formula": "=3"},
            ],
            '精英怪': [
                {"name": "力量", "category": "基础", "formula": "10"},
                {"name": "智力", "category": "基础", "formula": "8"},
                {"name": "敏捷", "category": "基础", "formula": "8"},
                {"name": "体质", "category": "基础", "formula": "14"},
                {"name": "HP", "category": "派生", "formula": "=力量*10+体质*20+敏捷*5"},
                {"name": "MP", "category": "派生", "formula": "=智力*15+体质*5"},
                {"name": "物攻", "category": "派生", "formula": "=力量*2+敏捷*1"},
                {"name": "物防", "category": "派生", "formula": "=力量*0.5+敏捷*0.5+体质*2"},
                {"name": "魔攻", "category": "派生", "formula": "=智力*3"},
                {"name": "魔防", "category": "派生", "formula": "=智力*1+体质*1"},
                {"name": "速度", "category": "派生", "formula": "=敏捷*2"},
                {"name": "暴击率", "category": "战斗", "formula": "=11.2"},
                {"name": "暴击伤害", "category": "战斗", "formula": "=161.0"},
                {"name": "命中率", "category": "战斗", "formula": "=89.2"},
                {"name": "闪避率", "category": "战斗", "formula": "=8.4"},
                {"name": "回血/回合", "category": "战斗", "formula": "=17"},
                {"name": "回蓝/回合", "category": "战斗", "formula": "=6"},
            ],
            'Boss': [
                {"name": "力量", "category": "基础", "formula": "20"},
                {"name": "智力", "category": "基础", "formula": "16"},
                {"name": "敏捷", "category": "基础", "formula": "12"},
                {"name": "体质", "category": "基础", "formula": "24"},
                {"name": "HP", "category": "派生", "formula": "=力量*10+体质*20+敏捷*5"},
                {"name": "MP", "category": "派生", "formula": "=智力*15+体质*5"},
                {"name": "物攻", "category": "派生", "formula": "=力量*2+敏捷*1"},
                {"name": "物防", "category": "派生", "formula": "=力量*0.5+敏捷*0.5+体质*2"},
                {"name": "魔攻", "category": "派生", "formula": "=智力*3"},
                {"name": "魔防", "category": "派生", "formula": "=智力*1+体质*1"},
                {"name": "速度", "category": "派生", "formula": "=敏捷*2"},
                {"name": "暴击率", "category": "战斗", "formula": "=16.0"},
                {"name": "暴击伤害", "category": "战斗", "formula": "=168.0"},
                {"name": "命中率", "category": "战斗", "formula": "=90.8"},
                {"name": "闪避率", "category": "战斗", "formula": "=12.0"},
                {"name": "回血/回合", "category": "战斗", "formula": "=40"},
                {"name": "回蓝/回合", "category": "战斗", "formula": "=12"},
            ],
        }
    }

    ALL_ATTRS = ALL_ATTR_NAMES

    def __init__(self, attr_type='role', parent=None):
        super().__init__(parent)
        self.logger = get_logger()
        self.attr_type = attr_type
        self.attrs = []
        self._updating_cells = False
        self._setup_ui()
        # 加载默认模板（新手/小怪）并同步模板选择
        templates = self.ATTR_TEMPLATES.get(self.attr_type, {})
        if templates:
            default_name = list(templates.keys())[0]
            self.attrs = list(templates[default_name])
            self.template_combo.setCurrentText(default_name)
            self._build_table_from_scratch()

    def _setup_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(6)

        top_bar = self._create_top_bar()
        layout.addWidget(top_bar)

        # Excel 风格表格：类别 | 属性名称 | 公式 | 结果 | 操作
        self.table = QTableWidget(0, 5)
        self.table.setMinimumHeight(150)
        self.table.setHorizontalHeaderLabels(["类别", "属性名称", "公式 (双击编辑)", "计算结果", "操作"])

        # 列宽设置
        self.table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        self.table.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        self.table.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeMode.Stretch)
        self.table.horizontalHeader().setSectionResizeMode(3, QHeaderView.ResizeMode.Fixed)
        self.table.horizontalHeader().setSectionResizeMode(4, QHeaderView.ResizeMode.Fixed)
        self.table.setColumnWidth(3, 100)
        self.table.setColumnWidth(4, 50)

        # 关键：只允许编辑类别、属性名称、公式列，结果列只读
        self.table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.table.setEditTriggers(
            QTableWidget.EditTrigger.DoubleClicked |
            QTableWidget.EditTrigger.EditKeyPressed
        )

        # 监听单元格编辑完成
        self.table.cellChanged.connect(self._on_cell_changed)

        # 双击单元格处理
        self.table.cellDoubleClicked.connect(self._on_cell_double_clicked)

        # 表头样式 - 通过 QSS 对象名继承主题
        header_style = """
            QHeaderView::section {
                padding: 6px;
                font-weight: bold;
            }
        """
        self.table.horizontalHeader().setStyleSheet(header_style)
        self.table.horizontalHeader().setObjectName("attrTableHeader")
        self.table.verticalHeader().setVisible(False)

        # 表格样式 - 通过 QSS 对象名继承主题
        self.table.setObjectName("attrTable")
        self.table.setStyleSheet("""
            QTableWidget#attrTable {
                font-family: 'Consolas', 'Courier New', monospace;
            }
            QTableWidget#attrTable::item {
                padding: 4px;
            }
        """)

        # 编辑框专用样式 - 通过 QSS 对象名继承主题
        self.table.viewport().setStyleSheet("""
            QLineEdit#attrCellEdit {
                padding: 2px 6px;
            }
        """)

        layout.addWidget(self.table)

        # 底部提示
        hint_label = QLabel("💡 提示：双击「公式」列即可编辑，输入 =力量*10+体质*20 等公式，结果自动计算")
        hint_label.setObjectName("attrHintLabel")
        hint_label.setStyleSheet("""
            QLabel#attrHintLabel {
                font-size: 11px;
                padding: 4px 8px;
                border-radius: 4px;
            }
        """)
        layout.addWidget(hint_label)

    def _create_top_bar(self):
        frame = QFrame()
        frame.setObjectName("attrTopBar")
        layout = QHBoxLayout(frame)
        layout.setContentsMargins(8, 6, 8, 6)
        layout.setSpacing(8)

        layout.addWidget(QLabel("📊 模板:"))
        self.template_combo = QComboBox()
        self.template_combo.setObjectName("attrTemplateCombo")
        templates = list(self.ATTR_TEMPLATES.get(self.attr_type, {}).keys())
        self.template_combo.addItems(["自定义"] + templates)
        self.template_combo.currentTextChanged.connect(self._on_template_changed)
        self.template_combo.setStyleSheet("""
            QComboBox#attrTemplateCombo {
                padding: 3px 8px;
                min-width: 100px;
            }
        """)
        layout.addWidget(self.template_combo)

        layout.addSpacing(10)
        layout.addWidget(QLabel("⚡ 快速添加:"))
        self.quick_add_combo = QComboBox()
        self.quick_add_combo.setObjectName("attrQuickAddCombo")
        self.quick_add_combo.addItems(self.ALL_ATTRS)
        self.quick_add_combo.setStyleSheet("""
            QComboBox#attrQuickAddCombo {
                padding: 3px 8px;
                min-width: 100px;
            }
        """)
        layout.addWidget(self.quick_add_combo)

        quick_add_btn = QPushButton("+ 添加")
        quick_add_btn.setObjectName("attrQuickAddBtn")
        quick_add_btn.clicked.connect(self._on_quick_add)
        layout.addWidget(quick_add_btn)

        add_btn = QPushButton("+ 自定义")
        add_btn.setObjectName("attrAddBtn")
        add_btn.clicked.connect(self._on_add)
        layout.addWidget(add_btn)

        remove_btn = QPushButton("- 删除选中")
        remove_btn.setObjectName("attrRemoveBtn")
        remove_btn.clicked.connect(self._on_remove)
        layout.addWidget(remove_btn)

        layout.addStretch()
        return frame

    # 安全算术求值器 — 仅允许数字和基础运算符，不使用 eval
    _SAFE_OPERATORS = {
        ast.Add: operator.add,
        ast.Sub: operator.sub,
        ast.Mult: operator.mul,
        ast.Div: operator.truediv,
        ast.FloorDiv: operator.floordiv,
        ast.Mod: operator.mod,
        ast.Pow: operator.pow,
        ast.USub: operator.neg,
        ast.UAdd: operator.pos,
    }

    @staticmethod
    def _safe_arithmetic_eval(expr: str):
        """安全求值算术表达式，仅允许数字常量和 +-*/%** 运算符"""
        tree = ast.parse(expr.strip(), mode="eval")
        return AttributePanelWidget._eval_node(tree.body)

    @staticmethod
    def _eval_node(node):
        if isinstance(node, ast.Constant):
            if isinstance(node.value, (int, float)):
                return node.value
            raise ValueError(f"不安全的常量: {node.value!r}")
        elif isinstance(node, ast.UnaryOp):
            op = AttributePanelWidget._SAFE_OPERATORS.get(type(node.op))
            if op is None:
                raise ValueError(f"不安全的运算符: {type(node.op).__name__}")
            return op(AttributePanelWidget._eval_node(node.operand))
        elif isinstance(node, ast.BinOp):
            op = AttributePanelWidget._SAFE_OPERATORS.get(type(node.op))
            if op is None:
                raise ValueError(f"不安全的运算符: {type(node.op).__name__}")
            return op(
                AttributePanelWidget._eval_node(node.left),
                AttributePanelWidget._eval_node(node.right),
            )
        else:
            raise ValueError(f"不安全的表达式节点: {type(node).__name__}")

    def _evaluate_formula(self, formula, attr_values):
        """计算公式，支持 =力量*10+体质*20 这样的Excel语法"""
        if not formula or not formula.strip():
            return 0

        expr = formula.strip()

        # 如果不是公式（没有=开头），直接解析数字
        if not expr.startswith("="):
            try:
                return float(expr)
            except (ValueError, TypeError):
                return 0

        # 去掉 = 号
        expr = expr[1:].strip()

        # 替换属性名为数值（按长度降序，避免部分匹配问题）
        sorted_attrs = sorted(attr_values.items(), key=lambda x: len(x[0]), reverse=True)
        for name, val in sorted_attrs:
            # 使用正则精确替换完整的属性名
            expr = re.sub(r'\b' + re.escape(name) + r'\b', str(val), expr)

        try:
            result = self._safe_arithmetic_eval(expr)
            return round(float(result), 1)
        except Exception:
            self.logger.debug("属性计算公式异常: %s", formula)
            return 0

    def _calculate_all(self):
        """重新计算所有属性的结果"""
        # 先收集所有基础属性的值
        base_values = {}
        for attr in self.attrs:
            if attr.get("category") == "基础":
                base_values[attr["name"]] = self._evaluate_formula(attr.get("formula", "0"), {})

        # 计算所有属性（基础属性直接用公式值，派生属性用完整公式）
        results = {}
        for attr in self.attrs:
            if attr.get("category") == "基础":
                results[attr["name"]] = base_values.get(attr["name"], 0)
            else:
                # 派生/战斗属性：用所有已知值计算
                all_values = dict(base_values)
                all_values.update(results)
                results[attr["name"]] = self._evaluate_formula(attr.get("formula", "0"), all_values)

        return results

    def _on_cell_double_clicked(self, row, col):
        """双击单元格处理 - 公式列弹出构建器"""
        if col == 2:  # 公式列
            current_formula = self.attrs[row].get("formula", "") if row < len(self.attrs) else ""
            current_attr_name = self.attrs[row].get("name", "") if row < len(self.attrs) else ""
            # 获取可用属性列表（包括所有已定义的属性）
            available_attrs = [attr["name"] for attr in self.attrs]

            dialog = FormulaBuilderDialog(available_attrs, current_formula, self, current_attr_name)
            dialog.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
            dialog.accepted.connect(
                lambda d=dialog, r=row: self._on_formula_accepted(d, r)
            )
            dialog.show()

    def _on_formula_accepted(self, dialog, row):
        new_formula = dialog.get_formula()
        if row < len(self.attrs):
            self.attrs[row]["formula"] = new_formula
            self._update_results_only()
            formula_item = self.table.item(row, 2)
            if formula_item:
                formula_item.setText(new_formula)
                if new_formula.startswith("="):
                    formula_item.setForeground(QColor(theme_color('accent')))
            self.data_changed.emit()

    def _on_cell_changed(self, row, col):
        """单元格编辑完成后的处理"""
        if self._updating_cells:
            return
        if row < 0 or row >= len(self.attrs):
            return

        # 更新数据
        if col == 0:
            text = self.table.item(row, col).text() if self.table.item(row, col) else ""
            self.attrs[row]["category"] = text.strip() if text else "自定义"
        elif col == 1:
            text = self.table.item(row, col).text() if self.table.item(row, col) else ""
            new_name = text.strip() if text else ""
            # 不允许保存空名称
            if new_name:
                self.attrs[row]["name"] = new_name
            else:
                # 恢复原名称，防止空值
                self._updating_cells = True
                self.table.blockSignals(True)
                name_item = self.table.item(row, col)
                if name_item:
                    name_item.setText(self.attrs[row]["name"])
                self.table.blockSignals(False)
                self._updating_cells = False
                return
        elif col == 2:
            text = self.table.item(row, col).text() if self.table.item(row, col) else ""
            self.attrs[row]["formula"] = text.strip() if text else "0"

        # 只更新结果列，不重建整个表格（保持编辑焦点）
        self._update_results_only()

        self.data_changed.emit()

    def _update_results_only(self):
        """只更新结果列，不影响其他单元格的编辑"""
        self._updating_cells = True
        results = self._calculate_all()

        for i, attr in enumerate(self.attrs):
            if i >= self.table.rowCount():
                break

            result = results.get(attr["name"], 0)
            result_text = f"{result:.1f}" if isinstance(result, float) else str(result)

            result_item = self.table.item(i, 3)
            if not result_item:
                result_item = QTableWidgetItem()
                result_item.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
                self.table.setItem(i, 3, result_item)

            result_item.setText(result_text)

            # 根据结果值设置颜色
            if result > 0:
                result_item.setForeground(QColor(theme_color('accent')))  # positive value color
                font = result_item.font()
                font.setBold(True)
                result_item.setFont(font)
            else:
                result_item.setForeground(QColor(theme_color('hint')))  # 灰色

        self._updating_cells = False

    def _on_template_changed(self, name):
        """模板选择变化"""
        if not name or name == "自定义":
            return
        templates = self.ATTR_TEMPLATES.get(self.attr_type, {})
        if name in templates:
            self.attrs = list(templates[name])
            self._build_table_from_scratch()
            self.data_changed.emit()

    def _on_quick_add(self):
        """快速添加属性"""
        attr_name = self.quick_add_combo.currentText()
        if attr_name and not any(a.get("name") == attr_name for a in self.attrs):
            if attr_name in ("力量", "智力", "敏捷", "体质"):
                category = "基础"
                formula = "0"
            elif attr_name in ("暴击率", "暴击伤害", "命中率", "闪避率", "回血/回合", "回蓝/回合"):
                category = "战斗"
                formula = "=0"
            elif attr_name in ("经验值", "金钱倍率", "掉落稀有倍率"):
                category = "奖励"
                formula = "=0"
            else:
                category = "派生"
                formula = "=0"
            self.attrs.append({"name": attr_name, "category": category, "formula": formula})
            self._build_table_from_scratch()
            self.data_changed.emit()

    def _on_add(self):
        """添加自定义属性"""
        name, ok = show_text_input_dialog(self, "添加属性", "请输入属性名称：")
        if ok and name.strip():
            self.attrs.append({"name": name.strip(), "category": "自定义", "formula": "=0"})
            self._build_table_from_scratch()
            self.data_changed.emit()

    def _on_remove(self):
        """删除选中的行"""
        selected_rows = set()
        for item in self.table.selectedItems():
            selected_rows.add(item.row())

        if not selected_rows:
            QMessageBox.information(self, "提示", "请先选中要删除的行")
            return

        # 从后往前删除，避免索引变化
        for row in sorted(selected_rows, reverse=True):
            if 0 <= row < len(self.attrs):
                self.attrs.pop(row)

        self._build_table_from_scratch()
        self.data_changed.emit()

    def _on_delete_row(self, row):
        """删除单行"""
        if 0 <= row < len(self.attrs):
            self.attrs.pop(row)
            self._build_table_from_scratch()
            self.data_changed.emit()

    def _build_table_from_scratch(self):
        """完整重建表格（仅在模板切换、添加/删除时调用）"""
        results = self._calculate_all()
        self._updating_cells = True

        self.table.blockSignals(True)
        self.table.setRowCount(len(self.attrs))

        for i, attr in enumerate(self.attrs):
            # 类别列
            cat_item = QTableWidgetItem(attr.get("category", "自定义"))
            cat_item.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
            self.table.setItem(i, 0, cat_item)

            # 属性名称列（可编辑）
            name = attr.get("name", "")
            name_item = QTableWidgetItem(name)
            self.table.setItem(i, 1, name_item)

            # 公式列（可编辑）
            formula = attr.get("formula", "0")
            formula_item = QTableWidgetItem(formula)
            if formula.startswith("="):
                formula_item.setForeground(QColor(theme_color('accent')))  # blue for formula
                formula_item.setFont(QFont("Consolas", 10))
            self.table.setItem(i, 2, formula_item)

            # 结果列（只读）
            result = results.get(attr["name"], 0)
            result_text = f"{result:.1f}" if isinstance(result, float) else str(result)
            result_item = QTableWidgetItem(result_text)
            result_item.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
            result_item.setFlags(result_item.flags() & ~Qt.ItemFlag.ItemIsEditable)  # 设为只读

            if result > 0:
                result_item.setForeground(QColor(theme_color('accent')))
                result_item.setFont(QFont("Consolas", 10, QFont.Weight.Bold))
            else:
                result_item.setForeground(QColor(theme_color('hint')))
            self.table.setItem(i, 3, result_item)

            # 操作列（删除按钮）
            del_btn = QPushButton("✕")
            del_btn.setToolTip("删除此行")
            del_btn.setStyleSheet(f"""
                QPushButton {{
                    background-color: transparent;
                    border: none;
                    color: {theme_color('danger')};
                    font-size: 16px;
                    font-weight: bold;
                }}
                QPushButton:hover {{
                    background-color: {theme_color('danger')};
                    border-radius: 3px;
                    color: white;
                }}
            """)
            del_btn.setFixedSize(30, 24)
            del_btn.clicked.connect(lambda checked, r=i: self._on_delete_row(r))
            self.table.setCellWidget(i, 4, del_btn)

        self.table.blockSignals(False)
        self._updating_cells = False

        # 动态调整表格高度
        self._adjust_table_height()

    def _adjust_table_height(self):
        """根据行数动态调整表格高度"""
        header_h = self.table.horizontalHeader().height()
        row_h = self.table.rowHeight(0) if self.table.rowCount() > 0 else 32
        total_h = header_h + max(row_h * self.table.rowCount(), row_h * 3)
        self.table.setMinimumHeight(min(total_h, 400))
        self.table.setMaximumHeight(min(total_h + 4, 400))

    def load_data(self, data):
        """加载数据"""
        if 'attr_list' in data:
            attrs_data = data['attr_list']
            if isinstance(attrs_data, list) and len(attrs_data) > 0:
                # 过滤无效数据（name 为空的条目），保留有效条目
                valid_attrs = []
                for item in attrs_data:
                    if isinstance(item, dict):
                        name = item.get("name", "").strip()
                        # 跳过 name 为空的条目
                        if name:
                            valid_attrs.append({
                                "name": name,
                                "category": item.get("category", "自定义"),
                                "formula": item.get("formula", "0")
                            })

                if valid_attrs:
                    self.attrs = valid_attrs
                    self.template_combo.setCurrentIndex(0)
                    self._build_table_from_scratch()
                    return

        # 如果没有有效数据，使用默认模板
        templates = self.ATTR_TEMPLATES.get(self.attr_type, {})
        if templates:
            default_name = list(templates.keys())[0]
            self.attrs = list(templates[default_name])
            self.template_combo.setCurrentText(default_name)
            self._build_table_from_scratch()

    def get_data(self):
        """获取数据"""
        return {'attr_list': list(self.attrs)}

    def clear(self):
        """清空数据"""
        self.attrs = []
        self._build_table_from_scratch()
        self.template_combo.setCurrentIndex(0)
