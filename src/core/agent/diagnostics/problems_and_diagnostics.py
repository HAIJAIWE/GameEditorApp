"""#problems_and_diagnostics — 问题诊断与修复方案注册表

面向 AI 助手和自动化测试的诊断方案系统。定义常见问题模式、
自动检测规则、诊断流程和修复策略，实现"检测→诊断→修复→验证"闭环。

使用方式:
    from core.agent.problems_and_diagnostics import (
        ProblemRegistry, DiagnosticReport, diagnose, fix
    )
    registry = ProblemRegistry()
    report = registry.diagnose(data_manager)
    registry.fix(report, data_manager)
"""
from __future__ import annotations

from common.logger import get_logger

logger = get_logger()

import os as _os
import sys

_PKG_DIR = _os.path.abspath(_os.path.join(_os.path.dirname(__file__), '..', '..'))
if _PKG_DIR not in sys.path:
    sys.path.insert(0, _PKG_DIR)

from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass, field
from enum import Enum
import time
from typing import Any, Optional

try:
    from common.logger import get_logger
    _logger = get_logger()
except Exception:
    import logging
    _logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════
# 问题类型与严重等级
# ═══════════════════════════════════════════════════════════════════

class ProblemSeverity(Enum):
    CRITICAL = "critical"    # 数据丢失 / 系统不可用
    ERROR = "error"          # 功能异常 / 数据损坏
    WARNING = "warning"      # 潜在风险 / 建议修复
    INFO = "info"            # 信息提示


class ProblemCategory(Enum):
    DATA_INTEGRITY = "data_integrity"    # 数据完整性（缺id/name/重复）
    REFERENCE = "reference"              # 引用完整性（孤立引用/死链）
    SCHEMA = "schema"                    # Schema 健康（字段定义缺失）
    PERFORMANCE = "performance"          # 性能问题（慢查询/内存）
    SELF_HEALING = "self_healing"        # 自愈系统状态
    CONFIG = "config"                    # 配置问题
    LOGIC = "logic"                      # 逻辑/规则问题


# ═══════════════════════════════════════════════════════════════════
# 诊断结果
# ═══════════════════════════════════════════════════════════════════

@dataclass
class Problem:
    """单个问题"""
    id: str
    category: ProblemCategory
    severity: ProblemSeverity
    title: str
    detail: str = ""
    location: str = ""           # 如 "roles[3].name"
    suggestion: str = ""         # 修复建议
    tool_call: Optional[dict] = None  # 可自动执行的修复工具调用


@dataclass
class DiagnosticReport:
    """诊断报告"""
    timestamp: float = field(default_factory=time.time)
    total_items: int = 0
    total_types: int = 0
    problems: list[Problem] = field(default_factory=list)
    metrics: dict[str, Any] = field(default_factory=dict)
    fixed_count: int = 0
    fixable_count: int = 0

    @property
    def is_healthy(self) -> bool:
        return len(self.problems) == 0

    @property
    def critical_count(self) -> int:
        return sum(1 for p in self.problems if p.severity == ProblemSeverity.CRITICAL)

    def to_dict(self) -> dict:
        return {
            "timestamp": self.timestamp,
            "total_items": self.total_items,
            "total_types": self.total_types,
            "is_healthy": self.is_healthy,
            "critical_count": self.critical_count,
            "problems": [
                {
                    "id": p.id, "category": p.category.value,
                    "severity": p.severity.value, "title": p.title,
                    "detail": p.detail, "location": p.location,
                    "suggestion": p.suggestion,
                    "auto_fixable": p.tool_call is not None,
                }
                for p in self.problems
            ],
            "metrics": self.metrics,
        }

    def format_for_ai(self) -> str:
        """格式化为 AI 助手可读的摘要"""
        lines = [
            "=" * 54,
            "   系统诊断报告",
            "=" * 54,
            f"  数据量: {self.total_items} 条 ({self.total_types} 类型)",
            f"  健康状态: {'[OK] 正常' if self.is_healthy else '[WARN] 发现问题'}",
            f"  严重问题: {self.critical_count}",
            f"  可自动修复: {self.fixable_count}",
            "",
        ]
        if not self.problems:
            lines.append("  [OK] 未发现任何问题，数据状态良好")
        else:
            lines.append(f"   发现 {len(self.problems)} 个问题:")
            by_cat = defaultdict(list)
            for p in self.problems:
                by_cat[p.category.value].append(p)
            for cat, probs in by_cat.items():
                cat_cn = {
                    "data_integrity": "数据完整性",
                    "reference": "引用完整性",
                    "schema": "Schema健康",
                    "performance": "性能",
                    "self_healing": "自愈系统",
                    "config": "配置",
                    "logic": "逻辑规则",
                }.get(cat, cat)
                lines.append(f"\n  [{cat_cn}]")
                for p in probs:
                    sev_icon = {"critical": "[ERR]", "error": "~", "warning": "~", "info": ""}[p.severity.value]
                    lines.append(f"    {sev_icon} {p.title}")
                    if p.detail:
                        lines.append(f"       细节: {p.detail}")
                    if p.suggestion:
                        lines.append(f"        {p.suggestion}")
        lines.append("")
        lines.append("=" * 54)
        return "\n".join(lines)


