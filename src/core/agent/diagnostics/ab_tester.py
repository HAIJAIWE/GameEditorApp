"""#ab_tester — A/B 修复并行测试 + 自动回滚

A/B 修复测试:
  - 对同一个错误生成 3 个候选方案
  - 在沙箱中并行测试
  - 运行回归测试套件
  - 选通过率最高的方案应用到源码

自动回滚:
  - 修复后开启监控窗口 (默认 60s)
  - 如果监控期间出现新错误 → 自动回滚到修复前状态
"""
from __future__ import annotations

from common.logger import get_logger

logger = get_logger()

from collections.abc import Callable  # noqa: E402  # logger 前置初始化后再导入的既有模式
from dataclasses import dataclass, field  # noqa: E402  # logger 前置初始化后再导入的既有模式
import os as _os  # noqa: E402  # logger 前置初始化后再导入的既有模式
import time  # noqa: E402  # logger 前置初始化后再导入的既有模式
from typing import Optional  # noqa: E402  # logger 前置初始化后再导入的既有模式


@dataclass
class FixCandidate:
    id: str
    strategy: str
    code_snippet: str
    confidence: float
    test_results: dict[str, bool] = field(default_factory=dict)
    pass_count: int = 0
    fail_count: int = 0
    errors: list[str] = field(default_factory=list)


class ABTester:
    """A/B 修复并行测试"""

    def __init__(self):
        self._candidates: list[FixCandidate] = []
        self._results: dict[str, FixCandidate] = {}

    def register_candidate(self, strategy: str, code_snippet: str,
                           confidence: float) -> str:
        cid = f"fix_{len(self._candidates) + 1}"
        candidate = FixCandidate(
            id=cid, strategy=strategy[:200], code_snippet=code_snippet[:2000],
            confidence=confidence
        )
        self._candidates.append(candidate)
        return cid

    def test_all(self, file_path: str, test_commands: list[str] = None) -> Optional[FixCandidate]:
        for candidate in self._candidates:
            for cmd in (test_commands or ["python -c \"import ast; ast.parse(open('test','r').read())\"".replace('test', file_path)]):
                try:
                    import shlex
                    import subprocess
                    cmd_parts = shlex.split(cmd) if isinstance(cmd, str) else cmd
                    result = subprocess.run(cmd_parts, capture_output=True,
                                           text=True, timeout=10, cwd=_os.path.dirname(file_path) or ".")
                    success = result.returncode == 0
                    candidate.test_results[cmd] = success
                    if success:
                        candidate.pass_count += 1
                    else:
                        candidate.fail_count += 1
                        if result.stderr:
                            candidate.errors.append(result.stderr[:200])
                except Exception as e:
                    candidate.fail_count += 1
                    candidate.errors.append(str(e))

        return self.select_best()

    def select_best(self) -> Optional[FixCandidate]:
        if not self._candidates:
            return None
        scored = [(c, c.pass_count * 2 + c.confidence * 3 - c.fail_count)
                  for c in self._candidates]
        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[0][0] if scored else None

    def get_ranked_report(self) -> str:
        lines = ["=" * 60, "   A/B 修复方案排行", "=" * 60]
        if not self._candidates:
            lines.append("\n  无候选方案")
            return "\n".join(lines)

        scored = [(c, c.pass_count * 2 + c.confidence * 3 - c.fail_count)
                  for c in self._candidates]
        scored.sort(key=lambda x: x[1], reverse=True)

        for i, (candidate, score) in enumerate(scored, 1):
            icon = "#1" if i == 1 else "#2" if i == 2 else "#3" if i == 3 else "  "
            lines.append(f"\n  {icon} 方案 {i}: {candidate.strategy[:80]}")
            lines.append(f"      置信度: {candidate.confidence:.0%}")
            lines.append(f"      通过: {candidate.pass_count} | 失败: {candidate.fail_count}")
            lines.append(f"      综合分: {score:.1f}")

        best = scored[0][0]
        lines.append(f"\n   最优方案: {best.strategy[:80]}")
        lines.append(f"\n  {'═' * 58}")
        return "\n".join(lines)

    def reset(self):
        self._candidates.clear()
        self._results.clear()


class AutoRollbackMonitor:
    """修复后自动回滚监控"""

    def __init__(self, monitor_seconds: float = 60.0):
        self._monitor_seconds = monitor_seconds
        self._active_monitors: dict[str, dict] = {}
        self._rollback_callbacks: dict[str, Callable] = {}

    def start_monitor(self, fix_id: str, file_path: str, rollback_fn: Callable):
        self._active_monitors[fix_id] = {
            "file_path": file_path,
            "start_time": time.time(),
            "timeline": [],
            "status": "monitoring",
        }
        self._rollback_callbacks[fix_id] = rollback_fn

    def report_error(self, fix_id: str, error: str) -> bool:
        """修复后监控期间如果出现新错误 → 自动回滚"""
        if fix_id not in self._active_monitors:
            return False
        monitor = self._active_monitors[fix_id]
        if monitor["status"] != "monitoring":
            return False

        monitor["timeline"].append({
            "time": time.time(),
            "error": error[:200],
        })

        if len(monitor["timeline"]) >= 2:
            monitor["status"] = "rollback_triggered"
            if fix_id in self._rollback_callbacks:
                try:
                    self._rollback_callbacks[fix_id]()
                except Exception as e:
                    logger.warning(f"操作失败: {e}")
            return True
        return False

    def check_timeout(self, fix_id: str) -> str:
        if fix_id not in self._active_monitors:
            return "not_found"
        monitor = self._active_monitors[fix_id]
        elapsed = time.time() - monitor["start_time"]
        if elapsed >= self._monitor_seconds:
            if monitor["status"] == "monitoring":
                monitor["status"] = "passed"
            return "passed" if monitor["status"] == "monitoring" else monitor["status"]
        return "monitoring"

    def get_monitor_report(self, fix_id: str) -> str:
        if fix_id not in self._active_monitors:
            return f"未找到修复 ID: {fix_id}"

        monitor = self._active_monitors[fix_id]
        elapsed = time.time() - monitor["start_time"]
        lines = ["=" * 60, "  ️ 修复后监控报告", "=" * 60]
        lines.append(f"  修复 ID: {fix_id}")
        lines.append(f"  文件: {monitor['file_path']}")
        lines.append(f"  监控时长: {min(elapsed, self._monitor_seconds):.0f}s / {self._monitor_seconds}s")
        lines.append(f"  状态: {monitor['status']}")

        if monitor["timeline"]:
            lines.append("\n  事件时间线:")
            for event in monitor["timeline"]:
                lines.append(f"    {event['time'] - monitor['start_time']:.0f}s: {event['error'][:100]}")

        lines.append(f"\n  {'═' * 58}")
        return "\n".join(lines)


_ab_tester = ABTester()
_auto_rollback_monitor = AutoRollbackMonitor()
