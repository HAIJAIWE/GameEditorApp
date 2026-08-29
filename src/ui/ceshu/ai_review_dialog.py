"""N6: AI 智能审阅对话框 — 5 维度结构化评分 + Top 3 改进建议

特性:
- 调用 CeshuSkill.ai_review action 进行结构化审阅
- 5 维度评分（内容完整性 / 逻辑一致性 / 市场可行性 / 技术可行性 / 创意度）
- 每个维度：1-10 分 + 详细文字反馈
- 总体评价 + Top 3 改进建议
- 使用 QThread 后台调用 AI（参考 _AIFillChapterWorker）
- 结果用 QTextBrowser 渲染 Markdown
- 支持导出审阅报告为 Markdown 文件
"""
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

from PyQt6.QtCore import Qt, QThread, pyqtSignal
from PyQt6.QtGui import QFont
from PyQt6.QtWidgets import (
    QDialog,
    QFileDialog,
    QHBoxLayout,
    QLabel,
    QMessageBox,
    QProgressBar,
    QPushButton,
    QTextBrowser,
    QVBoxLayout,
    QWidget,
)

from .ceshu_theme import theme_color

if TYPE_CHECKING:
    from core.ceshu.ceshu_model import CeshuModel


# === 维度元数据 ===

# 维度顺序与展示文案
DIMENSION_ORDER: list[str] = [
    "completeness", "consistency", "market", "technical", "creativity",
]

DIMENSION_LABELS: dict[str, str] = {
    "completeness": "内容完整性",
    "consistency": "逻辑一致性",
    "market": "市场可行性",
    "technical": "技术可行性",
    "creativity": "创意度",
}

# 分数 → 颜色（1-10 分制）
SCORE_COLORS_HI = "#22C55E"   # 8-10 良好/优秀
SCORE_COLORS_MID = "#3B82F6"  # 5-7 合格
SCORE_COLORS_LOW = "#F59E0B"  # 3-4 不足
SCORE_COLORS_FAIL = "#EF4444"  # 1-2 严重不足


def score_color(score: int) -> str:
    """根据 1-10 分返回对应颜色。

    Args:
        score: 1-10 的整数分数。

    Returns:
        颜色十六进制字符串。
    """
    if score >= 8:
        return SCORE_COLORS_HI
    if score >= 5:
        return SCORE_COLORS_MID
    if score >= 3:
        return SCORE_COLORS_LOW
    return SCORE_COLORS_FAIL


# === AI 调用 Worker ===

class _AIReviewWorker(QThread):
    """N6: AI 智能审阅 worker（后台线程，避免阻塞 UI）。

    信号:
        succeeded(dict): AI 审阅结构化数据
        failed(str): 错误信息
    """
    succeeded = pyqtSignal(dict)
    failed = pyqtSignal(str)

    def __init__(self, ceshu_id: str, library: str, parent=None) -> None:
        """初始化 AI 审阅 worker。

        Args:
            ceshu_id: 策划书 ID。
            library: 库名。
            parent: 父 QObject。
        """
        super().__init__(parent)
        self._ceshu_id = ceshu_id
        self._library = library

    def run(self) -> None:
        """线程入口：调用 CeshuSkill.ai_review 并发射结果信号。"""
        try:
            from core.agent.skills.ceshu_skill import CeshuSkill
            skill = CeshuSkill()
            params = {
                "action": "ai_review",
                "ceshu_id": self._ceshu_id,
                "library": self._library,
            }
            result = skill.execute(params, context={})
            if result.get("success"):
                data = result.get("data") or {}
                self.succeeded.emit(data)
            else:
                msg = result.get("message") or result.get("error") or "AI 审阅失败"
                self.failed.emit(msg)
        except Exception as e:
            self.failed.emit(f"AI 审阅异常: {e}")


# === 审阅对话框 ===