# ═══════════════════════════════════════════════════════════════════
# 问题模式库 — 注册所有已知问题类型的检测规则
# ═══════════════════════════════════════════════════════════════════

PROBLEM_PATTERNS: dict[str, dict] = {
    # ─── 数据完整性 ───
    "missing_id": {
        "category": ProblemCategory.DATA_INTEGRITY,
        "severity": ProblemSeverity.ERROR,
        "title": "条目缺少 ID",
        "detail_format": "{data_type} 表中 {count} 条数据缺少 id 字段",
        "suggestion": "执行 fix_data(repair_missing_ids) 自动补充",
        "tool_call": {"name": "fix_data", "params": {"action": "repair_missing_ids"}},
    },
    "missing_name": {
        "category": ProblemCategory.DATA_INTEGRITY,
        "severity": ProblemSeverity.WARNING,
        "title": "条目缺少名称",
        "detail_format": "{data_type} 表中 {count} 条数据缺少 name 字段",
        "suggestion": "执行 fix_data(repair_empty_names) 自动补充",
        "tool_call": {"name": "fix_data", "params": {"action": "repair_empty_names"}},
    },
    "duplicate_id": {
        "category": ProblemCategory.DATA_INTEGRITY,
        "severity": ProblemSeverity.CRITICAL,
        "title": "存在重复 ID",
        "detail_format": "{data_type} 表中发现重复 id: {ids}",
        "suggestion": "执行 fix_data(repair_duplicate_ids) 自动重新生成",
        "tool_call": {"name": "fix_data", "params": {"action": "repair_duplicate_ids"}},
    },
    "empty_dataset": {
        "category": ProblemCategory.DATA_INTEGRITY,
        "severity": ProblemSeverity.INFO,
        "title": "数据集为空",
        "detail_format": "{data_type} 表中没有任何数据",
        "suggestion": "使用 create_item 添加数据，或使用模板填充",
    },

    # ─── 引用完整性 ───
    "orphan_ref": {
        "category": ProblemCategory.REFERENCE,
        "severity": ProblemSeverity.WARNING,
        "title": "存在孤立引用",
        "detail_format": "发现 {count} 个引用指向不存在的目标",
        "suggestion": "执行 fix_data(clean_orphan_refs) 清理无效引用",
        "tool_call": {"name": "fix_data", "params": {"action": "clean_orphan_refs"}},
    },
    "dead_link": {
        "category": ProblemCategory.REFERENCE,
        "severity": ProblemSeverity.ERROR,
        "title": "死链接—引用的数据已删除",
        "detail_format": "{data_type}.{item_name} 引用了不存在的 {ref_type}:{ref_id}",
        "suggestion": "手动修正引用目标或删除该条目",
    },

    # ─── 性能问题 ───
    "slow_query": {
        "category": ProblemCategory.PERFORMANCE,
        "severity": ProblemSeverity.WARNING,
        "title": "查询性能下降",
        "detail_format": "{operation} 操作耗时 {elapsed_ms}ms，超过阈值 {threshold_ms}ms",
        "suggestion": "考虑使用 batch 批量操作减少单次调用",
    },
    "large_dataset": {
        "category": ProblemCategory.PERFORMANCE,
        "severity": ProblemSeverity.INFO,
        "title": "数据集规模较大",
        "detail_format": "{data_type} 表包含 {count} 条数据",
        "suggestion": "使用 search_items 和高级搜索缩小查询范围",
    },

    # ─── 自愈系统 ───
    "circuit_open": {
        "category": ProblemCategory.SELF_HEALING,
        "severity": ProblemSeverity.WARNING,
        "title": "熔断器已触发",
        "detail_format": "{tool_name} 熔断器已打开（连续失败 {fail_count} 次），将在 {reset_in}s 后恢复",
        "suggestion": "等待冷却后自动恢复，或查看 show_health_report 了解详情",
    },
    "high_failure_rate": {
        "category": ProblemCategory.SELF_HEALING,
        "severity": ProblemSeverity.ERROR,
        "title": "操作失败率过高",
        "detail_format": "{tool_name} 失败率 {rate:.0%}，超过阈值",
        "suggestion": "查看 show_health_report 分析高频故障，排查上游服务",
    },
    "no_snapshots": {
        "category": ProblemCategory.SELF_HEALING,
        "severity": ProblemSeverity.INFO,
        "title": "无可用快照",
        "detail_format": "快照管理器中没有保存的快照",
        "suggestion": "批量操作/导入数据时会自动创建快照，无需手动干预",
    },

    # ─── 配置问题 ───
    "auto_save_disabled": {
        "category": ProblemCategory.CONFIG,
        "severity": ProblemSeverity.WARNING,
        "title": "自动保存已关闭",
        "detail_format": "自动保存当前处于关闭状态",
        "suggestion": "执行 toggle_auto_save 重新开启",
        "tool_call": {"name": "toggle_auto_save", "params": {}},
    },
    "schema_missing": {
        "category": ProblemCategory.CONFIG,
        "severity": ProblemSeverity.WARNING,
        "title": "缺少类型 Schema 定义",
        "detail_format": "{data_type} 类型的字段定义不完整",
        "suggestion": "使用 sync_schema_from_plan 从方案中同步字段",
        "tool_call": {"name": "sync_schema_from_plan", "params": {}},
    },

    # ─── 逻辑/规则问题 ───
    "value_outlier": {
        "category": ProblemCategory.LOGIC,
        "severity": ProblemSeverity.WARNING,
        "title": "数值异常",
        "detail_format": "{data_type}.{item_name} 的 {field}={value} 超出合理范围 [{min}, {max}]",
        "suggestion": "执行 update_current_item 调整到合理范围内",
    },
    "duplicate_name": {
        "category": ProblemCategory.LOGIC,
        "severity": ProblemSeverity.WARNING,
        "title": "名称重复",
        "detail_format": "{data_type} 中 {count} 对条目使用相同名称",
        "suggestion": "手动修改或使用 update_current_item 区分名称",
    },
    "missing_required": {
        "category": ProblemCategory.LOGIC,
        "severity": ProblemSeverity.ERROR,
        "title": "必填字段缺失",
        "detail_format": "{data_type}.{item_name} 缺少必填字段: {fields}",
        "suggestion": "使用 update_current_item 补充必填字段",
    },

    # ─── 代码自愈 ───
    "code_import_error": {
        "category": ProblemCategory.LOGIC,
        "severity": ProblemSeverity.CRITICAL,
        "title": "代码缺少 import",
        "detail_format": "文件 {file_path} 第 {line} 行: {error_msg}",
        "suggestion": "调用 fix_code(traceback=\"{error_msg}\") 定位并自动添加缺失的 import",
        "tool_call": {"name": "fix_code", "params": {"traceback": "{traceback}"}},
    },
    "code_name_error": {
        "category": ProblemCategory.LOGIC,
        "severity": ProblemSeverity.ERROR,
        "title": "变量/函数名未定义",
        "detail_format": "{error_msg}",
        "suggestion": "调用 fix_code 分析 traceback，检查拼写和 import",
        "tool_call": {"name": "fix_code", "params": {"traceback": "{traceback}"}},
    },
    "code_attribute_error": {
        "category": ProblemCategory.LOGIC,
        "severity": ProblemSeverity.ERROR,
        "title": "属性/方法不存在",
        "detail_format": "{error_msg}",
        "suggestion": "调用 fix_code 定位源码，修正属性名拼写",
        "tool_call": {"name": "fix_code", "params": {"traceback": "{traceback}"}},
    },
    "code_type_error": {
        "category": ProblemCategory.LOGIC,
        "severity": ProblemSeverity.ERROR,
        "title": "参数类型/数量不匹配",
        "detail_format": "{error_msg}",
        "suggestion": "调用 fix_code 分析函数签名，修正参数",
        "tool_call": {"name": "fix_code", "params": {"traceback": "{traceback}"}},
    },
    "code_syntax_error": {
        "category": ProblemCategory.LOGIC,
        "severity": ProblemSeverity.CRITICAL,
        "title": "语法错误",
        "detail_format": "文件 {file_path} 第 {line} 行: 语法无效",
        "suggestion": "调用 fix_code 检查括号匹配、冒号、引号",
        "tool_call": {"name": "fix_code", "params": {"traceback": "{traceback}"}},
    },
    "frontend_error": {
        "category": ProblemCategory.LOGIC,
        "severity": ProblemSeverity.ERROR,
        "title": "前端运行时异常",
        "detail_format": "{error_msg}",
        "suggestion": "调用 fix_code(language=\"typescript\") 定位前端源码",
        "tool_call": {"name": "fix_code", "params": {"language": "typescript", "traceback": "{traceback}"}},
    },
    "frontend_css_error": {
        "category": ProblemCategory.LOGIC,
        "severity": ProblemSeverity.WARNING,
        "title": "CSS/样式问题",
        "detail_format": "{error_msg}",
        "suggestion": "调用 fix_code(language=\"css\") 定位样式文件",
        "tool_call": {"name": "fix_code", "params": {"language": "css", "traceback": "{traceback}"}},
    },
}


