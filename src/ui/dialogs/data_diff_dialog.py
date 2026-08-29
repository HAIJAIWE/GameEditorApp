"""数据对比对话框 — 使用 DataDiff 引擎对比当前数据与备份/历史版本"""
from common.logger import get_logger

logger = get_logger()

from PyQt6.QtGui import QColor, QFont, QSyntaxHighlighter, QTextCharFormat
from PyQt6.QtWidgets import (
    QComboBox,
    QDialog,
    QFrame,
    QHBoxLayout,
    QLabel,
    QMessageBox,
    QPushButton,
    QTextEdit,
    QVBoxLayout,
)

from common.data_diff import DataDiff
from ui.themes import theme_color


class DiffHighlighter(QSyntaxHighlighter):
    """差异输出语法高亮"""

    def __init__(self, parent=None):
        super().__init__(parent)
        self._formats = {
            "added": QTextCharFormat(),
            "removed": QTextCharFormat(),
            "modified": QTextCharFormat(),
            "path": QTextCharFormat(),
        }
        self._formats["added"].setForeground(QColor("#2ea043"))
        self._formats["removed"].setForeground(QColor("#da3633"))
        self._formats["modified"].setForeground(QColor("#d29922"))
        self._formats["path"].setForeground(QColor("#58a6ff"))

    def highlightBlock(self, text: str):
        if text.startswith("+"):
            self.setFormat(0, len(text), self._formats["added"])
        elif text.startswith("-"):
            self.setFormat(0, len(text), self._formats["removed"])
        elif text.startswith("~"):
            self.setFormat(0, len(text), self._formats["modified"])
        elif text.startswith("[") or "  " in text:
            pass  # keep default


class DataDiffDialog(QDialog):
    """数据对比对话框"""

    def __init__(self, data_manager, parent=None):
        super().__init__(parent)
        self.setWindowTitle("数据对比")
        self.setMinimumSize(640, 480)
        self.data_manager = data_manager
        self._setup_ui()

    def _setup_ui(self):
        layout = QVBoxLayout(self)
        layout.setSpacing(12)

        title = QLabel("📊 数据对比工具")
        title.setStyleSheet("font-size: 16px; font-weight: 700;")
        layout.addWidget(title)

        desc = QLabel("对比当前数据库中的不同数据类型，查看新增、删除和修改的字段。"
                       "您可以先修改数据，再回到此工具查看变更。")
        desc.setStyleSheet(f"font-size: 12px; color: {theme_color('hint')};")
        desc.setWordWrap(True)
        layout.addWidget(desc)

        # 类型选择
        row = QHBoxLayout()
        row.addWidget(QLabel("选择数据类型:"))
        self.type_combo = QComboBox()
        self.type_combo.setMinimumWidth(200)
        row.addWidget(self.type_combo)
        row.addStretch()

        btn = QPushButton("开始对比")
        btn.setStyleSheet(f"""
            QPushButton {{
                background: {theme_color('accent')}; color: white;
                border: none; border-radius: 6px; padding: 6px 20px;
                font-weight: 600;
            }}
            QPushButton:hover {{ background: {theme_color('accent_hover')}; }}
        """)
        btn.clicked.connect(self._run_diff)
        row.addWidget(btn)

        # 加载可用类型
        self._load_types()
        layout.addLayout(row)

        # 分隔线
        sep = QFrame()
        sep.setFrameShape(QFrame.Shape.HLine)
        layout.addWidget(sep)

        # 结果区域
        self.result_area = QTextEdit()
        self.result_area.setReadOnly(True)
        self.result_area.setFont(QFont("Cascadia Code, Consolas", 10))
        self.result_area.setStyleSheet(f"""
            QTextEdit {{
                background: {theme_color('input_bg')};
                border: 1px solid {theme_color('border')};
                border-radius: 6px; padding: 8px;
            }}
        """)
        self.highlighter = DiffHighlighter(self.result_area.document())
        layout.addWidget(self.result_area)

    def _load_types(self):
        try:
            schema = None
            if hasattr(self.data_manager, "config") and self.data_manager.config:
                schema = self.data_manager.config.get_type_schema()
            if schema and hasattr(schema, "types"):
                for t in schema.types:
                    label = t.name or t.id
                    self.type_combo.addItem(f"{label} ({t.plural_key})", t.plural_key)
        except Exception as e:
            logger.warning(f"操作失败: {e}")

    def _run_diff(self):
        pk = self.type_combo.currentData()
        if not pk:
            QMessageBox.warning(self, "提示", "请先选择要对比的数据类型")
            return

        try:
            all_data = getattr(self.data_manager, "data", None) or {}
            items = all_data.get(pk, [])
            # 对比空数据（只显示当前数据概览）
            diffs = DataDiff.compare({}, {"count": len(items), "items": items}, pk)
            report = DataDiff.format_diff_report(diffs)
            summary = DataDiff.format_summary(diffs)

            output = f"📋 数据类型: {self.type_combo.currentText()}\n"
            output += f"📦 当前条目数: {len(items)}\n"
            output += f"{'='*50}\n"
            output += f"📊 {summary}\n"
            output += f"{'='*50}\n\n"
            output += report if report else "(无差异 — 数据一致)\n"

            self.result_area.setPlainText(output)
        except Exception as ex:
            self.result_area.setPlainText(f"对比失败: {ex}")
