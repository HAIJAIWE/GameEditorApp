"""Agent OS §12 — 性能仪表盘：Agent运行时性能记录与汇总"""
from pathlib import Path
import time


class PerfDashboard:
    """Agent OS — 轻量级性能记录器，记录每次任务执行的耗时和迭代"""

    def __init__(self, data_dir: str = ""):
        self._data_dir = Path(data_dir or "data/perf")
        self._data_dir.mkdir(parents=True, exist_ok=True)
        self._current_session: dict = {}
        self._sessions: list = []

    def start_session(self, plan_id: str):
        self._current_session = {
            "plan_id": plan_id,
            "started_at": time.time(),
            "iterations": 0,
            "tool_calls": 0,
            "retries": 0,
        }

    def record_iteration(self, count: int):
        self._current_session["iterations"] = max(
            self._current_session.get("iterations", 0), count
        )

    def record_tool_call(self):
        self._current_session["tool_calls"] = self._current_session.get("tool_calls", 0) + 1

    def record_retry(self):
        self._current_session["retries"] = self._current_session.get("retries", 0) + 1

    def end_session(self) -> dict:
        session = dict(self._current_session)
        session["duration_ms"] = int((time.time() - session.get("started_at", time.time())) * 1000)
        session["ended_at"] = time.time()
        self._sessions.append(session)
        if len(self._sessions) > 50:
            self._sessions = self._sessions[-50:]
        return self.summary()

    def summary(self) -> dict:
        if not self._sessions:
            return {"total_sessions": 0, "avg_duration_ms": 0, "avg_iterations": 0}
        total = len(self._sessions)
        avg_dur = sum(s.get("duration_ms", 0) for s in self._sessions) / total
        avg_iter = sum(s.get("iterations", 0) for s in self._sessions) / total
        return {
            "total_sessions": total,
            "avg_duration_ms": round(avg_dur, 1),
            "avg_iterations": round(avg_iter, 1),
            "last_duration_ms": self._sessions[-1].get("duration_ms", 0),
        }
