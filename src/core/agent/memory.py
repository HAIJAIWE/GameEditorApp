from __future__ import annotations

from collections import OrderedDict
from datetime import datetime
import hashlib
import json
import math
import os
from pathlib import Path
import threading
import time
from typing import Any, Optional

from common.logger import get_logger
from core.agent.models import FeedbackRecord, MemoryEntry

logger = get_logger()


class VectorEmbedder:
    """增强型向量嵌入器 — 字符级ngram + 词级ngram + TF-IDF加权

    相比纯哈希ngram方案，改进点：
    1. 字符级3-gram捕获中文子词语义（如"火球术"→"火球","球术"）
    2. 词级ngram保留词序信息
    3. TF-IDF加权：稀有词获得更高权重，提升区分度
    4. 维度从128提升到256，减少哈希碰撞
    """
    VECTOR_DIM = 256
    WORD_NGRAM_SIZES = (1, 2, 3)
    CHAR_NGRAM_SIZE = 3
    HASH_FUNCS = 3

    def __init__(self):
        self._cache: dict[str, list[float]] = {}
        # 文档频率统计（用于IDF加权）
        self._doc_freq: dict[str, int] = {}
        self._doc_count: int = 0

    def _update_idf(self, tokens: set):
        """更新文档频率统计"""
        self._doc_count += 1
        for token in tokens:
            self._doc_freq[token] = self._doc_freq.get(token, 0) + 1

    def _idf_weight(self, token: str) -> float:
        """计算IDF权重"""
        if self._doc_count == 0 or token not in self._doc_freq:
            return 1.0
        df = self._doc_freq[token]
        # 平滑IDF，避免除零和极端值
        return 1.0 + math.log((self._doc_count + 1) / (df + 1))

    def embed(self, text: str) -> list[float]:
        if not text:
            return [0.0] * self.VECTOR_DIM

        cache_key = hashlib.md5(text.encode(), usedforsecurity=False).hexdigest()
        if cache_key in self._cache:
            return self._cache[cache_key]

        vec = [0.0] * self.VECTOR_DIM
        text_lower = text.lower()

        # 1. 词级ngram（保留词序）
        word_tokens = text_lower.split()
        unique_tokens = set(word_tokens)
        self._update_idf(unique_tokens)

        for n in self.WORD_NGRAM_SIZES:
            for i in range(len(word_tokens) - n + 1):
                ngram = " ".join(word_tokens[i:i+n])
                # IDF加权：稀有词组合获得更高权重
                weight = 1.0 / n
                if n == 1:
                    weight *= self._idf_weight(ngram)
                for h in range(self.HASH_FUNCS):
                    idx = self._hash_to_dim(f"w:{ngram}", h)
                    vec[idx] += weight

        # 2. 字符级ngram（捕获中文子词语义）
        for i in range(len(text_lower) - self.CHAR_NGRAM_SIZE + 1):
            char_ngram = text_lower[i:i + self.CHAR_NGRAM_SIZE]
            for h in range(self.HASH_FUNCS):
                idx = self._hash_to_dim(f"c:{char_ngram}", h)
                vec[idx] += 0.3  # 字符级权重较低，作为补充信号

        # 3. L2归一化
        norm = math.sqrt(sum(v * v for v in vec))
        if norm > 0:
            vec = [v / norm for v in vec]

        self._cache[cache_key] = vec
        if len(self._cache) > 5000:
            # LRU淘汰：清除最早的一半
            keys = list(self._cache.keys())
            for k in keys[:len(keys) // 2]:
                del self._cache[k]
        return vec

    def _hash_to_dim(self, text: str, seed: int) -> int:
        raw = hashlib.sha256(f"{seed}:{text}".encode()).digest()
        val = int.from_bytes(raw[:4], "big")
        return val % self.VECTOR_DIM

    @staticmethod
    def cosine_similarity(a: list[float], b: list[float]) -> float:
        dot = sum(x * y for x, y in zip(a, b))
        na = math.sqrt(sum(x * x for x in a))
        nb = math.sqrt(sum(x * x for x in b))
        if na == 0 or nb == 0:
            return 0.0
        return dot / (na * nb)


_embedder: Optional[VectorEmbedder] = None


def get_embedder() -> VectorEmbedder:
    global _embedder
    if _embedder is None:
        _embedder = VectorEmbedder()
    return _embedder


class Memory:
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

    def _semantic_index(self, key: str, text: str, source: str = "memory"):
        """Agent OS: 写入 ChromaDB 语义索引"""
        self._semantic.add(key, text, {"time": time.time()}, source)

    def semantic_search(self, query: str, top_k: int = 5) -> list[dict]:
        """Agent OS: ChromaDB 语义相似检索"""
        if not self._semantic.ready:
            return []
        return self._semantic.search(query, top_k)

    def semantic_dedup(self, text: str, threshold: float = 0.92) -> bool:
        """Agent OS: 语义去重 — 相似度 >= threshold 则已存在"""
        return self._semantic.deduplicate(text, threshold)

    def semantic_warmup(self, keywords: list, max_chunks: int = 5) -> str:
        """Agent OS: 记忆预热 — 启动时注入最相关记忆"""
        return self._semantic.warmup_inject(keywords, max_chunks)

    def semantic_count(self) -> int:
        return self._semantic.count()

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

    # === 对话历史持久化 ===

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
        entries = deque(maxlen=n)
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

    # === Agent OS: 长期记忆持久化 (MEMORY.md) ===

    def save_project_memory(self, project_context: dict = None):
        """Agent OS: 将项目知识、用户偏好、学习经验写入 MEMORY.md"""
        mp = self._data_dir / "MEMORY.md"
        lines = []
        lines.append("# Agent OS 长期记忆")
        lines.append(f"# 最后更新: {time.strftime('%Y-%m-%d %H:%M:%S')}")
        lines.append("")

        lines.append("## 用户偏好")
        prefs = self._preferences
        if prefs:
            for k, v in prefs.items():
                lines.append(f"- {k}: {v}")
        else:
            lines.append("- 暂无记录的偏好")
        lines.append("")

        lines.append("## 常用操作")
        frequent = list(self._action_counts.items()) if hasattr(self, '_action_counts') else []
        if not frequent:
            from collections import Counter
            recent = self.load_recent_conversations(20)
            if recent:
                actions = Counter()
                for e in recent:
                    for kw, act in [("创建", "create"), ("修改", "update"), ("删除", "delete"),
                                    ("查询", "query"), ("分析", "analyze"), ("导出", "export"),
                                    ("策划", "planning"), ("代码", "code"), ("搜索", "search")]:
                        if kw in str(e.get("user", "")) + str(e.get("assistant", "")):
                            actions[act] += 1
                frequent = actions.most_common(5)
        if frequent:
            for act, cnt in frequent:
                lines.append(f"- {act}: {cnt}次")

        lines.append("")

        lines.append("## 项目知识")
        if project_context:
            for k, v in project_context.items():
                if isinstance(v, str) and len(v) > 300:
                    v = v[:300] + "..."
                lines.append(f"- {k}: {v}")
        else:
            lines.append("- 暂无项目上下文")

        lines.append("")

        lines.append("## 最近学习经验")
        learnings = self.get_recent_learnings(10)
        if learnings:
            for l in learnings:
                cat = l.get("category", "?")
                content = l.get("content", "")[:150]
                lines.append(f"- [{cat}] {content}")
        else:
            lines.append("- 暂无经验记录")

        lines.append("")

        with open(mp, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))
        self._logger.info(f"[Memory] MEMORY.md 已更新 ({mp})")

    def get_memory_context(self) -> str:
        """Agent OS: 读取持久化记忆，格式化为 LLM 可注入的上下文字符串"""
        mp = self._data_dir / "MEMORY.md"
        if not mp.exists():
            return ""
        try:
            content = mp.read_text(encoding="utf-8")
            lines = content.strip().split("\n")
            filtered = []
            skip = False
            for line in lines:
                if line.startswith("# 最后更新:"):
                    continue
                if line.strip() == "" and len(filtered) > 0 and filtered[-1] == "":
                    continue
                filtered.append(line)
            text = "\n".join(filtered).strip()
            if text:
                if self._scope:
                    return f"=== {self._scope} 专属记忆 ===\n{text}"
                return f"=== 长期记忆（项目知识 & 用户偏好） ===\n{text}"
        except Exception as e:
            self._logger.warning(f"读取 MEMORY.md 失败: {e}")
        return ""

    # === Agent OS: 双层记忆上下文合并 (全局 + Agent专属) ===

    @classmethod
    def get_combined_context(cls, global_memory, agent_scope: str) -> str:
        """Agent OS: 合并全局记忆和Agent专属记忆，去重后注入"""
        parts = []
        if global_memory:
            ctx = global_memory.get_memory_context()
            if ctx:
                parts.append(ctx)
        if agent_scope:
            base = global_memory._data_dir if global_memory else Path("data/memory")
            scoped_dir = base / "agent_memory" / agent_scope.replace("agent:", "").replace(":", "_")
            scoped_md = scoped_dir / "MEMORY.md"
            if scoped_md.exists():
                try:
                    text = scoped_md.read_text(encoding="utf-8")
                    filtered = []
                    for line in text.strip().split("\n"):
                        if line.startswith("# 最后更新:"):
                            continue
                        filtered.append(line)
                    scoped_text = "\n".join(filtered).strip()
                    if scoped_text:
                        parts.append(f"=== {agent_scope} Agent 专属经验 ===\n{scoped_text}")
                except Exception as e:
                    logger.warning(f"操作失败: {e}")
        return "\n\n".join(parts)

    # === 长期记忆注入 (Agent OS 预热) ===

    def inject_memory_context(self, messages: list) -> list:
        """Agent OS: 在消息列表中注入长期记忆上下文"""
        context = self.get_memory_context()
        if context:
            messages.insert(1, {"role": "system", "content": context})
        return messages

    # === Agent OS §6: 关键词倒排索引 (无向量DB的语义检索) ===

    _CN_STOP_WORDS = {
        "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一",
        "一个", "上", "也", "很", "到", "说", "要", "去", "你", "会", "着",
        "没有", "看", "好", "自己", "这", "他", "她", "它", "们", "那", "什",
        "么", "怎么", "如何", "可以", "这个", "那个", "哪个", "什么", "因为",
    }

    def _tokenize(self, text: str) -> list:
        """简单中文分词: 2-gram + 单字过滤停用词"""
        import re
        text = re.sub(r'[^\u4e00-\u9fff\w]', ' ', str(text).lower())
        tokens = []
        words = text.split()
        for w in words:
            if len(w) == 1 and w in self._CN_STOP_WORDS:
                continue
            if len(w) >= 2:
                tokens.append(w)
                for i in range(len(w) - 1):
                    bigram = w[i:i + 2]
                    if bigram not in self._CN_STOP_WORDS:
                        tokens.append(bigram)
        return list(set(tokens))

    def build_keyword_index(self) -> dict:
        """构建倒排索引: {keyword: [entry_id, ...]}"""
        index: dict = {}
        conversations = self.load_recent_conversations(50)
        for entry in conversations:
            eid = entry.get("timestamp", hash(str(entry)) & 0xFFFFFFFF)
            text = str(entry.get("user", "")) + " " + str(entry.get("assistant", ""))
            for token in self._tokenize(text):
                if token not in index:
                    index[token] = []
                if eid not in index[token]:
                    index[token].append(eid)
        learnings = self.get_recent_learnings(30)
        for l in learnings:
            lid = f"learn_{hash(str(l)) & 0xFFFF:04x}"
            text = str(l.get("content", ""))
            for token in self._tokenize(text):
                if token not in index:
                    index[token] = []
                if lid not in index[token]:
                    index[token].append(lid)
        return index

    def keyword_search(self, query: str, max_results: int = 5) -> list:
        """关键词反向检索: 搜索记忆中最相关的条目"""
        query_tokens = self._tokenize(query)
        if not query_tokens:
            return []
        index = self.build_keyword_index()
        scores: dict = {}
        for token in query_tokens:
            for eid in index.get(token, []):
                scores[eid] = scores.get(eid, 0) + 1
        ranked = sorted(scores.items(), key=lambda x: -x[1])[:max_results]
        results = []
        conversations = self.load_recent_conversations(50)
        conv_map = {e.get("timestamp", hash(str(e)) & 0xFFFFFFFF): e for e in conversations}
        learnings = self.get_recent_learnings(30)
        learn_map = {f"learn_{hash(str(l)) & 0xFFFF:04x}": l for l in learnings}
        for eid, score in ranked:
            if eid in conv_map:
                e = conv_map[eid]
                results.append({
                    "type": "conversation",
                    "score": score,
                    "user": str(e.get("user", ""))[:100],
                    "assistant": str(e.get("assistant", ""))[:100],
                })
            elif eid in learn_map:
                l = learn_map[eid]
                results.append({
                    "type": "learning",
                    "score": score,
                    "content": str(l.get("content", ""))[:150],
                })
        return results

    def get_semantic_groups(self) -> dict:
        """Agent OS: 语义分组 — 按主题聚类记忆条目"""
        groups = {"创建操作": [], "查询操作": [], "修改操作": [], "删除操作": [], "分析类": [], "其他": []}
        conversations = self.load_recent_conversations(30)
        for e in conversations:
            text = str(e.get("user", "")) + str(e.get("assistant", ""))
            if any(kw in text for kw in ["创建", "新建", "添加", "create", "new"]):
                groups["创建操作"].append(str(e.get("user", ""))[:60])
            elif any(kw in text for kw in ["查询", "搜索", "查看", "列出", "query", "search", "list"]):
                groups["查询操作"].append(str(e.get("user", ""))[:60])
            elif any(kw in text for kw in ["修改", "更新", "编辑", "update", "edit", "change"]):
                groups["修改操作"].append(str(e.get("user", ""))[:60])
            elif any(kw in text for kw in ["删除", "移除", "delete", "remove"]):
                groups["删除操作"].append(str(e.get("user", ""))[:60])
            elif any(kw in text for kw in ["分析", "统计", "报告", "analyze", "report"]):
                groups["分析类"].append(str(e.get("user", ""))[:60])
            else:
                groups["其他"].append(str(e.get("user", ""))[:60])
        return {k: v[:5] for k, v in groups.items() if v}

    def get_memory_stats(self) -> dict:
        """Agent OS: 记忆统计 — 返回记忆系统健康状态"""
        conv_count = len(self.load_recent_conversations(100))
        learn_count = len(self.get_recent_learnings(100))
        pref_count = len(self._preferences)
        return {
            "conversations": conv_count,
            "learnings": learn_count,
            "preferences": pref_count,
            "semantic_vectors": self.semantic_count(),
            "total": conv_count + learn_count,
            "status": "healthy" if conv_count > 0 else "cold_start",
        }

    def summarize_conversation(self, config: Optional[object] = None, keep_recent: int = 3) -> str:
        """对话摘要压缩 — 长对话自动压缩而非截断

        策略: 保留最近 N 轮，早期对话压缩为摘要注入 system prompt
        若 AI 可用则用 LLM 做摘要，否则用关键词提取降级
        """
        log_file = self._data_dir / "conversation_log.jsonl"
        if not log_file.exists():
            return ""

        entries = []
        with open(log_file, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        entries.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue

        if len(entries) <= keep_recent + 5:
            return ""

        old_entries = entries[:-keep_recent] if keep_recent > 0 else entries
        recent_entries = entries[-keep_recent:] if keep_recent > 0 else []

        recent_text = "\n".join(
            f"用户: {e.get('user','')[:100]}\n助手: {e.get('assistant','')[:100]}"
            for e in recent_entries
        )

        old_text = "\n".join(
            f"用户: {e.get('user','')[:100]}\n助手: {e.get('assistant','')[:100]}"
            for e in old_entries
        )

        summary = ""
        if config and getattr(config, "enabled", False):
            try:
                from common.ai_client import generate_text
                prompt = (
                    "将以下对话历史压缩为一句中文摘要，保留关键信息: "
                    "项目、角色名、数据类型、重要决策、错误信息。\n\n"
                    f"{old_text[:2000]}\n\n摘要:"
                )
                success, raw = generate_text(config, prompt, "", "")
                if success and raw:
                    summary = raw.strip()[:200]
            except ImportError as e:
                logger.debug(f"操作失败: {e}")
            except Exception as e:
                self._logger.debug(f"[Memory] LLM摘要失败: {e}")

        if not summary:
            lines = old_text.split("\n")
            keywords = []
            for kw in ["项目", "project", "workspace", "角色", "数据", "data",
                       "创建", "create", "修改", "update", "删除", "delete",
                       "错误", "error", "失败", "策划", "plan"]:
                kw_lower = kw.lower()
                for line in lines:
                    if kw_lower in line.lower():
                        keywords.append(line.strip()[:60])
                        break
            summary = " | ".join(keywords[:5]) if keywords else f"共 {len(old_entries)} 轮对话"

        archive_file = self._data_dir / f"conversation_summary_{time.strftime('%Y%m%d_%H%M%S')}.txt"
        # 修复 P2-26: 原子写 — 先写到临时文件，再 os.replace 覆盖目标文件
        # 之前直接 truncate + write，进程在两步之间崩溃会导致对话日志丢失
        with open(archive_file, "w", encoding="utf-8") as f:
            f.write(f"摘要: {summary}\n\n---\n{old_text}")

        with open(log_file, encoding="utf-8") as f:
            all_lines = f.readlines()
        recent_lines = all_lines[-keep_recent:] if keep_recent > 0 else []
        tmp_file = log_file.with_suffix(log_file.suffix + ".tmp")
        try:
            with open(tmp_file, "w", encoding="utf-8") as f:
                f.writelines(recent_lines)
            os.replace(tmp_file, log_file)  # Windows/Linux 均原子
        except Exception as e:
            # 降级：清理临时文件，原日志保留未压缩状态
            self._logger.warning(f"[Memory] 对话日志原子替换失败，保留原文件: {e}")
            if tmp_file.exists():
                try:
                    tmp_file.unlink()
                except OSError:
                    pass
            raise

        self._logger.info(f"对话压缩: {len(old_entries)} 轮 → 摘要, 保留 {len(recent_entries)} 轮")
        return f"[对话摘要] {summary}\n\n---\n{recent_text}"

    # === 向量索引持久化 ===

    def _get_index_path(self, key: str) -> Path:
        """将 memory key 映射为安全的索引文件名"""
        safe = hashlib.md5(key.encode(), usedforsecurity=False).hexdigest()
        return self._vector_index_dir / f"{safe}.json"

    def build_vector_index(self):
        """遍历 _short_term + _long_term，为每条 (key, value) 生成向量并保存到索引文件"""
        embedder = get_embedder()
        count = 0

        for key, entry in list(self._short_term.items()):
            if not isinstance(entry, MemoryEntry):
                continue
            text = f"{key} {str(entry.value)}"
            vec = embedder.embed(text)
            ts = str(entry.last_accessed) if hasattr(entry, 'last_accessed') and entry.last_accessed else MemoryEntry.now_timestamp()
            self._save_index_entry(key, vec, text, ts)
            count += 1

        for key, entry in self._long_term.items():
            text = f"{key} {str(entry.value)}"
            vec = embedder.embed(text)
            ts = str(entry.last_accessed) if hasattr(entry, 'last_accessed') and entry.last_accessed else MemoryEntry.now_timestamp()
            self._save_index_entry(key, vec, text, ts)
            count += 1

        if count > 0:
            self._logger.info(f"向量索引构建完成: {count} 条 → {self._vector_index_dir}")

    def _save_index_entry(self, key: str, vector: list[float], text: str, timestamp: str):
        """保存单条索引到 JSON 文件"""
        filepath = self._get_index_path(key)
        data = {
            "vector": vector,
            "text": text,
            "timestamp": timestamp,
        }
        try:
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False)
        except Exception as e:
            self._logger.warning(f"保存向量索引失败 key={key}: {e}")

    def _sync_index_entry(self, key: str, entry) -> None:
        """修复 P2-24: 写入记忆时同步更新向量索引（避免 build_vector_index 滞后导致搜索拿不到新条目）"""
        try:
            embedder = get_embedder()
            text = f"{key} {str(entry.value)[:500]}"
            vec = embedder.embed(text)
            ts = str(getattr(entry, 'last_accessed', None) or MemoryEntry.now_timestamp())
            self._save_index_entry(key, vec, text, ts)
        except Exception as e:
            self._logger.debug(f"[Memory] 同步索引失败 key={key}: {e}")

    def _remove_index_entry(self, key: str) -> None:
        """修复 P2-24: 删除记忆条目时清理对应的孤儿索引文件"""
        try:
            filepath = self._get_index_path(key)
            if filepath.exists():
                filepath.unlink()
        except Exception as e:
            self._logger.debug(f"[Memory] 清理索引失败 key={key}: {e}")

    def _load_index_entry(self, key: str) -> Optional[dict[str, Any]]:
        """从索引文件加载单条向量记录，不存在则返回 None"""
        filepath = self._get_index_path(key)
        if not filepath.exists():
            return None
        try:
            with open(filepath, encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            self._logger.debug(f"[Memory] 加载索引文件失败 key={key}: {e}")
            return None

    def reindex(self):
        """手动重建全部向量索引：清空索引目录后重新生成"""
        for f in self._vector_index_dir.glob("*.json"):
            try:
                f.unlink()
            except Exception as e:
                logger.warning(f"操作失败: {e}")
        self.build_vector_index()
        self._logger.info("向量索引已全部重建")

    # === 语义搜索 ===

    def semantic_search_short(self, query: str, top_k: int = 5) -> list[dict[str, Any]]:
        return self._semantic_search(query, self._short_term, top_k)

    def _semantic_search(self, query: str, store, top_k: int = 5) -> list[dict[str, Any]]:
        """语义搜索：索引文件优先（cosine 相似度），否则回退到实时 n-gram hash 计算"""
        embedder = get_embedder()
        query_vec = embedder.embed(query)
        candidates = []

        for key, entry in list(store.items()):
            if not isinstance(entry, MemoryEntry):
                continue
            text = f"{key} {str(entry.value)}"

            # 优先从持久化索引加载向量
            idx_entry = self._load_index_entry(key)
            if idx_entry is not None:
                cached_vec = idx_entry.get("vector", [])
                if len(cached_vec) == embedder.VECTOR_DIM:
                    vec_score = embedder.cosine_similarity(query_vec, cached_vec)
                else:
                    # 索引数据损坏，回退实时计算
                    text_vec = embedder.embed(text)
                    vec_score = embedder.cosine_similarity(query_vec, text_vec)
            else:
                # 无索引文件，实时计算
                text_vec = embedder.embed(text)
                vec_score = embedder.cosine_similarity(query_vec, text_vec)

            tf_score = 0.0
            q_lower = query.lower()
            t_lower = text.lower()
            if q_lower in t_lower:
                tf_score = 0.3
            else:
                q_tokens = set(q_lower.split())
                t_tokens = set(t_lower.split())
                overlap = q_tokens & t_tokens
                if q_tokens:
                    tf_score = 0.15 * len(overlap) / len(q_tokens)

            score = vec_score * 0.7 + tf_score * 0.3
            if score > 0.01:
                candidates.append({
                    "key": key,
                    "value": entry.value,
                    "score": round(score, 4),
                    "vec_score": round(vec_score, 4),
                    "confidence": entry.confidence,
                })

        candidates.sort(key=lambda x: x["score"], reverse=True)
        return candidates[:top_k]

    def capture_context(self):
        """从最近对话中自动提取关键信息存入短期记忆"""
        recent = self.load_recent_conversations(10)
        if not recent:
            return

        all_text = " ".join([e.get("user", "") + " " + e.get("assistant", "") for e in recent])

        # 1. 提取主题词（按 keyword 分类）
        keywords = {
            "project": ["项目", "工程", "project", "workspace", "工作区"],
            "role": ["角色", "role", "char", "人物"],
            "skill": ["技能", "skill", "ability"],
            "data": ["数据", "data", "属性", "attribute"],
            "task": ["任务", "task", "TODO", "代办"],
            "plan": ["策划", "plan", "设计", "design"],
            "error": ["错误", "error", "bug", "异常", "失败"],
        }
        for cat, kws in keywords.items():
            for kw in kws:
                if kw in all_text:
                    self.save_short_term(f"recent_topic_{cat}", kw, confidence=0.6)
                    break

        # 2. 提取对话中提到的具体数据名称（引号内的中文名/英文名）
        import re
        entity_candidates = set()

        # 引号内的名称
        for m in re.finditer(r'[""]([^""]{2,20})[""]', all_text):
            name = m.group(1).strip()
            if len(name) >= 2 and not name.isascii():
                entity_candidates.add(name)

        # 常见关键词后的名称
        for pattern in [
            r'(?:创建|修改|删除|查询|搜索|操作)(?:了)?[：:\s]*([\u4e00-\u9fff]{2,12})',
            r'(?:数据|怪物|技能|装备|道具|角色|任务|成就|剧情|对话|天赋)(?:\s*名?\s*)[：:\s]*([\u4e00-\u9fff]{2,12})',
            r'([\u4e00-\u9fff]{2,12})(?:数据|字段|条目)',
        ]:
            for m in re.finditer(pattern, all_text):
                name = m.group(1).strip()
                if len(name) >= 2:
                    entity_candidates.add(name)

        if entity_candidates:
            self.save_short_term(
                "recent_entities",
                list(entity_candidates)[:10],
                confidence=0.5,
            )
            self._logger.debug(
                f"[Memory] 提取到 {len(entity_candidates)} 个实体名: "
                f"{', '.join(list(entity_candidates)[:5])}"
            )

    def search_conversations(self, keyword: str, n: int = 20) -> list[dict]:
        """按关键词搜索对话历史"""
        log_file = self._data_dir / "conversation_log.jsonl"
        if not log_file.exists():
            return []
        results = []
        kw = keyword.lower()
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
                    user = entry.get("user", "").lower()
                    assistant = entry.get("assistant", "").lower()
                    if kw in user or kw in assistant:
                        score = 0
                        if kw in user:
                            score += 2
                        if kw in assistant:
                            score += 1
                        results.append({**entry, "score": score})
        except Exception as e:
            self._logger.warning(f"搜索对话历史失败: {e}")
            return []

        # 按相关度降序排序后取前 n 个（修复 bug: 之前 results[-n:] 错取最差匹配）
        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:n]

    def auto_archive(self):
        """对话日志超过上限自动归档旧记录"""
        log_file = self._data_dir / "conversation_log.jsonl"
        if not log_file.exists():
            return

        with open(log_file, encoding="utf-8") as f:
            lines = [l for l in f if l.strip()]

        if len(lines) <= self.MAX_CONVERSATIONS:
            return

        archive_dir = self._data_dir / ".archive"
        archive_dir.mkdir(parents=True, exist_ok=True)
        archive_file = archive_dir / f"conversation_{int(time.time())}.jsonl"

        keep = self.MAX_CONVERSATIONS // 2
        old_lines = lines[:-keep]
        new_lines = lines[-keep:]

        with open(archive_file, "w", encoding="utf-8") as f:
            f.writelines(old_lines)

        with open(log_file, "w", encoding="utf-8") as f:
            f.writelines(new_lines)

        self._logger.info(f"对话归档: {len(old_lines)} 条 → {archive_file.name}")
        self.build_vector_index()

    def semantic_search_long(self, query: str, top_k: int = 5) -> list[dict[str, Any]]:
        return self._semantic_search(query, self._long_term, top_k)


