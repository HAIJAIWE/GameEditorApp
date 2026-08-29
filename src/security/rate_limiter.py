"""Agent OS §11 — 速率限制：令牌桶 + 多桶管理器

TokenBucket 实现标准的令牌桶算法，支持突发（burst）和持续速率（rate）。
RateLimiter 是单例多桶管理器，为不同资源（LLM、搜索、图像生成等）维护独立桶。
"""
from __future__ import annotations

import threading
import time

from common.logger import get_logger

logger = get_logger()


class TokenBucket:
    """令牌桶限流器 — 保护 API 调用频率

    Args:
        rate: 令牌补充速率（令牌/秒）
        burst: 桶容量，即最大突发请求数
    """

    def __init__(self, rate: float = 3.0, burst: int = 5):
        self._rate = rate
        self._burst = burst
        self._tokens = float(burst)
        self._last_refill = time.monotonic()
        self._lock = threading.Lock()
        self._event = threading.Event()

    def _refill(self):
        """根据流逝时间补充令牌（调用前需持有锁）"""
        now = time.monotonic()
        elapsed = now - self._last_refill
        self._tokens = min(self._burst, self._tokens + elapsed * self._rate)
        self._last_refill = now

    def _can_acquire(self, tokens: float = 1.0) -> bool:
        """检查是否可以获取指定数量令牌（不实际扣减）"""
        return self._tokens >= tokens

    def acquire(self, tokens: float = 1.0) -> bool:
        """尝试获取令牌，立即返回

        Args:
            tokens: 需要的令牌数

        Returns:
            True 表示获取成功，False 表示令牌不足
        """
        with self._lock:
            self._refill()
            self._event.set()
            if self._tokens >= tokens:
                self._tokens -= tokens
                return True
            return False

    def wait_and_acquire(self, tokens: float = 1.0, timeout: float = 30.0) -> bool:
        """等待并获取令牌，直到超时

        Args:
            tokens: 需要的令牌数
            timeout: 最大等待秒数

        Returns:
            True 表示获取成功，False 表示超时
        """
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if self.acquire(tokens):
                return True
            self._event.clear()
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return False
            self._event.wait(timeout=min(remaining, 0.1))
        return False

    @property
    def available(self) -> float:
        """当前可用令牌数（含未结算的补充）"""
        with self._lock:
            now = time.monotonic()
            elapsed = now - self._last_refill
            return min(self._burst, self._tokens + elapsed * self._rate)


class RateLimiter:
    """多桶限流管理器（单例）

    为不同资源类型维护独立的 TokenBucket，避免相互干扰。
    内置桶: llm / stream / web_search / image_gen
    """

    _instance: RateLimiter | None = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if hasattr(self, "_initialized"):
            return
        self._initialized = True
        self._buckets: dict[str, TokenBucket] = {
            "llm": TokenBucket(rate=3.0, burst=5),
            "stream": TokenBucket(rate=5.0, burst=8),
            "web_search": TokenBucket(rate=1.0, burst=3),
            "image_gen": TokenBucket(rate=0.5, burst=2),
        }

    def get_bucket(self, name: str) -> TokenBucket:
        """获取或创建指定名称的令牌桶"""
        if name not in self._buckets:
            self._buckets[name] = TokenBucket(rate=1.0, burst=3)
        return self._buckets[name]

    def acquire(self, bucket: str = "llm", timeout: float = 30.0) -> bool:
        """从指定桶获取一个令牌（等待最多 timeout 秒）"""
        b = self._buckets.get(bucket)
        if not b:
            b = TokenBucket(rate=1.0, burst=3)
            self._buckets[bucket] = b
        return b.wait_and_acquire(timeout=timeout)
