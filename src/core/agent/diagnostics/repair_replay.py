"""#repair_replay — 修复回放引擎

记录每一次修复的完整时间线:
  检测 → 快照 → 分析 → 编辑 → 验证 → 提交(或回滚)
  
出问题时可以:
  - 回放看哪一步出错了
  - 对比每次修复的耗时
  - 统计修复模式的成功率
  - 导出给 AI 学习
"""
from __future__ import annotations

from enum import Enum
import json
import os as _os
import time
from typing import Optional


class ReplayStep(str, Enum):
    DETECT = "detect"
    SNAPSHOT = "snapshot"
    ANALYZE = "analyze"
    EDIT = "edit"
    VERIFY = "verify"
    COMMIT = "commit"
    ROLLBACK = "rollback"
    CROSS_SCAN = "cross_scan"


class ReplayEntry:
    def __init__(self, step: ReplayStep, description: str, file_path: str = "",
                 detail: dict = None, timestamp: float = None):
        self.step = step
        self.description = description
        self.file_path = file_path
        self.detail = detail or {}
        self.timestamp = timestamp or time.time()

    def to_dict(self) -> dict:
        return {
            "step": self.step.value,
            "description": self.description,
            "file_path": self.file_path,
            "detail": self.detail,
            "timestamp": self.timestamp,
        }


class RepairTimeline:
    def __init__(self, repair_id: str, error_type: str, error_message: str = ""):
        self.repair_id = repair_id
        self.error_type = error_type
        self.error_message = error_message[:500]
        self.entries: list[ReplayEntry] = []
        self.start_time = time.time()
        self.end_time: Optional[float] = None
        self.success: Optional[bool] = None
        self.files_modified: list[str] = []

    def add(self, step: ReplayStep, description: str, file_path: str = "", detail: dict = None):
        self.entries.append(ReplayEntry(step, description, file_path, detail))

    def finish(self, success: bool):
        self.end_time = time.time()
        self.success = success

    @property
    def duration_ms(self) -> float:
        end = self.end_time or time.time()
        return (end - self.start_time) * 1000

    def to_dict(self) -> dict:
        return {
            "repair_id": self.repair_id,
            "error_type": self.error_type,
            "error_message": self.error_message,
            "entries": [e.to_dict() for e in self.entries],
            "duration_ms": self.duration_ms,
            "success": self.success,
            "files_modified": self.files_modified,
            "start_time": self.start_time,
            "end_time": self.end_time,
        }


class RepairReplay:
    def __init__(self):
        self._timelines: dict[str, RepairTimeline] = {}
        self._save_path: Optional[str] = None

    def set_save_path(self, path: str):
        self._save_path = path

    def start(self, error_type: str, error_message: str = "") -> RepairTimeline:
        rid = f"repair_{int(time.time() * 1000)}_{len(self._timelines)}"
        timeline = RepairTimeline(rid, error_type, error_message)
        self._timelines[rid] = timeline
        return timeline

    def record(self, rid: str, step: ReplayStep, description: str,
               file_path: str = "", detail: dict = None):
        if rid in self._timelines:
            self._timelines[rid].add(step, description, file_path, detail)

    def get_replay(self, rid: str) -> Optional[str]:
        if rid not in self._timelines:
            return None
        tl = self._timelines[rid]
        lines = ["=" * 60, f"   修复回放 — {rid}", "=" * 60]
        lines.append(f"  错误类型: {tl.error_type}")
        lines.append(f"  错误消息: {tl.error_message[:100]}")
        lines.append(f"  总耗时: {tl.duration_ms:.0f}ms")
        lines.append(f"  结果: {'[OK] 成功' if tl.success else '[FAIL] 失败'}")
        lines.append("")

        step_icons = {
            ReplayStep.DETECT: "",
            ReplayStep.SNAPSHOT: "",
            ReplayStep.ANALYZE: "",
            ReplayStep.EDIT: "✏️",
            ReplayStep.VERIFY: "[OK]",
            ReplayStep.COMMIT: "",
            ReplayStep.ROLLBACK: "↩️",
            ReplayStep.CROSS_SCAN: "",
        }

        prev_time = tl.entries[0].timestamp if tl.entries else tl.start_time
        for entry in tl.entries:
            icon = step_icons.get(entry.step, "•")
            elapsed = (entry.timestamp - prev_time) * 1000
            lines.append(f"  {icon} +{elapsed:6.0f}ms  [{entry.step.value}] {entry.description}")
            if entry.file_path:
                lines.append(f"       {entry.file_path}")
            prev_time = entry.timestamp

        lines.append(f"\n  {'═' * 58}")
        return "\n".join(lines)

    def compare(self, rid_a: str, rid_b: str) -> str:
        tla = self._timelines.get(rid_a)
        tlb = self._timelines.get(rid_b)
        if not tla or not tlb:
            return "replay not found"

        lines = ["=" * 60, "   修复对比", "=" * 60]
        lines.append(f"  A: {rid_a} ({tla.duration_ms:.0f}ms, {'[OK]' if tla.success else '[FAIL]'})")
        lines.append(f"  B: {rid_b} ({tlb.duration_ms:.0f}ms, {'[OK]' if tlb.success else '[FAIL]'})")
        lines.append(f"  耗时差异: {abs(tla.duration_ms - tlb.duration_ms):.0f}ms")

        common_steps = set(e.step for e in tla.entries) & set(e.step for e in tlb.entries)
        only_a = set(e.step for e in tla.entries) - common_steps
        only_b = set(e.step for e in tlb.entries) - common_steps

        if only_a:
            lines.append(f"  仅在 A 中: {[s.value for s in only_a]}")
        if only_b:
            lines.append(f"  仅在 B 中: {[s.value for s in only_b]}")

        return "\n".join(lines)

    def get_stats(self) -> dict:
        if not self._timelines:
            return {"total": 0, "success_rate": 0, "avg_duration_ms": 0}

        total = len(self._timelines)
        successes = sum(1 for t in self._timelines.values() if t.success)
        durations = [t.duration_ms for t in self._timelines.values()]

        return {
            "total": total,
            "successes": successes,
            "success_rate": successes / total if total > 0 else 0,
            "avg_duration_ms": sum(durations) / total if durations else 0,
            "min_duration_ms": min(durations) if durations else 0,
            "max_duration_ms": max(durations) if durations else 0,
        }

    def save(self, rid: str) -> bool:
        if not self._save_path or rid not in self._timelines:
            return False
        try:
            dirname = _os.path.dirname(self._save_path)
            if dirname and not _os.path.isdir(dirname):
                _os.makedirs(dirname, exist_ok=True)
            with open(self._save_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(self._timelines[rid].to_dict(), ensure_ascii=False) + "\n")
            return True
        except Exception:
            return False


_repair_replay = RepairReplay()
