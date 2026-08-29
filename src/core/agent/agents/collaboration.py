"""Agent OS §8 — 黑板模式：Agent 间通信的消息板"""

from __future__ import annotations

from dataclasses import dataclass, field
import threading
import time


@dataclass
class BroadcastMessage:
    """黑板消息 — Agent 之间通过黑板通信的结构化消息"""
    msg_id: str
    sender: str
    topic: str
    content: str
    timestamp: float = field(default_factory=time.time)
    replies: list[dict] = field(default_factory=list)


class Blackboard:
    """Agent OS 黑板模式：共享消息板，所有 Agent 可读写"""

    def __init__(self, max_messages: int = 50):
        self._messages: list[BroadcastMessage] = []
        self._lock = threading.Lock()
        self._max_messages = max_messages

    def post(self, sender: str, topic: str, content: str) -> BroadcastMessage:
        msg = BroadcastMessage(
            msg_id=f"bb_{int(time.time() * 1000)}_{hash(content) & 0xFFFF:04x}",
            sender=sender,
            topic=topic,
            content=content,
        )
        with self._lock:
            self._messages.append(msg)
            if len(self._messages) > self._max_messages:
                self._messages = self._messages[-self._max_messages:]
        return msg

    def read(self, topic: str = None, sender: str = None, limit: int = 10) -> list[BroadcastMessage]:
        with self._lock:
            msgs = list(self._messages)
        if topic:
            msgs = [m for m in msgs if m.topic == topic]
        if sender:
            msgs = [m for m in msgs if m.sender == sender]
        return msgs[-limit:]

    def reply(self, msg_id: str, sender: str, content: str) -> bool:
        with self._lock:
            for m in self._messages:
                if m.msg_id == msg_id:
                    m.replies.append({"sender": sender, "content": content, "time": time.time()})
                    return True
        return False

    def get_context(self, max_bytes: int = 2000) -> str:
        """获取黑板上下文供 LLM 注入"""
        msgs = self.read(limit=8)
        if not msgs:
            return ""
        lines = ["=== 黑板 (Agent间通信) ==="]
        total = 0
        for m in msgs:
            line = f"[{m.sender}→{m.topic}] {m.content[:150]}"
            if total + len(line) > max_bytes:
                break
            lines.append(line)
            total += len(line)
        return "\n".join(lines)
