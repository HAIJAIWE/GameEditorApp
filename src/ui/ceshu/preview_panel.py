"""编辑器实时预览面板 — 右侧上半区，根据 enabled_editors 动态渲染真实编辑器

包含「数据引用」标签页，实时显示策划书中 @data[...] 引用的当前值。
"""
from __future__ import annotations

from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtWidgets import (
    QLabel,
    QPushButton,
    QTabWidget,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from common.data_ref import extract_all_refs, resolve_ref
from common.event_bus import EventBus
from common.logger import get_logger

from .ceshu_theme import ceshu_preview_empty_qss, ceshu_preview_tab_qss, theme_color

logger = get_logger()


class EditorPreviewPanel(QWidget):
    """编辑器预览面板 — 策划书驱动编辑器的核心落地"""

    # 空状态里「去勾选游戏系统」按钮：主线为 策划书 → 数据，这里把下一步直接指出来
    goto_systems_requested = pyqtSignal()

    def __init__(self, data_manager=None, parent=None):
        super().__init__(parent)
        self._data_manager = data_manager
        self._editor_tabs = {}  # editor_key → DataEditorTab 实例
        self._ceshu_model = None
        self._setup_ui()
        EventBus().on("data_changed", self._on_data_changed)

    def _setup_ui(self) -> None:
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        self._tabs = QTabWidget()
        self._tabs.setDocumentMode(True)
        self._tabs.setMovable(True)
        self._tabs.setTabsClosable(False)
        self._tabs.setUsesScrollButtons(True)

        # 空状态 = 主线引导：先写策划书，再勾选游戏系统，数据编辑器才会出现
        self._empty_box = QWidget()
        empty_layout = QVBoxLayout(self._empty_box)
        empty_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)
        empty_layout.setSpacing(12)
        self._empty_label = QLabel(
            "设计游戏数据前，先启用游戏系统\n\n"
            "数据编辑器由策划书驱动：在左侧「第五章·游戏系统设计」\n"
            "勾选要做的系统后，对应的数据编辑器就会出现在这里。")
        self._empty_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._empty_label.setStyleSheet(ceshu_preview_empty_qss())
        empty_layout.addWidget(self._empty_label)
        self._goto_systems_btn = QPushButton("去「第五章·游戏系统设计」勾选")
        self._goto_systems_btn.setToolTip("跳转到第五章，勾选游戏系统后对应的数据编辑器会出现在这里")
        self._goto_systems_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._goto_systems_btn.clicked.connect(self.goto_systems_requested.emit)
        empty_layout.addWidget(self._goto_systems_btn, 0, Qt.AlignmentFlag.AlignCenter)

        # 数据引用标签 — 始终存在
        self._ref_tab = QWidget()
        ref_layout = QVBoxLayout(self._ref_tab)
        self._ref_display = QTextEdit()
        self._ref_display.setReadOnly(True)
        self._ref_display.setStyleSheet(f"""
            QTextEdit {{
                background: {theme_color('input_bg')};
                border: none; padding: 8px;
                font-size: 12px;
            }}
        """)
        ref_layout.addWidget(self._ref_display)
        self._tabs.addTab(self._ref_tab, "📊 数据引用")

        # 引导框在上、标签页在下：没有启用游戏系统时引导与「数据引用」同时可见，
        # 启用后引导自动隐藏、标签页占满整个面板
        layout.addWidget(self._empty_box)
        layout.addWidget(self._tabs, 1)
        self._tabs.hide()

    def set_data_manager(self, data_manager) -> None:
        """注入 DataManager"""
        self._data_manager = data_manager

    def set_ceshu_model(self, model) -> None:
        """注入当前 CeshuModel 以提取引用"""
        self._ceshu_model = model
        self._refresh_refs()

    def _on_data_changed(self, **_) -> None:
        """数据变更 → 刷新引用显示"""
        self._refresh_refs()

    def _refresh_refs(self) -> None:
        """刷新数据引用标签页内容（P7: 按数据类型分组 + 实时值显示）"""
        if not self._ceshu_model or not self._data_manager:
            return

        refs = extract_all_refs(self._ceshu_model)
        if not refs:
            self._ref_display.setPlainText(
                "当前策划书中没有使用 @data[...] 引用。\n\n"
                "在任意文本框中输入 @data[type_key.field_name] 即可引用数据。\n"
                "示例: @data[role.atk]  @data[skill.fireball.damage]"
            )
            return

        # P7: 按 type_key 分组，便于阅读
        from collections import defaultdict
        grouped: dict[str, list] = defaultdict(list)
        has_value = 0
        for ref in refs:
            value = resolve_ref(ref, self._data_manager)
            if value is not None:
                has_value += 1
            grouped[ref.type_key].append((ref, value))

        lines = ["📊 数据引用概览", "=" * 40, "",
                  f"共 {len(refs)} 个引用（有效 {has_value}/{len(refs)}）", ""]

        for type_key, items in grouped.items():
            lines.append(f"【{type_key}】({len(items)} 个引用)")
            for ref, value in items:
                if value is not None:
                    display_v = str(value)[:60]
                    lines.append(f"  ✓ {ref.full_path} = {display_v}")
                else:
                    lines.append(f"  ✗ {ref.full_path} (未找到)")
            lines.append("")

        self._ref_display.setPlainText("\n".join(lines))

    def refresh(self, enabled_editors: list) -> None:
        """根据启用的游戏系统列表刷新标签页

        Args:
            enabled_editors: 启用的游戏系统列表，每个元素可以是:
                - str: 游戏系统键名（兼容旧格式）
                - dict: 包含 key, name, data_type 的字典
        """
        # 先刷新数据引用
        self._refresh_refs()

        # 关键修复：clear() 会把所有 tab 页面的 parent 置为 None。
        # 之前被 addTab 隐式 show 过的 tab 页面在解除 parent 时会
        # 作为独立顶层窗口闪烁一下（"弹一下就消失"）。
        # 解决方案：hide 整个 QTabWidget 再 clear，阻止所有 tab 变身顶层窗口。
        self._tabs.hide()
        self._tabs.clear()
        self._editor_tabs.clear()

        if not enabled_editors:
            # 没有启用的游戏系统：保留只读的「数据引用」，同时把「下一步该做什么」直接摆出来
            self._tabs.addTab(self._ref_tab, "📊 数据引用")
            self._tabs.show()
            self._empty_box.show()
            return

        self._tabs.show()
        self._empty_box.hide()

        for entry in enabled_editors:
            # 兼容 str 和 dict 两种格式
            if isinstance(entry, str):
                editor_key = entry
                name = entry
                data_type = entry
            else:
                editor_key = entry.get("key", "")
                name = entry.get("name", editor_key)
                data_type = entry.get("data_type", editor_key)

            if data_type and self._data_manager:
                # 创建真实的数据编辑器 Tab
                try:
                    from ui.data_tab import DataEditorTab
                    tab: QWidget = DataEditorTab(data_type, self._data_manager, parent=self)
                    self._editor_tabs[editor_key] = tab
                    self._tabs.addTab(tab, name)
                    continue
                except Exception as e:
                    logger.warning(f"操作失败: {e}")  # fallback 到占位

            # 占位面板（无 data_manager 或无映射）
            tab = QWidget(parent=self)
            tab_layout = QVBoxLayout(tab)
            info = QLabel(
                f"{name}编辑器面板\n\n"
                f"数据类型: {data_type or '未映射'}\n"
                f"请确保数据管理器已初始化。")
            info.setAlignment(Qt.AlignmentFlag.AlignCenter)
            info.setStyleSheet(ceshu_preview_tab_qss())
            tab_layout.addWidget(info)
            self._tabs.addTab(tab, name)

        # 数据引用标签 — 始终在最后一个 tab
        self._tabs.addTab(self._ref_tab, "📊 数据引用")

    def get_editor(self, editor_key: str):
        """获取指定游戏系统的编辑器实例"""
        return self._editor_tabs.get(editor_key)

    def focus_first_editor(self) -> bool:
        """切到第一个数据编辑器标签页

        供「主线导航」（策划书写完 → 设计游戏数据）与 AI 技能切换数据类型时使用。
        返回 False 表示当前没有已启用的游戏系统。
        """
        if not self._editor_tabs:
            return False
        self._empty_box.hide()
        self._tabs.show()
        self._tabs.setCurrentIndex(0)
        return True
