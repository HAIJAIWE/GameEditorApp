"""N13: GDD 模板编辑器对话框 — 创建/编辑/管理自定义可复用模板

特性:
- 左侧：模板列表（自定义模板 + 内置 CHAPTER_TEMPLATES，可按章节/关键词筛选）
- 右侧：模板编辑器（名称/描述/标签/章节/数据预览 JSON）
- "从当前章节加载" — 从 CeshuModel 读取当前章节数据填充
- "应用到当前章节" — 将模板数据合并到当前章节
- 底部：新建 / 保存 / 删除 / 导出 / 导入 / 关闭

信号:
    template_saved(str, dict) — (chapter_key, data) 保存后发出
"""
from __future__ import annotations

import json
from typing import TYPE_CHECKING

from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QFont
from PyQt6.QtWidgets import (
    QComboBox,
    QDialog,
    QFileDialog,
    QFrame,
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
from core.ceshu.custom_template_manager import (
    CustomTemplateManager,
)

from .ceshu_theme import theme_color
from .chapter_templates import (
    CHAPTER_TEMPLATES,
)
from .chapter_templates import (
    search_templates as search_builtin_templates,
)

if TYPE_CHECKING:
    from core.ceshu.ceshu_model import CeshuModel


# 主题色兜底值
_DEFAULT_COLORS: dict[str, str] = {
    "input_bg": "#1e1e1e",
    "fg": "#e0e0e0",
    "border": "#3a3a3a",
    "hint": "#888888",
    "accent": "#4f8cf7",
    "accent_light": "rgba(79,140,247,0.15)",
}


def _color(key: str, default: str = "") -> str:
    """获取主题色，缺失时回退到 _DEFAULT_COLORS。"""
    return theme_color(key) or _DEFAULT_COLORS.get(key, default)


# QListWidgetItem 中存储模板来源的 data key
_DATA_ROLE_TEMPLATE: int = Qt.ItemDataRole.UserRole + 1
_DATA_ROLE_SOURCE: int = Qt.ItemDataRole.UserRole + 2

_SOURCE_CUSTOM: str = "custom"
_SOURCE_BUILTIN: str = "builtin"


class TemplateEditorDialog(QDialog):
    """N13: GDD 模板编辑器对话框

    信号:
        template_saved(str, dict): (chapter_key, data) — 保存后发出
    """

    template_saved = pyqtSignal(str, dict)

    def __init__(self, model: CeshuModel | None,
                 manager: CustomTemplateManager,
                 current_chapter: str = "meta",
                 data_root: str = "data",
                 parent: QWidget | None = None) -> None:
        """初始化模板编辑器。

        Args:
            model: 当前的 CeshuModel 实例（可为 None，仅影响"从当前章节加载"）。
            manager: CustomTemplateManager 实例。
            current_chapter: 默认选中的章节 key。
            data_root: 数据根目录（用于导入/导出默认路径）。
            parent: 父 QWidget。
        """
        super().__init__(parent)
        self._model = model
        self._manager = manager
        self._current_chapter = current_chapter or "meta"
        self._data_root = data_root
        self._current_template_id: str | None = None
        self._current_source: str = _SOURCE_CUSTOM
        self._setup_ui()
        self._apply_theme()
        self._refresh_list()

    # ── UI 构建 ──

    def _setup_ui(self) -> None:
        """搭建对话框整体布局。"""
        self.setWindowTitle("N13 GDD 模板编辑器 — 自定义可复用模板")
        self.resize(1000, 680)
        self.setMinimumSize(820, 540)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(12, 12, 12, 12)
        layout.setSpacing(8)

        layout.addWidget(self._build_header())
        layout.addLayout(self._build_filter_row())
        layout.addWidget(self._build_splitter(), 1)
        layout.addLayout(self._build_bottom_buttons())

    def _build_header(self) -> QWidget:
        """构建标题与提示。"""
        container = QWidget()
        v = QVBoxLayout(container)
        v.setContentsMargins(0, 0, 0, 0)
        v.setSpacing(4)

        title = QLabel("📚 GDD 模板编辑器")
        title.setFont(QFont("Microsoft YaHei", 14, QFont.Weight.Bold))
        title.setStyleSheet(
            f"color: {_color('fg')}; background: transparent;")
        v.addWidget(title)

        hint = QLabel(
            "把当前章节保存为可复用的自定义模板，或浏览内置范例。"
            "自定义模板独立存储，不会与内置 CHAPTER_TEMPLATES 混淆。"
        )
        hint.setStyleSheet(
            f"color: {_color('hint')}; background: transparent; font-size: 12px;")
        v.addWidget(hint)
        return container

    def _build_filter_row(self) -> QHBoxLayout:
        """构建筛选行（章节过滤 + 关键词搜索）。"""
        row = QHBoxLayout()
        row.setSpacing(8)

        row.addWidget(QLabel("章节:"))
        self._combo_filter = QComboBox()
        self._combo_filter.addItem("全部章节", "")
        self._combo_filter.addItem("仅自定义", "__custom__")
        self._combo_filter.addItem("仅内置", "__builtin__")
        for key in CHAPTER_KEYS:
            self._combo_filter.addItem(CHAPTER_LABELS.get(key, key), key)
        # 默认选中当前章节
        idx = self._combo_filter.findData(self._current_chapter)
        if idx >= 0:
            self._combo_filter.setCurrentIndex(idx)
        self._combo_filter.currentIndexChanged.connect(self._refresh_list)
        row.addWidget(self._combo_filter, 1)

        row.addWidget(QLabel("搜索:"))
        self._edit_search = QLineEdit()
        self._edit_search.setPlaceholderText("按名称/描述/标签搜索...")
        self._edit_search.textChanged.connect(self._refresh_list)
        row.addWidget(self._edit_search, 1)
        return row

    def _build_splitter(self) -> QSplitter:
        """构建左右分栏：左列表 + 右编辑器。"""
        splitter = QSplitter(Qt.Orientation.Horizontal)

        # 左侧
        left = QWidget()
        left_layout = QVBoxLayout(left)
        left_layout.setContentsMargins(0, 0, 0, 0)
        left_layout.setSpacing(4)

        list_label = QLabel("模板列表")
        list_label.setFont(QFont("Microsoft YaHei", 11, QFont.Weight.Bold))
        left_layout.addWidget(list_label)

        self._list = QListWidget()
        self._list.itemSelectionChanged.connect(self._on_template_selected)
        left_layout.addWidget(self._list, 1)
        splitter.addWidget(left)

        # 右侧
        right = QWidget()
        right_layout = QVBoxLayout(right)
        right_layout.setContentsMargins(0, 0, 0, 0)
        right_layout.setSpacing(6)

        # 名称行
        name_row = QHBoxLayout()
        name_row.addWidget(QLabel("名称:"))
        self._edit_name = QLineEdit()
        self._edit_name.setPlaceholderText("模板名称（必填）")
        name_row.addWidget(self._edit_name, 2)
        name_row.addWidget(QLabel("章节:"))
        self._combo_chapter = QComboBox()
        self._combo_chapter.addItem("(全局)", "")
        for key in CHAPTER_KEYS:
            self._combo_chapter.addItem(CHAPTER_LABELS.get(key, key), key)
        # 默认选中当前章节
        idx = self._combo_chapter.findData(self._current_chapter)
        if idx >= 0:
            self._combo_chapter.setCurrentIndex(idx)
        name_row.addWidget(self._combo_chapter, 1)
        right_layout.addLayout(name_row)

        # 描述行
        desc_row = QHBoxLayout()
        desc_row.addWidget(QLabel("描述:"))
        self._edit_desc = QLineEdit()
        self._edit_desc.setPlaceholderText("一句话描述模板用途")
        desc_row.addWidget(self._edit_desc, 1)
        right_layout.addLayout(desc_row)

        # 标签行
        tags_row = QHBoxLayout()
        tags_row.addWidget(QLabel("标签:"))
        self._edit_tags = QLineEdit()
        self._edit_tags.setPlaceholderText("逗号分隔，如: 仙侠, RPG, 开放世界")
        tags_row.addWidget(self._edit_tags, 1)
        right_layout.addLayout(tags_row)

        # 来源游戏行
        src_row = QHBoxLayout()
        src_row.addWidget(QLabel("来源:"))
        self._edit_source = QLineEdit()
        self._edit_source.setPlaceholderText("来源游戏名（可选）")
        src_row.addWidget(self._edit_source, 1)
        right_layout.addLayout(src_row)

        # 数据预览
        data_label = QLabel("数据预览（JSON，可编辑）")
        data_label.setFont(QFont("Microsoft YaHei", 10, QFont.Weight.Bold))
        right_layout.addWidget(data_label)

        self._edit_data = QTextEdit()
        self._edit_data.setPlaceholderText('{\n  "field": "value"\n}')
        self._edit_data.setFont(QFont("Consolas", 10))
        right_layout.addWidget(self._edit_data, 1)

        # 数据操作按钮
        data_btn_row = QHBoxLayout()
        self._btn_load_current = QPushButton("从当前章节加载")
        self._btn_load_current.clicked.connect(self._on_load_current)
        data_btn_row.addWidget(self._btn_load_current)

        self._btn_apply_current = QPushButton("应用到当前章节")
        self._btn_apply_current.clicked.connect(self._on_apply_current)
        data_btn_row.addWidget(self._btn_apply_current)

        data_btn_row.addStretch()
        right_layout.addLayout(data_btn_row)

        splitter.addWidget(right)
        splitter.setSizes([360, 640])
        return splitter

    def _build_bottom_buttons(self) -> QHBoxLayout:
        """构建底部按钮行。"""
        row = QHBoxLayout()

        self._btn_new = QPushButton("新建")
        self._btn_new.clicked.connect(self._on_new)
        row.addWidget(self._btn_new)

        self._btn_save = QPushButton("保存")
        self._btn_save.clicked.connect(self._on_save)
        row.addWidget(self._btn_save)

        self._btn_delete = QPushButton("删除")
        self._btn_delete.clicked.connect(self._on_delete)
        row.addWidget(self._btn_delete)

        row.addWidget(self._make_separator())

        self._btn_export = QPushButton("导出")
        self._btn_export.clicked.connect(self._on_export)
        row.addWidget(self._btn_export)

        self._btn_import = QPushButton("导入")
        self._btn_import.clicked.connect(self._on_import)
        row.addWidget(self._btn_import)

        row.addStretch()

        self._btn_close = QPushButton("关闭")
        self._btn_close.clicked.connect(self.accept)
        row.addWidget(self._btn_close)
        return row

    def _make_separator(self) -> QFrame:
        """创建按钮间竖直分隔符。"""
        sep = QFrame()
        sep.setFrameShape(QFrame.Shape.VLine)
        sep.setFrameShadow(QFrame.Shadow.Sunken)
        sep.setFixedWidth(2)
        return sep

    def _apply_theme(self) -> None:
        """应用主题样式。"""
        bg = _color("input_bg")
        fg = _color("fg")
        border = _color("border")
        accent = _color("accent")
        self.setStyleSheet(f"""
            QDialog {{ background: {bg}; color: {fg}; }}
            QLabel {{ background: transparent; color: {fg}; }}
            QLineEdit, QComboBox, QTextEdit, QListWidget {{
                background: {bg}; color: {fg};
                border: 1px solid {border}; border-radius: 4px;
                padding: 4px 6px;
            }}
            QListWidget::item:selected {{
                background: {accent}; color: white;
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

    # ── 列表刷新 ──

    def _refresh_list(self) -> None:
        """刷新左侧模板列表（自定义 + 内置，按筛选条件）。"""
        self._list.clear()
        filter_data = self._combo_filter.currentData() or ""
        keyword = self._edit_search.text().strip() if hasattr(self, "_edit_search") else ""

        # 自定义模板
        show_custom = filter_data not in ("__builtin__",)
        if show_custom:
            if filter_data and filter_data not in ("__custom__",):
                custom_list = self._manager.list_templates(filter_data)
            else:
                custom_list = self._manager.list_templates()
            if keyword:
                custom_list = [
                    t for t in custom_list
                    if keyword.lower() in (t.get("name", "") + t.get("description", "")
                                           + " ".join(t.get("tags", []))).lower()
                ]
            for t in custom_list:
                label = f"[自定义] {t.get('name', '未命名')}"
                if t.get("chapter_key"):
                    label += f"  ({CHAPTER_LABELS.get(t['chapter_key'], t['chapter_key'])})"
                item = QListWidgetItem(label)
                item.setData(_DATA_ROLE_TEMPLATE, t)
                item.setData(_DATA_ROLE_SOURCE, _SOURCE_CUSTOM)
                self._list.addItem(item)

        # 内置模板
        show_builtin = filter_data not in ("__custom__",)
        if show_builtin:
            if filter_data and filter_data not in ("__builtin__",):
                builtin_list = [(filter_data, t) for t in CHAPTER_TEMPLATES.get(filter_data, [])]
            else:
                builtin_list = search_builtin_templates(keyword) if keyword else [
                    (k, t) for k, ts in CHAPTER_TEMPLATES.items() for t in ts
                ]
            for chapter_key, t in builtin_list:
                label = f"[内置] {t.get('name', '未命名')}  ({CHAPTER_LABELS.get(chapter_key, chapter_key)})"
                item = QListWidgetItem(label)
                # 内置模板包装为统一结构
                wrapped = {
                    "id": f"builtin::{chapter_key}::{t.get('name', '')}",
                    "name": t.get("name", ""),
                    "description": t.get("description", ""),
                    "tags": list(t.get("tags", [])),
                    "chapter_key": chapter_key,
                    "data": dict(t.get("data", {})),
                    "source_game": "",
                }
                item.setData(_DATA_ROLE_TEMPLATE, wrapped)
                item.setData(_DATA_ROLE_SOURCE, _SOURCE_BUILTIN)
                self._list.addItem(item)

    # ── 列表选中 ──

    def _on_template_selected(self) -> None:
        """选中模板时填充右侧编辑器。"""
        items = self._list.selectedItems()
        if not items:
            return
        item = items[0]
        template = item.data(_DATA_ROLE_TEMPLATE) or {}
        source = item.data(_DATA_ROLE_SOURCE) or _SOURCE_CUSTOM
        self._current_template_id = template.get("id")
        self._current_source = source

        self._edit_name.setText(template.get("name", ""))
        self._edit_desc.setText(template.get("description", ""))
        self._edit_tags.setText(", ".join(template.get("tags", [])))
        self._edit_source.setText(template.get("source_game", ""))
        chapter_key = template.get("chapter_key", "")
        idx = self._combo_chapter.findData(chapter_key)
        if idx >= 0:
            self._combo_chapter.setCurrentIndex(idx)
        try:
            data_text = json.dumps(template.get("data", {}), ensure_ascii=False, indent=2)
        except Exception:
            data_text = "{}"
        self._edit_data.setText(data_text)

        # 内置模板只读（不能直接覆盖内置常量）
        is_builtin = source == _SOURCE_BUILTIN
        self._btn_save.setEnabled(not is_builtin)
        self._btn_delete.setEnabled(not is_builtin)
        # 内置模板可编辑字段（仅作"另存为自定义"用）
        for w in (self._edit_name, self._edit_desc, self._edit_tags,
                  self._edit_source, self._combo_chapter, self._edit_data):
            w.setReadOnly(False)

    # ── 按钮回调 ──

    def _on_new(self) -> None:
        """新建模板：清空编辑器，载入当前章节作为初始数据。"""
        self._current_template_id = None
        self._current_source = _SOURCE_CUSTOM
        self._edit_name.clear()
        self._edit_desc.clear()
        self._edit_tags.clear()
        self._edit_source.clear()
        idx = self._combo_chapter.findData(self._current_chapter)
        if idx >= 0:
            self._combo_chapter.setCurrentIndex(idx)
        self._edit_data.setText("{}")
        self._list.clearSelection()
        self._btn_save.setEnabled(True)
        self._btn_delete.setEnabled(False)
        # 尝试从当前章节预填数据
        self._on_load_current()

    def _on_save(self) -> None:
        """保存当前编辑器内容为自定义模板。"""
        name = self._edit_name.text().strip()
        if not name:
            QMessageBox.warning(self, "保存", "模板名称不能为空")
            return
        try:
            data = json.loads(self._edit_data.toPlainText() or "{}")
            if not isinstance(data, dict):
                QMessageBox.warning(self, "保存", "数据必须是 JSON 对象")
                return
        except json.JSONDecodeError as e:
            QMessageBox.warning(self, "保存", f"JSON 格式错误: {e}")
            return

        chapter_key = self._combo_chapter.currentData() or ""
        tags = [t.strip() for t in self._edit_tags.text().split(",") if t.strip()]
        description = self._edit_desc.text().strip()
        source_game = self._edit_source.text().strip()

        if self._current_template_id and self._current_source == _SOURCE_CUSTOM:
            # 更新已有自定义模板
            ok = self._manager.update_template(
                self._current_template_id,
                name=name, description=description, tags=tags,
                chapter_key=chapter_key, data=data, source_game=source_game,
            )
            if not ok:
                QMessageBox.warning(self, "保存", "更新失败：模板可能已被删除")
                return
            saved_template = self._manager.get_template(self._current_template_id) or {}
        else:
            # 新建（包括从内置模板"另存为"）
            saved_template = self._manager.save_template(
                name=name, description=description, tags=tags,
                chapter_key=chapter_key, data=data, source_game=source_game,
            )
            self._current_template_id = saved_template.get("id")
            self._current_source = _SOURCE_CUSTOM

        self._refresh_list()
        QMessageBox.information(self, "已保存", f"模板「{name}」已保存。")
        # 发出保存信号
        self.template_saved.emit(chapter_key, data)

    def _on_delete(self) -> None:
        """删除当前选中的自定义模板。"""
        if not self._current_template_id or self._current_source != _SOURCE_CUSTOM:
            QMessageBox.information(self, "删除", "请先选择一个自定义模板")
            return
        reply = QMessageBox.question(
            self, "确认删除",
            f"确定删除模板「{self._edit_name.text()}」？此操作不可撤销。",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
        )
        if reply != QMessageBox.StandardButton.Yes:
            return
        ok = self._manager.delete_template(self._current_template_id)
        if ok:
            QMessageBox.information(self, "已删除", "模板已删除。")
            self._current_template_id = None
            self._on_new()
            self._refresh_list()
        else:
            QMessageBox.warning(self, "删除失败", "模板可能已被删除")

    def _on_export(self) -> None:
        """导出全部自定义模板为 JSON。"""
        path, _ = QFileDialog.getSaveFileName(
            self, "导出模板", "custom_templates.json", "JSON 文件 (*.json)")
        if not path:
            return
        try:
            out = self._manager.export_templates(path)
            QMessageBox.information(self, "导出成功", f"已导出到:\n{out}")
        except Exception as e:
            QMessageBox.critical(self, "导出失败", str(e))

    def _on_import(self) -> None:
        """从 JSON 导入模板。"""
        path, _ = QFileDialog.getOpenFileName(
            self, "导入模板", "", "JSON 文件 (*.json)")
        if not path:
            return
        try:
            count = self._manager.import_templates(path, overwrite=False)
            QMessageBox.information(self, "导入完成", f"已导入 {count} 个模板。")
            self._refresh_list()
        except Exception as e:
            QMessageBox.critical(self, "导入失败", str(e))

    def _on_load_current(self) -> None:
        """从当前 model 的当前章节数据填充编辑器。"""
        if not self._model:
            QMessageBox.information(self, "从当前章节加载", "未加载策划书")
            return
        chapter_key = self._combo_chapter.currentData() or self._current_chapter
        try:
            data = self._model.get_chapter(chapter_key) or {}
        except Exception:
            data = {}
        if not isinstance(data, dict):
            data = {}
        try:
            text = json.dumps(data, ensure_ascii=False, indent=2)
        except Exception:
            text = "{}"
        self._edit_data.setText(text)
        # 若名称为空，自动填一个默认名称
        if not self._edit_name.text().strip():
            label = CHAPTER_LABELS.get(chapter_key, chapter_key)
            self._edit_name.setText(f"{label} 模板")

    def _on_apply_current(self) -> None:
        """将编辑器中的数据应用到当前章节（发出信号供上层处理）。"""
        try:
            data = json.loads(self._edit_data.toPlainText() or "{}")
            if not isinstance(data, dict):
                QMessageBox.warning(self, "应用", "数据必须是 JSON 对象")
                return
        except json.JSONDecodeError as e:
            QMessageBox.warning(self, "应用", f"JSON 格式错误: {e}")
            return
        chapter_key = self._combo_chapter.currentData() or ""
        if not chapter_key:
            QMessageBox.information(self, "应用", "请选择具体章节（不能为全局）")
            return
        self.template_saved.emit(chapter_key, data)
        QMessageBox.information(
            self, "已应用",
            f"模板数据已应用到「{CHAPTER_LABELS.get(chapter_key, chapter_key)}」。\n"
            f"如需保存到 model 请在编辑器主界面保存策划书。"
        )
