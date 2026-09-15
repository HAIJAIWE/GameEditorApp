"""AI 数据生成对话框 — 数据共同开发工作流入口

流程：策划书数值/系统章作为设定 → AI 生成候选游戏数据 → 表格预览勾选 → 人工导入。
核心原则：AI 只生产候选，人工审批后才会写入游戏数据。
"""
from __future__ import annotations

from PyQt6.QtCore import Qt, QThread, pyqtSignal
from PyQt6.QtGui import QFont
from PyQt6.QtWidgets import (
    QCheckBox,
    QDialog,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QMessageBox,
    QPushButton,
    QSpinBox,
    QTabWidget,
    QVBoxLayout,
    QWidget,
)

from common.event_bus import EventBus
from config.constants import _type_registry

from .ceshu_theme import theme_color


class _AIDataGenWorker(QThread):
    """后台线程：调用 CeshuSkill.ai_generate_data 生成候选数据。"""

    done = pyqtSignal(dict)
    failed = pyqtSignal(str)

    def __init__(self, model, selected: list[str], count: int,
                 instruction: str, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._model = model
        self._selected = list(selected)
        self._count = count
        self._instruction = instruction

    def run(self) -> None:
        try:
            from core.agent.skills.ceshu_skill import CeshuSkill
            skill = CeshuSkill()
            result = skill.execute(
                {
                    "action": "ai_generate_data",
                    "data_types": self._selected,
                    "count": self._count,
                    "instruction": self._instruction,
                },
                context={"_inline_model": self._model},
            )
            if result.get("success"):
                self.done.emit(result.get("data") or {})
            else:
                self.failed.emit(result.get("message") or result.get("error") or "生成失败")
        except Exception as e:
            self.failed.emit(f"生成异常: {e}")


def _item_summary(item: dict) -> str:
    """条目简要摘要：name + 前 3 个非 name 的标量字段。"""
    name = str(item.get("name", "未命名")).strip()
    parts: list[str] = []
    for k, v in item.items():
        if k == "name" or parts and len(parts) >= 3:
            break
        if isinstance(v, (str, int, float)) and v != "":
            parts.append(f"{k}={v}")
    return f"{name}    |    {'  '.join(parts)}" if parts else name


class AIDataGenerateDialog(QDialog):
    """AI 候选数据生成 + 人工勾选导入对话框。"""

    data_imported = pyqtSignal(int)  # 导入条目总数

    def __init__(self, parent: QWidget | None = None, model=None, data_manager=None) -> None:
        super().__init__(parent)
        self._model = model
        self._data_manager = data_manager
        self._worker: _AIDataGenWorker | None = None
        self._candidates: dict[str, list[dict]] = {}
        self._type_checks: dict[str, QCheckBox] = {}
        self._list_widgets: dict[str, QListWidget] = {}
        self._setup_ui()
        self._apply_theme()

    # ── UI ──

    def _setup_ui(self) -> None:
        self.setWindowTitle("🤖 AI 数据生成（候选 + 人工审批）")
        self.resize(720, 680)
        self.setMinimumSize(620, 600)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(16, 16, 16, 16)
        layout.setSpacing(12)

        title = QLabel("🤖 AI 数据生成")
        title.setFont(QFont("Microsoft YaHei", 14, QFont.Weight.Bold))
        layout.addWidget(title)

        hint = QLabel(
            "根据当前策划书的数值/系统章设定，AI 生成候选游戏数据；"
            "下方预览中人工勾选后才会导入数据表。")
        hint.setWordWrap(True)
        hint.setStyleSheet(f"color: {theme_color('hint')}; background: transparent; font-size: 12px;")
        layout.addWidget(hint)

        layout.addWidget(self._build_type_group())
        layout.addLayout(self._build_option_row())
        layout.addWidget(self._build_preview_group(), 1)
        layout.addLayout(self._build_button_row())

    def _build_type_group(self) -> QGroupBox:
        group = QGroupBox("生成的数据类型")
        flow = QHBoxLayout(group)
        flow.setSpacing(10)
        for type_id in _type_registry.types:
            plural = _type_registry.get_plural(type_id)
            name = _type_registry.get_name(type_id)
            cb = QCheckBox(name)
            cb.setChecked(True)
            cb.setProperty("plural", plural)
            self._type_checks[plural] = cb
            flow.addWidget(cb)
        flow.addStretch()
        return group

    def _build_option_row(self) -> QHBoxLayout:
        row = QHBoxLayout()
        row.setSpacing(8)
        row.addWidget(QLabel("每类数量:"))
        self._spin_count = QSpinBox()
        self._spin_count.setRange(1, 20)
        self._spin_count.setValue(5)
        row.addWidget(self._spin_count)
        row.addWidget(QLabel("补充要求:"))
        self._edit_instruction = QLineEdit()
        self._edit_instruction.setPlaceholderText("可选，如：全部为 1-10 级新手内容，技能带冷却时间")
        row.addWidget(self._edit_instruction, 1)
        return row

    def _build_preview_group(self) -> QGroupBox:
        group = QGroupBox("候选数据预览（勾选要导入的条目）")
        v = QVBoxLayout(group)
        self._tabs = QTabWidget()
        self._empty_label = QLabel("尚未生成。选择类型后点击「生成候选」开始。")
        self._empty_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._empty_label.setStyleSheet(
            f"color: {theme_color('hint')}; background: transparent; padding: 40px;")
        self._tabs.addTab(self._empty_label, "预览")
        v.addWidget(self._tabs)
        self._btn_select_all = QPushButton("全选 / 取消全选")
        self._btn_select_all.setEnabled(False)
        self._btn_select_all.clicked.connect(self._on_toggle_select_all)
        v.addWidget(self._btn_select_all)
        return group

    def _build_button_row(self) -> QHBoxLayout:
        row = QHBoxLayout()
        self._btn_generate = QPushButton("生成候选")
        self._btn_generate.clicked.connect(self._on_generate)
        row.addWidget(self._btn_generate)

        self._btn_import = QPushButton("导入勾选")
        self._btn_import.setEnabled(False)
        self._btn_import.clicked.connect(self._on_import)
        row.addWidget(self._btn_import)

        row.addStretch()
        close_btn = QPushButton("关闭")
        close_btn.clicked.connect(self._on_close)
        row.addWidget(close_btn)
        return row

    def _apply_theme(self) -> None:
        bg = theme_color('input_bg') or '#1e1e1e'
        fg = theme_color('fg') or '#e0e0e0'
        border = theme_color('border') or '#3a3a3a'
        accent = theme_color('accent', '#4f8cf7')
        self.setStyleSheet(f"""
            QDialog {{ background: {bg}; color: {fg}; }}
            QLabel {{ background: transparent; color: {fg}; }}
            QGroupBox {{
                border: 1px solid {border}; border-radius: 6px;
                margin-top: 10px; padding-top: 8px; color: {fg};
            }}
            QGroupBox::title {{ subcontrol-origin: margin; left: 10px; padding: 0 4px; color: {accent}; }}
            QLineEdit, QSpinBox, QListWidget, QTabWidget::pane {{
                background: {bg}; color: {fg}; border: 1px solid {border}; border-radius: 4px;
            }}
            QPushButton {{
                background: {bg}; color: {fg}; border: 1px solid {border};
                padding: 6px 14px; border-radius: 4px;
            }}
            QPushButton:hover {{ border-color: {accent}; }}
            QPushButton:disabled {{ color: {theme_color('hint')}; }}
        """)

    # ── 事件 ──

    def _on_generate(self) -> None:
        if self._worker and self._worker.isRunning():
            QMessageBox.information(self, "AI 数据生成", "已有生成任务进行中，请稍候")
            return

        selected = [plural for plural, cb in self._type_checks.items() if cb.isChecked()]
        if not selected:
            QMessageBox.warning(self, "请选择类型", "请至少勾选一种数据类型。")
            return

        self._btn_generate.setEnabled(False)
        self._btn_import.setEnabled(False)
        self._btn_select_all.setEnabled(False)
        self._candidates = {}
        self._clear_preview_tabs()
        self._show_status("正在生成候选数据，请稍候……")

        self._worker = _AIDataGenWorker(
            self._model, selected, self._spin_count.value(),
            self._edit_instruction.text().strip(), parent=self,
        )
        self._worker.done.connect(self._on_generated)
        self._worker.failed.connect(self._on_failed)
        self._worker.start()

    def _on_generated(self, data: dict) -> None:
        self._btn_generate.setEnabled(True)
        self._candidates = data.get("candidates") or {}
        self._render_preview(self._candidates)
        if not self._candidates:
            self._show_status("AI 未返回有效候选数据。")
            return
        total = sum(len(items) for items in self._candidates.values())
        self._show_status(f"已生成 {total} 条候选数据，请勾选要导入的条目。")
        self._btn_import.setEnabled(True)
        self._btn_select_all.setEnabled(True)

    def _on_failed(self, msg: str) -> None:
        self._btn_generate.setEnabled(True)
        self._show_status(f"生成失败：{msg}")
        QMessageBox.warning(self, "生成失败", msg)

    def _on_toggle_select_all(self) -> None:
        if not self._list_widgets:
            return
        first = next(iter(self._list_widgets.values()))
        first_item = first.item(0)
        target = first.count() > 0 and (first_item is not None
                                        and first_item.checkState() != Qt.CheckState.Checked)
        for lst in self._list_widgets.values():
            for i in range(lst.count()):
                item = lst.item(i)
                if item is None:
                    continue
                item.setCheckState(
                    Qt.CheckState.Checked if target else Qt.CheckState.Unchecked)

    def _on_import(self) -> None:
        if self._data_manager is None:
            QMessageBox.warning(self, "无法导入", "数据管理器不可用，无法导入数据。")
            return

        to_import: list[tuple[str, dict]] = []
        for plural, lst in self._list_widgets.items():
            for i in range(lst.count()):
                item = lst.item(i)
                if item is None or item.checkState() != Qt.CheckState.Checked:
                    continue
                it = item.data(Qt.ItemDataRole.UserRole)
                if isinstance(it, dict):
                    to_import.append((plural, dict(it)))

        if not to_import:
            QMessageBox.information(self, "未勾选", "请先在预览中勾选要导入的条目。")
            return

        imported = 0
        errors: list[str] = []
        for plural, it in to_import:
            it.pop("id", None)  # 由 DataManager 自动生成 ID，避免冲突
            try:
                new_id = self._data_manager.add_item(plural, it)
                if new_id:
                    imported += 1
                else:
                    errors.append(f"{it.get('name', '未命名')}: 导入被拒绝")
            except Exception as e:
                errors.append(f"{it.get('name', '未命名')}: {e}")

        # 通知数据表刷新（add_item 不主动发事件）
        try:
            EventBus().emit("data_changed")
        except Exception:
            pass

        msg = f"已导入 {imported} 条数据。"
        if errors:
            msg += f"\n{len(errors)} 条失败（如 {errors[0]}）"
        QMessageBox.information(self, "导入完成", msg)
        self.data_imported.emit(imported)
        self._show_status(f"已导入 {imported} 条。可继续生成或关闭。")

    def _on_close(self) -> None:
        if self._worker and self._worker.isRunning():
            reply = QMessageBox.question(
                self, "关闭对话框", "生成任务仍在进行中，关闭将中断本次生成。\n是否继续？",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            )
            if reply != QMessageBox.StandardButton.Yes:
                return
        self.reject()

    # ── 预览渲染 ──

    def _clear_preview_tabs(self) -> None:
        while self._tabs.count() > 0:
            self._tabs.removeTab(0)
        self._list_widgets = {}

    def _render_preview(self, candidates: dict[str, list[dict]]) -> None:
        self._clear_preview_tabs()
        if not candidates:
            self._tabs.addTab(self._empty_label, "预览")
            return
        for plural, items in candidates.items():
            lst = QListWidget()
            for it in items:
                text = _item_summary(it)
                item = QListWidgetItem(text)
                item.setFlags(item.flags() | Qt.ItemFlag.ItemIsUserCheckable)
                item.setCheckState(Qt.CheckState.Checked)
                item.setData(Qt.ItemDataRole.UserRole, it)
                lst.addItem(item)
            self._list_widgets[plural] = lst
            label = f"{plural} ({len(items)})"
            self._tabs.addTab(lst, label)

    def _show_status(self, text: str) -> None:
        self._empty_label.setText(text)
        if self._tabs.count() == 0 or self._tabs.widget(0) is not self._empty_label:
            self._tabs.removeTab(0)
            self._tabs.insertTab(0, self._empty_label, "状态")
