"""向量索引维护、语义检索与会话归档 —— Memory 的 MemoryVectorMixin 部分

自 memory.py 拆出，方法体逐行原样搬运（逻辑未改动）。
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import time
from typing import Any, Optional

from common.logger import get_logger
from core.agent.memory_embedder import get_embedder
from core.agent.memory_state import MemoryState
from core.agent.models import MemoryEntry

logger = get_logger()


class MemoryVectorMixin(MemoryState):
    """向量索引维护、语义检索与会话归档"""

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
            ts = str(entry.last_accessed) if hasattr(entry, 'last_accessed') and entry.last_accessed else str(MemoryEntry.now_timestamp())
            self._save_index_entry(key, vec, text, ts)
            count += 1

        for key, entry in self._long_term.items():
            text = f"{key} {str(entry.value)}"
            vec = embedder.embed(text)
            ts = str(entry.last_accessed) if hasattr(entry, 'last_accessed') and entry.last_accessed else str(MemoryEntry.now_timestamp())
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
    def semantic_search_long(self, query: str, top_k: int = 5) -> list[dict[str, Any]]:
        return self._semantic_search(query, self._long_term, top_k)
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
            lines = [line for line in f if line.strip()]

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
