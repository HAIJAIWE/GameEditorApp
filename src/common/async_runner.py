from collections.abc import Callable
from dataclasses import dataclass
from enum import Enum
import logging
import queue
import threading
import time
import traceback
from typing import Any, Optional

logger = logging.getLogger(__name__)


class TaskStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class TaskResult:
    task_id: str
    status: TaskStatus
    result: Any = None
    error: Optional[str] = None
    duration_ms: float = 0
    started_at: float = 0
    finished_at: float = 0


class AsyncRunner:
    _instance: Optional[AsyncRunner] = None
    _lock = threading.Lock()
    _initialized: bool = False

    def __new__(cls) -> AsyncRunner:
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self) -> None:
        if self._initialized:
            return
        self._initialized = True
        self._max_workers: int = 4
        self._task_counter: int = 0
        self._results: dict[str, TaskResult] = {}
        self._result_timestamps: dict[str, float] = {}
        self._result_events: dict[str, threading.Event] = {}
        self._max_results: int = 100
        self._ttl: float = 3600
        self._callbacks: dict[str, list[Callable[[TaskResult], None]]] = {}
        self._threads: list[threading.Thread] = []
        self._task_queue: queue.Queue = queue.Queue()
        self._running: bool = False
        self._results_lock = threading.Lock()

    def _store_result(self, task_id: str, result: TaskResult):
        """存储结果，同时清理过期结果（调用方需持有 _results_lock）"""
        now = time.time()
        self._results[task_id] = result
        self._result_timestamps[task_id] = now

        # 清理过期结果
        expired = [tid for tid, ts in self._result_timestamps.items()
                   if now - ts > self._ttl]
        for tid in expired:
            self._results.pop(tid, None)
            self._result_timestamps.pop(tid, None)
            self._result_events.pop(tid, None)

        # 如果结果数超过上限，清理最旧的
        if len(self._results) > self._max_results:
            oldest = sorted(self._result_timestamps.items(), key=lambda x: x[1])
            excess = len(self._results) - self._max_results
            for tid, _ in oldest[:excess]:
                self._results.pop(tid, None)
                self._result_timestamps.pop(tid, None)
                self._result_events.pop(tid, None)

    def configure(self, max_workers: int = 4) -> None:
        self._max_workers = min(max_workers, 16)

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        for _ in range(self._max_workers):
            t = threading.Thread(target=self._worker, daemon=True)
            t.start()
            self._threads.append(t)
        logger.info("AsyncRunner started: %d workers", self._max_workers)

    def stop(self, timeout: float = 5) -> None:
        self._running = False
        for t in self._threads:
            t.join(timeout=timeout)

    def run(
        self,
        fn: Callable[..., Any],
        *args,
        on_done: Optional[Callable[[TaskResult], None]] = None,
        on_error: Optional[Callable[[Exception], None]] = None,
        timeout: Optional[float] = None,
        **kwargs,
    ) -> str:
        task_id = f"task_{int(time.time() * 1000)}_{self._task_counter}"
        self._task_counter += 1

        with self._results_lock:
            self._result_events[task_id] = threading.Event()
            self._store_result(task_id, TaskResult(
                task_id=task_id, status=TaskStatus.PENDING
            ))
            if on_done:
                self._callbacks.setdefault(task_id, []).append(on_done)

        self._task_queue.put((task_id, fn, args, kwargs, on_error, timeout))
        return task_id

    def run_batch(
        self,
        tasks: list[tuple],
        on_all_done: Optional[Callable[[dict[str, TaskResult]], None]] = None,
    ) -> list[str]:
        task_ids = []
        completed = {}
        lock = threading.Lock()

        def _batch_callback(rid: str, remaining: list[str]):
            def _cb(result: TaskResult):
                with lock:
                    completed[rid] = result
                    remaining.remove(rid)
                if not remaining and on_all_done:
                    on_all_done(dict(completed))
            return _cb

        for fn, args, kwargs in tasks:
            tid = self.run(fn, *args, **kwargs)
            task_ids.append(tid)

        remaining = list(task_ids)
        for tid in task_ids:
            existing = self._callbacks.get(tid, [])
            existing.append(_batch_callback(tid, remaining))
            self._callbacks[tid] = existing

        return task_ids

    def get_result(self, task_id: str) -> Optional[TaskResult]:
        with self._results_lock:
            return self._results.get(task_id)

    def wait(self, task_id: str, timeout: Optional[float] = None) -> Optional[TaskResult]:
        deadline = time.time() + timeout if timeout else None
        while True:
            result = self.get_result(task_id)
            if result and result.status in (TaskStatus.DONE, TaskStatus.FAILED, TaskStatus.CANCELLED):
                return result
            if deadline and time.time() > deadline:
                return None
            event = self._result_events.get(task_id)
            if event is not None:
                if deadline:
                    remaining = deadline - time.time()
                    if remaining <= 0:
                        return None
                    event.wait(timeout=min(remaining, 0.05))
                else:
                    event.wait(timeout=0.05)
            else:
                time.sleep(0.05)

    def wait_all(self, task_ids: list[str], timeout: Optional[float] = None) -> dict[str, Optional[TaskResult]]:
        results = {}
        for tid in task_ids:
            results[tid] = self.wait(tid, timeout)
        return results

    def cancel(self, task_id: str) -> None:
        with self._results_lock:
            if task_id in self._results:
                result = self._results[task_id]
                if result.status in (TaskStatus.PENDING, TaskStatus.RUNNING):
                    result.status = TaskStatus.CANCELLED
                    self._store_result(task_id, result)
                    event = self._result_events.get(task_id)
                    if event:
                        event.set()

    def get_pending_count(self) -> int:
        return self._task_queue.qsize()

    def get_stats(self) -> dict[str, Any]:
        with self._results_lock:
            total = len(self._results)
            done = sum(1 for r in self._results.values() if r.status == TaskStatus.DONE)
            failed = sum(1 for r in self._results.values() if r.status == TaskStatus.FAILED)
            running = sum(1 for r in self._results.values() if r.status == TaskStatus.RUNNING)
            pending = sum(1 for r in self._results.values() if r.status == TaskStatus.PENDING)
            durations = [r.duration_ms for r in self._results.values() if r.duration_ms > 0]
            avg_duration = sum(durations) / len(durations) if durations else 0
        return {
            "total": total,
            "done": done,
            "failed": failed,
            "running": running,
            "pending": pending,
            "avg_duration_ms": round(avg_duration, 1),
            "queue_size": self._task_queue.qsize(),
        }

    def _worker(self):
        while self._running:
            try:
                task_id, fn, args, kwargs, on_error, timeout = self._task_queue.get(timeout=0.5)
            except queue.Empty:
                continue

            with self._results_lock:
                if task_id in self._results:
                    self._results[task_id].status = TaskStatus.RUNNING
                    self._results[task_id].started_at = time.time()

            try:
                if timeout:
                    result_value = [None]
                    exception_info = [None]

                    def _target(
                        result_value=result_value,
                        exception_info=exception_info,
                        fn=fn,
                        args=args,
                        kwargs=kwargs,
                    ):
                        try:
                            result_value[0] = fn(*args, **kwargs)
                        except Exception as e:
                            exception_info[0] = e

                    t = threading.Thread(target=_target)
                    t.start()
                    t.join(timeout=timeout)

                    if t.is_alive():
                        raise TimeoutError(f"Task {task_id} timed out after {timeout}s")

                    if exception_info[0]:
                        raise exception_info[0]
                    result = result_value[0]
                else:
                    result = fn(*args, **kwargs)

                finished_at = time.time()
                with self._results_lock:
                    r = self._results.get(task_id, TaskResult(task_id=task_id, status=TaskStatus.PENDING))
                    r.status = TaskStatus.DONE
                    r.result = result
                    r.duration_ms = (finished_at - r.started_at) * 1000
                    r.finished_at = finished_at
                    self._store_result(task_id, r)
                    event = self._result_events.get(task_id)
                    if event:
                        event.set()

            except Exception as e:
                finished_at = time.time()
                error_msg = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
                logger.error("Task %s failed: %s", task_id, e)

                with self._results_lock:
                    r = self._results.get(task_id, TaskResult(task_id=task_id, status=TaskStatus.PENDING))
                    r.status = TaskStatus.FAILED
                    r.error = error_msg
                    r.duration_ms = (finished_at - r.started_at) * 1000
                    r.finished_at = finished_at
                    self._store_result(task_id, r)
                    event = self._result_events.get(task_id)
                    if event:
                        event.set()

                if on_error:
                    try:
                        on_error(e)
                    except Exception as e:
                        logger.warning(f"操作失败: {e}")

            self._fire_callbacks(task_id)
            self._task_queue.task_done()

    def _fire_callbacks(self, task_id: str):
        callbacks = self._callbacks.pop(task_id, [])
        if not callbacks:
            return
        with self._results_lock:
            result = self._results.get(task_id)
        if result:
            for cb in callbacks:
                try:
                    cb(result)
                except Exception:
                    logger.warning("Callback failed for task %s", task_id)


def get_async_runner() -> AsyncRunner:
    return AsyncRunner()


def run_async(
    fn: Callable[..., Any],
    *args,
    on_done: Optional[Callable[[TaskResult], None]] = None,
    **kwargs,
) -> str:
    return get_async_runner().run(fn, *args, on_done=on_done, **kwargs)
