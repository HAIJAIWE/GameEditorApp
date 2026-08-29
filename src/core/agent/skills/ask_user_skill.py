from __future__ import annotations

import threading
import uuid

from common.logger import get_logger
from core.agent.skill_protocol import BaseSkill

logger = get_logger()
from core.agent.skills.common import normalize_params


class AskUserSkill(BaseSkill):
    name = "tool.ask_user"
    description = "向用户提问: 当不确定参数/选项/方案时，弹出问题让用户选择"
    version = "1.0.0"
    parameters = [
        {"name": "action", "required": True, "description": "ask/cancel"},
        {"name": "questions", "required": False, "description": "问题列表: [{question,header,options:[{label,description}],multiSelect}]"},
        {"name": "question_id", "required": False, "description": "取消提问时的ID"},
        {"name": "timeout", "required": False, "description": "等待超时秒数，默认120"},
        {"name": "blocking", "required": False, "description": "是否阻塞等待回答，默认true"},
    ]
    tags = ["ask", "question", "dialog", "choice", "user", "interaction"]
    REQUIRES_MAIN_THREAD = True  # 修复 P2-29: 回调最终弹 PyQt 对话框，必须在主线程

    _lock = threading.Lock()
    _pending: dict[str, dict] = {}
    _question_callbacks: list = []
    _log = None

    @classmethod
    def register_callback(cls, callback):
        """callback(questions: list) -> list[dict] — 同步方式提供答案"""
        cls._question_callbacks.append(callback)

    @classmethod
    def answer(cls, question_id: str, answers: list):
        with cls._lock:
            if question_id in cls._pending:
                event = cls._pending[question_id]["event"]
                cls._pending[question_id]["answers"] = answers
                event.set()

    def execute(self, params: dict, context: dict) -> dict:
        params = normalize_params(params)
        logger = get_logger()
        action = params.get("action", "ask")

        try:
            if action == "cancel":
                return self._cancel(params)
            return self._ask(params, context)
        except Exception as e:
            logger.error(f"AskUserSkill 异常: {e}", exc_info=True)
            return {"success": False, "error": str(e), "message": ""}

    def _ask(self, params: dict, context: dict) -> dict:
        questions = params.get("questions", [])
        if not questions:
            single_question = {
                "question": params.get("question", "请选择"),
                "header": params.get("header", "确认"),
                "options": params.get("options", []),
                "multiSelect": params.get("multiSelect", False),
            }
            if single_question["question"] == "请选择" and not single_question["options"]:
                return {"success": False, "error": "缺少 questions 或 question+options", "message": ""}
            questions = [single_question]

        timeout = params.get("timeout", 120)
        blocking = params.get("blocking", True)
        qid = params.get("question_id", uuid.uuid4().hex[:8])

        event = threading.Event()
        with self._lock:
            self._pending[qid] = {"event": event, "answers": None, "questions": questions}

        dispatched = False
        for cb in self._question_callbacks:
            try:
                cb(qid, questions)
                dispatched = True
            except Exception as e:
                logger.warning(f"操作失败: {e}")

        if not dispatched:
            with self._lock:
                self._pending.pop(qid, None)
            return {"success": False,
                    "error": "没有注册问题回调。请在 UI 中调用 AskUserSkill.register_callback()",
                    "message": ""}

        if not blocking:
            return {"success": True,
                    "message": f"已弹出问题 [id={qid}]，等待用户回答...",
                    "data": {"waiting": True, "question_id": qid, "questions": questions},
                    "waiting": True, "question_id": qid}

        answered = event.wait(timeout=timeout)

        with self._lock:
            entry = self._pending.pop(qid, None)

        if not answered or not entry or entry["answers"] is None:
            return {"success": True,
                    "message": "用户未在时间内回答，已跳过",
                    "data": {"question_id": qid, "answered": False, "timeout": True}}

        answers = entry["answers"]
        lines = ["##  用户回答\n"]
        for a in answers:
            q_text = a.get("question", "")
            ans = a.get("answer", "")
            ans_label = a.get("answer_label", ans)
            lines.append(f"**Q: {q_text}** → {ans_label}" if q_text else f"**→ {ans_label}")

        return {"success": True,
                "message": "\n".join(lines),
                "data": {"question_id": qid, "answered": True, "answers": answers}}

    def _cancel(self, params: dict) -> dict:
        qid = params.get("question_id", "")
        if not qid:
            return {"success": False, "error": "缺少 question_id", "message": ""}
        with self._lock:
            if qid in self._pending:
                self._pending[qid]["answers"] = [{"answer": "cancelled", "answer_label": "已取消"}]
                self._pending[qid]["event"].set()
        return {"success": True, "message": "已取消提问", "data": {"question_id": qid}}
