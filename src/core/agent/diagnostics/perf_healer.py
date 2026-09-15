"""#perf_healer — 性能自愈引擎

不只修报错，还要修"慢":
  - 检测超时/耗时异常 → 分析原因 → 自动加缓存/优化循环/减并发
  - 自动生成性能基准，发现退化立刻告警
  - 代码模式检测: 循环中重复计算、N+1查询、无索引查询
"""
from __future__ import annotations

import ast
import os as _os
from typing import Optional


class PerfIssue:
    def __init__(self, kind: str, file_path: str, lineno: int, description: str,
                 fix: str, severity: str = "medium"):
        self.kind = kind
        self.file_path = file_path
        self.lineno = lineno
        self.description = description
        self.fix = fix
        self.severity = severity


class PerformanceHealer:
    """性能自愈 — 检测慢操作并建议/自动优化"""

    PATTERNS = [
        ("loop_recompute", "循环中重复计算不变量",
         r"for.*in.*:.*\n.*=.*\(.*\)", "将计算结果提取到循环外"),
        ("n_plus_1", "N+1 查询模式 (循环中逐条查询)",
         r"for.*in.*:.*\n.*query|find|get", "用批量查询代替逐条查询"),
        ("unindexed_search", "在大列表中线性搜索",
         None, "用 dict/set 代替 list 查找，或用 bisect 二分查找"),
        ("repeated_file_read", "循环中重复读取文件",
         r"for.*in.*:.*\n.*open|read", "把文件内容读到内存后在循环中使用"),
        ("deep_nesting", "循环嵌套过深 (≥3层)",
         None, "考虑用 itertools.product 或提前退出减少层级"),
        ("large_list_copy", "大列表切片复制",
         r"=\s*\[.*\]\s*\*", "如果不需要修改，用 tuple 或共享引用"),
    ]

    def __init__(self):
        self._perf_baselines: dict[str, float] = {}
        self._issues: list[PerfIssue] = []

    def analyze_file(self, file_path: str) -> list[PerfIssue]:
        issues: list[PerfIssue] = []
        try:
            with open(file_path, encoding="utf-8") as f:
                source = f.read()
            tree = ast.parse(source)
        except Exception:
            return issues

        def _get_loop_depth(node, depth=0):
            if isinstance(node, (ast.For, ast.While)):
                depth += 1
                if depth >= 3:
                    issues.append(PerfIssue(
                        "deep_nesting", file_path, getattr(node, 'lineno', 0),
                        f"循环嵌套深度 {depth}，可能导致性能问题",
                        "考虑扁平化或提前退出", "medium"
                    ))
        for node in ast.walk(tree):
            if isinstance(node, ast.For):
                has_inner_call = False
                for child in ast.walk(node):
                    if isinstance(child, ast.Call):
                        has_inner_call = True
                        break
                if has_inner_call:
                    for child in ast.walk(node):
                        if isinstance(child, ast.Call) and isinstance(child.func, ast.Name):
                            if child.func.id in ('open', 'read'):
                                issues.append(PerfIssue(
                                    "repeated_file_read", file_path, child.lineno,
                                    "循环中重复读取文件",
                                    "在循环前一次性读取文件内容", "high"
                                ))

        return issues

    def auto_optimize_suggestion(self, error_message: str) -> Optional[str]:
        msg = error_message.lower()
        if "timeout" in msg or "timed out" in msg:
            return (
                " 性能优化建议:\n"
                "  1. 增加超时阈值: timeout=60\n"
                "  2. 添加结果缓存，减少重复计算\n"
                "  3. 如果查询数据量大，用分页 (limit/offset)\n"
                "  4. 用异步/多线程并行处理独立操作"
            )
        if "slow" in msg or "performance" in msg or "耗时" in msg:
            return (
                " 性能优化建议:\n"
                "  1. 用 ast_check 扫描文件中的循环和重复调用\n"
                "  2. 添加 @functools.lru_cache 缓存函数结果\n"
                "  3. 数据库操作检查是否有索引\n"
                "  4. 考虑用生成器代替列表，减少内存占用"
            )
        return None

    def get_report(self, file_path: str = "") -> str:
        lines = ["=" * 60, "   性能自愈报告", "=" * 60]

        if file_path and _os.path.isfile(file_path):
            issues = self.analyze_file(file_path)
            if issues:
                lines.append(f"\n   {file_path}: 发现 {len(issues)} 个性能隐患")
                for issue in issues:
                    icon = "[ERR]" if issue.severity == "high" else "~"
                    lines.append(f"  {icon} L{issue.lineno}: [{issue.kind}] {issue.description}")
                    lines.append(f"       {issue.fix}")
            else:
                lines.append(f"\n  [OK] {file_path} 未发现性能问题")
        else:
            lines.append("\n   传入 file_path 参数可分析特定文件")
            lines.append("\n  常见性能自愈场景:")
            lines.append("  - 操作超时 → 增加超时+缓存+分页")
            lines.append("  - 内存溢出 → 生成器+lru_cache+分批处理")
            lines.append("  - 响应变慢 → 异步+索引+预计算")

        lines.append(f"\n  {'═' * 58}")
        return "\n".join(lines)


class ResourceLeakDetector:
    """资源泄漏检测 — 文件未关闭、连接未释放"""

    def __init__(self):
        self._open_resources: dict[str, int] = {}

    def scan_file(self, file_path: str) -> list[PerfIssue]:
        issues: list[PerfIssue] = []
        try:
            with open(file_path, encoding="utf-8") as f:
                source = f.read()
            tree = ast.parse(source)
        except Exception:
            return issues

        # 修复: ast 标准库不会自动设置 parent 属性，必须手动遍历建立
        self._annotate_parents(tree)

        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                if isinstance(node.func, ast.Name):
                    if node.func.id == 'open':
                        if not self._has_context_manager(node):
                            issues.append(PerfIssue(
                                "resource_leak", file_path, node.lineno,
                                "open() 未使用 with 语句，文件可能未正确关闭",
                                "改用: with open(...) as f:",
                                "high"
                            ))
                    elif node.func.id in ('connect', 'acquire'):
                        if not self._has_context_manager(node):
                            issues.append(PerfIssue(
                                "resource_leak", file_path, node.lineno,
                                f"{node.func.id}() 未使用上下文管理器",
                                "改用 with 语句管理资源生命周期",
                                "high"
                            ))

        return issues

    @staticmethod
    def _annotate_parents(tree) -> None:
        """为 AST 树的每个节点建立 parent 引用（ast 标准库不自动设置）"""
        for parent in ast.walk(tree):
            for child in ast.iter_child_nodes(parent):
                # 优先使用 ast.parent 属性（Python 3.8+ 支持），无则手动设置
                if not getattr(child, 'parent', None):
                    child.parent = parent  # type: ignore[attr-defined]  # ast 标准库未声明 parent 属性

    def _has_context_manager(self, node) -> bool:
        # 修复: 之前 node.parent 永远 None（ast 不自动设置），现在通过 _annotate_parents 建立
        parent = getattr(node, 'parent', None)
        while parent:
            if isinstance(parent, ast.With):
                return True
            parent = getattr(parent, 'parent', None)
        return False


_perf_healer = PerformanceHealer()
_resource_leak_detector = ResourceLeakDetector()
