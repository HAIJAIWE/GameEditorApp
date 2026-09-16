"""短期/长期/偏好/学习与反馈的读写与持久化 —— Memory 的 MemoryStoreMixin 部分

自 memory.py 拆出，方法体逐行原样搬运（逻辑未改动）。
"""
from __future__ import annotations

import hashlib
import json
import threading
from typing import Any, Optional

from common.logger import get_logger
from core.agent.memory_state import MemoryState
from core.agent.models import FeedbackRecord, MemoryEntry

logger = get_logger()


class MemoryStoreMixin(MemoryState):
    """短期/长期/偏好/学习与反馈的读写与持久化"""

    def _debounce(self, key: str, fn, wait_ms: float = 2000):
        with self._debounce_lock:
            existing = self._debounce_timers.get(key)
            if existing and existing.is_alive():
                existing.cancel()
            timer = threading.Timer(wait_ms / 1000.0, fn)
            timer.daemon = True
            self._debounce_timers[key] = timer
            timer.start()
    def save_short_term(self, key: str, value: Any, confidence: float = 1.0):
        now = MemoryEntry.now_timestamp()
        entry = MemoryEntry(
            key=key,
            value=value,
            source="session",
            confidence=confidence,
            last_accessed=now,
            access_count=1,
        )
        self._short_term[key] = entry
        self._short_term.move_to_end(key)
        # 修复 P2-24: 写入时同步更新向量索引（避免 build_vector_index 滞后）
        self._sync_index_entry(key, entry)

        while len(self._short_term) > self.MAX_SHORT_TERM:
            evicted_key, _ = self._short_term.popitem(last=False)
            # 修复 P2-24: 清理被淘汰条目的孤儿索引文件
            self._remove_index_entry(evicted_key)
    def get_short_term(self, key: str) -> Optional[Any]:
        entry = self._short_term.get(key)
        if entry:
            entry.last_accessed = MemoryEntry.now_timestamp()
            entry.access_count += 1
            return entry.value
        return None
    def save_long_term(self, key: str, value: Any, confidence: float = 1.0, source: str = "learned"):
        # Agent OS 隐私设计: 敏感信息摘要化
        if isinstance(value, str):
            from security.privacy import summarize_sensitive
            value = summarize_sensitive(value)
        now = MemoryEntry.now_timestamp()
        entry = MemoryEntry(
            key=key,
            value=value,
            source=source,
            confidence=confidence,
            last_accessed=now,
            access_count=0,
        )
        self._long_term[key] = entry
        self._debounce("long_term", self._persist_long_term, 2000)
        text = str(value)[:1000]
        self._semantic_index(f"long:{key}", text, "long_term")
        # 修复 P2-24: 同步更新向量索引文件
        self._sync_index_entry(key, entry)
    def remove_long_term(self, key: str) -> bool:
        """删除长期记忆条目 + 同步清理索引文件（修复 P2-24 孤儿文件）"""
        if key in self._long_term:
            del self._long_term[key]
            self._remove_index_entry(key)
            self._debounce("long_term", self._persist_long_term, 2000)
            return True
        return False
    def get_long_term(self, key: str) -> Optional[Any]:
        entry = self._long_term.get(key)
        if entry:
            entry.last_accessed = MemoryEntry.now_timestamp()
            entry.access_count += 1
            return entry.value
        return None
    def set_preference(self, key: str, value: Any):
        self._preferences[key] = value
        self._debounce("preferences", self._persist_preferences, 2000)
    def get_preference(self, key: str, default: Any = None) -> Any:
        return self._preferences.get(key, default)
    def get_session_context(self) -> dict:
        ctx = {k: v.value for k, v in self._short_term.items() if isinstance(v, MemoryEntry)}
        ctx["preferences"] = dict(self._preferences)
        return ctx
    def clear_session(self):
        # 修复 P2-24: clear_session 时同步清理短期记忆的索引文件
        for key in list(self._short_term.keys()):
            self._remove_index_entry(key)
        self._short_term.clear()
        self._session_context.clear()
    def log_behavior(self, action: str, detail: dict):
        log_file = self._data_dir / "behavior_log.jsonl"
        entry = {
            "timestamp": MemoryEntry.now_timestamp(),
            "action": action,
            "detail": detail,
        }
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    def save_feedback(self, feedback: FeedbackRecord):
        fb_file = self._data_dir / "feedback.jsonl"
        entry = {
            "plan_id": feedback.plan_id,
            "rating": feedback.rating,
            "comment": feedback.comment,
            "timestamp": feedback.timestamp or MemoryEntry.now_timestamp(),
        }
        with open(fb_file, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    def save_learning(self, category: str, content: str):
        """Agent OS 反思循环：保存学习经验到 LEARNINGS.jsonl"""
        lf = self._data_dir / "LEARNINGS.jsonl"
        entry = {
            "category": category,
            "content": content,
            "timestamp": MemoryEntry.now_timestamp(),
        }
        with open(lf, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        self._semantic_index(f"learn:{category}:{hashlib.md5(content.encode(), usedforsecurity=False).hexdigest()[:8]}",
                             f"[{category}] {content[:500]}", "learning")
    def get_recent_learnings(self, limit: int = 5) -> list:
        """获取最近的学习经验"""
        lf = self._data_dir / "LEARNINGS.jsonl"
        if not lf.exists():
            return []
        with open(lf, encoding="utf-8") as f:
            lines = f.readlines()
        entries = []
        for line in lines[-limit:]:
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError:
                self._logger.debug("[Memory] 学习记录JSON解析异常，跳过")
        return entries
    def _load_long_term(self):
        path = self._data_dir / "user_profile.json"
        if not path.exists():
            return
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            for key, value in data.items():
                self._long_term[key] = MemoryEntry(
                    key=key,
                    value=value.get("value"),
                    source=value.get("source", "loaded"),
                    confidence=value.get("confidence", 1.0),
                    last_accessed=value.get("last_accessed", 0),
                    access_count=value.get("access_count", 0),
                )
        except Exception as e:
            self._logger.warning(f"Failed to load long-term memory: {e}")
    def _persist_long_term(self):
        path = self._data_dir / "user_profile.json"
        data = {}
        for key, entry in self._long_term.items():
            data[key] = {
                "value": entry.value,
                "source": entry.source,
                "confidence": entry.confidence,
                "last_accessed": entry.last_accessed,
                "access_count": entry.access_count,
            }
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    def _load_preferences(self):
        path = self._data_dir / "preferences.json"
        if not path.exists():
            return
        try:
            with open(path, encoding="utf-8") as f:
                self._preferences = json.load(f)
        except Exception as e:
            self._logger.warning(f"Failed to load preferences: {e}")
    def _persist_preferences(self):
        path = self._data_dir / "preferences.json"
        with open(path, "w", encoding="utf-8") as f:
            json.dump(self._preferences, f, ensure_ascii=False, indent=2)
