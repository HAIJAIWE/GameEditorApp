"""N15: 变更日志对话框 — 从版本对比生成 changelog 并导出

特性:
- 顶部：版本范围选择（从版本 / 到版本）
- 中间：变更日志内容（QTextBrowser 渲染 Markdown）
- 底部：导出 Markdown / 导出 HTML / 导出 Text / 关闭
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from PyQt6.QtCore import pyqtSignal
from PyQt6.QtGui import QFont
from PyQt6.QtWidgets import (
    QComboBox,
    QDialog,
    QFileDialog,
    QHBoxLayout,
    QLabel,
    QMessageBox,
    QPushButton,
    QTextBrowser,
    QVBoxLayout,
    QWidget,
)

from core.ceshu.ceshu_changelog import (
    Changelog,
    generate_changelog,
    generate_changelog_between,
)

from .ceshu_theme import theme_color

if TYPE_CHECKING:
    from core.ceshu.ceshu_manager import CeshuManager


# 主题色兜底值
_DEFAULT_COLORS: dict[str, str] = {
    "input_bg": "#1e1e1e",
    "fg": "#e0e0e0",
    "border": "#3a3a3a",
    "hint": "#888888",
    "accent": "#4f8cf7",
}


def _color(key: str, default: str = "") -> str:
    """获取主题色，缺失时回退到 _DEFAULT_COLORS。"""
    return theme_color(key) or _DEFAULT_COLORS.get(key, default)


class ChangelogDialog(QDialog):
    """N15: 变更日志对话框

    信号:
        changelog_generated(str): 用户点击"生成"后发出，参数为生成的 Markdown 文本
    """

    changelog_generated = pyqtSignal(str)

    def __init__(self, manager: CeshuManager | None,
                 library: str,
                 current_ceshu_id: str = "",
                 parent: QWidget | None = None) -> None:
        """初始化变更日志对话框。

        Args:
            manager: CeshuManager 实例（可为 None，仅显示提示）。
            library: 库名。
            current_ceshu_id: 当前策划书 ID（用于查找版本链）。
            parent: 父 QWidget。
        """
        super().__init__(parent)
        self._manager = manager
        self._library = library
        self._current_ceshu_id = current_ceshu_id
        self._versions: list = []
        self._changelog: Changelog | None = None
        self._setup_ui()
        self._apply_theme()
        self._load_versions()

    # ── UI 构建 ──

    def _setup_ui(self) -> None:
        """搭建对话框整体布局。"""
        self.setWindowTitle("N15 变更日志 — 从版本对比生成 changelog")
        self.resize(900, 640)
        self.setMinimumSize(720, 500)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(12, 12, 12, 12)
        layout.setSpacing(8)

        layout.addWidget(self._build_header())
        layout.addLayout(self._build_version_selector())
        layout.addWidget(self._build_content(), 1)
        layout.addLayout(self._build_bottom_buttons())

    def _build_header(self) -> QWidget:
        """构建标题与提示。"""
        container = QWidget()
        v = QVBoxLayout(container)
        v.setContentsMargins(0, 0, 0, 0)
        v.setSpacing(4)

        title = QLabel("📋 变更日志生成器")
        title.setFont(QFont("Microsoft YaHei", 14, QFont.Weight.Bold))
        title.setStyleSheet(
            f"color: {_color('fg')}; background: transparent;")
        v.addWidget(title)

        hint = QLabel(
            "选择版本范围，自动生成 changelog。可导出为 Markdown / HTML / 纯文本。"
        )
        hint.setStyleSheet(
            f"color: {_color('hint')}; background: transparent; font-size: 12px;")
        v.addWidget(hint)
        return container

    def _build_version_selector(self) -> QHBoxLayout:
        """构建版本范围选择行。"""
        row = QHBoxLayout()
        row.setSpacing(8)

        row.addWidget(QLabel("从版本:"))
        self._combo_from = QComboBox()
        row.addWidget(self._combo_from, 1)

        row.addWidget(QLabel("到版本:"))
        self._combo_to = QComboBox()
        row.addWidget(self._combo_to, 1)

        self._btn_generate = QPushButton("生成")
        self._btn_generate.clicked.connect(self._on_generate)
        row.addWidget(self._btn_generate)

        self._btn_generate_all = QPushButton("生成全部")
        self._btn_generate_all.setToolTip("生成同版本链下所有版本的完整 changelog")
        self._btn_generate_all.clicked.connect(self._on_generate_all)
        row.addWidget(self._btn_generate_all)
        return row

    def _build_content(self) -> QTextBrowser:
        """构建变更日志内容区。"""
        self._browser = QTextBrowser()
        self._browser.setOpenExternalLinks(True)
        self._browser.setPlaceholderText("选择版本范围并点击「生成」...")
        return self._browser

    def _build_bottom_buttons(self) -> QHBoxLayout:
        """构建底部按钮行。"""
        row = QHBoxLayout()

        self._btn_export_md = QPushButton("导出 Markdown")
        self._btn_export_md.setEnabled(False)
        self._btn_export_md.clicked.connect(lambda: self._on_export("md"))
        row.addWidget(self._btn_export_md)

        self._btn_export_html = QPushButton("导出 HTML")
        self._btn_export_html.setEnabled(False)
        self._btn_export_html.clicked.connect(lambda: self._on_export("html"))
        row.addWidget(self._btn_export_html)

        self._btn_export_text = QPushButton("导出 Text")
        self._btn_export_text.setEnabled(False)
        self._btn_export_text.clicked.connect(lambda: self._on_export("text"))
        row.addWidget(self._btn_export_text)

        row.addStretch()

        self._btn_close = QPushButton("关闭")
        self._btn_close.clicked.connect(self.accept)
        row.addWidget(self._btn_close)
        return row

    def _apply_theme(self) -> None:
        """应用主题样式。"""
        bg = _color("input_bg")
        fg = _color("fg")
        border = _color("border")
        accent = _color("accent")
        self.setStyleSheet(f"""
            QDialog {{ background: {bg}; color: {fg}; }}
            QLabel {{ background: transparent; color: {fg}; }}
            QComboBox, QTextBrowser {{
                background: {bg}; color: {fg};
                border: 1px solid {border}; border-radius: 4px;
                padding: 4px 6px;
            }}
            QPushButton {{
                background: {bg}; color: {fg};
                border: 1px solid {border}; padding: 6px 14px;
                border-radius: 4px;
            }}
            QPushButton:hover {{
                border-color: {accent};
            }}
            QPushButton:disabled {{
                color: {_color('hint')};
            }}
        """)

    # ── 数据加载 ──

    def _load_versions(self) -> None:
        """加载同版本链下的所有版本到下拉框。"""
        if not self._manager or not self._current_ceshu_id:
            return
        try:
            cur = self._manager.get_ceshu(self._current_ceshu_id, self._library)
            root_id = cur.parent_id or cur.ceshu_id
            self._versions = self._manager.list_versions(self._library, root_id)
        except Exception as e:
            QMessageBox.warning(self, "加载版本", f"加载版本列表失败: {e}")
            return

        self._combo_from.clear()
        self._combo_to.clear()
        for v in self._versions:
            label = f"{v.get('version_label', 'v?')} - {v.get('name', '未命名')}"
            if v.get("is_active"):
                label += " ★激活"
            cid = v.get("ceshu_id", "")
            self._combo_from.addItem(label, cid)
            self._combo_to.addItem(label, cid)
        # 默认范围：首 → 末
        if len(self._versions) >= 2:
            self._combo_from.setCurrentIndex(0)
            self._combo_to.setCurrentIndex(len(self._versions) - 1)

    # ── 生成 changelog ──

    def _on_generate(self) -> None:
        """生成两个指定版本之间的 changelog。"""
        from_id = self._combo_from.currentData()
        to_id = self._combo_to.currentData()
        if not from_id or not to_id or from_id == to_id:
            QMessageBox.information(self, "生成", "请选择两个不同的版本")
            return
        try:
            assert self._manager is not None
            old_model = self._manager.get_ceshu(from_id, self._library)
            new_model = self._manager.get_ceshu(to_id, self._library)
        except Exception as e:
            QMessageBox.warning(self, "生成", f"加载版本失败: {e}")
            return
        try:
            entry = generate_changelog_between(
                old_model=old_model,
                new_model=new_model,
                version_label=new_model.version_label,
                date=new_model.updated_at or new_model.created_at,
            )
        except Exception as e:
            QMessageBox.warning(self, "生成", f"生成 changelog 失败: {e}")
            return
        self._changelog = Changelog(entries=[entry])
        self._render()
        self._set_export_enabled(True)
        self.changelog_generated.emit(self._changelog.to_markdown())

    def _on_generate_all(self) -> None:
        """生成同版本链下所有版本的完整 changelog。"""
        if not self._versions or len(self._versions) < 2:
            QMessageBox.information(self, "生成全部", "版本数不足，至少需要 2 个版本")
            return
        try:
            assert self._manager is not None  # _manager 缺失时由下方 except 捕获并提示
            self._changelog = generate_changelog(
                self._versions, self._manager, self._library,
            )
        except Exception as e:
            QMessageBox.warning(self, "生成全部", f"生成 changelog 失败: {e}")
            return
        self._render()
        self._set_export_enabled(True)
        self.changelog_generated.emit(self._changelog.to_markdown())

    def _render(self) -> None:
        """渲染 changelog 到 QTextBrowser。"""
        if not self._changelog:
            return
        # QTextBrowser 支持 HTML 子集，使用 HTML 渲染效果更稳定
        self._browser.setHtml(self._changelog.to_html())

    def _set_export_enabled(self, enabled: bool) -> None:
        """启用/禁用导出按钮。"""
        self._btn_export_md.setEnabled(enabled)
        self._btn_export_html.setEnabled(enabled)
        self._btn_export_text.setEnabled(enabled)

    # ── 导出 ──

    def _on_export(self, fmt: str) -> None:
        """导出 changelog 为指定格式。

        Args:
            fmt: 格式标识 — "md" / "html" / "text"
        """
        if not self._changelog:
            return
        if fmt == "md":
            content = self._changelog.to_markdown()
            default_name = "changelog.md"
            ffilter = "Markdown 文件 (*.md)"
        elif fmt == "html":
            content = self._changelog.to_html()
            default_name = "changelog.html"
            ffilter = "HTML 文件 (*.html)"
        else:
            content = self._changelog.to_text()
            default_name = "changelog.txt"
            ffilter = "文本文件 (*.txt)"
        path, _ = QFileDialog.getSaveFileName(
            self, "导出 changelog", default_name, ffilter)
        if not path:
            return
        try:
            with open(path, "w", encoding="utf-8") as f:
                f.write(content)
            QMessageBox.information(self, "导出成功", f"已导出到:\n{path}")
        except Exception as e:
            QMessageBox.critical(self, "导出失败", str(e))
