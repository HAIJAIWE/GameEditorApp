"""属性转换比例组件 - 定义1点基础属性能转换成多少派生属性"""
from common.logger import get_logger

logger = get_logger()

from PyQt6.QtCore import Qt  # noqa: E402  # 延迟导入：避免模块级循环导入
from PyQt6.QtWidgets import (  # noqa: E402  # 延迟导入：避免模块级循环导入
    QDoubleSpinBox,
    QGroupBox,
    QHeaderView,
    QLabel,
    QTableWidget,
    QVBoxLayout,
    QWidget,
)

from ui.themes import theme_color  # noqa: E402  # 延迟导入：避免模块级循环导入


class AttrConversionWidget(QWidget):
    """属性转换比例：表格展示 基础属性→派生属性的转换系数
    存储格式:
    {
        "力量": {"HP": 10, "攻击": 2, "物防": 0},
        "敏捷": {"HP": 5, "攻击": 1, "速度": 0.5},
        "智力": {"MP": 15, "法攻": 3, "魔防": 1},
        "体质": {"HP": 20, "MP": 5, "物防": 2}
    }
    """

    BASE_STATS = ["力量", "敏捷", "智力", "体质"]
    DERIVED_STATS = ["HP", "MP", "物攻", "法攻", "物防", "魔防", "速度"]

    def __init__(self, parent=None):
        super().__init__(parent)
        self.conversion_data = {}
        for base in self.BASE_STATS:
            self.conversion_data[base] = {d: 0 for d in self.DERIVED_STATS}

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        group = QGroupBox("属性转换比例（1点基础属性 = ? 派生属性）")
        group_layout = QVBoxLayout(group)

        hint = QLabel("填写每1点基础属性可转换为多少派生属性数值")
        hint.setStyleSheet(f"color: {theme_color('hint')}; font-size: 11px; font-style: italic;")
        group_layout.addWidget(hint)

        self.table = QTableWidget(len(self.BASE_STATS), len(self.DERIVED_STATS))
        self.table.setHorizontalHeaderLabels(self.DERIVED_STATS)
        self.table.setVerticalHeaderLabels(self.BASE_STATS)
        self.table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
        self.table.verticalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Fixed)
        self.table.setMinimumHeight(120)
        group_layout.addWidget(self.table)

        for row, _base_stat in enumerate(self.BASE_STATS):
            for col, _derived_stat in enumerate(self.DERIVED_STATS):
                spin = QDoubleSpinBox()
                spin.setRange(-999, 9999)
                spin.setDecimals(1)
                spin.setSingleStep(0.5)
                spin.setValue(0)
                spin.setAlignment(Qt.AlignmentFlag.AlignCenter)
                spin.setStyleSheet("QDoubleSpinBox { min-width: 60px; }")
                self.table.setCellWidget(row, col, spin)
                spin.valueChanged.connect(lambda v, r=row, c=col: self._on_value_changed(r, c, v))

        layout.addWidget(group)

    def _on_value_changed(self, row, col, value):
        base = self.BASE_STATS[row]
        derived = self.DERIVED_STATS[col]
        self.conversion_data[base][derived] = value

    def load_data(self, data):
        """加载数据"""
        if isinstance(data, dict):
            for base in self.BASE_STATS:
                if base in data and isinstance(data[base], dict):
                    for derived in self.DERIVED_STATS:
                        if derived in data[base]:
                            try:
                                val = float(data[base][derived])
                                self.conversion_data[base][derived] = val
                                spin = self.table.cellWidget(
                                    self.BASE_STATS.index(base),
                                    self.DERIVED_STATS.index(derived)
                                )
                                if spin:
                                    spin.blockSignals(True)
                                    spin.setValue(val)
                                    spin.blockSignals(False)
                            except (ValueError, TypeError) as e:
                                logger.debug(f"操作失败: {e}")

    def get_data(self):
        """获取数据"""
        return {
            base: {d: float(self.table.cellWidget(
                self.BASE_STATS.index(base),
                self.DERIVED_STATS.index(d)
            ).value() or 0) for d in self.DERIVED_STATS}
            for base in self.BASE_STATS
        }

    def clear(self):
        """清空数据"""
        for row, base in enumerate(self.BASE_STATS):
            for col, _ in enumerate(self.DERIVED_STATS):
                spin = self.table.cellWidget(row, col)
                if spin:
                    spin.blockSignals(True)
                    spin.setValue(0)
                    spin.blockSignals(False)
                self.conversion_data[base][self.DERIVED_STATS[col]] = 0
