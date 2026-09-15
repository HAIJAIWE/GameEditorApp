from __future__ import annotations

import threading
import uuid

from common.logger import get_logger
from core.agent.skill_protocol import BaseSkill
from core.agent.skills.common import normalize_params

logger = get_logger()


class TodoWriteSkill(BaseSkill):
    name = "tool.todo_write"
    description = "任务计划管理: 创建/更新/列出结构化任务清单，追踪执行进度"
    version = "1.0.0"
    parameters = [
        {"name": "action", "required": True, "description": "create_replaces/update/list/mark_done/add"},
        {"name": "todos", "required": False, "description": "任务列表(create_replaces时必填): [{id,content,status,priority}]"},
        {"name": "item_id", "required": False, "description": "单个任务ID(update/mark_done时必填)"},
        {"name": "item_content", "required": False, "description": "任务描述(add时必填)"},
        {"name": "item_status", "required": False, "description": "新状态: pending/in_progress/completed"},
        {"name": "item_priority", "required": False, "description": "优先级: high/medium/low"},
        {"name": "summary", "required": False, "description": "全部完成后的执行摘要"},
    ]
    tags = ["todo", "task", "plan", "schedule", "progress", "checklist"]
    REQUIRES_MAIN_THREAD = True  # 修复 P2-29: 触发 task_panel 等 UI 回调

    _lock = threading.Lock()
    _tasks: dict[str, dict] = {}
    _changed_callbacks: list = []

    @classmethod
    def register_callback(cls, callback):
        # 修复 P3-37: 多个回调实例会重复触发 UI 刷新；按回调函数对象去重
        with cls._lock:
            # 函数对象作为唯一键；bound method 也按 __self__+__func__ 自然区分
            key = (getattr(callback, '__self__', None), getattr(callback, '__func__', callback))
            existing = set()
            for cb in cls._changed_callbacks:
                k = (getattr(cb, '__self__', None), getattr(cb, '__func__', cb))
                existing.add(k)
            if key not in existing:
                cls._changed_callbacks.append(callback)

    @classmethod
    def get_tasks(cls) -> list:
        with cls._lock:
            result = []
            for tid, t in cls._tasks.items():
                result.append({
                    "id": tid, "content": t["content"],
                    "status": t["status"], "priority": t["priority"],
                })
            return sorted(result, key=lambda x: (
                {"high": 0, "medium": 1, "low": 2}.get(x["priority"], 1),
                {"pending": 0, "in_progress": 1, "completed": 2}.get(x["status"], 0),
            ))

    def execute(self, params: dict, context: dict) -> dict:
        params = normalize_params(params)
        action = params.get("action", "list")
        try:
            if action == "create_replaces":
                return self._create_replaces(params)
            elif action == "update":
                return self._update(params)
            elif action == "mark_done":
                return self._mark_done(params)
            elif action == "add":
                return self._add(params)
            elif action == "list":
                return self._list(params)
            else:
                return {"success": False, "error": f"未知 action: {action}", "message": ""}
        except Exception as e:
            return {"success": False, "error": str(e), "message": ""}

    def _list(self, params: dict) -> dict:
        tasks = self.get_tasks()
        if not tasks:
            return {"success": True, "message": "当前无任务", "data": {"todos": [], "count": 0}}

        status_icons = {"pending": "⬜", "in_progress": "", "completed": "[OK]"}
        lines = ["##  任务计划\n"]
        for t in tasks:
            icon = status_icons.get(t["status"], "⬜")
            priority_mark = {"high": "[ERR]", "medium": "~", "low": "OK"}.get(t["priority"], "")
            lines.append(f"{icon} {priority_mark} [{t['id']}] {t['content']} ({t['status']})")

        pending = sum(1 for t in tasks if t["status"] == "pending")
        in_prog = sum(1 for t in tasks if t["status"] == "in_progress")
        done = sum(1 for t in tasks if t["status"] == "completed")
        lines.append(f"\n进度: {done}/{len(tasks)} 已完成 | {in_prog} 进行中 | {pending} 待处理")

        return {"success": True, "message": "\n".join(lines),
                "data": {"todos": tasks, "count": len(tasks),
                         "pending": pending, "in_progress": in_prog, "completed": done}}

    def _create_replaces(self, params: dict) -> dict:
        items = params.get("todos", [])
        if not items:
            return {"success": False, "error": "缺少 todos 参数", "message": ""}

        with self._lock:
            self._tasks.clear()
            for item in items:
                tid = item.get("id", uuid.uuid4().hex[:8])
                self._tasks[tid] = {
                    "content": item.get("content", ""),
                    "status": item.get("status", "pending"),
                    "priority": item.get("priority", "medium"),
                }

        summary = params.get("summary", "")
        tasks = self.get_tasks()
        lines = ["##  新任务计划\n"]
        status_icons = {"pending": "⬜", "in_progress": "", "completed": "[OK]"}
        for t in tasks:
            icon = status_icons.get(t["status"], "⬜")
            lines.append(f"{icon} [{t['id']}] {t['content']} ({t['priority']})")
        if summary:
            lines.append(f"\n 目标: {summary}")

        self._notify_changed()
        return {"success": True, "message": "\n".join(lines),
                "data": {"todos": tasks, "count": len(tasks), "summary": summary}}

    def _add(self, params: dict) -> dict:
        content = params.get("item_content", "")
        if not content:
            return {"success": False, "error": "缺少 item_content", "message": ""}
        tid = params.get("item_id", uuid.uuid4().hex[:8])
        status = params.get("item_status", "pending")
        priority = params.get("item_priority", "medium")
        with self._lock:
            self._tasks[tid] = {"content": content, "status": status, "priority": priority}
        self._notify_changed()
        return {"success": True, "message": f"已添加任务 [{tid}]: {content}",
                "data": {"id": tid, "content": content, "status": status}}

    def _update(self, params: dict) -> dict:
        tid = params.get("item_id", "")
        if not tid:
            return {"success": False, "error": "缺少 item_id", "message": ""}
        with self._lock:
            if tid not in self._tasks:
                return {"success": False, "error": f"未找到任务: {tid}", "message": ""}
            t = self._tasks[tid]
            if "item_status" in params:
                t["status"] = params["item_status"]
            if "item_content" in params:
                t["content"] = params["item_content"]
            if "item_priority" in params:
                t["priority"] = params["item_priority"]
        self._notify_changed()
        status = t["status"]
        icon = {"pending": "⬜", "in_progress": "", "completed": "[OK]"}.get(status, "")
        return {"success": True, "message": f"{icon} [{tid}] {t['content']} → {status}",
                "data": {"id": tid, "content": t["content"], "status": status}}

    def _mark_done(self, params: dict) -> dict:
        params["item_status"] = "completed"
        return self._update(params)

    @classmethod
    def _notify_changed(cls):
        for cb in cls._changed_callbacks:
            try:
                cb(cls.get_tasks())
            except Exception as e:
                logger.warning(f"操作失败: {e}")
