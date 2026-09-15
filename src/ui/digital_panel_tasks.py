"""任务面板与 ask_user 提问交互 —— DigitalPanel 的 DigitalPanelTaskMixin 部分

自 digital_employee.py 拆出，方法体逐行原样搬运（逻辑未改动）。
"""

from __future__ import annotations

from typing import Optional

from PyQt6.QtCore import (
    Qt,
    QTimer,
)
from PyQt6.QtWidgets import (
    QFrame,
    QHBoxLayout,
    QInputDialog,
    QLabel,
)

from common.logger import get_logger
from ui.digital_panel_state import DigitalPanelState
from ui.widgets.task_row import TaskRowWidget

try:
    from config.settings import AppConfig, get_config
    _APP_CONFIG: Optional[AppConfig] = get_config()
except (ImportError, RuntimeError):
    _APP_CONFIG = None

logger = get_logger()



class DigitalPanelTaskMixin(DigitalPanelState):
    """任务面板与 ask_user 提问交互"""

    def _on_tasks_changed(self, tasks):
        QTimer.singleShot(0, lambda: self._safe_invoke(self._refresh_task_panel))
        if tasks:
            QTimer.singleShot(0, lambda: self._safe_invoke(self._task_panel.expand, animated=True))
    def _safe_invoke(self, fn, *args, **kwargs):
        """安全执行 UI 延迟调用，防止无声崩溃"""
        try:
            fn(*args, **kwargs)
        except Exception as e:
            get_logger().error(f"延迟 UI 调用失败: {e}", exc_info=True)
    def _on_asked_question(self, qid: str, questions: list):
        """AI 提问回调（工作线程）→ 发射信号切到 UI 线程弹窗"""
        self.question_asked.emit(qid, questions)
    def _show_question_dialog(self, qid: str, questions: list):
        """在 UI 线程弹窗提问"""
        if not questions:
            return
        answers = []
        for q in questions:
            question = q.get("question", "请选择")
            header = q.get("header", "问题")
            options = q.get("options", [])
            answer = {}
            if options:
                items = [o.get("label", o) if isinstance(o, dict) else str(o) for o in options]
                item, ok = QInputDialog.getItem(self, header, question, items, 0, False)
                answer = {"answer": item if ok else "", "answer_label": item if ok else ""}
            else:
                text, ok = QInputDialog.getText(self, header, question)
                answer = {"answer": text if ok else "", "answer_label": text if ok else ""}
            answers.append(answer)
        # 将回答提交回 AskUserSkill
        from core.agent.skills.ask_user_skill import AskUserSkill
        AskUserSkill.answer(qid, answers)
    def _refresh_task_panel(self):
        try:
            from core.agent.skills.todo_skill import TodoWriteSkill
            tasks = TodoWriteSkill.get_tasks()
        except (ImportError, AttributeError, RuntimeError):
            tasks = []

        task_layout = self._task_panel.content_layout
        child = task_layout.takeAt(0)
        while child:
            w = child.widget()
            if w:
                w.deleteLater()
            child = task_layout.takeAt(0)

        if not tasks:
            placeholder = QLabel("暂无任务 — 尝试对 AI 说：'帮我制定一个计划'")
            placeholder.setStyleSheet("color: palette(mid); font-size: 14px; padding: 8px;")
            placeholder.setAlignment(Qt.AlignmentFlag.AlignCenter)
            task_layout.addWidget(placeholder)
            self._task_panel.set_summary("")
            return

        status_order = {"in_progress": 0, "pending": 1, "completed": 2}

        pending = in_prog = done = 0
        for t in tasks:
            s = t["status"]
            if s == "pending":
                pending += 1
            elif s == "in_progress":
                in_prog += 1
            elif s == "completed":
                done += 1

        # 更新折叠态摘要
        parts = [f"{len(tasks)}个任务"]
        if in_prog:
            parts.append(f"{in_prog}个进行中")
        if done:
            parts.append(f"{done}个已完成")
        self._task_panel.set_summary(" · ".join(parts))

        # ── 通用对话行 ──
        gen_row = QFrame()
        gen_row.setCursor(Qt.CursorShape.PointingHandCursor)
        gen_layout = QHBoxLayout(gen_row)
        gen_layout.setContentsMargins(8, 6, 8, 6)
        gen_layout.setSpacing(8)
        gen_icon = QLabel("*")
        gen_icon.setFixedWidth(20)
        gen_icon.setStyleSheet("font-size: 14px; font-weight: bold; color: palette(mid);")
        gen_layout.addWidget(gen_icon)
        gen_label = QLabel("通用对话")
        self._gen_label = gen_label
        gen_label.setStyleSheet("color: palette(text); font-size: 13px;")
        gen_layout.addWidget(gen_label, stretch=1)
        is_active = self._current_task_id is None
        try:
            from ui.themes import get_theme_colors
            _tc = get_theme_colors()
            _row_bg = _tc['input_bg']
            _row_active = _tc['accent'] + '22'
            _row_active_border = _tc['accent'] + '66'
        except Exception:
            _row_bg = '#161b22'
            _row_active = '#1a3a5c'
            _row_active_border = '#2a5298'
        gen_row.setStyleSheet(f"""
            QFrame {{
                background: {_row_active if is_active else _row_bg};
                border: {'1px solid ' + _row_active_border if is_active else '1px solid transparent'};
                border-radius: 6px;
            }}
            QFrame:hover {{
                background: {_row_bg if not is_active else _row_active};
                border: 1px solid {_row_active_border};
            }}
        """)
        gen_row.mousePressEvent = lambda e: self._switch_to_general() if e.button() == Qt.MouseButton.LeftButton else None
        task_layout.addWidget(gen_row)

        # ── 任务展开行 ──
        sorted_tasks = sorted(tasks, key=lambda x: (
            status_order.get(x["status"], 99),
            {"high": 0, "medium": 1, "low": 2}.get(x["priority"], 1),
        ))

        self._task_rows = []
        for t in sorted_tasks:
            is_active = self._current_task_id == t["id"]
            row = TaskRowWidget(t, is_active)
            row.mousePressEvent = lambda e, tid=t["id"]: self._switch_to_task(tid) if e.button() == Qt.MouseButton.LeftButton else None
            row.status_changed.connect(self._on_task_status_changed)
            row.task_deleted.connect(self._on_task_deleted)
            task_layout.addWidget(row)
            self._task_rows.append(row)

        self._update_task_panel_height()
    def _switch_to_task(self, task_id: str):
        if self._current_task_id == task_id:
            return
        self._current_task_id = task_id
        self._rebuild_chat()
        self._update_task_badge()
    def _switch_to_general(self):
        if self._current_task_id is None:
            return
        self._current_task_id = None
        self._rebuild_chat()
        self._update_task_badge()
    def _on_task_status_changed(self, task_id: str, new_status: str):
        """响应 TaskRowWidget 状态变更信号"""
        if not self._brain:
            return
        self._brain.execute_tool("system.todo", {
            "action": "update",
            "item_id": task_id,
            "item_status": new_status,
        })
        self._refresh_task_panel()
    def _on_task_deleted(self, task_id: str):
        """响应 TaskRowWidget 删除信号"""
        if not self._brain:
            return
        self._brain.execute_tool("system.todo", {
            "action": "delete",
            "item_id": task_id,
        })
        self._refresh_task_panel()
    def _update_task_badge(self):
        if self._current_task_id:
            try:
                from core.agent.skills.todo_skill import TodoWriteSkill
                tasks = TodoWriteSkill.get_tasks()
                for t in tasks:
                    if t["id"] == self._current_task_id:
                        self._task_badge.setText(f"当前任务: {t['content'][:30]}")
                        self._task_badge.setVisible(True)
                        return
            except Exception as e:
                logger.warning(f"操作失败: {e}")
        self._task_badge.setVisible(False)
