"""F6: 章节字数统计 + 写作建议对话框

统计策划书每章字数，对照工业级 GDD 标准给出改进建议。

工业级 GDD 字数参考（每章）：
- meta / mvp / accessibility: 短篇 100-300 字
- vision / gameplay / tech: 中篇 300-800 字
- worldview / systems / numeric / art / resources / market_analysis / characters
  / combat / economy / monetization / risk_handling / audio: 500-1500 字
"""
from __future__ import annotations

from PyQt6.QtCore import Qt
from PyQt6.QtGui import QColor, QFont
from PyQt6.QtWidgets import (
    QAbstractItemView,
    QDialog,
    QFrame,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QProgressBar,
    QPushButton,
    QTableWidget,
    QTableWidgetItem,
    QVBoxLayout,
)

from .ceshu_theme import theme_color

# 工业级 GDD 章节字数参考标准
# (下限, 上限, 期望中位)
CHAPTER_WORD_BENCHMARK = {
    "meta":            (50,   300,  150),
    "vision":          (200,  800,  400),
    "worldview":       (500,  1500, 800),
    "gameplay":        (300,  1000, 500),
    "systems":         (200,  800,  400),  # 系统配置项，不是字数
    "numeric":         (300,  1000, 500),
    "art":             (300,  800,  500),
    "tech":            (300,  1000, 500),
    "resources":       (200,  800,  400),
    "market_analysis": (400,  1200, 700),
    "characters":      (500,  1500, 800),
    "combat":          (400,  1200, 700),
    "economy":         (400,  1200, 700),
    "monetization":    (300,  1000, 600),
    "mvp":             (200,  800,  400),
    "risk_handling":   (300,  1000, 500),
    "audio":           (200,  800,  400),
    "accessibility":   (100,  500,  250),
}


def _count_words_in_chapter(chapter_data) -> int:
    """递归统计章节中所有字符串字段的总字数（中文按字符算，英文按词算）"""
    if chapter_data is None:
        return 0
    total = 0
    if isinstance(chapter_data, str):
        # 简单算法：中文字符数 + 英文词数
        import re
        chinese_chars = len(re.findall(r'[\u4e00-\u9fff]', chapter_data))
        # 英文词数（连续字母数字）
        english_words = len(re.findall(r'[a-zA-Z0-9]+', chapter_data))
        return chinese_chars + english_words
    elif isinstance(chapter_data, dict):
        for v in chapter_data.values():
            total += _count_words_in_chapter(v)
    elif isinstance(chapter_data, (list, tuple)):
        for v in chapter_data:
            total += _count_words_in_chapter(v)
    return total


