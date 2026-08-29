from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass
import json
import logging
from pathlib import Path
import threading
import time
from typing import Any, Optional

logger = logging.getLogger(__name__)


@dataclass
class MetricEntry:
    name: str
    count: int = 0
    total_ms: float = 0
    min_ms: float = float("inf")
    max_ms: float = 0
    error_count: int = 0
    last_at: float = 0

    @property
    def avg_ms(self) -> float:
        return self.total_ms / self.count if self.count > 0 else 0

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "count": self.count,
            "avg_ms": round(self.avg_ms, 2),
            "min_ms": round(self.min_ms, 2) if self.min_ms != float("inf") else 0,
            "max_ms": round(self.max_ms, 2),
            "error_count": self.error_count,
            "error_rate": round(self.error_count / max(self.count, 1), 4),
            "total_ms": round(self.total_ms, 2),
            "last_at": self.last_at,
        }


@dataclass
class GaugeEntry:
    name: str
    value: float = 0
    last_updated: float = 0


class MetricsCollector:
    _instance: Optional[MetricsCollector] = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self._metrics: dict[str, MetricEntry] = {}
        self._gauges: dict[str, GaugeEntry] = {}
        self._counters: dict[str, int] = defaultdict(int)
        self._event_log: list[dict[str, Any]] = []
        self._max_event_log: int = 500

    def timer(self, name: str) -> _TimerContext:
        return _TimerContext(name, self)

    def timed(self, name: str) -> Callable:
        def decorator(fn):
            def wrapper(*args, **kwargs):
                with self.timer(name):
                    return fn(*args, **kwargs)
            return wrapper
        return decorator

    def record(self, name: str, duration_ms: float, error: bool = False):
        with self._lock:
            if name not in self._metrics:
                self._metrics[name] = MetricEntry(name=name)
            m = self._metrics[name]
            m.count += 1
            m.total_ms += duration_ms
            m.min_ms = min(m.min_ms, duration_ms)
            m.max_ms = max(m.max_ms, duration_ms)
            m.last_at = time.time()
            if error:
                m.error_count += 1

    def set_gauge(self, name: str, value: float):
        with self._lock:
            self._gauges[name] = GaugeEntry(name=name, value=value, last_updated=time.time())

    def inc_counter(self, name: str, delta: int = 1):
        with self._lock:
            self._counters[name] += delta

    def get_counter(self, name: str) -> int:
        return self._counters.get(name, 0)

    def log_event(self, event_type: str, data: Optional[dict[str, Any]] = None, level: str = "info"):
        with self._lock:
            entry = {
                "type": event_type,
                "level": level,
                "timestamp": time.time(),
                "data": data or {},
            }
            self._event_log.append(entry)
            if len(self._event_log) > self._max_event_log:
                self._event_log = self._event_log[-self._max_event_log:]

    def get_snapshot(self) -> dict[str, Any]:
        with self._lock:
            return {
                "metrics": {k: v.to_dict() for k, v in self._metrics.items()},
                "gauges": {
                    k: {"value": v.value, "updated": v.last_updated}
                    for k, v in self._gauges.items()
                },
                "counters": dict(self._counters),
                "recent_events": self._event_log[-20:],
                "timestamp": time.time(),
            }

    def get_hotspots(self, top_n: int = 10) -> list[dict[str, Any]]:
        items = sorted(
            self._metrics.values(),
            key=lambda m: m.total_ms,
            reverse=True,
        )
        return [m.to_dict() for m in items[:top_n]]

    def get_slowest(self, top_n: int = 10) -> list[dict[str, Any]]:
        items = sorted(
            [m for m in self._metrics.values() if m.count > 0],
            key=lambda m: m.avg_ms,
            reverse=True,
        )
        return [m.to_dict() for m in items[:top_n]]

    def get_error_prone(self, top_n: int = 10) -> list[dict[str, Any]]:
        items = sorted(
            [m for m in self._metrics.values() if m.error_count > 0],
            key=lambda m: m.error_count / max(m.count, 1),
            reverse=True,
        )
        return [m.to_dict() for m in items[:top_n]]

    def export_json(self, filepath: str):
        snapshot = self.get_snapshot()
        snapshot["hotspots"] = self.get_hotspots(5)
        snapshot["slowest"] = self.get_slowest(5)
        Path(filepath).write_text(
            json.dumps(snapshot, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def generate_report(self) -> str:
        self.get_snapshot()
        lines = ["=" * 50, "Metrics Report", "=" * 50, ""]

        total_ops = sum(m.count for m in self._metrics.values())
        total_ms = sum(m.total_ms for m in self._metrics.values())
        total_errs = sum(m.error_count for m in self._metrics.values())

        lines.append(f"Total operations: {total_ops}")
        lines.append(f"Total time: {total_ms:.0f}ms")
        lines.append(f"Errors: {total_errs} ({total_errs/max(total_ops,1)*100:.1f}%)")
        lines.append("")

        lines.append("--- Hotspots (by total time) ---")
        for i, h in enumerate(self.get_hotspots(5), 1):
            lines.append(
                f"  {i}. {h['name']}: {h['total_ms']:.0f}ms total, "
                f"{h['avg_ms']:.1f}ms avg, {h['count']} calls"
            )

        lines.append("")
        lines.append("--- Slowest (by avg time) ---")
        for i, s in enumerate(self.get_slowest(5), 1):
            lines.append(
                f"  {i}. {s['name']}: {s['avg_ms']:.1f}ms avg "
                f"(min={s['min_ms']:.1f}, max={s['max_ms']:.1f})"
            )

        error_prone = self.get_error_prone(5)
        if error_prone:
            lines.append("")
            lines.append("--- Most Error-Prone ---")
            for i, e in enumerate(error_prone, 1):
                lines.append(
                    f"  {i}. {e['name']}: {e['error_count']}/{e['count']} "
                    f"({e['error_rate']*100:.1f}%)"
                )

        return "\n".join(lines)

    def reset(self):
        with self._lock:
            self._metrics.clear()
            self._gauges.clear()
            self._counters.clear()
            self._event_log.clear()


class _TimerContext:
    def __init__(self, name: str, collector: MetricsCollector):
        self._name = name
        self._collector = collector
        self._start = 0.0

    def __enter__(self):
        self._start = time.time()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        duration_ms = (time.time() - self._start) * 1000
        self._collector.record(self._name, duration_ms, error=exc_type is not None)
        return False


def get_metrics() -> MetricsCollector:
    return MetricsCollector()
