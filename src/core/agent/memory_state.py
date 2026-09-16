"""Memory 各 mixin 的公共基类（声明共享属性、类常量与跨 mixin 方法签名）

Memory 的方法拆分到 memory_store / _history / _context / _search / _vector 五个 mixin；
mixin 通过本类声明的属性与签名访问实例状态与既有方法，实现仍由各 mixin / 主类提供
（MRO 下真实实现优先）。本类不承载运行时代码。
"""
from __future__ import annotations

from collections import OrderedDict
from pathlib import Path
from typing import Any, Optional

from core.agent.models import FeedbackRecord, MemoryEntry


class MemoryState:
    """Memory 与各 mixin 的公共基类（仅声明属性与签名）"""

    # ── 类常量（真实值定义在 Memory 上）──
    MAX_SHORT_TERM: int
    MAX_CONVERSATIONS: int
    _CN_STOP_WORDS: set

    # ── 实例状态 ──
    _logger: Any
    _scope: str
    _data_dir: Any
    _vector_index_dir: Any
    _short_term: OrderedDict
    _long_term: dict[str, MemoryEntry]
    _session_context: dict[str, Any]
    _preferences: dict[str, Any]
    _debounce_timers: dict
    _debounce_lock: Any
    _semantic: Any

    # ─ 跨 mixin 方法签名声明（实现见对应 mixin）──
    # STUBS
    def _semantic_index(self, key: str, text: str, source: str = "memory"):
        raise NotImplementedError
    def semantic_search(self, query: str, top_k: int = 5) -> list[dict]:
        raise NotImplementedError
    def semantic_dedup(self, text: str, threshold: float = 0.92) -> bool:
        raise NotImplementedError
    def semantic_warmup(self, keywords: list, max_chunks: int = 5) -> str:
        raise NotImplementedError
    def semantic_count(self) -> int:
        raise NotImplementedError
    def _debounce(self, key: str, fn, wait_ms: float = 2000):
        raise NotImplementedError
    def save_short_term(self, key: str, value: Any, confidence: float = 1.0):
        raise NotImplementedError
    def get_short_term(self, key: str) -> Optional[Any]:
        raise NotImplementedError
    def save_long_term(self, key: str, value: Any, confidence: float = 1.0, source: str = "learned"):
        raise NotImplementedError
    def remove_long_term(self, key: str) -> bool:
        raise NotImplementedError
    def get_long_term(self, key: str) -> Optional[Any]:
        raise NotImplementedError
    def set_preference(self, key: str, value: Any):
        raise NotImplementedError
    def get_preference(self, key: str, default: Any = None) -> Any:
        raise NotImplementedError
    def get_session_context(self) -> dict:
        raise NotImplementedError
    def clear_session(self):
        raise NotImplementedError
    def log_behavior(self, action: str, detail: dict):
        raise NotImplementedError
    def save_feedback(self, feedback: FeedbackRecord):
        raise NotImplementedError
    def save_learning(self, category: str, content: str):
        raise NotImplementedError
    def get_recent_learnings(self, limit: int = 5) -> list:
        raise NotImplementedError
    def _load_long_term(self):
        raise NotImplementedError
    def _persist_long_term(self):
        raise NotImplementedError
    def _load_preferences(self):
        raise NotImplementedError
    def _persist_preferences(self):
        raise NotImplementedError
    def save_conversation(self, user_msg: str, assistant_msg: str):
        raise NotImplementedError
    def load_recent_conversations(self, n: int = 5) -> list:
        raise NotImplementedError
    def get_task_history(self, n: int = 30) -> list:
        raise NotImplementedError
    def consolidate(self, min_confidence: float = 0.5):
        raise NotImplementedError
    def learn_preferences(self):
        raise NotImplementedError
    def _optimal_history_window(self) -> int:
        raise NotImplementedError
    def _count_conversation_entries(self) -> int:
        raise NotImplementedError
    def format_history_for_llm(self, n: int = None) -> str:
        raise NotImplementedError
    def save_project_memory(self, project_context: dict = None):
        raise NotImplementedError
    def get_memory_context(self) -> str:
        raise NotImplementedError
    @classmethod
    def get_combined_context(cls, global_memory, agent_scope: str) -> str:
        raise NotImplementedError
    def inject_memory_context(self, messages: list) -> list:
        raise NotImplementedError
    def _tokenize(self, text: str) -> list:
        raise NotImplementedError
    def build_keyword_index(self) -> dict:
        raise NotImplementedError
    def keyword_search(self, query: str, max_results: int = 5) -> list:
        raise NotImplementedError
    def get_semantic_groups(self) -> dict:
        raise NotImplementedError
    def get_memory_stats(self) -> dict:
        raise NotImplementedError
    def summarize_conversation(self, config: Optional[object] = None, keep_recent: int = 3) -> str:
        raise NotImplementedError
    def _get_index_path(self, key: str) -> Path:
        raise NotImplementedError
    def build_vector_index(self):
        raise NotImplementedError
    def _save_index_entry(self, key: str, vector: list[float], text: str, timestamp: str):
        raise NotImplementedError
    def _sync_index_entry(self, key: str, entry) -> None:
        raise NotImplementedError
    def _remove_index_entry(self, key: str) -> None:
        raise NotImplementedError
    def _load_index_entry(self, key: str) -> Optional[dict[str, Any]]:
        raise NotImplementedError
    def reindex(self):
        raise NotImplementedError
    def semantic_search_short(self, query: str, top_k: int = 5) -> list[dict[str, Any]]:
        raise NotImplementedError
    def _semantic_search(self, query: str, store, top_k: int = 5) -> list[dict[str, Any]]:
        raise NotImplementedError
    def capture_context(self):
        raise NotImplementedError
    def search_conversations(self, keyword: str, n: int = 20) -> list[dict]:
        raise NotImplementedError
    def auto_archive(self):
        raise NotImplementedError
    def semantic_search_long(self, query: str, top_k: int = 5) -> list[dict[str, Any]]:
        raise NotImplementedError
