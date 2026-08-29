"""N8: 章节笔记 — 管理器（核心逻辑，不依赖 PyQt）+ 对话框

笔记存储位置: data/libraries/<lib>/ceshu_notes/<ceshu_id>.json

每条笔记字段：
    {
        "id": str,           # 笔记唯一 ID
        "chapter_key": str,  # 所属章节键名（如 "meta" / "vision"）
        "content": str,      # 笔记正文
        "created_at": str,   # 创建时间
        "updated_at": str,   # 更新时间
        "author": str        # 作者
    }

ChapterNotesManager 提供 CRUD：add_note / list_notes / update_note /
delete_note / get_notes_by_chapter。
ChapterNotesDialog 提供左侧列表 + 右侧编辑器的双栏 UI。
"""
from __future__ import annotations

from datetime import datetime
import json
import os
from pathlib import Path
from typing import Any
import uuid

# === 笔记管理器（核心逻辑，不依赖 PyQt6） ===

# 默认作者
DEFAULT_AUTHOR: str = "anonymous"

# 笔记存储子目录名
NOTES_DIR_NAME: str = "ceshu_notes"


class ChapterNotesManager:
    """章节笔记管理器 — 纯 Python 实现，不依赖 PyQt6。

    笔记以 JSON 文件持久化到 ``data/libraries/<lib>/ceshu_notes/<ceshu_id>.json``，
    单本策划书共享一个文件，结构为 ``{"notes": [note, ...]}``。
    """

    def __init__(self, library_root: str | Path,
                 library: str,
                 ceshu_id: str,
                 author: str = DEFAULT_AUTHOR) -> None:
        """初始化笔记管理器。

        Args:
            library_root: 库根目录（如 data/libraries）。
            library: 库名。
            ceshu_id: 策划书 ID。
            author: 默认作者（添加笔记时未指定作者则用此值）。
        """
        self._lib_root = Path(library_root)
        self._library = library
        self._ceshu_id = ceshu_id
        self._author = author or DEFAULT_AUTHOR
        self._notes_path = (
            self._lib_root / library / NOTES_DIR_NAME / f"{ceshu_id}.json"
        )

    # ── 路径与加载 ──

    @property
    def notes_path(self) -> Path:
        """返回笔记文件路径。"""
        return self._notes_path

    def _load(self) -> list[dict]:
        """从磁盘加载笔记列表（文件不存在时返回空列表）。"""
        if not self._notes_path.exists():
            return []
        try:
            with open(self._notes_path, encoding="utf-8") as f:
                data = json.load(f)
            notes = data.get("notes", []) if isinstance(data, dict) else []
            return [n for n in notes if isinstance(n, dict)]
        except (json.JSONDecodeError, OSError):
            return []

    def _save(self, notes: list[dict]) -> None:
        """持久化笔记列表到磁盘（原子写入）。"""
        self._notes_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = self._notes_path.with_suffix(".json.tmp")
        try:
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump({"notes": notes}, f, ensure_ascii=False, indent=2)
            os.replace(str(tmp_path), str(self._notes_path))
        except Exception:
            if tmp_path.exists():
                try:
                    tmp_path.unlink()
                except Exception:
                    pass
            raise

    # ── CRUD ──

    def add_note(self, chapter_key: str, content: str,
                 author: str | None = None) -> dict:
        """新增一条笔记。

        Args:
            chapter_key: 所属章节键名（如 "meta"）。
            content: 笔记正文。
            author: 作者（缺省则用默认作者）。

        Returns:
            新建笔记字典。
        """
        if not chapter_key:
            raise ValueError("chapter_key 不能为空")
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        note = {
            "id": uuid.uuid4().hex[:12],
            "chapter_key": chapter_key,
            "content": content or "",
            "created_at": now,
            "updated_at": now,
            "author": author or self._author,
        }
        notes = self._load()
        notes.append(note)
        self._save(notes)
        return note

    def list_notes(self, chapter_key: str | None = None) -> list[dict]:
        """列出笔记。

        Args:
            chapter_key: 若指定，仅返回该章节的笔记；否则返回全部。

        Returns:
            笔记列表（按 created_at 升序）。
        """
        notes = self._load()
        if chapter_key:
            notes = [n for n in notes if n.get("chapter_key") == chapter_key]
        return sorted(notes, key=lambda n: n.get("created_at", ""))

    def update_note(self, note_id: str, content: str,
                    author: str | None = None) -> dict | None:
        """更新指定笔记的正文。

        Args:
            note_id: 笔记 ID。
            content: 新正文。
            author: 若指定则同时更新作者。

        Returns:
            更新后的笔记字典；若 ID 不存在返回 None。
        """
        notes = self._load()
        target = None
        for n in notes:
            if n.get("id") == note_id:
                target = n
                break
        if target is None:
            return None
        target["content"] = content or ""
        target["updated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        if author:
            target["author"] = author
        self._save(notes)
        return target

    def delete_note(self, note_id: str) -> bool:
        """删除指定笔记。

        Args:
            note_id: 笔记 ID。

        Returns:
            是否删除成功（False 表示 ID 不存在）。
        """
        notes = self._load()
        new_notes = [n for n in notes if n.get("id") != note_id]
        if len(new_notes) == len(notes):
            return False
        self._save(new_notes)
        return True

    def get_notes_by_chapter(self, chapter_key: str) -> list[dict]:
        """获取指定章节的所有笔记（按创建时间升序）。"""
        return self.list_notes(chapter_key)

    def count_by_chapter(self) -> dict[str, int]:
        """统计每个章节的笔记数量。"""
        result: dict[str, int] = {}
        for n in self._load():
            k = n.get("chapter_key", "")
            result[k] = result.get(k, 0) + 1
        return result

    def count_all(self) -> int:
        """返回笔记总数。"""
        return len(self._load())


# === PyQt6 对话框（懒加载） ===

# 以下代码块需要 PyQt6 支持。若 PyQt6 未安装则跳过对话框类定义，
# 但 ChapterNotesManager 仍可独立使用。

try:
    from PyQt6.QtCore import Qt, pyqtSignal
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
    _PYQT_AVAILABLE = True
except ModuleNotFoundError:
    _PYQT_AVAILABLE = False
    QDialog = object  # type: ignore[misc,assignment]


if _PYQT_AVAILABLE:

    from core.ceshu.ceshu_model import CHAPTER_KEYS, CHAPTER_LABELS

    from .ceshu_theme import theme_color

    class ChapterNotesDialog(QDialog):
        """N8: 章节笔记对话框 — 左侧列表 + 右侧编辑器。"""

        notes_changed = pyqtSignal()

        def __init__(self, manager: ChapterNotesManager,
                     parent: QWidget | None = None) -> None:
            """初始化章节笔记对话框。

            Args:
                manager: ChapterNotesManager 实例。
                parent: 父控件。
            """
            super().__init__(parent)
            self._manager = manager
            self._current_note_id: str | None = None
            self._setup_ui()
            self._apply_theme()
            self._refresh_list()

        def _setup_ui(self) -> None:
            """搭建对话框界面。"""
            self.setWindowTitle("N8 章节笔记")
            self.resize(880, 600)
            self.setMinimumSize(680, 460)

            layout = QVBoxLayout(self)
            layout.setContentsMargins(12, 12, 12, 12)
            layout.setSpacing(8)

            layout.addWidget(self._build_header())
            layout.addWidget(self._build_splitter(), 1)
            layout.addLayout(self._build_bottom_buttons())

        def _build_header(self) -> QWidget:
            """构建标题与提示。"""
            container = QWidget()
            v = QVBoxLayout(container)
            v.setContentsMargins(0, 0, 0, 0)
            v.setSpacing(4)

            title = QLabel("📝 章节笔记")
            title.setFont(QFont("Microsoft YaHei", 14, QFont.Weight.Bold))
            title.setStyleSheet(
                f"color: {theme_color('fg')}; background: transparent;")
            v.addWidget(title)

            hint = QLabel("为每个章节添加设计笔记、修改记录或讨论要点。")
            hint.setStyleSheet(
                f"color: {theme_color('hint')}; background: transparent; font-size: 12px;")
            v.addWidget(hint)
            return container

        def _build_splitter(self) -> QSplitter:
            """构建左右分栏：左侧章节过滤+笔记列表；右侧编辑器。"""
            splitter = QSplitter(Qt.Orientation.Horizontal)

            # 左侧
            left = QWidget()
            left_layout = QVBoxLayout(left)
            left_layout.setContentsMargins(0, 0, 0, 0)
            left_layout.setSpacing(6)

            filter_label = QLabel("章节过滤:")
            filter_label.setStyleSheet("background: transparent;")
            left_layout.addWidget(filter_label)

            self._combo_chapter = QComboBox()
            self._combo_chapter.addItem("全部章节", "")
            for key in CHAPTER_KEYS:
                self._combo_chapter.addItem(CHAPTER_LABELS.get(key, key), key)
            self._combo_chapter.currentIndexChanged.connect(self._refresh_list)
            left_layout.addWidget(self._combo_chapter)

            self._list = QListWidget()
            self._list.itemSelectionChanged.connect(self._on_note_selected)
            left_layout.addWidget(self._list, 1)

            self._btn_add = QPushButton("新建笔记")
            self._btn_add.clicked.connect(self._on_add_note)
            left_layout.addWidget(self._btn_add)

            splitter.addWidget(left)

            # 右侧
            right = QWidget()
            right_layout = QVBoxLayout(right)
            right_layout.setContentsMargins(0, 0, 0, 0)
            right_layout.setSpacing(6)

            form_row = QHBoxLayout()
            form_row.addWidget(QLabel("章节:"))
            self._edit_chapter = QComboBox()
            for key in CHAPTER_KEYS:
                self._edit_chapter.addItem(CHAPTER_LABELS.get(key, key), key)
            form_row.addWidget(self._edit_chapter, 1)
            form_row.addWidget(QLabel("作者:"))
            self._edit_author = QLineEdit()
            self._edit_author.setPlaceholderText("作者名")
            form_row.addWidget(self._edit_author, 1)
            right_layout.addLayout(form_row)

            self._edit_content = QTextEdit()
            self._edit_content.setPlaceholderText("在此输入笔记内容...")
            right_layout.addWidget(self._edit_content, 1)

            btn_row = QHBoxLayout()
            self._btn_save = QPushButton("保存")
            self._btn_save.clicked.connect(self._on_save_note)
            btn_row.addWidget(self._btn_save)

            self._btn_delete = QPushButton("删除")
            self._btn_delete.clicked.connect(self._on_delete_note)
            btn_row.addWidget(self._btn_delete)

            btn_row.addStretch()
            right_layout.addLayout(btn_row)

            splitter.addWidget(right)
            splitter.setSizes([320, 560])
            return splitter

        def _build_bottom_buttons(self) -> QHBoxLayout:
            """构建底部按钮行。"""
            row = QHBoxLayout()
            row.addStretch()
            self._btn_close = QPushButton("关闭")
            self._btn_close.clicked.connect(self.accept)
            row.addWidget(self._btn_close)
            return row

        def _apply_theme(self) -> None:
            """应用对话框主题样式。"""
            bg = theme_color('input_bg') or '#1e1e1e'
            fg = theme_color('fg') or '#e0e0e0'
            border = theme_color('border') or '#3a3a3a'
            self.setStyleSheet(f"""
                QDialog {{ background: {bg}; color: {fg}; }}
                QLabel {{ background: transparent; color: {fg}; }}
                QListWidget {{
                    background: {bg}; color: {fg};
                    border: 1px solid {border};
                }}
                QListWidget::item:selected {{
                    background: {theme_color('accent', '#4f8cf7')}; color: white;
                }}
                QTextEdit, QLineEdit, QComboBox {{
                    background: {bg}; color: {fg};
                    border: 1px solid {border}; padding: 4px;
                    border-radius: 4px;
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

        # ── 列表与编辑器联动 ──

        def _refresh_list(self) -> None:
            """刷新左侧笔记列表（含数量徽章）。"""
            chapter_key = self._combo_chapter.currentData()
            notes = self._manager.list_notes(
                chapter_key if chapter_key else None)
            self._list.clear()
            counts = self._manager.count_by_chapter()
            for n in notes:
                ch = n.get("chapter_key", "")
                ch_label = CHAPTER_LABELS.get(ch, ch)
                content_preview = (n.get("content", "") or "").strip().replace("\n", " ")
                if len(content_preview) > 30:
                    content_preview = content_preview[:30] + "…"
                count = counts.get(ch, 0)
                text = f"[{ch_label}] (×{count}) {content_preview or '(空)'}"
                item = QListWidgetItem(text)
                item.setData(Qt.ItemDataRole.UserRole, n.get("id", ""))
                self._list.addItem(item)

        def _on_note_selected(self) -> None:
            """选中笔记时把内容回填到右侧编辑器。"""
            items = self._list.selectedItems()
            if not items:
                return
            note_id = items[0].data(Qt.ItemDataRole.UserRole)
            notes = self._manager.list_notes()
            target = next((n for n in notes if n.get("id") == note_id), None)
            if target is None:
                return
            self._current_note_id = note_id
            ch = target.get("chapter_key", "")
            idx = self._edit_chapter.findData(ch)
            if idx >= 0:
                self._edit_chapter.setCurrentIndex(idx)
            self._edit_author.setText(target.get("author", ""))
            self._edit_content.setPlainText(target.get("content", ""))

        def _on_add_note(self) -> None:
            """新建一条空笔记并选中。"""
            chapter_key = self._combo_chapter.currentData() or CHAPTER_KEYS[0]
            note = self._manager.add_note(chapter_key, "")
            self._current_note_id = note["id"]
            self.notes_changed.emit()
            self._refresh_list()
            # 选中新建项
            for i in range(self._list.count()):
                item = self._list.item(i)
                if item.data(Qt.ItemDataRole.UserRole) == note["id"]:
                    self._list.setCurrentRow(i)
                    break
            self._edit_content.setFocus()

        def _on_save_note(self) -> None:
            """保存当前编辑器中的笔记。"""
            if not self._current_note_id:
                QMessageBox.information(self, "保存笔记", "请先选择或新建一条笔记")
                return
            content = self._edit_content.toPlainText()
            author = self._edit_author.text().strip() or None
            updated = self._manager.update_note(self._current_note_id, content, author)
            if updated is None:
                QMessageBox.warning(self, "保存失败", "笔记不存在，可能已被删除")
                return
            self.notes_changed.emit()
            self._refresh_list()
            QMessageBox.information(self, "已保存", "笔记已保存。")

        def _on_delete_note(self) -> None:
            """删除当前选中的笔记。"""
            if not self._current_note_id:
                return
            reply = QMessageBox.question(
                self, "删除笔记",
                "确定删除当前笔记吗？此操作不可撤销。",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            )
            if reply != QMessageBox.StandardButton.Yes:
                return
            ok = self._manager.delete_note(self._current_note_id)
            if ok:
                self._current_note_id = None
                self._edit_content.setPlainText("")
                self._edit_author.setText("")
                self.notes_changed.emit()
                self._refresh_list()
            else:
                QMessageBox.warning(self, "删除失败", "笔记不存在")

else:
    # PyQt6 不可用时，ChapterNotesDialog 仍可被引用（但不可实例化）
    class ChapterNotesDialog:  # type: ignore[no-redef]
        """PyQt6 未安装时的占位实现 — 仅用于保持模块可导入。"""

        def __init__(self, *args: Any, **kwargs: Any) -> None:
            raise ModuleNotFoundError("PyQt6 未安装，无法实例化 ChapterNotesDialog")
