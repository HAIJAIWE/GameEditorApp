"""对话历史、整合与偏好学习 —— Memory 的 MemoryHistoryMixin 部分

自 memory.py 拆出，方法体逐行原样搬运（逻辑未改动）。
"""
from __future__ import annotations

import json
import time
from typing import Any

from common.logger import get_logger
from core.agent.memory_state import MemoryState
from core.agent.models import MemoryEntry

logger = get_logger()


class MemoryHistoryMixin(MemoryState):
    """对话历史、整合与偏好学习"""

    def save_conversation(self, user_msg: str, assistant_msg: str):
        """保存一轮对话到持久化日志"""
        log_file = self._data_dir / "conversation_log.jsonl"
        entry = {
            "timestamp": time.time(),
            "user": user_msg[:500],
            "assistant": assistant_msg[:500],
        }
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    def load_recent_conversations(self, n: int = 5) -> list:
        """加载最近 N 轮对话历史（尾部读取，O(1)内存）"""
        log_file = self._data_dir / "conversation_log.jsonl"
        if not log_file.exists():
            return []
        from collections import deque
        entries: deque[Any] = deque(maxlen=n)
        try:
            with open(log_file, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        entries.append(json.loads(line))
        except Exception as e:
            self._logger.warning(f"加载对话历史失败: {e}")
            return []
        return list(entries)
    def get_task_history(self, n: int = 30) -> list:
        """从行为日志中获取最近 N 条任务/操作记录"""
        log_file = self._data_dir / "behavior_log.jsonl"
        if not log_file.exists():
            return []
        entries = []
        try:
            with open(log_file, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        entry = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    entries.append({
                        "time": entry.get("timestamp", 0),
                        "action": entry.get("action", ""),
                        "params": entry.get("params", {}),
                        "success": entry.get("success", True),
                        "message": str(entry.get("raw_msg", ""))[:100],
                    })
        except Exception as e:
            self._logger.warning(f"加载任务历史失败: {e}")
            return []

        entries.sort(key=lambda x: x.get("time", 0))
        return entries[-n:]  # 最近 N 条
    def consolidate(self, min_confidence: float = 0.5):
        """Session 结束：从短期记忆中提炼有价值条目写入长期存储"""
        consolidated = 0
        for key, entry in list(self._short_term.items()):
            if not isinstance(entry, MemoryEntry):
                continue
            if entry.access_count >= 2 and entry.confidence >= min_confidence:
                existing = self._long_term.get(key)
                if existing:
                    existing.value = entry.value
                    existing.confidence = max(existing.confidence, entry.confidence)
                    existing.access_count += entry.access_count
                    existing.source = "consolidated"
                else:
                    self._long_term[key] = MemoryEntry(
                        key=key,
                        value=entry.value,
                        source="consolidated",
                        confidence=entry.confidence,
                        last_accessed=entry.last_accessed,
                        access_count=entry.access_count,
                    )
                consolidated += 1
        if consolidated > 0:
            self._logger.info(f"Memory 提炼完成: {consolidated} 条写入长期记忆")
            self._debounce("long_term", self._persist_long_term, 500)
        self.build_vector_index()
    def learn_preferences(self):
        """从最近对话中提取用户偏好信号"""
        recent = self.load_recent_conversations(10)
        if not recent:
            return

        signals = {
            "brief": 0,
            "detail": 0,
            "planning": 0,
            "coding": 0,
            "data_query": 0,
            "game_design": 0,
            "fix_bugs": 0,
        }

        for entry in recent:
            user = entry.get("user", "")
            assistant = entry.get("assistant", "")

            if len(assistant) < 80:
                signals["brief"] += 1
            elif len(assistant) > 400:
                signals["detail"] += 1

            ua = user + " " + assistant
            for kw in ["策划", "方案", "设计", "策划案"]:
                if kw in ua:
                    signals["planning"] += 1
                    break
            for kw in ["代码", "编程", "code", "修复", "bug", "错误"]:
                if kw in ua:
                    signals["coding"] += 1
                    break
            for kw in ["查询", "数据", "角色", "属性", "导出"]:
                if kw in ua:
                    signals["data_query"] += 1
                    break
            for kw in ["游戏", "平衡", "关卡", "玩法", "技能", "数值"]:
                if kw in ua:
                    signals["game_design"] += 1
                    break

        total = sum(signals.values()) or 1

        for key, count in signals.items():
            ratio = count / total
            if ratio >= 0.2:
                self.set_preference(f"interest_{key}", round(ratio, 2))

        for entry in recent:
            user = entry.get("user", "")
            if "简洁" in user or "简短" in user or "一句话" in user:
                self.set_preference("style", "brief")
                break
            if "详细" in user or "展开" in user or "完整" in user:
                self.set_preference("style", "detailed")
                break

        total_conv = len(recent)
        if signals["brief"] >= total_conv * 0.6:
            self.set_preference("style", "brief")
        elif signals["detail"] >= total_conv * 0.6:
            self.set_preference("style", "detailed")
    def _optimal_history_window(self) -> int:
        """根据总对话轮次动态计算最优历史窗口大小"""
        total = self._count_conversation_entries()
        if total <= 5:
            return max(total, 1)
        if total <= 15:
            return 8
        if total <= 30:
            return 12
        return 16
    def _count_conversation_entries(self) -> int:
        """统计对话日志的总轮次数"""
        log_file = self._data_dir / "conversation_log.jsonl"
        if not log_file.exists():
            return 0
        count = 0
        try:
            with open(log_file, encoding="utf-8") as f:
                for line in f:
                    if line.strip():
                        count += 1
        except Exception as e:
            logger.warning(f"操作失败: {e}")
        return count
    def format_history_for_llm(self, n: int = None) -> str:
        """将对话历史格式化为 LLM 可读的上下文字符串

        如果 n 未指定，根据总对话长度动态调整窗口：
        - 短对话 (≤5轮): 全量保留
        - 中对话 (6~15轮): 保留 8 条
        - 长对话 (16~30轮): 保留 12 条
        - 超长对话 (>30轮): 保留 16 条
        """
        if n is None:
            n = self._optimal_history_window()
        history = self.load_recent_conversations(n)
        if not history:
            return ""
        lines = ["=== 最近的对话历史 ==="]
        for entry in history:
            lines.append(f"用户: {entry['user'][:100]}")
            lines.append(f"助手: {entry['assistant'][:100]}")
            lines.append("")
        return "\n".join(lines)
