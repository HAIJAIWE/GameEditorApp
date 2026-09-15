"""cache.py 缓存模块单元测试

覆盖 LRUCache / TimedCache / lru_cache 装饰器 / timed_cache 装饰器 /
cache_result / invalidate_cache 的核心功能与线程安全。
"""
import os
import sys
import threading
import time

_PROJ_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_SRC = os.path.join(_PROJ_ROOT, "src")
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)


from common.cache import (
    _NOT_FOUND,
    DATA_CACHE,
    SEARCH_CACHE,
    LRUCache,
    TimedCache,
    cache_result,
    invalidate_cache,
    lru_cache,
    timed_cache,
)

# ── LRUCache 测试 ──

class TestLRUCache:
    """LRUCache 缓存类测试"""

    def test_get_miss_returns_default(self):
        """未命中的键返回默认值"""
        cache = LRUCache(maxsize=10)
        assert cache.get("missing") is None
        assert cache.get("missing", "fallback") == "fallback"

    def test_put_and_get(self):
        """写入后能正确读取"""
        cache = LRUCache(maxsize=10)
        cache.put("k1", "v1")
        assert cache.get("k1") == "v1"

    def test_lru_eviction(self):
        """超过容量时淘汰最久未使用的项"""
        cache = LRUCache(maxsize=2)
        cache.put("a", 1)
        cache.put("b", 2)
        cache.get("a")  # 访问 a，使 b 成为最久未使用
        cache.put("c", 3)  # 应淘汰 b
        assert cache.get("a") == 1
        assert cache.get("b") is None
        assert cache.get("c") == 3

    def test_put_existing_key_updates_value(self):
        """已存在的键更新值而不增加容量"""
        cache = LRUCache(maxsize=2)
        cache.put("a", 1)
        cache.put("a", 2)
        assert cache.get("a") == 2
        assert len(cache) == 1

    def test_clear(self):
        """清空缓存并重置统计"""
        cache = LRUCache(maxsize=10)
        cache.put("a", 1)
        cache.get("a")
        cache.clear()
        assert len(cache) == 0
        stats = cache.get_stats()
        assert stats["hits"] == 0
        assert stats["misses"] == 0

    def test_contains(self):
        """__contains__ 正确判断键是否存在"""
        cache = LRUCache(maxsize=10)
        cache.put("a", 1)
        assert "a" in cache
        assert "b" not in cache

    def test_get_stats(self):
        """统计信息正确"""
        cache = LRUCache(maxsize=10)
        cache.put("a", 1)
        cache.get("a")  # hit
        cache.get("b")  # miss
        stats = cache.get_stats()
        assert stats["hits"] == 1
        assert stats["misses"] == 1
        assert stats["hit_rate"] == 0.5
        assert stats["size"] == 1
        assert stats["maxsize"] == 10

    def test_none_value_distinguishable(self):
        """能区分缓存值为 None 和未命中"""
        cache = LRUCache(maxsize=10)
        cache.put("none_key", None)
        # 使用 _NOT_FOUND 哨兵判断
        result = cache.get("none_key", _NOT_FOUND)
        assert result is None  # 缓存值为 None
        result = cache.get("missing", _NOT_FOUND)
        assert result is _NOT_FOUND  # 未命中


