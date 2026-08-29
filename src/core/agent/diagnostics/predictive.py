"""#predictive — 预测性自愈 + 持续学习 + 健康评分

不等报错就先动手:
  - 监控警告日志 → 预测即将发生的错误
  - 分析历史错误模式 → 预测高频时段
  - 健康评分 0-100 → 低于阈值自动触发全面巡检

持续学习:
  - 修复记录持久化到 SQLite
  - 跨会话记住哪些策略成功率高
  - 自动为新的错误模式建立预测规则
"""
from __future__ import annotations

from common.logger import get_logger

logger = get_logger()

from collections import Counter
import threading
import time
from typing import Any, Optional


class WarningPattern:
    def __init__(self, keyword: str, risk_level: str, description: str,
                 steps_to_explosion: int = 3, fix_hint: str = ""):
        self.keyword = keyword
        self.risk_level = risk_level
        self.description = description
        self.steps_to_explosion = steps_to_explosion
        self.fix_hint = fix_hint
        self.count = 0


class PredictiveHealer:
    """不等报错就动手 — 从警告中预测即将发生的错误"""

    WARNING_PATTERNS = [
        WarningPattern("deprecated", "medium",
                       "使用了已弃用的 API，先别等报错，现在就升级",
                       3, "替换为新 API"),
        WarningPattern("deprecation", "medium",
                       "同上: 已弃用 API",
                       3, "替换为新 API"),
        WarningPattern("will be removed", "high",
                       "某个功能即将被移除",
                       1, "立即切换到替代方案"),
        WarningPattern("memory", "high",
                       "内存使用过高警告",
                       2, "检查内存泄漏，释放大对象"),
        WarningPattern("slow query", "medium",
                       "查询性能下降",
                       5, "添加索引或优化查询计划"),
        WarningPattern("retry", "low",
                       "操作重试中",
                       10, "观察，可能是暂时性网络问题"),
        WarningPattern("connection pool", "medium",
                       "连接池接近耗尽",
                       3, "增加连接池大小或检查连接泄漏"),
        WarningPattern("disk usage", "high",
                       "磁盘使用率接近上限",
                       1, "清理日志和临时文件"),
        WarningPattern("timeout", "medium",
                       "操作超时频率增加",
                       5, "增加超时或优化操作"),
        WarningPattern("circuit breaker", "high",
                       "熔断器被触发",
                       3, "熔断后的操作需要降级处理"),
    ]

    def __init__(self):
        self._warnings: dict[str, WarningPattern] = {}
        self._history: list[dict] = []
        self._prediction_log: list[dict] = []

    def feed_warning(self, message: str) -> Optional[WarningPattern]:
        for pattern in self.WARNING_PATTERNS:
            if pattern.keyword in message.lower():
                key = pattern.keyword
                if key not in self._warnings:
                    self._warnings[key] = WarningPattern(
                        pattern.keyword, pattern.risk_level,
                        pattern.description, pattern.steps_to_explosion,
                        pattern.fix_hint
                    )
                self._warnings[key].count += 1
                return self._warnings[key]
        return None

    def predict_imminent_errors(self) -> list[dict[str, Any]]:
        predictions = []
        for key, wp in self._warnings.items():
            if wp.count >= wp.steps_to_explosion:
                predictions.append({
                    "keyword": key,
                    "risk": wp.risk_level,
                    "description": wp.description,
                    "count": wp.count,
                    "threshold": wp.steps_to_explosion,
                    "fix": wp.fix_hint,
                    "prediction": f"警告 '{key}' 已出现 {wp.count} 次，可能在 {max(1, wp.steps_to_explosion * 2 - wp.count)} 次操作后崩溃",
                })
        return predictions

    def analyze_error_trend(self, error_logs: list[dict]) -> dict[str, Any]:
        if not error_logs:
            return {"trend": "stable", "prediction": "无历史数据"}

        by_hour = Counter()
        by_type = Counter()
        recent = []

        for entry in error_logs[-50:]:
            ts = entry.get("timestamp", 0)
            hour = int((ts % 86400) / 3600)
            by_hour[hour] += 1
            etype = entry.get("error_type", "unknown")
            by_type[etype] += 1
            recent.append(entry)

        top_hours = by_hour.most_common(3)
        top_types = by_type.most_common(3)

        recent_failures = sum(1 for e in recent[-10:] if not e.get("success", False))
        trend = "improving" if recent_failures <= 2 else "stable" if recent_failures <= 5 else "worsening"

        return {
            "trend": trend,
            "total_errors_50": len(recent),
            "recent_failures": recent_failures,
            "peak_hours": top_hours,
            "top_error_types": top_types,
            "prediction": (
                "预计持续稳定" if trend == "improving"
                else "需关注" if trend == "worsening"
                else "保持观察"
            ),
        }

    def get_prediction_report(self) -> str:
        lines = ["=" * 60, "   预测性自愈报告", "=" * 60]

        predictions = self.predict_imminent_errors()
        if predictions:
            lines.append(f"\n  [WARN] 检测到 {len(predictions)} 个潜在风险:")
            for p in predictions:
                icon = "[ERR]" if p["risk"] == "high" else "~" if p["risk"] == "medium" else "OK"
                lines.append(f"  {icon} {p['keyword']}: {p['description']}")
                lines.append(f"      已出现 {p['count']} 次，阈值 {p['threshold']} 次")
                lines.append(f"       {p['fix']}")
        else:
            lines.append("\n  [OK] 未检测到即将发生的风险")

        lines.append(f"\n  {'═' * 58}")
        return "\n".join(lines)

    def reset(self):
        self._warnings.clear()
        self._history.clear()
        self._prediction_log.clear()


