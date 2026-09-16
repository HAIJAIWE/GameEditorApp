"""语义索引包装、关键词检索与摘要 —— Memory 的 MemorySearchMixin 部分

自 memory.py 拆出，方法体逐行原样搬运（逻辑未改动）。
"""
from __future__ import annotations

import json
import os
import time
from typing import Optional

from common.logger import get_logger
from core.agent.memory_state import MemoryState

logger = get_logger()


class MemorySearchMixin(MemoryState):
    """语义索引包装、关键词检索与摘要"""

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
        for learning in learnings:
            lid = f"learn_{hash(str(learning)) & 0xFFFF:04x}"
            text = str(learning.get("content", ""))
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
        learn_map = {f"learn_{hash(str(learning)) & 0xFFFF:04x}": learning for learning in learnings}
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
                learning = learn_map[eid]
                results.append({
                    "type": "learning",
                    "score": score,
                    "content": str(learning.get("content", ""))[:150],
                })
        return results
    def get_semantic_groups(self) -> dict:
        """Agent OS: 语义分组 — 按主题聚类记忆条目"""
        groups: dict[str, list[str]] = {"创建操作": [], "查询操作": [], "修改操作": [], "删除操作": [], "分析类": [], "其他": []}
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
                success, raw = generate_text(config, prompt, "", None)
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
