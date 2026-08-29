"""Agent OS §12 — PyQt 内置监控面板：实时显示系统运行指标"""
from PyQt6.QtCore import Qt, QTimer, pyqtSignal
from PyQt6.QtGui import QFont
from PyQt6.QtWidgets import QFrame, QGridLayout, QHBoxLayout, QLabel, QProgressBar, QPushButton, QVBoxLayout, QWidget

from ui.themes import theme_color


class AgentMonitorPanel(QWidget):
    """Agent OS 运行时监控面板 — 内嵌到设置/底部面板"""

    refresh_requested = pyqtSignal()

    def __init__(self, get_stats_callback=None, parent=None):
        super().__init__(parent)
        self._stats_fn = get_stats_callback or (lambda: {})
        self._build_ui()
        self._timer = QTimer(self)
        self._timer.timeout.connect(self._refresh)
        self._timer.start(5000)
        self.refresh_requested.connect(self._refresh)

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(12, 12, 12, 12)

        title = QLabel("🧠 Agent OS 运行监控")
        title.setFont(QFont("Microsoft YaHei", 11, QFont.Weight.Bold))
        layout.addWidget(title)

        self._grid = QGridLayout()
        self._grid.setSpacing(8)

        self._cards = {}
        metrics = [
            ("status", "状态", "---"),
            ("conversations", "对话数", "0"),
            ("success_rate", "成功率", "N/A"),
            ("failures", "失败数", "0"),
            ("tools", "工具数", "0"),
            ("agents", "智能体", "0"),
            ("uptime", "运行时间", "---"),
            ("memory", "记忆条目", "0"),
        ]
        for i, (key, label, default) in enumerate(metrics):
            card = self._make_card(label, default)
            row, col = divmod(i, 4)
            self._grid.addWidget(card, row, col)
            self._cards[key] = card

        layout.addLayout(self._grid)

        btn_row = QHBoxLayout()
        self._manual_btn = QPushButton("🔄 手动刷新")
        self._manual_btn.clicked.connect(self._refresh)
        self._manual_btn.setFixedHeight(28)
        btn_row.addStretch()
        btn_row.addWidget(self._manual_btn)
        layout.addLayout(btn_row)

        self._health_bar = QProgressBar()
        self._health_bar.setRange(0, 100)
        self._health_bar.setValue(100)
        self._health_bar.setFixedHeight(8)
        self._health_bar.setTextVisible(False)
        layout.addWidget(self._health_bar)

        layout.addStretch()

    def _make_card(self, label, value):
        frame = QFrame()
        frame.setFrameShape(QFrame.Shape.StyledPanel)
        frame.setMinimumWidth(120)
        fl = QVBoxLayout(frame)
        fl.setContentsMargins(8, 6, 8, 6)
        fl.setSpacing(2)

        lbl = QLabel(label)
        lbl.setStyleSheet(f"color: {theme_color('hint')}; font-size: 10px;")
        lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
        fl.addWidget(lbl)

        val = QLabel(value)
        val.setObjectName(f"mv_{label}")
        val.setFont(QFont("Consolas", 14, QFont.Weight.Bold))
        val.setAlignment(Qt.AlignmentFlag.AlignCenter)
        val.setStyleSheet(f"color: {theme_color('accent')};")
        fl.addWidget(val)
        return frame

    def _refresh(self):
        stats = self._stats_fn()
        if not stats:
            return
        self._update_card("status", stats.get("status", "---"))
        self._update_card("conversations", str(stats.get("conversations", 0)))
        self._update_card("success_rate", str(stats.get("success_rate", "N/A")))
        self._update_card("failures", str(stats.get("failure_count", 0)))
        self._update_card("tools", str(stats.get("tools_count", 0)))
        self._update_card("agents", str(stats.get("agents_loaded", 0)))
        self._update_card("uptime", stats.get("uptime", "---"))
        self._update_card("memory", str(stats.get("memory_entries", 0)))

        success_rate = stats.get("success_rate", "N/A")
        if success_rate != "N/A":
            try:
                parts = success_rate.split("/")
                rate = int(parts[0]) / max(int(parts[1]), 1) * 100
            except (ValueError, IndexError):
                rate = 50
            self._health_bar.setValue(int(rate))
            if rate > 80:
                self._health_bar.setStyleSheet(f"QProgressBar::chunk {{ background: {theme_color('accent')}; }}")
            elif rate > 50:
                self._health_bar.setStyleSheet(f"QProgressBar::chunk {{ background: {theme_color('accent_hover')}; }}")
            else:
                self._health_bar.setStyleSheet(f"QProgressBar::chunk {{ background: {theme_color('danger')}; }}")

    def _update_card(self, key, value):
        card = self._cards.get(key)
        if card:
            val_lbl = card.findChild(QLabel, f"mv_{key}")
            if val_lbl:
                val_lbl.setText(str(value))

    def set_stats_provider(self, fn):
        self._stats_fn = fn

    def closeEvent(self, event):
        self._timer.stop()
        super().closeEvent(event)
