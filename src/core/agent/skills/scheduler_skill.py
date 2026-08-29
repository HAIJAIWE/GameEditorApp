from __future__ import annotations

from common.logger import get_logger
from core.agent.skill_protocol import BaseSkill
from core.agent.skills.common import normalize_params
from core.agent.workflow.scheduler import TaskScheduler


class SchedulerSkill(BaseSkill):
    name = "system.scheduler"
    description = "定时任务调度: 一次性延迟/每日定时/循环任务/取消/列表"
    version = "1.0.0"
    parameters = [
        {"name": "action", "required": True, "type": "string",
         "enum": ["schedule", "daily", "recurring", "cancel", "list", "get", "monitor"],
         "description": "schedule=一次性延迟, daily=每日定时, recurring=循环, cancel=取消, list=列出, get=详情, monitor=监控"},
        {"name": "task_name", "required": False, "type": "string", "description": "任务名称"},
        {"name": "delay_seconds", "required": False, "type": "integer", "description": "延迟秒数(schedule)"},
        {"name": "hour", "required": False, "type": "integer", "description": "小时 0-23 (daily)"},
        {"name": "minute", "required": False, "type": "integer", "description": "分钟 0-59 (daily)"},
        {"name": "interval_seconds", "required": False, "type": "integer", "description": "间隔秒数(recurring/monitor)"},
        {"name": "tool_name", "required": False, "type": "string", "description": "要执行的工具名"},
        {"name": "task_id", "required": False, "type": "string", "description": "任务ID(cancel/get)"},
        {"name": "description", "required": False, "type": "string", "description": "任务说明"},
        {"name": "monitor_target", "required": False, "type": "string",
         "enum": ["cpu", "memory", "gpu", "disk", "process"],
         "description": "监控目标(monitor)"},
        {"name": "monitor_threshold", "required": False, "type": "integer", "description": "监控阈值(monitor)"},
    ]
    tags = ["schedule", "timer", "task", "automation", "monitor"]

    def execute(self, params: dict, context: dict) -> dict:
        params = normalize_params(params)
        action = params.get("action", "list")
        self._logger = get_logger()
        scheduler = TaskScheduler.get_instance()

        try:
            if action == "schedule":
                return self._do_schedule(params, scheduler)
            elif action == "daily":
                return self._do_daily(params, scheduler)
            elif action == "recurring":
                return self._do_recurring(params, scheduler)
            elif action == "cancel":
                return self._do_cancel(params, scheduler)
            elif action == "list":
                return self._do_list(scheduler)
            elif action == "get":
                return self._do_get(params, scheduler)
            elif action == "monitor":
                return self._do_monitor(params, scheduler)
            else:
                return {"success": False, "error": f"未知 action: {action}", "message": ""}
        except Exception as e:
            self._logger.error(f"SchedulerSkill 异常: {e}", exc_info=True)
            return {"success": False, "error": str(e), "message": ""}

    def _do_schedule(self, params, scheduler):
        name = params.get("task_name", "未命名任务")
        delay = float(params.get("delay_seconds", 60))
        tool = params.get("tool_name", "")
        desc = params.get("description", "")
        task_id = scheduler.schedule_once(name, delay, tool, params, desc)
        return {"success": True, "message": f"已创建一次性任务: {name} ({delay:.0f}秒后)", "data": {"task_id": task_id}}

    def _do_daily(self, params, scheduler):
        name = params.get("task_name", "每日任务")
        hour = int(params.get("hour", 9))
        minute = int(params.get("minute", 0))
        tool = params.get("tool_name", "")
        desc = params.get("description", "")
        if not 0 <= hour <= 23:
            return {"success": False, "error": "hour 必须在 0-23 之间", "message": ""}
        if not 0 <= minute <= 59:
            return {"success": False, "error": "minute 必须在 0-59 之间", "message": ""}
        task_id = scheduler.schedule_daily(name, hour, minute, tool, params, desc)
        return {"success": True, "message": f"已创建每日任务: {name} ({hour:02d}:{minute:02d})", "data": {"task_id": task_id}}

    def _do_recurring(self, params, scheduler):
        name = params.get("task_name", "循环任务")
        interval = float(params.get("interval_seconds", 300))
        tool = params.get("tool_name", "")
        desc = params.get("description", "")
        task_id = scheduler.schedule_recurring(name, interval, tool, params, desc)
        return {"success": True, "message": f"已创建循环任务: {name} (每{interval:.0f}秒)", "data": {"task_id": task_id}}

    def _do_cancel(self, params, scheduler):
        task_id = params.get("task_id", "")
        if not task_id:
            return {"success": False, "error": "缺少 task_id", "message": ""}
        ok = scheduler.cancel_task(task_id)
        if ok:
            return {"success": True, "message": f"已取消任务: {task_id}", "data": None}
        else:
            return {"success": False, "error": f"任务不存在: {task_id}", "message": ""}

    def _do_list(self, scheduler):
        tasks = scheduler.list_tasks()
        if not tasks:
            return {"success": True, "message": "当前无定时任务", "data": {"tasks": []}}
        lines = [f"{t['id']}: {t['name']} [{t['status']}]" for t in tasks]
        return {"success": True, "message": "\n".join(lines), "data": {"tasks": tasks}}

    def _do_get(self, params, scheduler):
        task_id = params.get("task_id", "")
        if not task_id:
            return {"success": False, "error": "缺少 task_id", "message": ""}
        task = scheduler.get_task(task_id)
        if task:
            return {"success": True, "message": f"任务详情: {task['name']}", "data": task}
        else:
            return {"success": False, "error": f"任务不存在: {task_id}", "message": ""}

    def _do_monitor(self, params, scheduler):
        target = params.get("monitor_target", "cpu")
        threshold = int(params.get("monitor_threshold", 80))
        name = params.get("task_name", f"监控{target}")
        interval = float(params.get("interval_seconds", 10))
        desc = params.get("description", f"当{target}超过{threshold}时触发")

        def check_fn():
            try:
                import psutil
                if target == "cpu":
                    val = psutil.cpu_percent(interval=0.5)
                elif target == "memory":
                    val = psutil.virtual_memory().percent
                elif target == "disk":
                    val = psutil.disk_usage("/").percent
                elif target == "gpu":
                    try:
                        import json
                        import subprocess
                        r = subprocess.run(
                            ["nvidia-smi", "--query-gpu=temperature.gpu", "--format=csv,noheader,nounits"],
                            capture_output=True, text=True, timeout=5
                        )
                        val = float(r.stdout.strip().split("\n")[0]) if r.stdout.strip() else 0
                    except Exception:
                        return None
                else:
                    return None
                if val >= threshold:
                    return {"target": target, "value": val, "threshold": threshold}
                return None
            except ImportError:
                return None
            except Exception:
                return None

        def action_fn(condition):
            self._logger.warning(f"[Scheduler] 监控告警: {condition}")

        task_id = scheduler.monitor(name, check_fn, action_fn, interval, desc)
        return {"success": True, "message": f"已启动监控: {name} (阈值{threshold}, 每{interval:.0f}s)", "data": {"task_id": task_id}}
