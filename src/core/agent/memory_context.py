"""项目记忆与上下文注入 —— Memory 的 MemoryContextMixin 部分

自 memory.py 拆出，方法体逐行原样搬运（逻辑未改动）。
"""
from __future__ import annotations

from pathlib import Path
import time

from common.logger import get_logger
from core.agent.memory_state import MemoryState

logger = get_logger()


class MemoryContextMixin(MemoryState):
    """项目记忆与上下文注入"""

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
                actions: Counter[str] = Counter()
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
            for learning in learnings:
                cat = learning.get("category", "?")
                content = learning.get("content", "")[:150]
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
            filtered: list[str] = []
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
    def inject_memory_context(self, messages: list) -> list:
        """Agent OS: 在消息列表中注入长期记忆上下文"""
        context = self.get_memory_context()
        if context:
            messages.insert(1, {"role": "system", "content": context})
        return messages