class AIReviewDialog(QDialog):
    """N6: AI 智能审阅对话框。

    后台调用 ``CeshuSkill.ai_review`` action，以 5 维度评分 + Top 3 改进建议
    展示审阅结果，并支持导出 Markdown 报告。
    """

    def __init__(self, model: CeshuModel, ceshu_id: str = "",
                 library: str = "", parent: QWidget | None = None) -> None:
        """初始化 AI 审阅对话框。

        Args:
            model: CeshuModel 实例（用于报告头与基本信息）。
            ceshu_id: 策划书 ID（用于 AI 调用）。
            library: 库名（用于 AI 调用）。
            parent: 父控件。
        """
        super().__init__(parent)
        self._model = model
        self._ceshu_id = ceshu_id or getattr(model, "ceshu_id", "")
        self._library = library or "默认库"
        self._review_data: dict[str, Any] = {}
        self._worker: _AIReviewWorker | None = None
        self._setup_ui()
        self._apply_theme()

    def _setup_ui(self) -> None:
        """搭建对话框界面。"""
        self.setWindowTitle("N6 AI 智能审阅")
        self.resize(880, 680)
        self.setMinimumSize(680, 520)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(16, 16, 16, 16)
        layout.setSpacing(12)

        layout.addWidget(self._build_header())
        layout.addWidget(self._build_progress_row())
        self._bars_container = self._build_dimension_bars()
        layout.addWidget(self._bars_container)
        layout.addWidget(self._build_report_view(), 1)
        layout.addLayout(self._build_bottom_buttons())

    def _build_header(self) -> QWidget:
        """构建标题 + 提示文案。"""
        container = QWidget()
        v = QVBoxLayout(container)
        v.setContentsMargins(0, 0, 0, 0)
        v.setSpacing(4)

        title = QLabel("🤖 AI 智能审阅")
        title.setFont(QFont("Microsoft YaHei", 14, QFont.Weight.Bold))
        title.setStyleSheet(f"color: {theme_color('fg')}; background: transparent;")
        v.addWidget(title)

        game_name = self._model.meta.get("game_name", "未命名") if self._model else "未命名"
        hint = QLabel(
            f"《{game_name}》 — 5 维度评分：内容完整性 / 逻辑一致性 / 市场可行性 / 技术可行性 / 创意度"
        )
        hint.setStyleSheet(
            f"color: {theme_color('hint')}; background: transparent; font-size: 12px;")
        v.addWidget(hint)
        return container

    def _build_progress_row(self) -> QWidget:
        """构建操作行：开始审阅按钮 + 状态标签。"""
        row = QWidget()
        h = QHBoxLayout(row)
        h.setContentsMargins(0, 0, 0, 0)
        h.setSpacing(8)

        self._btn_start = QPushButton("开始 AI 审阅")
        self._btn_start.clicked.connect(self._on_start_review)
        h.addWidget(self._btn_start)

        self._status_label = QLabel("（点击「开始 AI 审阅」启动后台调用）")
        self._status_label.setStyleSheet(
            f"color: {theme_color('hint')}; background: transparent; font-size: 12px;")
        h.addWidget(self._status_label, 1)
        return row

    def _build_dimension_bars(self) -> QWidget:
        """构建 5 维度评分条容器。"""
        container = QWidget()
        v = QVBoxLayout(container)
        v.setContentsMargins(0, 0, 0, 0)
        v.setSpacing(6)

        title = QLabel("评分维度")
        title.setFont(QFont("Microsoft YaHei", 12, QFont.Weight.Bold))
        title.setStyleSheet(f"color: {theme_color('fg')}; background: transparent;")
        v.addWidget(title)

        self._bars: dict[str, _ScoreBar] = {}
        for key in DIMENSION_ORDER:
            label = DIMENSION_LABELS[key]
            bar = _ScoreBar(label, 10)
            v.addWidget(bar)
            self._bars[key] = bar
        return container

    def _build_report_view(self) -> QTextBrowser:
        """构建 Markdown 报告视图。"""
        self._report = QTextBrowser()
        self._report.setOpenExternalLinks(True)
        self._report.setPlaceholderText("审阅完成后，此处展示总体评价 + Top 3 改进建议...")
        self._report.setHtml("<i>等待审阅结果...</i>")
        return self._report

    def _build_bottom_buttons(self) -> QHBoxLayout:
        """构建底部按钮行：导出 Markdown + 关闭。"""
        row = QHBoxLayout()
        row.addStretch()

        self._btn_export = QPushButton("导出 Markdown")
        self._btn_export.setEnabled(False)
        self._btn_export.clicked.connect(self._on_export_md)
        row.addWidget(self._btn_export)

        self._btn_close = QPushButton("关闭")
        self._btn_close.clicked.connect(self.accept)
        row.addWidget(self._btn_close)
        return row

    def _apply_theme(self) -> None:
        """应用对话框整体主题样式。"""
        bg = theme_color('input_bg') or '#1e1e1e'
        fg = theme_color('fg') or '#e0e0e0'
        border = theme_color('border') or '#3a3a3a'
        self.setStyleSheet(f"""
            QDialog {{ background: {bg}; color: {fg}; }}
            QLabel {{ background: transparent; color: {fg}; }}
            QTextBrowser {{
                background: {bg}; color: {fg};
                border: 1px solid {border};
            }}
            QPushButton {{
                background: {bg}; color: {fg};
                border: 1px solid {border}; padding: 6px 14px;
                border-radius: 4px;
            }}
            QPushButton:hover {{
                border-color: {theme_color('accent', '#4f8cf7')};
            }}
            QPushButton:disabled {{
                color: {theme_color('hint')};
            }}
        """)

    # ── 事件回调 ──

    def _on_start_review(self) -> None:
        """启动 AI 审阅 worker。"""
        if not self._ceshu_id:
            QMessageBox.warning(self, "AI 审阅", "缺少策划书 ID，无法启动审阅")
            return
        if self._worker and self._worker.isRunning():
            QMessageBox.information(self, "AI 审阅", "已有审阅任务进行中，请稍候")
            return

        self._btn_start.setEnabled(False)
        self._status_label.setText("正在调用 AI 进行结构化审阅，请稍候...")
        self._report.setHtml("<i>正在调用 AI，请稍候...</i>")

        self._worker = _AIReviewWorker(
            self._ceshu_id, self._library, parent=self)
        self._worker.succeeded.connect(self._on_review_done)
        self._worker.failed.connect(self._on_review_failed)
        self._worker.start()

    def _on_review_done(self, data: dict) -> None:
        """审阅成功：刷新维度评分条 + 渲染 Markdown 报告。"""
        self._btn_start.setEnabled(True)
        self._status_label.setText("✅ 审阅完成")
        self._review_data = data

        # 刷新评分条
        for dim in data.get("dimensions", []):
            key = dim.get("key", "")
            bar = self._bars.get(key)
            if bar is None:
                continue
            bar.set_value(int(dim.get("score", 0)))
            bar.set_feedback(str(dim.get("feedback", "")))

        # 渲染报告
        self._report.setMarkdown(self._build_markdown())
        self._btn_export.setEnabled(True)

    def _on_review_failed(self, error_msg: str) -> None:
        """审阅失败：恢复按钮状态并提示。"""
        self._btn_start.setEnabled(True)
        self._status_label.setText("❌ 审阅失败")
        self._report.setHtml(f"<span style='color:#EF4444;'>{error_msg}</span>")
        QMessageBox.warning(self, "AI 审阅失败", error_msg)

    # ── Markdown 生成与导出 ──

    def _build_markdown(self) -> str:
        """根据 _review_data 生成 Markdown 报告文本。"""
        if not self._review_data:
            return "(暂无审阅结果)"
        data = self._review_data
        game_name = self._model.meta.get("game_name", "未命名") if self._model else "未命名"
        lines = [
            "# AI 智能审阅报告",
            "",
            f"**游戏名称**: {game_name}",
            f"**审阅时间**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            "",
            "## 维度评分",
            "",
            "| 维度 | 分数 | 反馈 |",
            "|------|------|------|",
        ]
        for dim in data.get("dimensions", []):
            label = dim.get("label", "")
            score = dim.get("score", 0)
            feedback = str(dim.get("feedback", "")).replace("\n", " ").replace("|", "\\|")
            lines.append(f"| {label} | {score} / 10 | {feedback} |")

        lines.extend(["", "## 总体评价", "", data.get("overall", "（无）")])

        suggestions = data.get("suggestions", []) or []
        lines.extend(["", "## Top 3 改进建议", ""])
        for i, s in enumerate(suggestions[:3], 1):
            lines.append(f"{i}. {s}")

        progress = data.get("progress") or {}
        total = progress.get("total", 0)
        if total:
            lines.extend(["", f"**策划书完成进度**: {total*100:.0f}%"])
        validation_errors = data.get("validation_errors") or []
        if validation_errors:
            lines.append(f"**内置校验问题数**: {len(validation_errors)}")
        return "\n".join(lines)

    def _on_export_md(self) -> None:
        """导出审阅报告为 Markdown 文件。"""
        if not self._review_data:
            return
        path, _ = QFileDialog.getSaveFileName(
            self, "导出 AI 审阅报告", "AI审阅报告.md", "Markdown 文件 (*.md)")
        if not path:
            return
        try:
            md = self._build_markdown()
            with open(path, "w", encoding="utf-8") as f:
                f.write(md)
            QMessageBox.information(self, "导出成功", f"AI 审阅报告已导出:\n{path}")
        except Exception as e:
            QMessageBox.critical(self, "导出失败", str(e))