# ═══════════════════════════════════════════════════════════════════
# 问题注册引擎
# ═══════════════════════════════════════════════════════════════════

class ProblemRegistry:
    """问题诊断注册表 — 管理所有检测器和修复策略"""

    _instance: Optional[ProblemRegistry] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self.patterns: dict[str, dict] = dict(PROBLEM_PATTERNS)
        self._detectors: dict[ProblemCategory, list[Callable]] = defaultdict(list)
        self._fixers: dict[str, Callable] = {}
        self._last_report: Optional[DiagnosticReport] = None
        self._diagnostic_history: list[DiagnosticReport] = []

    def register_detector(self, category: ProblemCategory, fn: Callable):
        """注册自定义检测器"""
        self._detectors[category].append(fn)
        _logger.info(f"注册检测器: {category.value} <- {fn.__name__}")

    def register_fixer(self, problem_id: str, fn: Callable):
        """注册自定义修复器"""
        self._fixers[problem_id] = fn
        _logger.info(f"注册修复器: {problem_id} <- {fn.__name__}")

    def diagnose(self, data_manager, *, fast: bool = False) -> DiagnosticReport:
        """执行全系统诊断扫描

        Args:
            data_manager: 数据管理器实例
            fast: True 时跳过性能敏感检测
        """
        start = time.perf_counter()
        dm = data_manager
        report = DiagnosticReport()

        total_items = 0
        for pk, items in dm.data.items():
            if not isinstance(items, list):
                continue
            report.total_types += 1
            total_items += len(items)
        report.total_items = total_items

        # ── 1. 数据完整性 ──
        self._check_data_integrity(dm, report)

        # ── 2. 引用完整性 ──
        self._check_references(dm, report)

        # ── 3. Schema 健康度 ──
        self._check_schema(dm, report)

        # ── 4. 自愈系统状态 ──
        self._check_self_healing(report)

        # ── 5. 运行自定义检测器 ──
        if not fast:
            for category, detectors in self._detectors.items():
                for det_fn in detectors:
                    try:
                        det_fn(dm, report)
                    except Exception as e:
                        _logger.warning(f"自定义检测器 {det_fn.__name__} 失败: {e}")

        # ── 统计 ──
        report.fixable_count = sum(1 for p in report.problems if p.tool_call is not None)

        elapsed = (time.perf_counter() - start) * 1000
        report.metrics = {
            "diagnose_elapsed_ms": round(elapsed, 1),
            "total_problems": len(report.problems),
            "by_severity": {
                "critical": report.critical_count,
                "error": sum(1 for p in report.problems if p.severity == ProblemSeverity.ERROR),
                "warning": sum(1 for p in report.problems if p.severity == ProblemSeverity.WARNING),
                "info": sum(1 for p in report.problems if p.severity == ProblemSeverity.INFO),
            },
            "by_category": {},
        }
        by_cat = defaultdict(int)
        for p in report.problems:
            by_cat[p.category.value] += 1
        report.metrics["by_category"] = dict(by_cat)

        self._last_report = report
        self._diagnostic_history.append(report)
        if len(self._diagnostic_history) > 50:
            self._diagnostic_history = self._diagnostic_history[-50:]

        return report

    def fix(self, report: DiagnosticReport, data_manager, tool_executor=None) -> int:
        """自动修复诊断报告中可自动修复的问题

        Args:
            report: 诊断报告
            data_manager: 数据管理器
            tool_executor: 工具执行器 (execute_tool 函数)

        Returns:
            成功修复的数量
        """
        fixed = 0
        auto_fixable = [p for p in report.problems if p.tool_call is not None]

        for problem in auto_fixable:
            try:
                if tool_executor:
                    result = tool_executor(
                        problem.tool_call["name"],
                        problem.tool_call.get("params", {}),
                        None  # main_window
                    )
                elif problem.id in self._fixers:
                    result = self._fixers[problem.id](data_manager, problem)
                else:
                    continue

                if result and "失败" not in str(result):
                    fixed += 1
                    _logger.info(f"自动修复: {problem.id} -> {problem.title}")
            except Exception as e:
                _logger.warning(f"修复 {problem.id} 失败: {e}")

        report.fixed_count = fixed
        return fixed

    # ═══════════════════════════════════════════════════════
    # 内置检测器
    # ═══════════════════════════════════════════════════════

    def _check_data_integrity(self, dm, report: DiagnosticReport):
        for pk, items in dm.data.items():
            if not isinstance(items, list) or not items:
                if isinstance(items, list) and not items:
                    p = Problem(
                        id=f"empty_dataset_{pk}",
                        category=ProblemCategory.DATA_INTEGRITY,
                        severity=ProblemSeverity.INFO,
                        title="数据集为空",
                        detail=f"{pk} 表中没有任何数据",
                        location=pk,
                    )
                    report.problems.append(p)
                continue

            no_id = []
            no_name = []
            ids_seen = {}
            name_seen = defaultdict(list)

            for i, it in enumerate(items):
                iid = it.get("id")
                if not iid:
                    no_id.append(i)
                elif iid in ids_seen:
                    ids_seen[iid].append(i)
                else:
                    ids_seen[iid] = [i]

                name = it.get("name")
                if not name:
                    no_name.append(i)
                else:
                    name_seen[name].append(i)

            if no_id:
                p = self._build_problem("missing_id", data_type=pk, count=len(no_id))
                report.problems.append(p)

            if no_name:
                p = self._build_problem("missing_name", data_type=pk, count=len(no_name))
                report.problems.append(p)

            for iid, occurrences in ids_seen.items():
                if len(occurrences) > 1:
                    p = self._build_problem("duplicate_id", data_type=pk, ids=iid)
                    report.problems.append(p)
                    break

    def _check_references(self, dm, report: DiagnosticReport):
        all_ids = set()
        for items in dm.data.values():
            if not isinstance(items, list):
                continue
            for it in items:
                iid = str(it.get("id", ""))
                if iid:
                    all_ids.add(iid)

        ref_fields = {"role_id", "skill_id", "monster_id", "equip_id", "item_id",
                      "talent_id", "buff_id", "job_id", "task_id", "dialog_id",
                      "source_id", "target_id", "ref_id", "parent_id"}

        orphan_count = 0
        for pk, items in dm.data.items():
            if not isinstance(items, list):
                continue
            for it in items:
                for key, val in it.items():
                    if key in ref_fields and isinstance(val, str) and len(val) > 4:
                        if val not in all_ids:
                            orphan_count += 1

        if orphan_count > 0:
            p = self._build_problem("orphan_ref", count=orphan_count)
            report.problems.append(p)

    def _check_schema(self, dm, report: DiagnosticReport):
        try:
            from config.constants import DATA_TYPES
            for dt in DATA_TYPES:
                if dt in dm.data and isinstance(dm.data[dt], list) and dm.data[dt]:
                    sample = dm.data[dt][0]
                    if not isinstance(sample, dict) or len(sample) < 3:
                        p = self._build_problem("schema_missing", data_type=dt)
                        report.problems.append(p)
                        break
        except Exception as e:
            logger.warning(f"操作失败: {e}")

    def _check_self_healing(self, report: DiagnosticReport):
        try:
            from core.agent.diagnostics.error_handler import _repair_logger, _snapshot_mgr

            stats = _repair_logger.get_stats()
            if stats.get("total", 0) > 0 and stats.get("success_rate", 1.0) < 0.5:
                p = Problem(
                    id="high_failure_rate",
                    category=ProblemCategory.SELF_HEALING,
                    severity=ProblemSeverity.ERROR,
                    title="操作失败率过高",
                    detail=f"成功率 {stats['success_rate']:.0%}",
                    suggestion="查看 show_health_report 分析高频故障",
                )
                report.problems.append(p)

            if not _snapshot_mgr.get_latest():
                p = self._build_problem("no_snapshots")
                report.problems.append(p)

        except Exception as e:
            logger.warning(f"操作失败: {e}")

        report.metrics["self_healing"] = {
            "has_snapshots": True,
            "circuit_breakers_open": 0,
        }

    def _build_problem(self, pattern_id: str, **kwargs) -> Problem:
        pattern = self.patterns.get(pattern_id, {})
        detail = pattern.get("detail_format", "")
        if detail and kwargs:
            try:
                detail = detail.format(**kwargs)
            except KeyError as e:
                logger.debug(f"操作失败: {e}")

        return Problem(
            id=f"{pattern_id}_{int(time.time() * 1000)}",
            category=pattern.get("category", ProblemCategory.DATA_INTEGRITY),
            severity=pattern.get("severity", ProblemSeverity.WARNING),
            title=pattern.get("title", pattern_id),
            detail=detail,
            suggestion=pattern.get("suggestion", ""),
            tool_call=pattern.get("tool_call"),
        )

    def get_last_report(self) -> Optional[DiagnosticReport]:
        return self._last_report


