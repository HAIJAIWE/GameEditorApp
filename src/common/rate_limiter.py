from __future__ import annotations

import threading
import time


class TokenBucket:
    """令牌桶限流器 — 保护 AI API 调用频率"""

    def __init__(self, rate: float = 3.0, burst: int = 5):
        self._rate = rate
        self._burst = burst
        self._tokens = float(burst)
        self._last_refill = time.monotonic()
        self._lock = threading.Lock()
        self._event = threading.Event()

    def acquire(self, tokens: float = 1.0) -> bool:
        with self._lock:
            now = time.monotonic()
            elapsed = now - self._last_refill
            self._tokens = min(self._burst, self._tokens + elapsed * self._rate)
            self._last_refill = now
            self._event.set()

            if self._tokens >= tokens:
                self._tokens -= tokens
                return True
            return False

    def wait_and_acquire(self, tokens: float = 1.0, timeout: float = 30.0) -> bool:
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
        with self._lock:
            now = time.monotonic()
            elapsed = now - self._last_refill
            return min(self._burst, self._tokens + elapsed * self._rate)


class RateLimiter:
    """多桶限流管理器"""

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

    def acquire(self, bucket: str = "llm", timeout: float = 30.0) -> bool:
        b = self._buckets.get(bucket)
        if not b:
            b = TokenBucket(rate=1.0, burst=3)
            self._buckets[bucket] = b
        return b.wait_and_acquire(timeout=timeout)

    def get_bucket(self, name: str) -> TokenBucket:
        if name not in self._buckets:
            self._buckets[name] = TokenBucket(rate=1.0, burst=3)
        return self._buckets[name]
