"""v5.0 优化D: 混合玩法预设模板市场

可视化展示 HYBRID_GAMEPLAY_PRESETS 全部 18 个预设：
- 卡片式布局（标签 / 风格 / 模块 / 推荐系统 / 特色）
- 搜索框实时筛选（按 label/style/module_type）
- 一键应用：将预设的 recommended_systems 写入策划书 systems 字段
- 应用前确认对话框（展示将被启用的系统列表）
"""
from __future__ import annotations

from PyQt6.QtCore import QSize, Qt, pyqtSignal
from PyQt6.QtGui import QFont
from PyQt6.QtWidgets import (
    QDialog,
    QFrame,
    QGridLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMessageBox,
    QPushButton,
    QScrollArea,
    QVBoxLayout,
    QWidget,
)

from core.ceshu.ceshu_constants import HYBRID_GAMEPLAY_PRESETS
from core.ceshu.ceshu_model import SYSTEM_LABELS
from ui.themes import theme_color

# 风格对应的颜色徽章
_STYLE_BADGE_COLORS = {
    "xianxia":    "#9c27b0",  # 紫
    "wuxia":      "#795548",  # 棕
    "sci-fi":     "#2196f3",  # 蓝
    "post_apoc":  "#7e57c2",  # 暗紫
    "fantasy":    "#4caf50",  # 绿
    "realistic":  "#607d8b",  # 灰蓝
    "anime":      "#ec407a",  # 粉
    "dark":       "#424242",  # 黑
    "cyberpunk":  "#00bcd4",  # 青
    "steampunk":  "#a1887f",  # 棕褐
}


def _style_badge(style: str) -> str:
    """返回风格的 HTML 徽章"""
    color = _STYLE_BADGE_COLORS.get(style, "#757575")
    return (f"<span style='background:{color}; color:white; "
            f"padding:2px 8px; border-radius:8px; font-size:10px; "
            f"font-weight:bold;'>{style}</span>")


def _module_badge(module_type: str) -> str:
    """返回模块类型的 HTML 徽章"""
    return (f"<span style='background:{theme_color('accent')}; color:white; "
            f"padding:2px 8px; border-radius:8px; font-size:10px; "
            f"font-weight:bold;'>{module_type.upper()}</span>")


