from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
import threading
import time
from typing import Any, Optional
import uuid

from common.logger import get_logger

logger = get_logger()


class TaskStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    FAILED = "failed"


@dataclass
class ScheduledTask:
    id: str
    name: str
    description: str = ""
    tool_name: str = ""
    tool_params: dict = field(default_factory=dict)
    scheduled_at: Optional[datetime] = None
    interval_seconds: float = 0
    repeat: bool = False
    status: TaskStatus = TaskStatus.PENDING
    created_at: datetime = field(default_factory=datetime.now)
    executed_at: Optional[datetime] = None
    error: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "tool_name": self.tool_name,
            "tool_params": self.tool_params,
            "scheduled_at": self.scheduled_at.isoformat() if self.scheduled_at else None,
            "interval_seconds": self.interval_seconds,
            "repeat": self.repeat,
            "status": self.status.value,
            "created_at": self.created_at.isoformat(),
            "executed_at": self.executed_at.isoformat() if self.executed_at else None,
            "error": self.error,
        }


class TaskScheduler:
    _instance: Optional[TaskScheduler] = None
    _lock = threading.Lock()

    def __init__(self):
        self._logger = get_logger()
        self._tasks: dict[str, ScheduledTask] = {}
        self._timers: dict[str, threading.Timer] = {}
        self._executor: Optional[Callable[[str, dict], dict]] = None
        self._running = False

    @classmethod
    def get_instance(cls) -> TaskScheduler:
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def set_executor(self, executor: Callable[[str, dict], dict]):
        self._executor = executor

    def start(self):
        self._running = True
        self._logger.info("[Scheduler] 调度器已启动")

    def stop(self):
        self._running = False
        for task_id, timer in list(self._timers.items()):
            try:
                timer.cancel()
            except Exception as e:
                logger.warning(f"操作失败: {e}")
        self._timers.clear()
        self._logger.info("[Scheduler] 调度器已停止")

    def schedule_once(self, name: str, delay_seconds: float,
                      tool_name: str = "", tool_params: dict = None,
                      description: str = "") -> str:
        task_id = f"task_{uuid.uuid4().hex[:8]}"
        task = ScheduledTask(
            id=task_id, name=name, description=description,
            tool_name=tool_name, tool_params=tool_params or {},
            scheduled_at=datetime.now() + timedelta(seconds=delay_seconds),
        )
        self._tasks[task_id] = task
        self._schedule_timer(task_id, delay_seconds)
        self._logger.info(f"[Scheduler] 一次性任务: {name} ({delay_seconds:.0f}s)")
        return task_id

    def schedule_daily(self, name: str, hour: int, minute: int,
                       tool_name: str = "", tool_params: dict = None,
                       description: str = "") -> str:
        now = datetime.now()
        target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if target <= now:
            target += timedelta(days=1)
        delay = (target - now).total_seconds()

        task_id = f"task_{uuid.uuid4().hex[:8]}"
        task = ScheduledTask(
            id=task_id, name=name, description=description,
            tool_name=tool_name, tool_params=tool_params or {},
            scheduled_at=target, interval_seconds=86400, repeat=True,
        )
        self._tasks[task_id] = task
        self._schedule_recurring(task_id, delay, 86400)
        self._logger.info(f"[Scheduler] 每日任务: {name} ({hour:02d}:{minute:02d})")
        return task_id

    def schedule_recurring(self, name: str, interval_seconds: float,
                           tool_name: str = "", tool_params: dict = None,
                           description: str = "") -> str:
        task_id = f"task_{uuid.uuid4().hex[:8]}"
        task = ScheduledTask(
            id=task_id, name=name, description=description,
            tool_name=tool_name, tool_params=tool_params or {},
            scheduled_at=datetime.now() + timedelta(seconds=interval_seconds),
            interval_seconds=interval_seconds, repeat=True,
        )
        self._tasks[task_id] = task
        self._schedule_recurring(task_id, interval_seconds, interval_seconds)
        self._logger.info(f"[Scheduler] 循环任务: {name} (每{interval_seconds:.0f}s)")
        return task_id

    def monitor(self, name: str, check_fn: Callable[[], Optional[dict]],
                action_fn: Callable[[dict], Any], interval_seconds: float = 10,
                description: str = "") -> str:
        task_id = f"monitor_{uuid.uuid4().hex[:8]}"

        def monitor_loop():
            while self._running and task_id in self._tasks:
                task = self._tasks.get(task_id)
                if not task or task.status == TaskStatus.CANCELLED:
                    break
                try:
                    condition = check_fn()
                    if condition:
                        self._logger.info(f"[Scheduler] 监控触发: {name}")
                        action_fn(condition)
                except Exception as e:
                    self._logger.error(f"[Scheduler] 监控异常: {name}: {e}")
                time.sleep(interval_seconds)

        task = ScheduledTask(
            id=task_id, name=name, description=description,
            interval_seconds=interval_seconds, repeat=True,
        )
        self._tasks[task_id] = task
        thread = threading.Thread(target=monitor_loop, daemon=True)
        thread.start()
        self._logger.info(f"[Scheduler] 监控任务: {name} (每{interval_seconds:.0f}s)")
        return task_id

    def cancel_task(self, task_id: str) -> bool:
        task = self._tasks.get(task_id)
        if not task:
            return False
        task.status = TaskStatus.CANCELLED
        timer = self._timers.pop(task_id, None)
        if timer:
            try:
                timer.cancel()
            except Exception as e:
                logger.warning(f"操作失败: {e}")
        self._logger.info(f"[Scheduler] 已取消: {task.name}")
        return True

    def list_tasks(self) -> list[dict]:
        return [t.to_dict() for t in self._tasks.values()]

    def get_task(self, task_id: str) -> Optional[dict]:
        task = self._tasks.get(task_id)
        return task.to_dict() if task else None

    def _schedule_timer(self, task_id: str, delay_seconds: float):
        timer = threading.Timer(delay_seconds, self._execute_task, [task_id])
        timer.daemon = True
        self._timers[task_id] = timer
        timer.start()

    def _schedule_recurring(self, task_id: str, first_delay: float, interval: float):
        task = self._tasks.get(task_id)
        if not task:
            return

        def recurring():
            time.sleep(first_delay)
            while self._running and task_id in self._tasks:
                t = self._tasks.get(task_id)
                if not t or t.status == TaskStatus.CANCELLED:
                    break
                self._execute_task(task_id)
                time.sleep(interval)

        thread = threading.Thread(target=recurring, daemon=True)
        thread.start()

    def _execute_task(self, task_id: str):
        task = self._tasks.get(task_id)
        if not task:
            return
        if task.status in (TaskStatus.CANCELLED, TaskStatus.RUNNING):
            return

        task.status = TaskStatus.RUNNING
        task.executed_at = datetime.now()
        self._logger.info(f"[Scheduler] 执行: {task.name}")

        try:
            if self._executor and task.tool_name:
                result = self._executor(task.tool_name, task.tool_params)
                if not result.get("success"):
                    task.error = result.get("error", "执行失败")
                    task.status = TaskStatus.FAILED
                else:
                    task.status = TaskStatus.COMPLETED
            else:
                task.status = TaskStatus.COMPLETED
        except Exception as e:
            task.error = str(e)
            task.status = TaskStatus.FAILED
            self._logger.error(f"[Scheduler] 任务失败: {task.name}: {e}")

        if not task.repeat:
            self._timers.pop(task_id, None)