class MemoryIndex:
    """基于 JSON 的轻量级持久化索引

    存储格式: {向量目录}/{key_md5}.json → {"vector": [128 floats], "text": "原文", "timestamp": "..."}

    用于 VectorEmbedder 查询加速：搜索时优先从索引文件加载预计算向量，
    避免每次实时 n-gram hash，显著降低 CPU 开销。
    """

    def __init__(self, index_dir: Path):
        self._index_dir = Path(index_dir)
        self._index_dir.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _key_to_filename(key: str) -> str:
        safe = hashlib.md5(key.encode(), usedforsecurity=False).hexdigest()
        return f"{safe}.json"

    def filepath(self, key: str) -> Path:
        return self._index_dir / self._key_to_filename(key)

    def save(self, key: str, vector: list[float], text: str, timestamp: str = ""):
        filepath = self.filepath(key)
        data = {
            "vector": vector,
            "text": text,
            "timestamp": timestamp or datetime.now().isoformat(),
        }
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)

    def load(self, key: str) -> Optional[dict[str, Any]]:
        filepath = self.filepath(key)
        if not filepath.exists():
            return None
        try:
            with open(filepath, encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            return None

    def has(self, key: str) -> bool:
        return self.filepath(key).exists()

    def clear(self):
        for f in self._index_dir.glob("*.json"):
            try:
                f.unlink()
            except OSError as e:
                logger.debug(f"操作失败: {e}")

    def count(self) -> int:
        return len(list(self._index_dir.glob("*.json")))

    def all_keys(self) -> list[str]:
        """返回所有已索引的 key（从文件名反推不可逆，此处返回文件 stem 即 MD5 值）"""
        return [f.stem for f in self._index_dir.glob("*.json")]

    def __repr__(self) -> str:
        return f"MemoryIndex(dir={self._index_dir}, entries={self.count()})"


from core.agent.semantic_memory import SemanticMemory