class PresetCard(QFrame):
    """单个预设卡片"""

    apply_requested = pyqtSignal(str)  # preset_key

    def __init__(self, preset_key: str, preset: dict, parent=None):
        super().__init__(parent)
        self._key = preset_key
        self._preset = preset
        self._setup_ui()
        self._apply_theme()

    def _setup_ui(self) -> None:
        self.setFrameShape(QFrame.Shape.StyledPanel)
        self.setMinimumHeight(160)
        self.setCursor(Qt.CursorShape.PointingHandCursor)

        v = QVBoxLayout(self)
        v.setContentsMargins(12, 10, 12, 10)
        v.setSpacing(6)

        # 第一行：label + 风格徽章 + 模块徽章
        top_row = QHBoxLayout()
        title = QLabel(self._preset.get("label", self._key))
        title.setFont(QFont("Microsoft YaHei", 12, QFont.Weight.Bold))
        title.setStyleSheet(f"color: {theme_color('fg')}; border: none; background: transparent;")
        top_row.addWidget(title)
        top_row.addStretch()

        style_label = QLabel(_style_badge(self._preset.get("style", "")))
        style_label.setTextFormat(Qt.TextFormat.RichText)
        style_label.setStyleSheet("border: none; background: transparent;")
        top_row.addWidget(style_label)

        module_label = QLabel(_module_badge(self._preset.get("module_type", "")))
        module_label.setTextFormat(Qt.TextFormat.RichText)
        module_label.setStyleSheet("border: none; background: transparent;")
        top_row.addWidget(module_label)
        v.addLayout(top_row)

        # 第二行：特色说明
        highlight = self._preset.get("highlight", "")
        if highlight:
            hl_label = QLabel(f"💡 {highlight}")
            hl_label.setWordWrap(True)
            hl_label.setStyleSheet(
                f"color: {theme_color('hint')}; font-size: 11px; "
                f"border: none; background: transparent;")
            v.addWidget(hl_label)

        # 第三行：推荐系统标签
        rec_systems = self._preset.get("recommended_systems", [])
        if rec_systems:
            sys_names = [SYSTEM_LABELS.get(s, s) for s in rec_systems[:6]]
            sys_text = "、".join(sys_names)
            if len(rec_systems) > 6:
                sys_text += f" 等 {len(rec_systems)} 项"
            sys_label = QLabel(f"⚙ 推荐系统: {sys_text}")
            sys_label.setWordWrap(True)
            sys_label.setStyleSheet(
                f"color: {theme_color('fg')}; font-size: 11px; "
                f"border: none; background: transparent;")
            v.addWidget(sys_label)

        # 第四行：副模块
        sec_modules = self._preset.get("secondary_modules", [])
        if sec_modules:
            sec_text = " + ".join(sec_modules)
            sec_label = QLabel(f"🔗 副模块: {sec_text}")
            sec_label.setStyleSheet(
                f"color: {theme_color('hint')}; font-size: 10px; "
                f"border: none; background: transparent;")
            v.addWidget(sec_label)

        v.addStretch()

        # 应用按钮
        btn_row = QHBoxLayout()
        btn_row.addStretch()
        apply_btn = QPushButton("应用此预设")
        apply_btn.clicked.connect(lambda: self.apply_requested.emit(self._key))
        apply_btn.setStyleSheet(f"""
            QPushButton {{
                background: {theme_color('accent')};
                color: white;
                border: none;
                border-radius: 4px;
                padding: 4px 14px;
                font-size: 11px;
            }}
            QPushButton:hover {{ background: {theme_color('accent_hover')}; }}
        """)
        btn_row.addWidget(apply_btn)
        v.addLayout(btn_row)

    def _apply_theme(self) -> None:
        self.setStyleSheet(f"""
            QFrame {{
                background: {theme_color('input_bg')};
                border: 1px solid {theme_color('border')};
                border-radius: 8px;
            }}
            QFrame:hover {{
                border: 1px solid {theme_color('accent')};
                background: {theme_color('hover')};
            }}
        """)