class WordStatsDialog(QDialog):
    """F6: 字数统计 + 写作建议对话框

    展示每章字数、对照工业级 GDD 标准的完成度、写作建议。
    """

    def __init__(self, model, parent=None):
        super().__init__(parent)
        self._model = model
        self.setWindowTitle("字数统计与写作建议")
        self.setMinimumSize(720, 540)
        self._setup_ui()
        self._apply_theme()

    def _setup_ui(self) -> None:
        layout = QVBoxLayout(self)
        layout.setContentsMargins(16, 12, 16, 12)
        layout.setSpacing(10)

        # 顶部标题
        title = QLabel("字数统计与写作建议")
        title.setFont(QFont("Microsoft YaHei", 14, QFont.Weight.Bold))
        layout.addWidget(title)

        # 总览统计
        self._stats_label = QLabel()
        self._stats_label.setFont(QFont("Microsoft YaHei", 11))
        layout.addWidget(self._stats_label)

        # 章节字数表
        self._table = QTableWidget()
        self._table.setColumnCount(5)
        self._table.setHorizontalHeaderLabels(["章节", "字数", "工业级标准", "完成度", "建议"])
        self._table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
        self._table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        self._table.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.ResizeToContents)
        self._table.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeMode.ResizeToContents)
        self._table.horizontalHeader().setSectionResizeMode(3, QHeaderView.ResizeMode.ResizeToContents)
        self._table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        self._table.verticalHeader().setVisible(False)
        layout.addWidget(self._table, 1)

        # 总进度条
        overall_frame = QFrame()
        overall_layout = QHBoxLayout(overall_frame)
        overall_layout.setContentsMargins(0, 0, 0, 0)
        overall_label = QLabel("整体写作完成度：")
        overall_label.setFont(QFont("Microsoft YaHei", 11))
        overall_layout.addWidget(overall_label)
        self._overall_bar = QProgressBar()
        self._overall_bar.setRange(0, 100)
        self._overall_bar.setTextVisible(True)
        self._overall_bar.setFixedHeight(18)
        overall_layout.addWidget(self._overall_bar, 1)
        layout.addWidget(overall_frame)

        # 关闭按钮
        btn_row = QHBoxLayout()
        btn_row.addStretch()
        btn_close = QPushButton("关闭")
        btn_close.clicked.connect(self.accept)
        btn_row.addWidget(btn_close)
        layout.addLayout(btn_row)

        self._populate()

    def _populate(self) -> None:
        """填充字数统计数据"""
        from core.ceshu.ceshu_model import CHAPTER_KEYS, CHAPTER_LABELS
        total_words = 0
        total_target = 0
        rows = []
        for key in CHAPTER_KEYS:
            label = CHAPTER_LABELS.get(key, key)
            try:
                chapter_data = self._model.get_chapter(key)
            except Exception:
                chapter_data = None
            words = _count_words_in_chapter(chapter_data)
            lo, hi, mid = CHAPTER_WORD_BENCHMARK.get(key, (100, 500, 250))
            # 完成度计算：达到 mid 视为 100%，超过 hi 视为 120%
            if mid > 0:
                pct = int(min(120, words / mid * 100))
            else:
                pct = 100 if words > 0 else 0
            # 建议
            if words == 0:
                advice = "🔴 章节为空，建议尽快填写"
                advice_color = "#e57373"
            elif words < lo:
                advice = f"🟠 字数偏少（建议至少 {lo} 字）"
                advice_color = "#ffb74d"
            elif words > hi * 1.5:
                advice = f"🟡 字数过多（建议精简到 {hi} 字以内）"
                advice_color = "#fff176"
            else:
                advice = "🟢 字数合理"
                advice_color = "#81c784"
            rows.append((label, words, f"{lo}-{hi}", pct, advice, advice_color))
            total_words += words
            total_target += mid

        self._table.setRowCount(len(rows))
        for i, (label, words, std, pct, advice, color) in enumerate(rows):
            item_label = QTableWidgetItem(label)
            self._table.setItem(i, 0, item_label)
            item_words = QTableWidgetItem(f"{words}")
            item_words.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
            self._table.setItem(i, 1, item_words)
            item_std = QTableWidgetItem(std)
            item_std.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
            self._table.setItem(i, 2, item_std)
            item_pct = QTableWidgetItem(f"{pct}%")
            item_pct.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
            if pct >= 100:
                item_pct.setForeground(QColor("#81c784"))
            elif pct >= 50:
                item_pct.setForeground(QColor("#fff176"))
            else:
                item_pct.setForeground(QColor("#e57373"))
            self._table.setItem(i, 3, item_pct)
            item_advice = QTableWidgetItem(advice)
            item_advice.setForeground(QColor(color))
            self._table.setItem(i, 4, item_advice)

        # 顶部统计
        overall_pct = int(min(100, total_words / max(1, total_target) * 100))
        self._stats_label.setText(
            f"总字数：<b style='color:{theme_color('accent')};'>{total_words:,}</b> 字　"
            f"工业级 GDD 推荐总字数：约 <b>{total_target:,}</b> 字　"
            f"整体完成度：<b>{overall_pct}%</b>"
        )
        self._overall_bar.setValue(overall_pct)
        if overall_pct >= 80:
            self._overall_bar.setStyleSheet(
                f"QProgressBar {{ background: {theme_color('border')}; border: none; border-radius: 9px; text-align: center; }}"
                f"QProgressBar::chunk {{ background: #81c784; border-radius: 9px; }}")
        elif overall_pct >= 50:
            self._overall_bar.setStyleSheet(
                f"QProgressBar {{ background: {theme_color('border')}; border: none; border-radius: 9px; text-align: center; }}"
                f"QProgressBar::chunk {{ background: #fff176; border-radius: 9px; }}")
        else:
            self._overall_bar.setStyleSheet(
                f"QProgressBar {{ background: {theme_color('border')}; border: none; border-radius: 9px; text-align: center; }}"
                f"QProgressBar::chunk {{ background: #e57373; border-radius: 9px; }}")

    def _apply_theme(self) -> None:
        bg = theme_color('bg') or "#1e1e1e"
        fg = theme_color('fg') or "#e0e0e0"
        border = theme_color('border') or "#3a3a3a"
        self.setStyleSheet(f"""
            QDialog {{ background: {bg}; color: {fg}; }}
            QLabel {{ color: {fg}; background: transparent; }}
            QTableWidget {{
                background: {theme_color('input_bg') or '#252525'};
                color: {fg};
                gridline-color: {border};
                border: 1px solid {border};
                border-radius: 6px;
            }}
            QHeaderView::section {{
                background: {theme_color('accent_light') or '#2a2a2a'};
                color: {fg};
                padding: 6px;
                border: none;
                border-bottom: 1px solid {border};
                font-weight: bold;
            }}
            QPushButton {{
                background: {theme_color('accent') or '#4f8cf7'};
                color: white;
                border: none;
                padding: 6px 18px;
                border-radius: 4px;
                font-size: 12px;
            }}
            QPushButton:hover {{
                background: {theme_color('accent_hover_light') or '#5a9cff'};
            }}
        """)
