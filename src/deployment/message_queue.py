"""Agent OS §11 — 消息队列抽象层：支持内存队列 + 文件持久化"""
from collections.abc import Callable
from dataclasses import dataclass, field
import json
from pathlib import Path
import queue
import threading
import time
from typing import Any, Optional

from common.logger import get_logger

logger = get_logger()


@dataclass
class Message:
    msg_id: str
    topic: str
    payload: Any
    sender: str = "system"
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        return {"msg_id": self.msg_id, "topic": self.topic, "payload": self.payload,
                "sender": self.sender, "timestamp": self.timestamp}


class MessageQueue:
    """Agent OS — 内存消息队列：支持主题订阅 + 持久化"""

    def __init__(self, data_dir: str = "", max_size: int = 1000):
        self._data_dir = Path(data_dir or "data/msg_queue")
        self._data_dir.mkdir(parents=True, exist_ok=True)
        self._max_size = max_size
        self._logger = get_logger()
        self._topics: dict[str, queue.Queue] = {}
        self._subscribers: dict[str, list[Callable]] = {}
        self._lock = threading.Lock()
        self._msg_counter = 0

    def register_topic(self, topic: str):
        with self._lock:
            if topic not in self._topics:
                self._topics[topic] = queue.Queue(maxsize=self._max_size)

    def publish(self, topic: str, payload: Any, sender: str = "system", persist: bool = False):
        with self._lock:
            self.register_topic(topic)
            self._msg_counter += 1
            msg = Message(
                msg_id=f"msg_{self._msg_counter:06d}",
                topic=topic,
                payload=payload,
                sender=sender,
            )
            try:
                self._topics[topic].put_nowait(msg)
            except queue.Full:
                self._logger.warning(f"队列 {topic} 已满，丢弃最旧消息")
                try:
                    self._topics[topic].get_nowait()
                    self._topics[topic].put_nowait(msg)
                except Exception as e:
                    logger.warning(f"操作失败: {e}")

            if persist:
                self._persist(msg)

            for cb in self._subscribers.get(topic, []):
                try:
                    cb(msg)
                except Exception as e:
                    self._logger.warning(f"订阅回调异常 {topic}: {e}")

    def subscribe(self, topic: str, callback: Callable[[Message], None]):
        with self._lock:
            self.register_topic(topic)
            self._subscribers.setdefault(topic, []).append(callback)

    def consume(self, topic: str, timeout: float = 1.0) -> Optional[Message]:
        with self._lock:
            self.register_topic(topic)
        try:
            return self._topics[topic].get(timeout=timeout)
        except queue.Empty:
            return None

    def drain(self, topic: str, max_messages: int = 10) -> list[Message]:
        messages = []
        with self._lock:
            self.register_topic(topic)
        for _ in range(max_messages):
            try:
                msg = self._topics[topic].get_nowait()
                messages.append(msg)
            except queue.Empty:
                break
        return messages

    def topic_size(self, topic: str) -> int:
        with self._lock:
            if topic in self._topics:
                return self._topics[topic].qsize()
        return 0

    def topics(self) -> list[str]:
        return list(self._topics.keys())

    def _persist(self, msg: Message):
        topic_dir = self._data_dir / msg.topic
        topic_dir.mkdir(parents=True, exist_ok=True)
        filepath = topic_dir / f"{msg.msg_id}.json"
        try:
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(msg.to_dict(), f, ensure_ascii=False)
        except Exception as e:
            logger.warning(f"操作失败: {e}")

    def replay_persisted(self, topic: str) -> list[Message]:
        topic_dir = self._data_dir / topic
        if not topic_dir.exists():
            return []
        messages = []
        for f in sorted(topic_dir.glob("*.json")):
            try:
                data = json.loads(f.read_text(encoding="utf-8"))
                messages.append(Message(**data))
            except Exception:
                continue
        return messages