class PresetMarketDialog(QDialog):
    """混合玩法预设模板市场"""

    preset_applied = pyqtSignal(str)  # preset_key

    def __init__(self, model=None, parent=None):
        super().__init__(parent)
        self._model = model
        self.setWindowTitle("混合玩法预设市场")
        self.setMinimumSize(QSize(900, 640))
        self._cards: list[PresetCard] = []
        self._setup_ui()
        self._apply_theme()

    def _setup_ui(self) -> None:
        layout = QVBoxLayout(self)
        layout.setContentsMargins(16, 12, 16, 12)
        layout.setSpacing(10)

        # 标题
        title = QLabel("🎨 混合玩法预设市场")
        title.setFont(QFont("Microsoft YaHei", 14, QFont.Weight.Bold))
        layout.addWidget(title)

        subtitle = QLabel(f"共 {len(HYBRID_GAMEPLAY_PRESETS)} 个工业级预设 · 点击卡片即可应用到当前策划书")
        subtitle.setStyleSheet(f"color: {theme_color('hint')}; font-size: 11px;")
        layout.addWidget(subtitle)

        # 搜索框
        search_row = QHBoxLayout()
        self._search = QLineEdit()
        self._search.setPlaceholderText("🔍 搜索预设（按名称/风格/模块类型）...")
        self._search.textChanged.connect(self._on_search)
        self._search.setStyleSheet(f"""
            QLineEdit {{
                background: {theme_color('input_bg')};
                border: 1px solid {theme_color('border')};
                border-radius: 6px;
                padding: 6px 10px;
                color: {theme_color('fg')};
                font-size: 12px;
            }}
        """)
        search_row.addWidget(self._search)
        layout.addLayout(search_row)

        # 卡片网格（可滚动）
        self._scroll = QScrollArea()
        self._scroll.setWidgetResizable(True)
        self._scroll.setFrameShape(QFrame.Shape.NoFrame)

        self._grid_container = QWidget()
        self._grid_layout = QGridLayout(self._grid_container)
        self._grid_layout.setContentsMargins(0, 0, 0, 0)
        self._grid_layout.setSpacing(10)
        self._scroll.setWidget(self._grid_container)
        layout.addWidget(self._scroll)

        # 关闭按钮
        btn_row = QHBoxLayout()
        btn_row.addStretch()
        btn_close = QPushButton("关闭")
        btn_close.clicked.connect(self.accept)
        btn_row.addWidget(btn_close)
        layout.addLayout(btn_row)

        # 渲染所有卡片
        self._render_cards("")

    def _render_cards(self, keyword: str) -> None:
        """根据关键字渲染卡片"""
        # 清空旧卡片
        while self._grid_layout.count():
            item = self._grid_layout.takeAt(0)
            if item.widget():
                item.widget().setParent(None)
                item.widget().deleteLater()
        self._cards.clear()

        # 按关键字筛选
        kw = keyword.strip().lower()
        items = []
        for key, preset in HYBRID_GAMEPLAY_PRESETS.items():
            if not kw:
                items.append((key, preset))
                continue
            # 搜索 label / style / module_type / highlight
            searchable = " ".join([
                preset.get("label", ""),
                preset.get("style", ""),
                preset.get("module_type", ""),
                preset.get("highlight", ""),
                key,
            ]).lower()
            if kw in searchable:
                items.append((key, preset))

        # 双列网格布局
        for i, (key, preset) in enumerate(items):
            row = i // 2
            col = i % 2
            card = PresetCard(key, preset, parent=self)
            card.apply_requested.connect(self._on_apply)
            self._grid_layout.addWidget(card, row, col)
            self._cards.append(card)

        # 占位提示
        if not items:
            empty = QLabel(f"未找到匹配 '{keyword}' 的预设")
            empty.setAlignment(Qt.AlignmentFlag.AlignCenter)
            empty.setStyleSheet(f"color: {theme_color('hint')}; font-size: 13px; padding: 40px;")
            self._grid_layout.addWidget(empty, 0, 0, 1, 2)

    def _on_search(self, text: str) -> None:
        self._render_cards(text)

    def _on_apply(self, preset_key: str) -> None:
        """应用预设到当前策划书"""
        if not self._model:
            QMessageBox.information(self, "应用预设", "请先加载策划书")
            return
        preset = HYBRID_GAMEPLAY_PRESETS.get(preset_key)
        if not preset:
            return

        # 确认对话框
        rec_systems = preset.get("recommended_systems", [])
        sys_names = "\n".join(f"  ✓ {SYSTEM_LABELS.get(s, s)}" for s in rec_systems)
        reply = QMessageBox.question(
            self, "应用预设",
            f"将应用预设【{preset.get('label', preset_key)}】\n\n"
            f"风格: {preset.get('style', '')}\n"
            f"模块: {preset.get('module_type', '')}\n\n"
            f"将启用以下 {len(rec_systems)} 个游戏系统:\n{sys_names}\n\n"
            f"已启用的系统不会被关闭，预设系统将被开启。\n确定应用？",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
        )
        if reply != QMessageBox.StandardButton.Yes:
            return

        # 应用：启用推荐系统
        applied = 0
        for sys_key in rec_systems:
            if sys_key in self._model.systems:
                cfg = self._model.systems[sys_key]
                if isinstance(cfg, dict) and not cfg.get("enabled"):
                    cfg["enabled"] = True
                    applied += 1

        # 同步风格到 meta（如果空）
        if not self._model.meta.get("game_type"):
            self._model.meta["game_type"] = preset.get("module_type", "")

        self.preset_applied.emit(preset_key)
        QMessageBox.information(
            self, "应用成功",
            f"已应用预设【{preset.get('label', preset_key)}】\n"
            f"新启用 {applied} 个游戏系统，已存在的系统保持启用。\n"
            f"请记得保存策划书。")

    def _apply_theme(self) -> None:
        self.setStyleSheet(f"""
            QDialog {{ background: {theme_color('bg')}; color: {theme_color('fg')}; }}
            QLabel {{ color: {theme_color('fg')}; }}
            QScrollArea {{ background: transparent; border: none; }}
            QPushButton {{
                background: {theme_color('accent')};
                color: white;
                border: none;
                border-radius: 4px;
                padding: 6px 18px;
                font-size: 12px;
            }}
            QPushButton:hover {{ background: {theme_color('accent_hover')}; }}
        """)