# === 评分条 widget ===

class _ScoreBar(QWidget):
    """评分条：标签 + 进度条 + 分数 + 反馈 tooltip。"""

    def __init__(self, label: str, max_value: int = 10, parent: QWidget | None = None) -> None:
        """初始化评分条。

        Args:
            label: 维度名称。
            max_value: 满分值（默认 10）。
            parent: 父控件。
        """
        super().__init__(parent)
        self._max = max_value
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
        self._bar.setRange(0, self._max)
        self._bar.setTextVisible(False)
        self._bar.setFixedHeight(14)
        self._bar.setValue(0)
        self._bar.setStyleSheet(f"""
            QProgressBar {{
                background: {theme_color('border')};
                border: 1px solid {theme_color('border')};
                border-radius: 7px;
            }}
            QProgressBar::chunk {{
                background: {SCORE_COLORS_MID};
                border-radius: 6px;
            }}
        """)
        layout.addWidget(self._bar, 1)

        self._value = QLabel(f"0 / {self._max}")
        self._value.setFixedWidth(60)
        self._value.setAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
        self._value.setStyleSheet(
            f"color: {theme_color('hint')}; background: transparent; font-weight: bold; font-size: 13px;")
        layout.addWidget(self._value)

    def set_value(self, score: int) -> None:
        """设置当前得分并刷新进度条与文本。"""
        color = score_color(score)
        self._bar.setValue(score)
        self._value.setText(f"{score} / {self._max}")
        self._value.setStyleSheet(
            f"color: {color}; background: transparent; font-weight: bold; font-size: 13px;")
        self._bar.setStyleSheet(f"""
            QProgressBar {{
                background: {theme_color('border')};
                border: 1px solid {theme_color('border')};
                border-radius: 7px;
            }}
            QProgressBar::chunk {{
                background: {color};
                border-radius: 6px;
            }}
        """)

    def set_feedback(self, feedback: str) -> None:
        """设置鼠标悬停时显示的反馈文案。"""
        self._label.setToolTip(feedback)
        self._bar.setToolTip(feedback)
        self._value.setToolTip(feedback)