class TestLRUCacheThreadSafety:
    """LRUCache 线程安全测试"""

    def test_concurrent_put_get(self):
        """并发读写不崩溃且数据一致"""
        cache = LRUCache(maxsize=100)
        errors = []

        def writer():
            try:
                for i in range(100):
                    cache.put(f"key_{i}", i)
            except Exception as e:
                errors.append(e)

        def reader():
            try:
                for i in range(100):
                    cache.get(f"key_{i}")
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=writer) for _ in range(4)]
        threads += [threading.Thread(target=reader) for _ in range(4)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        assert errors == []


# ── TimedCache 测试 ──

class TestTimedCache:
    """TimedCache 带过期时间缓存测试"""

    def test_put_and_get_within_ttl(self):
        """TTL 内能读取"""
        cache = TimedCache(ttl=10)
        cache.put("k", "v")
        assert cache.get("k") == "v"

    def test_expired_entry_returns_default(self):
        """过期后返回默认值"""
        cache = TimedCache(ttl=0)  # 立即过期
        cache.put("k", "v")
        time.sleep(0.01)
        assert cache.get("k") is None

    def test_cleanup_removes_expired(self):
        """cleanup 清理过期项并返回清理数量"""
        cache = TimedCache(ttl=0)
        cache.put("a", 1)
        cache.put("b", 2)
        time.sleep(0.01)
        removed = cache.cleanup()
        assert removed == 2

    def test_clear(self):
        """清空缓存"""
        cache = TimedCache(ttl=10)
        cache.put("a", 1)
        cache.clear()
        assert cache.get("a") is None


# ── lru_cache 装饰器测试 ──

class TestLRUCacheDecorator:
    """lru_cache 装饰器测试"""

    def test_caches_result(self):
        """相同参数命中缓存"""
        call_count = 0

        @lru_cache(maxsize=10)
        def add(a, b):
            nonlocal call_count
            call_count += 1
            return a + b

        assert add(1, 2) == 3
        assert add(1, 2) == 3  # 命中缓存
        assert call_count == 1

    def test_different_args_not_cached(self):
        """不同参数不命中缓存"""
        call_count = 0

        @lru_cache(maxsize=10)
        def square(n):
            nonlocal call_count
            call_count += 1
            return n * n

        square(2)
        square(3)
        assert call_count == 2

    def test_uncacheable_args_bypass_cache(self):
        """不可哈希参数直接调用函数"""
        @lru_cache(maxsize=10)
        def process(data):
            return len(data)

        result = process([1, 2, 3])  # list 不可哈希
        assert result == 3


# ── timed_cache 装饰器测试 ──

class TestTimedCacheDecorator:
    """timed_cache 装饰器测试"""

    def test_caches_within_ttl(self):
        call_count = 0

        @timed_cache(ttl=10)
        def compute(x):
            nonlocal call_count
            call_count += 1
            return x * 2

        assert compute(5) == 10
        assert compute(5) == 10
        assert call_count == 1


# ── 全局缓存函数测试 ──

class TestGlobalCacheFunctions:
    """cache_result 和 invalidate_cache 测试"""

    def setup_method(self):
        """每个测试前清空全局缓存"""
        DATA_CACHE.clear()
        SEARCH_CACHE.clear()

    def test_cache_result_caches(self):
        """cache_result 缓存函数结果"""
        call_count = 0

        def expensive():
            nonlocal call_count
            call_count += 1
            return "result"

        r1 = cache_result("test_key", expensive)
        r2 = cache_result("test_key", expensive)
        assert r1 == "result"
        assert r2 == "result"
        assert call_count == 1

    def test_invalidate_cache_removes_matching(self):
        """invalidate_cache 按模式失效缓存"""
        DATA_CACHE.put("user:1", "a")
        DATA_CACHE.put("user:2", "b")
        DATA_CACHE.put("item:1", "c")

        removed = invalidate_cache("user")
        assert removed == 2
        assert DATA_CACHE.get("user:1") is None
        assert DATA_CACHE.get("user:2") is None
        assert DATA_CACHE.get("item:1") == "c"

    def test_invalidate_cache_thread_safe(self):
        """invalidate_cache 在并发下不崩溃"""
        DATA_CACHE.put("key1", 1)
        DATA_CACHE.put("key2", 2)

        errors = []

        def invalidator():
            try:
                for _ in range(50):
                    invalidate_cache("key")
            except Exception as e:
                errors.append(e)

        def writer():
            try:
                for i in range(50):
                    DATA_CACHE.put(f"key{i}", i)
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=invalidator) for _ in range(3)]
        threads += [threading.Thread(target=writer) for _ in range(3)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        assert errors == []