# ═══════════════════════════════════════════════════════════════════
# 便捷函数
# ═══════════════════════════════════════════════════════════════════

_registry: Optional[ProblemRegistry] = None


def get_registry() -> ProblemRegistry:
    global _registry
    if _registry is None:
        _registry = ProblemRegistry()
    return _registry


def diagnose(data_manager, *, fast: bool = False) -> DiagnosticReport:
    """快捷诊断 — 返回 DiagnosticReport"""
    return get_registry().diagnose(data_manager, fast=fast)


def fix(report: DiagnosticReport, data_manager, tool_executor=None) -> int:
    """快捷修复 — 返回成功数量"""
    return get_registry().fix(report, data_manager, tool_executor)


def quick_check(data_manager) -> tuple[bool, str]:
    """快速检查 — 返回 (是否健康, 摘要)"""
    report = diagnose(data_manager, fast=True)
    return report.is_healthy, report.format_for_ai()


# ═══════════════════════════════════════════════════════════════════
# 问题与修复方案速查表 (供 AI 助手 prompt 嵌入)
# ═══════════════════════════════════════════════════════════════════

PROBLEMS_AND_DIAGNOSTICS_PROMPT = """
## #problems_and_diagnostics — 问题与修复方案

当系统出现异常或用户报告问题时，按以下流程处理：

### 诊断流程
1. **收集症状** — 观察错误消息、用户描述、系统日志
2. **分类问题** — 确定属于以下哪个类别：
   - 数据完整性: 缺id/缺name/重复id/空数据集
   - 引用完整性: 孤立引用/死链接
   - Schema健康: 字段定义缺失/类型不匹配
   - 性能问题: 慢查询/大数据集
   - 自愈系统: 熔断器触发/高失败率/无快照
   - 配置问题: 自动保存关闭/Schema不完整
   - 逻辑规则: 数值异常/名称重复/必填缺失
3. **执行诊断** — 调用 `diagnose_problem` 工具获取详细报告
4. **制定方案** — 根据诊断报告选择修复策略
5. **执行修复** — 调用 `fix_data` 工具自动修复可修复项
6. **验证结果** — 再次调用 `diagnose_problem` 确认问题已解决

### 典型自愈流程
```
用户: "数据好像有问题"
AI:  调用 diagnose_problem → 发现 roles 缺id
AI:  调用 fix_data(repair_missing_ids) → 自动补全
AI:  [修复完成 + 修复后验证报告]
用户: "修好了!"
```

### 代码自愈流程 (全新!)
```
系统: 工具调用返回 traceback (ModuleNotFoundError/NameError/TypeError/...)
AI:  看到诊断报告中的 CODE_ERROR + 修复指南
AI:  调用 fix_code(traceback="...") → 解析出文件:行号 + 源码上下文 + 修复策略
AI:  调用 file_system.read 读取完整上下文
AI:  调用 file_system.edit_file 精确修改源码 (old_str → new_str)
AI:  调用 system.shell("python -c 'import 模块'") 验证修复
AI:  [修复完成]
```

### 前端代码自愈流程
```
用户: "页面报错了 Uncaught TypeError: Cannot read property..."
AI:  调用 fix_code(language="typescript", traceback="...")
AI:  → 定位 .tsx/.jsx 文件和行号
AI:  调用 file_system.edit_file 修改前端代码
AI:  调用 system.shell 运行类型检查验证
AI:  [前端修复完成]
```

### 可用工具速查
| 工具 | 用途 | 参数 |
|------|------|------|
| diagnose_problem | 全系统扫描 | {} |
| fix_data | 自动修复数据 | {action: repair_missing_ids/repair_duplicate_ids/repair_empty_names/clean_orphan_refs/all} |
| fix_code | 代码自愈分析 | {traceback: "...", language: "python"/"typescript"/"css", verify: true} |
| show_health_report | 自愈统计 | {} |
| rollback_data | 回滚到快照 | {} |
| search_items | 搜索数据 | {data_type, keyword} |
| get_data_summary | 数据概况 | {} |
| rule_validate | 规则验证 | {data_type(可选)} |
"""


# ═══════════════════════════════════════════════════════════════════
# 自检: 模块导入验证
# ═══════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    sys.stdout.reconfigure(encoding='utf-8')
    print("=== problems_and_diagnostics 自检 ===")
    reg = get_registry()
    print(f"  已注册模式: {len(reg.patterns)} 个")
    for pid, pat in reg.patterns.items():
        print(f"    {pid:<24} [{pat['category'].value}] {pat['severity'].value}")

    report = DiagnosticReport()
    report.problems.append(Problem(
        id="test_001", category=ProblemCategory.DATA_INTEGRITY,
        severity=ProblemSeverity.ERROR, title="测试问题",
        suggestion="测试修复", tool_call={"name": "fix_data", "params": {"action": "all"}}
    ))
    print(f"\n  报告格式测试: {report.fixable_count} 可修复项")
    formatted = report.format_for_ai()
    print(formatted)
    print("  模块自检通过")