class LearningDB:
    """持续学习数据库 — SQLite 持久化修复记录，跨会话学习"""

    def __init__(self, db_path: str = "repair_learning.db"):
        self._db_path = db_path
        self._conn = None
        # 修复 P2-30: sqlite3 默认 check_same_thread=True，跨线程访问必崩
        # 改为 False + 全方法加锁，保证 worker 线程能安全调用
        self._lock = threading.Lock()
        self._init_db()

    def _init_db(self):
        try:
            import sqlite3
            self._conn = sqlite3.connect(self._db_path, check_same_thread=False)
            self._conn.execute("""
                CREATE TABLE IF NOT EXISTS repairs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp REAL,
                    error_type TEXT,
                    error_message TEXT,
                    strategy TEXT,
                    success INTEGER,
                    duration_ms REAL,
                    fingerprint TEXT,
                    confidence REAL
                )
            """)
            self._conn.execute("""
                CREATE TABLE IF NOT EXISTS fix_market (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    error_pattern TEXT UNIQUE,
                    fix_strategy TEXT,
                    success_count INTEGER DEFAULT 0,
                    fail_count INTEGER DEFAULT 0,
                    last_used REAL,
                    confidence REAL DEFAULT 0.5
                )
            """)
            self._conn.execute("""
                CREATE TABLE IF NOT EXISTS health_history (
                    timestamp REAL,
                    score REAL,
                    details TEXT
                )
            """)
            self._conn.commit()
        except Exception:
            self._conn = None

    def record_repair(self, repair: dict[str, Any]):
        if not self._conn:
            return
        with self._lock:
            try:
                self._conn.execute(
                    "INSERT INTO repairs (timestamp, error_type, error_message, strategy, success, duration_ms, fingerprint, confidence) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (repair.get("timestamp", time.time()),
                     repair.get("error_type", ""),
                     repair.get("error_message", "")[:500],
                     repair.get("strategy", ""),
                     1 if repair.get("success") else 0,
                     repair.get("duration_ms", 0),
                     repair.get("fingerprint", ""),
                     repair.get("confidence", 0.5))
                )
                self._conn.commit()
            except Exception as e:
                logger.warning(f"操作失败: {e}")

    def upsert_market_entry(self, error_pattern: str, fix_strategy: str, success: bool):
        if not self._conn:
            return
        with self._lock:
            try:
                row = self._conn.execute(
                    "SELECT id, success_count, fail_count FROM fix_market WHERE error_pattern = ?",
                    (error_pattern[:200],)
                ).fetchone()
                if row:
                    if success:
                        self._conn.execute(
                            "UPDATE fix_market SET success_count = success_count + 1, last_used = ?, "
                            "confidence = (success_count * 1.0) / (success_count + fail_count + 1) WHERE error_pattern = ?",
                            (time.time(), error_pattern[:200])
                        )
                    else:
                        self._conn.execute(
                            "UPDATE fix_market SET fail_count = fail_count + 1, last_used = ?, "
                            "confidence = (success_count * 1.0) / (success_count + fail_count + 1) WHERE error_pattern = ?",
                            (time.time(), error_pattern[:200])
                        )
                else:
                    self._conn.execute(
                        "INSERT INTO fix_market (error_pattern, fix_strategy, success_count, fail_count, last_used, confidence) "
                        "VALUES (?, ?, ?, ?, ?, ?)",
                        (error_pattern[:200], fix_strategy[:500], 1 if success else 0,
                         0 if success else 1, time.time(), 0.8 if success else 0.3)
                    )
                self._conn.commit()
            except Exception as e:
                logger.warning(f"操作失败: {e}")

    def query_market(self, error_pattern: str) -> Optional[dict]:
        if not self._conn:
            return None
        with self._lock:
            try:
                row = self._conn.execute(
                    "SELECT fix_strategy, success_count, fail_count, confidence FROM fix_market "
                    "WHERE error_pattern LIKE ? ORDER BY confidence DESC LIMIT 1",
                    (f"%{error_pattern[:100]}%",)
                ).fetchone()
                if row:
                    return {
                        "strategy": row[0], "success_count": row[1],
                        "fail_count": row[2], "confidence": row[3]
                    }
            except Exception as e:
                logger.warning(f"操作失败: {e}")
        return None

    def record_health(self, score: float, details: str = ""):
        if not self._conn:
            return
        with self._lock:
            try:
                self._conn.execute(
                    "INSERT INTO health_history (timestamp, score, details) VALUES (?, ?, ?)",
                    (time.time(), score, details[:2000])
                )
                self._conn.commit()
            except Exception as e:
                logger.warning(f"操作失败: {e}")

    def get_top_strategies(self, limit: int = 10) -> list[dict]:
        if not self._conn:
            return []
        with self._lock:
            try:
                rows = self._conn.execute(
                    "SELECT error_pattern, fix_strategy, success_count, fail_count, confidence "
                    "FROM fix_market ORDER BY confidence DESC LIMIT ?",
                    (limit,)
                ).fetchall()
                return [
                    {"pattern": r[0], "strategy": r[1], "success": r[2],
                     "fail": r[3], "confidence": r[4]}
                    for r in rows
                ]
            except Exception:
                return []


