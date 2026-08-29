"""Agent OS §10 — 可观测性：指标收集、导出、Prometheus 格式暴露"""
from common.logger import get_logger

logger = get_logger()

import json
from pathlib import Path
import threading
import time


class MetricsCollector:
    """Agent OS — 指标收集器：内存聚合 + 持久化"""

    def __init__(self, data_dir: str = ""):
        self._data_dir = Path(data_dir or "data/metrics")
        self._data_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._counters: dict[str, int] = {}
        self._gauges: dict[str, float] = {}
        self._histograms: dict[str, list[float]] = {}
        self._start_time = time.time()
        self._interval = 60

        self._flush_thread = threading.Thread(target=self._periodic_flush, daemon=True)
        self._flush_thread.start()

    def incr(self, name: str, amount: int = 1):
        with self._lock:
            self._counters[name] = self._counters.get(name, 0) + amount

    def gauge(self, name: str, value: float):
        with self._lock:
            self._gauges[name] = value

    def observe(self, name: str, value: float):
        with self._lock:
            self._histograms.setdefault(name, []).append(value)
            if len(self._histograms[name]) > 1000:
                self._histograms[name] = self._histograms[name][-500:]

    def snapshot(self) -> dict:
        with self._lock:
            hist_snap = {}
            for k, values in self._histograms.items():
                if values:
                    sorted_vals = sorted(values)
                    hist_snap[k] = {
                        "count": len(values),
                        "avg": sum(values) / len(values),
                        "p50": sorted_vals[len(values) // 2],
                        "p95": sorted_vals[int(len(values) * 0.95)],
                        "p99": sorted_vals[int(len(values) * 0.99)],
                    }
            uptime = time.time() - self._start_time
            return {
                "counters": dict(self._counters),
                "gauges": dict(self._gauges),
                "histograms": hist_snap,
                "uptime_seconds": int(uptime),
                "uptime": f"{int(uptime // 3600)}h{int((uptime % 3600) // 60)}m",
            }

    def prometheus_format(self) -> str:
        snap = self.snapshot()
        lines = []
        for name, value in snap["counters"].items():
            lines.append(f"agent_os_{name}_total {value}")
        for name, value in snap["gauges"].items():
            lines.append(f"agent_os_{name} {value}")
        for name, h in snap["histograms"].items():
            lines.append(f"agent_os_{name}_count {h['count']}")
            lines.append(f"agent_os_{name}_avg {h['avg']:.3f}")
        return "\n".join(lines)

    def _periodic_flush(self):
        filepath = self._data_dir / "metrics.jsonl"
        while True:
            time.sleep(self._interval)
            try:
                snap = self.snapshot()
                with open(filepath, "a", encoding="utf-8") as f:
                    f.write(json.dumps({"t": int(time.time()), **snap}, ensure_ascii=False) + "\n")
            except Exception as e:
                logger.warning(f"操作失败: {e}")

    def get_latest(self, lines: int = 1) -> list:
        filepath = self._data_dir / "metrics.jsonl"
        if not filepath.exists():
            return []
        result = []
        with open(filepath, encoding="utf-8") as f:
            for line in f:
                try:
                    result.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
        return result[-lines:] if lines > 0 else result


class MetricsMiddleware:
    """Agent OS — 指标中间件：自动记录请求指标"""

    def __init__(self, collector: MetricsCollector):
        self._collector = collector

    def wrap(self, fn):
        def wrapper(*args, **kwargs):
            start = time.time()
            self._collector.incr("requests_total")
            try:
                result = fn(*args, **kwargs)
                self._collector.incr("requests_success")
                return result
            except Exception:
                self._collector.incr("requests_failed")
                raise
            finally:
                elapsed = (time.time() - start) * 1000
                self._collector.observe("request_duration_ms", elapsed)
                self._collector.gauge("last_request_ms", elapsed)
        return wrapper
