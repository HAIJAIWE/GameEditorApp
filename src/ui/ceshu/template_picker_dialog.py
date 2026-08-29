"""N5: 章节模板选择对话框 — 搜索 + 预览 + 一键应用

特性:
- 双列布局：左侧模板列表 + 右侧预览
- 支持按章节过滤 + 关键词搜索
- 三种应用模式：仅填充空字段 / 覆盖现有字段 / 追加到字段末尾
- 应用前二次确认，防止误操作
"""
from __future__ import annotations

from enum import Enum
from typing import TYPE_CHECKING, Any

from PyQt6.QtCore import QSize, Qt, pyqtSignal
from PyQt6.QtGui import QFont
from PyQt6.QtWidgets import (
    QComboBox,
    QDialog,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QMessageBox,
    QPushButton,
    QSplitter,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from core.ceshu.ceshu_model import CHAPTER_KEYS, CHAPTER_LABELS

from .ceshu_theme import theme_color
from .chapter_templates import (
    list_templates,
    merge_template_to_chapter,
    search_templates,
)

if TYPE_CHECKING:
    # 仅用于类型提示，避免运行时循环导入
    from core.ceshu.ceshu_model import CeshuModel


class ApplyMode(str, Enum):
    """模板应用模式枚举。

    继承 str 使其可直接与字符串字面量比较，也方便作为 QComboBox 的 userData。
    """

    FILL_EMPTY = "fill_empty"  # 仅填充空字段（推荐）
    OVERWRITE = "overwrite"    # 覆盖现有字段
    APPEND = "append"          # 追加到字段末尾（仅文本字段）


# 主题色兜底值：当 theme_color(key) 返回空时使用
_DEFAULT_COLORS: dict[str, str] = {
    "input_bg": "#1e1e1e",
    "fg": "#e0e0e0",
    "border": "#3a3a3a",
    "hint": "#888888",
    "accent": "#4f8cf7",
    "accent_light": "rgba(79,140,247,0.15)",
    "accent_hover_light": "#4f8cf7",
}


def _color(key: str, default: str = "") -> str:
    """获取主题色，缺失时回退到 _DEFAULT_COLORS。

    Args:
        key: 主题色键名（如 'input_bg' / 'accent'）。
        default: 当 _DEFAULT_COLORS 也没有该键时的最终回退值。

    Returns:
        主题色字符串（CSS 颜色值）。
    """
    return theme_color(key) or _DEFAULT_COLORS.get(key, default)


class TemplatePickerDialog(QDialog):
    """N5: 章节模板选择对话框

    信号:
        template_applied(str, dict): (chapter_key, merged_data) — 应用模板后发出
    """

    template_applied = pyqtSignal(str, dict)

    def __init__(self, model: CeshuModel | None, current_chapter: str = "meta",
                 parent: QWidget | None = None) -> None:
        """初始化模板选择对话框。

        Args:
            model: 当前的 CeshuModel 实例，用于读取现有章节数据；可为 None。
            current_chapter: 打开对话框时默认选中的章节 key。
            parent: 父 QWidget。
        """
        super().__init__(parent)
        self._model = model
        self._current_chapter = current_chapter
        self._setup_ui()
        self._load_templates()

    def _setup_ui(self) -> None:
        """搭建对话框的整体布局，编排各子区域。"""
        self.setWindowTitle("N5 章节模板库 — 一键插入范例")
        self.resize(900, 600)
        self.setMinimumSize(700, 500)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(12, 12, 12, 12)
        layout.setSpacing(8)

        self._build_header(layout)
        self._build_filter_row(layout)
        self._build_splitter(layout)
        self._build_mode_row(layout)
        self._build_button_row(layout)

        self._apply_theme()

    def _build_header(self, layout: QVBoxLayout) -> None:
        """构建顶部标题 + 描述提示。"""
        title = QLabel("📚 章节模板库")
        title.setFont(QFont("Microsoft YaHei", 14, QFont.Weight.Bold))
        title.setStyleSheet(f"color: {theme_color('fg')}; background: transparent;")
        layout.addWidget(title)

        hint = QLabel("每章预置 3-5 个高质量范例，支持搜索与一键应用。应用前可预览内容。")
        hint.setStyleSheet(f"color: {theme_color('hint')}; background: transparent; font-size: 12px;")
        layout.addWidget(hint)

    def _build_filter_row(self, layout: QVBoxLayout) -> None:
        """构建章节下拉 + 关键词搜索栏。"""
        filter_row = QHBoxLayout()
        filter_row.setSpacing(8)

        filter_row.addWidget(QLabel("章节:"))
        self._chapter_combo = QComboBox()
        self._chapter_combo.addItem("全部章节", "")
        for key in CHAPTER_KEYS:
            label = CHAPTER_LABELS.get(key, key)
            self._chapter_combo.addItem(label, key)
        # 默认选中当前章节
        idx = self._chapter_combo.findData(self._current_chapter)
        if idx >= 0:
            self._chapter_combo.setCurrentIndex(idx)
        self._chapter_combo.currentIndexChanged.connect(self._on_filter_changed)
        filter_row.addWidget(self._chapter_combo, 1)

        filter_row.addWidget(QLabel("搜索:"))
        self._search_edit = QLineEdit()
        self._search_edit.setPlaceholderText("按名称/描述/标签搜索...")
        self._search_edit.textChanged.connect(self._on_filter_changed)
        filter_row.addWidget(self._search_edit, 2)

        layout.addLayout(filter_row)

    def _build_splitter(self, layout: QVBoxLayout) -> None:
        """构建左右分栏：模板列表 + 模板预览。"""
        splitter = QSplitter(Qt.Orientation.Horizontal)

        # 左：模板列表
        left = QWidget()
        left_layout = QVBoxLayout(left)
        left_layout.setContentsMargins(0, 0, 0, 0)
        left_layout.setSpacing(4)

        list_label = QLabel("模板列表")
        list_label.setFont(QFont("Microsoft YaHei", 11, QFont.Weight.Bold))
        left_layout.addWidget(list_label)

        self._list = QListWidget()
        self._list.setIconSize(QSize(20, 20))
        self._list.itemSelectionChanged.connect(self._on_template_selected)
        left_layout.addWidget(self._list, 1)
        splitter.addWidget(left)

        # 右：预览
        right = QWidget()
        right_layout = QVBoxLayout(right)
        right_layout.setContentsMargins(0, 0, 0, 0)
        right_layout.setSpacing(4)

        preview_label = QLabel("模板预览")
        preview_label.setFont(QFont("Microsoft YaHei", 11, QFont.Weight.Bold))
        right_layout.addWidget(preview_label)

        self._preview = QTextEdit()
        self._preview.setReadOnly(True)
        self._preview.setPlaceholderText("选择左侧模板查看预览...")
        right_layout.addWidget(self._preview, 1)
        splitter.addWidget(right)

        splitter.setSizes([350, 550])
        layout.addWidget(splitter, 1)

    def _build_mode_row(self, layout: QVBoxLayout) -> None:
        """构建应用模式选择行。"""
        mode_row = QHBoxLayout()
        mode_row.setSpacing(12)

        mode_row.addWidget(QLabel("应用模式:"))
        self._mode_combo = QComboBox()
        self._mode_combo.addItem("仅填充空字段（推荐，不覆盖现有内容）", ApplyMode.FILL_EMPTY)
        self._mode_combo.addItem("覆盖现有字段（替换为模板内容）", ApplyMode.OVERWRITE)
        self._mode_combo.addItem("追加到字段末尾（仅文本字段）", ApplyMode.APPEND)
        mode_row.addWidget(self._mode_combo, 1)

        layout.addLayout(mode_row)

    def _build_button_row(self, layout: QVBoxLayout) -> None:
        """构建底部关闭 + 应用按钮。"""
        btn_row = QHBoxLayout()
        btn_row.addStretch()

        self._btn_close = QPushButton("关闭")
        self._btn_close.clicked.connect(self.reject)
        btn_row.addWidget(self._btn_close)

        self._btn_apply = QPushButton("应用模板")
        self._btn_apply.setEnabled(False)
        self._btn_apply.clicked.connect(self._on_apply_clicked)
        self._btn_apply.setStyleSheet(
            f"QPushButton {{ background: {theme_color('accent')}; color: white; "
            f"padding: 6px 18px; border: none; border-radius: 4px; font-size: 13px; }}"
            f"QPushButton:hover {{ background: {_color('accent_hover_light')}; }}"
            f"QPushButton:disabled {{ background: {theme_color('border')}; color: {theme_color('hint')}; }}"
        )
        btn_row.addWidget(self._btn_apply)

        layout.addLayout(btn_row)

    def _apply_theme(self) -> None:
        """应用整体主题样式表，统一使用 _color 兜底。"""
        bg = _color('input_bg')
        fg = _color('fg')
        border = _color('border')

        self.setStyleSheet(f"""
            QDialog {{ background: {bg}; color: {fg}; }}
            QLabel {{ background: transparent; color: {fg}; }}
            QLineEdit, QComboBox {{
                background: {bg}; color: {fg};
                border: 1px solid {border}; padding: 4px 8px; border-radius: 4px;
            }}
            QListWidget {{
                background: {bg}; color: {fg};
                border: 1px solid {border}; border-radius: 4px;
            }}
            QListWidget::item:selected {{
                background: {_color('accent')}; color: white;
            }}
            QListWidget::item:hover {{
                background: {_color('accent_light')};
            }}
            QTextEdit {{
                background: {bg}; color: {fg};
                border: 1px solid {border}; border-radius: 4px;
            }}
            QPushButton {{
                background: {bg}; color: {fg};
                border: 1px solid {border}; padding: 6px 14px;
                border-radius: 4px; font-size: 13px;
            }}
            QPushButton:hover {{
                border-color: {_color('accent')};
            }}
        """)

    # ── 数据加载 ──

    def _load_templates(self) -> None:
        """根据当前筛选条件（章节 + 关键词）刷新模板列表。

        无匹配时显示占位项；每个列表项的 UserRole 存储 (chapter_key, template) 元组。
        """
        self._list.clear()
        chapter_key = self._chapter_combo.currentData()
        keyword = self._search_edit.text().strip()

        if chapter_key and not keyword:
            templates = list_templates(chapter_key)
            items = [(chapter_key, t) for t in templates]
        else:
            items = search_templates(keyword)
            if chapter_key:
                items = [(k, t) for k, t in items if k == chapter_key]

        for ch_key, tpl in items:
            label = CHAPTER_LABELS.get(ch_key, ch_key)
            name = tpl.get("name", "未命名")
            tags = " · ".join(tpl.get("tags", []))
            display = f"[{label}] {name}"
            if tags:
                display += f"\n  {tags}"
            item = QListWidgetItem(display)
            item.setData(Qt.ItemDataRole.UserRole, (ch_key, tpl))
            # 提示
            desc = tpl.get("description", "")
            if desc:
                item.setToolTip(desc)
            self._list.addItem(item)

        # 顶部统计
        count = len(items)
        if count == 0:
            empty = QListWidgetItem("(无匹配模板)")
            empty.setFlags(empty.flags() & ~Qt.ItemFlag.ItemIsSelectable)
            self._list.addItem(empty)

    def _on_filter_changed(self) -> None:
        """章节下拉或搜索关键词变化时重新加载模板列表。"""
        self._load_templates()
        self._preview.clear()
        self._btn_apply.setEnabled(False)

    def _on_template_selected(self) -> None:
        """选中模板列表项时触发，更新右侧预览与应用按钮状态。"""
        items = self._list.selectedItems()
        if not items:
            self._btn_apply.setEnabled(False)
            return
        data = items[0].data(Qt.ItemDataRole.UserRole)
        if not data:
            self._btn_apply.setEnabled(False)
            return
        ch_key, tpl = data
        self._render_preview(ch_key, tpl)
        self._btn_apply.setEnabled(True)

    def _render_preview(self, chapter_key: str, tpl: dict) -> None:
        """将模板渲染为 HTML 并展示在右侧预览区。

        Args:
            chapter_key: 章节标识，用于查找中文标签。
            tpl: 模板字典，包含 name/description/tags/data 等字段。
        """
        label = CHAPTER_LABELS.get(chapter_key, chapter_key)
        name = tpl.get("name", "")
        desc = tpl.get("description", "")
        tags = tpl.get("tags", [])
        data = tpl.get("data", {})

        html_parts = [
            f"<h2 style='color:{_color('accent')}'>[{label}] {name}</h2>",
            f"<p style='color:{_color('hint')};font-size:12px;'>{desc}</p>",
        ]
        if tags:
            tag_html = " ".join(
                f"<span style='background:{_color('accent_light')};"
                f"color:{_color('accent')};"
                f"padding:2px 8px;border-radius:8px;font-size:11px;'>#{t}</span>"
                for t in tags
            )
            html_parts.append(f"<p>{tag_html}</p>")

        html_parts.append("<hr style='border:0;border-top:1px solid #444;'>")
        html_parts.append("<h3>模板内容：</h3>")

        if not data:
            note = tpl.get("note", "(此章节无模板数据)")
            html_parts.append(f"<p style='color:{_color('hint')}'>"
                              f"<em>{note}</em></p>")
        else:
            html_parts.append(self._render_data_html(data))

        self._preview.setHtml("".join(html_parts))

    def _render_data_html(self, data: dict, indent: int = 0) -> str:
        """递归将模板 data 渲染为层级化 HTML。

        Args:
            data: 待渲染的数据字典（可嵌套 dict / list / 标量）。
            indent: 当前缩进层级，用于生成 margin-left 样式。

        Returns:
            拼接好的 HTML 字符串。
        """
        if not isinstance(data, dict):
            return f"<p>{str(data)}</p>"
        parts = []
        pad = "  " * indent
        for k, v in data.items():
            if isinstance(v, dict):
                parts.append(f"<p><b style='color:{_color('accent')}'>"
                             f"{pad}{k}:</b></p>")
                parts.append(self._render_data_html(v, indent + 1))
            elif isinstance(v, list):
                parts.append(f"<p><b style='color:{_color('accent')}'>"
                             f"{pad}{k}:</b></p>")
                for item in v:
                    if isinstance(item, dict):
                        parts.append(self._render_data_html(item, indent + 1))
                    else:
                        parts.append(f"<p style='margin-left:{(indent+1)*20}px'>"
                                     f"- {item}</p>")
            else:
                val_str = str(v) if v not in (None, "") else "<em>(空)</em>"
                # 多行文本渲染
                if "\n" in val_str:
                    val_str = val_str.replace("\n", "<br>" + " " * (indent * 20))
                parts.append(
                    f"<p style='margin-left:{indent*20}px'>"
                    f"<b>{k}:</b> {val_str}</p>"
                )
        return "".join(parts)

    # ── 应用模板 ──

    def _on_apply_clicked(self) -> None:
        """应用选中的模板到当前章节。

        流程: 获取选中模板 → 二次确认 → 合并数据 → 发出信号并关闭对话框。
        """
        selected = self._get_selected_template()
        if selected is None:
            return
        chapter_key, tpl, template_data = selected

        mode = self._mode_combo.currentData()
        if not self._confirm_apply(chapter_key, tpl, mode):
            return

        merged = self._merge_data(chapter_key, template_data, mode)

        # 发出信号 + 提示 + 关闭
        label = CHAPTER_LABELS.get(chapter_key, chapter_key)
        self.template_applied.emit(chapter_key, merged)
        QMessageBox.information(
            self, "应用成功",
            f"模板已应用到「{label}」。\n"
            f"共 {len(merged)} 个字段，可继续编辑或保存。")
        self.accept()

    def _get_selected_template(self) -> tuple[str, dict, dict] | None:
        """获取当前选中的模板及其数据。

        Returns:
            元组 (chapter_key, template, template_data)；若未选中或模板无数据
            （如 systems 占位模板）则弹出提示并返回 None。
        """
        items = self._list.selectedItems()
        if not items:
            return None
        data = items[0].data(Qt.ItemDataRole.UserRole)
        if not data:
            return None
        chapter_key, tpl = data
        template_data = tpl.get("data", {})
        if not template_data:
            QMessageBox.information(
                self, "提示",
                tpl.get("note", "此模板无数据可应用。"))
            return None
        return chapter_key, tpl, template_data

    def _confirm_apply(self, chapter_key: str, tpl: dict, mode: ApplyMode) -> bool:
        """弹出二次确认对话框，防止误操作。

        Args:
            chapter_key: 章节标识。
            tpl: 模板字典，用于取出 name 展示。
            mode: 应用模式枚举值（仅用于触发对话框，展示文本取自下拉框）。

        Returns:
            True 表示用户确认继续；False 表示取消。
        """
        mode_label = self._mode_combo.currentText()
        label = CHAPTER_LABELS.get(chapter_key, chapter_key)
        tpl_name = tpl.get("name", "")
        reply = QMessageBox.question(
            self, "确认应用模板",
            f"将应用模板「{tpl_name}」到「{label}」\n"
            f"应用模式: {mode_label}\n\n"
            f"是否继续？",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
        )
        return reply == QMessageBox.StandardButton.Yes

    def _merge_data(self, chapter_key: str, template_data: dict,
                    mode: ApplyMode) -> dict[str, Any]:
        """根据应用模式将模板数据合并到现有章节。

        Args:
            chapter_key: 章节标识，用于从 model 读取现有数据。
            template_data: 模板的 data 字段。
            mode: 应用模式（FILL_EMPTY / OVERWRITE / APPEND）。

        Returns:
            合并后的章节数据字典。
        """
        # 读取现有章节数据
        existing: dict[str, Any] = {}
        if self._model is not None:
            try:
                existing = self._model.get_chapter(chapter_key) or {}
            except Exception:
                existing = {}

        # 按模式合并
        if mode == ApplyMode.OVERWRITE:
            merged = dict(template_data)
            # 保留 existing 中的非模板字段
            for k, v in existing.items():
                if k not in merged:
                    merged[k] = v
        elif mode == ApplyMode.APPEND:
            merged = dict(existing)
            for k, v in template_data.items():
                cur = merged.get(k, "")
                if isinstance(cur, str) and isinstance(v, str) and cur and v:
                    merged[k] = cur + "\n" + v
                elif cur in (None, "", [], {}):
                    merged[k] = v
        else:  # ApplyMode.FILL_EMPTY
            merged = merge_template_to_chapter(existing, template_data, overwrite=False)
        return merged
