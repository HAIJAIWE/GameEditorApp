"""工作线程类 — 数字员工模块的后台线程组件"""

from __future__ import annotations

from typing import Optional

from PyQt6.QtCore import QThread, pyqtSignal


class AgentWorker(QThread):
    """在后台线程中运行 AgentBrain.process，通过信号回传进度和结果"""
    progress = pyqtSignal(str, object)
    finished = pyqtSignal(dict)

    def __init__(self, brain, user_input: str, extra: Optional[dict] = None):
        super().__init__()
        self._brain = brain
        self._user_input = user_input
        self._extra = extra or {}

    def run(self):
        try:
            result = self._brain.process(self._user_input, callback=self._on_callback, extra=self._extra)
            self.finished.emit(result)
        except Exception as exc:
            self.finished.emit({"success": False, "error": str(exc)})

    def _on_callback(self, event_type: str, data: dict):
        self.progress.emit(event_type, data)
