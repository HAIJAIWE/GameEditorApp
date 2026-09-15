"""N4: 评分报告对话框 — 工业级 GDD 评分展示

特性:
- 顶部总分 + 等级 + 三维度进度条
- 中部章节评分明细表
- 底部改进建议 + 同行业对比
- 支持导出评分报告为 Markdown
"""
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from PyQt6.QtCore import Qt
from PyQt6.QtGui import QColor, QFont
from PyQt6.QtWidgets import (
    QDialog,
    QFileDialog,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QMessageBox,
    QProgressBar,
    QPushButton,
    QTableWidget,
    QTableWidgetItem,
    QTabWidget,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from core.ceshu.ceshu_scorer import grade_label, score_ceshu

from .ceshu_theme import theme_color

if TYPE_CHECKING:
    from core.ceshu.ceshu_model import CeshuModel


# === 颜色常量 ===
COLOR_GRADE_S = "#9333EA"   # 卓越
COLOR_GRADE_A = "#22C55E"   # 优秀
COLOR_GRADE_B = "#3B82F6"   # 良好
COLOR_GRADE_C = "#F59E0B"   # 合格
COLOR_GRADE_D = "#EF4444"   # 不足
COLOR_GRADE_UNKNOWN = "#888888"

# 等级 -> 颜色映射
GRADE_COLORS: dict[str, str] = {
    "S": COLOR_GRADE_S,
    "A": COLOR_GRADE_A,
    "B": COLOR_GRADE_B,
    "C": COLOR_GRADE_C,
    "D": COLOR_GRADE_D,
}

# 分数配色阈值表（从高到低）：(下限分数, 颜色)，首个 score>=下限 的颜色生效
SCORE_COLORS: list[tuple[int, str]] = [
    (80, COLOR_GRADE_A),
    (60, COLOR_GRADE_B),
    (40, COLOR_GRADE_C),
    (0,  COLOR_GRADE_D),
]


class _ScoreBar(QWidget):
    """评分条：标签 + 进度条 + 分数。"""

    def __init__(self, label: str, max_value: float, color: str, parent: QWidget | None = None) -> None:
        """初始化评分条。

        Args:
            label: 维度名称。
            max_value: 该维度满分值。
            color: 进度条颜色（十六进制）。
            parent: 父控件。
        """
        super().__init__(parent)
        self._max = max_value
        self._color = color
        self._setup_ui(label)

    def _setup_ui(self, label: str) -> None:
        """搭建评分条内部布局。"""
        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(8)

        self._label = QLabel(label)
        self._label.setFixedWidth(120)
        self._label.setStyleSheet(
            f"color: {theme_color('fg')}; background: transparent; font-size: 13px;")
        layout.addWidget(self._label)

        self._bar = QProgressBar()
        self._bar.setRange(0, int(self._max * 10))
        self._bar.setTextVisible(False)
        self._bar.setFixedHeight(16)
        self._bar.setStyleSheet(f"""
            QProgressBar {{
                background: {theme_color('border')};
                border: 1px solid {theme_color('border')};
                border-radius: 8px;
            }}
            QProgressBar::chunk {{
                background: {self._color};
                border-radius: 7px;
            }}
        """)
        layout.addWidget(self._bar, 1)

        self._value = QLabel("0.0")
        self._value.setFixedWidth(70)
        self._value.setAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
        self._value.setStyleSheet(
            f"color: {self._color}; background: transparent; font-weight: bold; font-size: 13px;")
        layout.addWidget(self._value)

    def set_value(self, value: float) -> None:
        """设置当前得分并刷新进度条与文本。

        Args:
            value: 当前得分。
        """
        self._bar.setValue(int(value * 10))
        self._value.setText(f"{value:.1f} / {self._max:.0f}")


class ScoreReportDialog(QDialog):
    """N4: 评分报告对话框"""

    def __init__(self, model: CeshuModel, parent: QWidget | None = None) -> None:
        """初始化评分报告对话框。

        Args:
            model: CeshuModel 实例。
            parent: 父控件。
        """
        super().__init__(parent)
        self._model = model
        self._report = score_ceshu(model)
        self._setup_ui()

    def _setup_ui(self) -> None:
        """初始化对话框界面：编排顶部卡片、评分条、选项卡与底部按钮。"""
        self.setWindowTitle("N4 工业级 GDD 评分报告")
        self.resize(900, 700)
        self.setMinimumSize(700, 550)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(16, 16, 16, 16)
        layout.setSpacing(12)

        layout.addWidget(self._build_top_card())
        layout.addWidget(self._build_dimension_bars())
        layout.addWidget(self._build_tabs(), 1)
        layout.addLayout(self._build_bottom_buttons())

        self._apply_theme()

        # 可访问性：对话框整体描述
        self.setAccessibleName("策划书评分报告对话框")
        self.setAccessibleDescription(
            "展示工业级 GDD 评分报告，包含总分、三维度评分、章节明细、改进建议与同行业对比"
        )

    def _build_top_card(self) -> QWidget:
        """构建顶部卡片：总分大数字 + 等级 + 行业对比。

        Returns:
            顶部卡片 QWidget。
        """
        top_card = QWidget()
        top_card.setStyleSheet(f"""
            QWidget {{
                background: {theme_color('input_bg')};
                border: 1px solid {theme_color('border')};
                border-radius: 10px;
            }}
        """)
        top_layout = QHBoxLayout(top_card)
        top_layout.setContentsMargins(20, 16, 20, 16)
        top_layout.setSpacing(20)

        # 总分大数字
        grade = self._report.grade
        grade_color = GRADE_COLORS.get(grade, COLOR_GRADE_UNKNOWN)
        score_label = QLabel(f"{self._report.total_score:.1f}")
        score_label.setFont(QFont("Microsoft YaHei", 36, QFont.Weight.Bold))
        score_label.setStyleSheet(
            f"color: {grade_color}; background: transparent;")
        score_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        top_layout.addWidget(score_label)

        # 右侧：等级 + 说明 + 行业对比
        info_layout = QVBoxLayout()
        info_layout.setSpacing(4)

        grade_text = QLabel(f"等级 {grade}")
        grade_text.setFont(QFont("Microsoft YaHei", 18, QFont.Weight.Bold))
        grade_text.setStyleSheet(
            f"color: {grade_color}; background: transparent;")
        info_layout.addWidget(grade_text)

        desc = QLabel(grade_label(grade))
        desc.setStyleSheet(
            f"color: {theme_color('hint')}; background: transparent; font-size: 12px;")
        info_layout.addWidget(desc)

        # 行业对比
        bench = self._report.industry_benchmark
        vs_label = QLabel(self._vs_text(bench.get("vs_total", 0),
                                        f"{bench.get('label', '同行业')} 平均"))
        vs_label.setStyleSheet(
            f"color: {theme_color('accent', '#4f8cf7')}; background: transparent; font-size: 12px;")
        info_layout.addWidget(vs_label)

        info_layout.addStretch()
        top_layout.addLayout(info_layout, 1)
        return top_card

    def _build_dimension_bars(self) -> QWidget:
        """构建三维度评分条容器。

        Returns:
            包含结构 / 质量 / 市场三个评分条的 QWidget。
        """
        dims = QWidget()
        dims_layout = QVBoxLayout(dims)
        dims_layout.setContentsMargins(0, 0, 0, 0)
        dims_layout.setSpacing(6)

        dims_title = QLabel("评分维度")
        dims_title.setFont(QFont("Microsoft YaHei", 12, QFont.Weight.Bold))
        dims_title.setStyleSheet(
            f"color: {theme_color('fg')}; background: transparent;")
        dims_layout.addWidget(dims_title)

        self._bar_structure = _ScoreBar("结构完整度", 30, COLOR_GRADE_B)
        self._bar_structure.set_value(self._report.structure_score)
        dims_layout.addWidget(self._bar_structure)

        self._bar_quality = _ScoreBar("内容质量", 40, COLOR_GRADE_A)
        self._bar_quality.set_value(self._report.content_quality_score)
        dims_layout.addWidget(self._bar_quality)

        self._bar_market = _ScoreBar("市场潜力", 30, COLOR_GRADE_C)
        self._bar_market.set_value(self._report.market_potential_score)
        dims_layout.addWidget(self._bar_market)
        return dims

    def _build_tabs(self) -> QTabWidget:
        """构建选项卡：章节明细 + 改进建议 + 同行业对比。

        Returns:
            配置好三个 Tab 的 QTabWidget。
        """
        tabs = QTabWidget()

        # Tab 1: 章节评分明细
        tab1 = QWidget()
        tab1_layout = QVBoxLayout(tab1)
        self._table = QTableWidget()
        self._table.setColumnCount(6)
        self._table.setHorizontalHeaderLabels([
            "章节", "评分", "完成度", "字数", "必填字段", "备注",
        ])
        hheader = self._table.horizontalHeader()
        assert hheader is not None
        hheader.setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
        hheader.setSectionResizeMode(5, QHeaderView.ResizeMode.Stretch)
        self._table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self._table.setAccessibleName("章节评分明细表格")
        self._table.setAccessibleDescription("按章节列出评分、完成度、字数、必填字段状态与备注")
        self._populate_table()
        tab1_layout.addWidget(self._table)
        tabs.addTab(tab1, "章节明细")

        # Tab 2: 改进建议
        tab2 = QWidget()
        tab2_layout = QVBoxLayout(tab2)
        self._suggestions = QTextEdit()
        self._suggestions.setReadOnly(True)
        self._suggestions.setAccessibleName("改进建议内容")
        self._suggestions.setAccessibleDescription("列出评分引擎给出的改进建议与各维度及格状态")
        self._populate_suggestions()
        tab2_layout.addWidget(self._suggestions)
        tabs.addTab(tab2, "改进建议")

        # Tab 3: 同行业对比
        tab3 = QWidget()
        tab3_layout = QVBoxLayout(tab3)
        self._benchmark = QTextEdit()
        self._benchmark.setReadOnly(True)
        self._benchmark.setAccessibleName("同行业对比内容")
        self._benchmark.setAccessibleDescription("展示与同行业平均分的对比表格与差距文案")
        self._populate_benchmark()
        tab3_layout.addWidget(self._benchmark)
        tabs.addTab(tab3, "同行业对比")
        return tabs

    def _build_bottom_buttons(self) -> QHBoxLayout:
        """构建底部按钮行。

        Returns:
            含导出 / 关闭按钮的 QHBoxLayout。
        """
        btn_row = QHBoxLayout()
        btn_row.addStretch()

        self._btn_export = QPushButton("导出 Markdown")
        self._btn_export.clicked.connect(self._on_export_md)
        self._btn_export.setAccessibleName("导出评分报告为 Markdown 文件")
        self._btn_export.setAccessibleDescription("将当前评分报告导出为 .md 文件保存到本地")
        self._btn_export.setShortcut("Alt+E")
        self._btn_export.setToolTip("导出 (Alt+E)")
        btn_row.addWidget(self._btn_export)

        self._btn_close = QPushButton("关闭")
        self._btn_close.clicked.connect(self.accept)
        self._btn_close.setAccessibleName("关闭评分报告对话框")
        self._btn_close.setShortcut("Esc")
        btn_row.addWidget(self._btn_close)
        return btn_row

    def _apply_theme(self) -> None:
        """应用对话框整体主题样式。"""
        bg = theme_color('input_bg') or '#1e1e1e'
        fg = theme_color('fg') or '#e0e0e0'
        border = theme_color('border') or '#3a3a3a'

        self.setStyleSheet(f"""
            QDialog {{ background: {bg}; color: {fg}; }}
            QLabel {{ background: transparent; color: {fg}; }}
            QTableWidget {{
                background: {bg}; color: {fg};
                border: 1px solid {border}; gridline-color: {border};
            }}
            QHeaderView::section {{
                background: {bg}; color: {fg};
                border: 1px solid {border}; padding: 6px;
            }}
            QTextEdit {{
                background: {bg}; color: {fg};
                border: 1px solid {border};
            }}
            QTabWidget::pane {{
                border: 1px solid {border};
            }}
            QTabBar::tab {{
                background: {bg}; color: {fg};
                padding: 6px 16px; border: 1px solid {border};
            }}
            QTabBar::tab:selected {{
                background: {theme_color('accent', '#4f8cf7')}; color: white;
            }}
            QPushButton {{
                background: {bg}; color: {fg};
                border: 1px solid {border}; padding: 6px 14px;
                border-radius: 4px;
            }}
            QPushButton:hover {{
                border-color: {theme_color('accent', '#4f8cf7')};
            }}
        """)

    def _populate_table(self) -> None:
        """填充章节明细表格。

        逐行写入各章节的评分、完成度、字数、必填字段与备注，
        并按颜色常量为关键单元着色。
        """
        cs_list = self._report.chapter_scores
        self._table.setRowCount(len(cs_list))
        for i, cs in enumerate(cs_list):
            # 章节
            ch_item = QTableWidgetItem(cs.chapter_label)
            ch_item.setToolTip(cs.chapter_label)
            self._table.setItem(i, 0, ch_item)
            # 评分
            score_item = QTableWidgetItem(f"{cs.score:.1f}")
            color = self._score_color(cs.score)
            score_item.setForeground(QColor(color))
            score_item.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
            self._table.setItem(i, 1, score_item)
            # 完成度
            pct = int(cs.completion * 100)
            comp_item = QTableWidgetItem(f"{pct}%")
            comp_item.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
            self._table.setItem(i, 2, comp_item)
            # 字数
            wc_item = QTableWidgetItem(str(cs.word_count))
            wc_item.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
            min_w, max_w, mid_w = cs.benchmark_word
            if cs.word_count < min_w and min_w > 0:
                wc_item.setForeground(QColor(COLOR_GRADE_D))
            elif cs.word_count >= mid_w:
                wc_item.setForeground(QColor(COLOR_GRADE_A))
            self._table.setItem(i, 3, wc_item)
            # 必填字段
            req_text = "✓ 齐全" if cs.has_required else f"缺 {len(cs.missing_required)}"
            req_item = QTableWidgetItem(req_text)
            req_item.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
            req_item.setForeground(QColor(COLOR_GRADE_A if cs.has_required else COLOR_GRADE_D))
            self._table.setItem(i, 4, req_item)
            # 备注
            notes_text = "; ".join(cs.notes) if cs.notes else "—"
            notes_item = QTableWidgetItem(notes_text)
            notes_item.setToolTip(notes_text)
            self._table.setItem(i, 5, notes_item)

    @staticmethod
    def _score_color(score: float) -> str:
        """根据分数返回对应颜色（查 SCORE_COLORS 阈值表）。

        Args:
            score: 0-100 分数。

        Returns:
            颜色十六进制字符串。
        """
        for threshold, color in SCORE_COLORS:
            if score >= threshold:
                return color
        return COLOR_GRADE_D

    def _vs_text(self, vs_total: float, label: str) -> str:
        """生成与对比对象的对比文案（↑高于 / ↓低于 / —持平）。

        Args:
            vs_total: 与对比对象的差距分值。
            label: 对比对象描述（如 "RPG / ARPG 平均" / "行业平均"）。

        Returns:
            带箭头前缀的对比文案。
        """
        if vs_total > 0:
            return f"↑ 高于 {label} {abs(vs_total):.1f} 分"
        if vs_total < 0:
            return f"↓ 低于 {label} {abs(vs_total):.1f} 分"
        return f"— 持平 {label}"

    def _populate_suggestions(self) -> None:
        """填充改进建议 Tab：列出建议清单与各维度及格状态表。"""
        parts = ["<h3>改进建议</h3>"]
        for s in self._report.suggestions:
            parts.append(f"<p>• {s}</p>")

        # 及格状态
        ps = self._report.pass_status
        parts.append("<h3>及格状态</h3>")
        parts.append("<table>")
        parts.append(self._pass_row("结构完整度", ps["structure"], 30))
        parts.append(self._pass_row("内容质量", ps["quality"], 40))
        parts.append(self._pass_row("市场潜力", ps["market"], 30))
        parts.append(self._pass_row("总分", ps["total"], 100))
        parts.append("</table>")

        self._suggestions.setHtml("".join(parts))

    def _pass_row(self, name: str, passed: bool, max_score: float) -> str:
        """生成及格状态表的一行 HTML。

        Args:
            name: 维度名称。
            passed: 是否及格。
            max_score: 该维度满分值（仅作展示参考，当前未输出）。

        Returns:
            HTML 表格行字符串。
        """
        status = "✓ 及格" if passed else "✗ 不及格"
        color = COLOR_GRADE_A if passed else COLOR_GRADE_D
        return (f"<tr><td style='padding:4px 12px;'>{name}</td>"
                f"<td style='color:{color};'>{status}</td></tr>")

    def _populate_benchmark(self) -> None:
        """填充同行业对比 Tab：行业均值表 + 与行业平均的差距文案。"""
        bench = self._report.industry_benchmark
        parts = [f"<h3>同行业对比 — {bench.get('label', '未知')}</h3>"]
        if bench.get("top_games"):
            parts.append(f"<p>行业代表游戏: {', '.join(bench['top_games'])}</p>")

        parts.append("<table style='width:100%;'>")
        parts.append("<tr><th>维度</th><th>你的得分</th><th>行业平均</th><th>差距</th></tr>")
        parts.append(self._bench_row("结构完整度", self._report.structure_score,
                                     bench["structure_avg"], 30))
        parts.append(self._bench_row("内容质量", self._report.content_quality_score,
                                     bench["quality_avg"], 40))
        parts.append(self._bench_row("市场潜力", self._report.market_potential_score,
                                     bench["market_avg"], 30))
        parts.append(self._bench_row("总分", self._report.total_score,
                                     bench["total_avg"], 100))
        parts.append("</table>")

        vs_total = bench.get("vs_total", 0)
        if vs_total > 0:
            vs_color = COLOR_GRADE_A
        elif vs_total < 0:
            vs_color = COLOR_GRADE_C
        else:
            vs_color = COLOR_GRADE_UNKNOWN
        parts.append(
            f"<p style='color:{vs_color};'>"
            f"{self._vs_text(vs_total, '行业平均')}</p>"
        )

        self._benchmark.setHtml("".join(parts))

    def _bench_row(self, name: str, my_score: float, avg: float, max_score: float) -> str:
        """生成行业对比表的一行 HTML。

        Args:
            name: 维度名称。
            my_score: 当前策划书该维度得分。
            avg: 行业平均分。
            max_score: 该维度满分值。

        Returns:
            HTML 表格行字符串，差距单元按正负着色。
        """
        diff = my_score - avg
        if diff > 0:
            diff_text = f"<span style='color:{COLOR_GRADE_A};'>+{diff:.1f}</span>"
        elif diff < 0:
            diff_text = f"<span style='color:{COLOR_GRADE_D};'>{diff:.1f}</span>"
        else:
            diff_text = f"<span style='color:{COLOR_GRADE_UNKNOWN};'>±0</span>"
        return (f"<tr><td style='padding:6px 12px;'>{name}</td>"
                f"<td style='text-align:center;'>{my_score:.1f} / {max_score:.0f}</td>"
                f"<td style='text-align:center;'>{avg:.1f} / {max_score:.0f}</td>"
                f"<td style='text-align:center;'>{diff_text}</td></tr>")

    def _on_export_md(self) -> None:
        """导出评分报告为 Markdown 文件。"""
        path, _ = QFileDialog.getSaveFileName(
            self, "导出评分报告", "评分报告.md", "Markdown 文件 (*.md)")
        if not path:
            return
        try:
            md = self._build_markdown()
            with open(path, "w", encoding="utf-8") as f:
                f.write(md)
            QMessageBox.information(self, "导出成功", f"评分报告已导出:\n{path}")
        except Exception as e:
            QMessageBox.critical(self, "导出失败", str(e))

    def _build_markdown(self) -> str:
        """生成评分报告的 Markdown 文本。

        Returns:
            可直接写入 .md 文件的报告字符串。
        """
        r = self._report
        lines = [
            "# 工业级 GDD 评分报告",
            "",
            f"**游戏名称**: {self._model.meta.get('game_name', '未命名')}",
            f"**游戏类型**: {self._model.meta.get('game_type', '未知')}",
            f"**评分时间**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            "",
            "## 总评",
            "",
            f"- **总分**: {r.total_score:.1f} / 100",
            f"- **等级**: {r.grade} ({grade_label(r.grade)})",
            f"- **结构完整度**: {r.structure_score:.1f} / 30",
            f"- **内容质量**: {r.content_quality_score:.1f} / 40",
            f"- **市场潜力**: {r.market_potential_score:.1f} / 30",
            "",
            "## 章节明细",
            "",
            "| 章节 | 评分 | 完成度 | 字数 | 必填字段 | 备注 |",
            "|------|------|--------|------|----------|------|",
        ]
        for cs in r.chapter_scores:
            pct = int(cs.completion * 100)
            req = "齐全" if cs.has_required else f"缺 {len(cs.missing_required)}"
            notes = "; ".join(cs.notes) if cs.notes else "—"
            lines.append(f"| {cs.chapter_label} | {cs.score:.1f} | {pct}% | "
                         f"{cs.word_count} | {req} | {notes} |")

        lines.extend([
            "",
            "## 改进建议",
            "",
        ])
        for s in r.suggestions:
            lines.append(f"- {s}")

        lines.extend([
            "",
            "## 同行业对比",
            "",
            f"- **行业**: {r.industry_benchmark.get('label', '未知')}",
            f"- **行业平均总分**: {r.industry_benchmark.get('total_avg', 0):.1f}",
            f"- **你的总分**: {r.total_score:.1f}",
            f"- **差距**: {r.industry_benchmark.get('vs_total', 0):+.1f}",
        ])
        if r.industry_benchmark.get("top_games"):
            lines.append(f"- **行业代表**: {', '.join(r.industry_benchmark['top_games'])}")

        return "\n".join(lines)
