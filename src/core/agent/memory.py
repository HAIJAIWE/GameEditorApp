"""记忆系统 —— 短期/长期记忆、偏好、对话历史与语义检索

Memory 的方法按职责拆分到 memory_store / _history / _context / _search / _vector
五个 mixin（共享状态见 memory_state.py）；VectorEmbedder 与 MemoryIndex 独立成模块，
并在本模块保留同名再导出，既有导入路径不变。
"""
from __future__ import annotations

from collections import OrderedDict
from pathlib import Path
import threading
from typing import Any

from common.logger import get_logger
from core.agent.memory_context import MemoryContextMixin
from core.agent.memory_embedder import VectorEmbedder, get_embedder
from core.agent.memory_history import MemoryHistoryMixin
from core.agent.memory_index import MemoryIndex
from core.agent.memory_search import MemorySearchMixin
from core.agent.memory_store import MemoryStoreMixin
from core.agent.memory_vector import MemoryVectorMixin
from core.agent.models import MemoryEntry

logger = get_logger()

__all__ = ["Memory", "MemoryIndex", "VectorEmbedder", "get_embedder"]


class Memory(
    MemoryStoreMixin,
    MemoryHistoryMixin,
    MemoryContextMixin,
    MemorySearchMixin,
    MemoryVectorMixin,
):
    """记忆系统 — 短期/长期记忆、偏好、对话历史与语义检索"""

    MAX_SHORT_TERM = 200
    MAX_CONVERSATIONS = 500

    def __init__(self, data_dir: str = "", scope: str = ""):
        self._logger = get_logger()
        self._scope = scope

        if data_dir:
            base_dir = Path(data_dir)
        else:
            try:
                from core.agent.workspace import get_workspace as _gw
                base_dir = _gw().memory_dir
            except Exception:
                base_dir = Path("data/memory")

        if scope:
            self._data_dir = base_dir / "agent_memory" / scope.replace("agent:", "").replace(":", "_")
        else:
            self._data_dir = base_dir
        self._data_dir.mkdir(parents=True, exist_ok=True)

        self._vector_index_dir = self._data_dir / "vector_index"
        self._vector_index_dir.mkdir(parents=True, exist_ok=True)

        self._short_term: OrderedDict = OrderedDict()
        self._long_term: dict[str, MemoryEntry] = {}
        self._session_context: dict[str, Any] = {}
        self._preferences: dict[str, Any] = {}
        self._debounce_timers: dict[str, threading.Timer] = {}
        self._debounce_lock = threading.Lock()

        self._load_long_term()
        self._load_preferences()
        self._semantic = SemanticMemory(self._data_dir)
    _CN_STOP_WORDS = {
        "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一",
        "一个", "上", "也", "很", "到", "说", "要", "去", "你", "会", "着",
        "没有", "看", "好", "自己", "这", "他", "她", "它", "们", "那", "什",
        "么", "怎么", "如何", "可以", "这个", "那个", "哪个", "什么", "因为",
    }

from core.agent.semantic_memory import SemanticMemory  # noqa: E402  # 延迟导入：避免与 semantic_memory 循环导入