class HealthScorer:
    """系统健康评分 — 0(濒死) 到 100(完美)"""

    def __init__(self):
        self._baseline = 100.0
        self._last_scores: list[float] = []

    def compute(self, data: dict) -> dict:
        score = 100.0
        deductions = []

        error_rate = data.get("error_rate_1h", 0)
        if error_rate > 20:
            score -= 30
            deductions.append(f"最近1小时错误率 {error_rate}%: -30")
        elif error_rate > 10:
            score -= 15
            deductions.append(f"最近1小时错误率 {error_rate}%: -15")
        elif error_rate > 5:
            score -= 5
            deductions.append(f"最近1小时错误率 {error_rate}%: -5")

        avg_fix_duration = data.get("avg_fix_duration_ms", 100)
        if avg_fix_duration > 5000:
            score -= 20
            deductions.append(f"平均修复耗时 {avg_fix_duration:.0f}ms: -20")
        elif avg_fix_duration > 2000:
            score -= 10
            deductions.append(f"平均修复耗时 {avg_fix_duration:.0f}ms: -10")

        circuit_trips = data.get("circuit_trips_24h", 0)
        if circuit_trips >= 5:
            score -= 25
            deductions.append(f"24h 熔断 {circuit_trips} 次: -25")
        elif circuit_trips >= 3:
            score -= 15
            deductions.append(f"24h 熔断 {circuit_trips} 次: -15")

        undo_count = data.get("undo_count_24h", 0)
        if undo_count > 10:
            score -= 20
            deductions.append(f"24h 撤销 {undo_count} 次: -20")
        elif undo_count > 5:
            score -= 10
            deductions.append(f"24h 撤销 {undo_count} 次: -10")

        score = max(0, score)
        self._last_scores.append(score)
        if len(self._last_scores) > 20:
            self._last_scores.pop(0)

        grade = ("S: 完美" if score >= 95 else "A: 优秀" if score >= 85
                 else "B: 良好" if score >= 70 else "C: 需关注" if score >= 50
                 else "D: 警告" if score >= 30 else "F: 严重")

        return {
            "score": score,
            "grade": grade,
            "deductions": deductions,
            "trend": self._compute_trend(),
            "recommendation": self._recommend(score),
        }

    def _compute_trend(self) -> str:
        if len(self._last_scores) < 2:
            return "insufficient_data"
        recent = self._last_scores[-5:]
        if len(recent) >= 2 and recent[-1] > recent[0] + 3:
            return "improving"
        if len(recent) >= 2 and recent[-1] < recent[0] - 3:
            return "declining"
        return "stable"

    def _recommend(self, score: float) -> str:
        if score >= 85:
            return "系统运行良好，保持现状"
        if score >= 70:
            return "建议运行一次全面诊断: diagnose_problem()"
        if score >= 50:
            return "建议运行一键修复: one_click_fix()"
        if score >= 30:
            return "[WARN] 需要深度修复: deep_fix() + root_cause_analyze()"
        return "[ALERT] 系统处于严重状态，建议运行完整自愈流程后重启"


_predictive_healer = PredictiveHealer()
_learning_db = LearningDB()
_health_scorer = HealthScorer()
