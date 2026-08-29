"""editor_view 的 AI 后台线程 worker。"""
from __future__ import annotations

from PyQt6.QtCore import QThread, pyqtSignal


class _AIFillFieldWorker(QThread):
    """F1: 单字段 AI 填充 worker

    信号:
        succeeded(str): 生成的内容
        failed(str): 错误信息
    """
    succeeded = pyqtSignal(str)
    failed = pyqtSignal(str)

    def __init__(self, chapter_key: str, field_path: str, field_label: str,
                 current_content: str, ceshu_id: str, library: str, parent=None):
        super().__init__(parent)
        self._chapter = chapter_key
        self._field_path = field_path
        self._field_label = field_label
        self._current = current_content
        self._ceshu_id = ceshu_id
        self._library = library

    def run(self) -> None:
        try:
            from core.agent.skills.ceshu_skill import CeshuSkill
            skill = CeshuSkill()
            params = {
                "action": "ai_fill_field",
                "ceshu_id": self._ceshu_id,
                "library": self._library,
                "chapter": self._chapter,
                "field_path": self._field_path,
                "field_label": self._field_label,
                "field_content": self._current,
            }
            result = skill.execute(params, context={})
            if result.get("success"):
                content = (result.get("data") or {}).get("generated_content", "")
                if content:
                    self.succeeded.emit(content)
                else:
                    self.failed.emit("AI 未返回有效内容")
            else:
                self.failed.emit(result.get("message") or result.get("error") or "AI 调用失败")
        except Exception as e:
            self.failed.emit(f"AI 调用异常: {e}")


class _AIFillChapterWorker(QThread):
    """F7: 整章 AI 生成 worker

    信号:
        succeeded(str): JSON 格式的章节内容
        failed(str): 错误信息
    """
    succeeded = pyqtSignal(str)
    failed = pyqtSignal(str)

    def __init__(self, chapter_key: str, ceshu_id: str, library: str, parent=None):
        super().__init__(parent)
        self._chapter = chapter_key
        self._ceshu_id = ceshu_id
        self._library = library

    def run(self) -> None:
        try:
            from core.agent.skills.ceshu_skill import CeshuSkill
            skill = CeshuSkill()
            params = {
                "action": "ai_fill_chapter",
                "ceshu_id": self._ceshu_id,
                "library": self._library,
                "chapter": self._chapter,
            }
            result = skill.execute(params, context={})
            if result.get("success"):
                content = (result.get("data") or {}).get("generated_content", "")
                if content:
                    self.succeeded.emit(content)
                else:
                    self.failed.emit("AI 未返回有效内容")
            else:
                self.failed.emit(result.get("message") or result.get("error") or "AI 调用失败")
        except Exception as e:
            self.failed.emit(f"AI 调用异常: {e}")
