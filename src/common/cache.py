"""缓存工具模块 - 提供内存缓存和LRU缓存功能"""
from collections import OrderedDict
from collections.abc import Callable, Hashable
from functools import wraps
import threading
import time
from typing import Any

from common.logger import get_logger

logger = get_logger()

# 哨兵对象：用于区分缓存未命中与缓存值为 None 的情况
_NOT_FOUND = object()


class LRUCache:
    """LRU缓存类 - 最近最少使用缓存"""

    def __init__(self, maxsize: int = 128):
        """初始化缓存

        Args:
            maxsize: 最大缓存容量
        """
        self.maxsize = maxsize
        self.cache: OrderedDict[Hashable, Any] = OrderedDict()
        self.lock = threading.Lock()
        self.hits = 0
        self.misses = 0

    def get(self, key: Hashable, default: Any = None) -> Any:
        """获取缓存值

        Args:
            key: 缓存键
            default: 默认值

        Returns:
            缓存值或默认值
        """
        with self.lock:
            if key not in self.cache:
                self.misses += 1
                return default

            # 将key移到最后表示最近访问
            value = self.cache.pop(key)
            self.cache[key] = value
            self.hits += 1
            return value

    def put(self, key: Hashable, value: Any) -> None:
        """设置缓存值

        Args:
            key: 缓存键
            value: 缓存值
        """
        with self.lock:
            if key in self.cache:
                self.cache.pop(key)
            elif len(self.cache) >= self.maxsize:
                # 移除最早添加的项
                self.cache.popitem(last=False)
            self.cache[key] = value

    def clear(self) -> None:
        """清空缓存"""
        with self.lock:
            self.cache.clear()
            self.hits = 0
            self.misses = 0

    def __contains__(self, key: Hashable) -> bool:
        """检查键是否在缓存中"""
        return key in self.cache

    def __len__(self) -> int:
        """获取缓存大小"""
        return len(self.cache)

    def get_stats(self) -> dict[str, Any]:
        """获取缓存统计信息"""
        total = self.hits + self.misses
        hit_rate = self.hits / total if total > 0 else 0
        return {
            'size': len(self.cache),
            'maxsize': self.maxsize,
            'hits': self.hits,
            'misses': self.misses,
            'hit_rate': hit_rate
        }


class TimedCache:
    """带过期时间的缓存类"""

    def __init__(self, ttl: int = 300):
        """初始化缓存

        Args:
            ttl: 过期时间（秒）
        """
        self.ttl = ttl
        self.cache: dict[Hashable, tuple[float, Any]] = {}
        self.lock = threading.Lock()

    def get(self, key: Hashable, default: Any = None) -> Any:
        """获取缓存值

        Args:
            key: 缓存键
            default: 默认值

        Returns:
            缓存值或默认值
        """
        with self.lock:
            if key not in self.cache:
                return default

            timestamp, value = self.cache[key]
            if time.time() - timestamp > self.ttl:
                del self.cache[key]
                return default

            return value

    def put(self, key: Hashable, value: Any) -> None:
        """设置缓存值

        Args:
            key: 缓存键
            value: 缓存值
        """
        with self.lock:
            self.cache[key] = (time.time(), value)

    def clear(self) -> None:
        """清空缓存"""
        with self.lock:
            self.cache.clear()

    def cleanup(self) -> int:
        """清理过期缓存

        Returns:
            清理的缓存项数量
        """
        with self.lock:
            current_time = time.time()
            expired = [
                key for key, (timestamp, _) in self.cache.items()
                if current_time - timestamp > self.ttl
            ]
            for key in expired:
                del self.cache[key]
            return len(expired)


def lru_cache(maxsize: int = 128) -> Callable:
    """LRU缓存装饰器

    Args:
        maxsize: 最大缓存容量

    Returns:
        装饰器函数
    """
    def decorator(func: Callable) -> Callable:
        cache = LRUCache(maxsize)

        @wraps(func)
        def wrapper(*args, **kwargs) -> Any:
            # 创建缓存键
            key_parts = args + tuple(sorted(kwargs.items()))
            try:
                cache_key = hash(key_parts)
            except TypeError:
                # 如果不可哈希，直接调用函数
                logger.warning(f"Uncacheable arguments for {func.__name__}, not using cache")
                return func(*args, **kwargs)

            # 尝试从缓存获取
            value = cache.get(cache_key, _NOT_FOUND)
            if value is not _NOT_FOUND:
                return value

            # 缓存未命中，执行函数
            result = func(*args, **kwargs)
            cache.put(cache_key, result)
            return result

        object.__setattr__(wrapper, "cache", cache)  # wraps 包装后类型无此属性，动态绑定（B010 豁免：需避开 attr 属性声明冲突）
        return wrapper
    return decorator


def timed_cache(ttl: int = 300) -> Callable:
    """带过期时间的缓存装饰器

    Args:
        ttl: 过期时间（秒）

    Returns:
        装饰器函数
    """
    def decorator(func: Callable) -> Callable:
        cache = TimedCache(ttl)

        @wraps(func)
        def wrapper(*args, **kwargs) -> Any:
            # 创建缓存键
            key_parts = args + tuple(sorted(kwargs.items()))
            try:
                cache_key = hash(key_parts)
            except TypeError:
                logger.warning(f"Uncacheable arguments for {func.__name__}, not using cache")
                return func(*args, **kwargs)

            # 尝试从缓存获取
            value = cache.get(cache_key, _NOT_FOUND)
            if value is not _NOT_FOUND:
                return value

            # 缓存未命中，执行函数
            result = func(*args, **kwargs)
            cache.put(cache_key, result)
            return result

        object.__setattr__(wrapper, "cache", cache)  # wraps 包装后类型无此属性，动态绑定（B010 豁免：需避开 attr 属性声明冲突）
        return wrapper
    return decorator


# 全局缓存实例
SEARCH_CACHE = LRUCache(64)
DATA_CACHE = LRUCache(128)


def cache_result(key: str, func: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
    """通用缓存函数

    Args:
        key: 缓存键
        func: 要执行的函数
        *args: 函数参数
        **kwargs: 函数关键字参数

    Returns:
        函数结果
    """
    if key in DATA_CACHE:
        return DATA_CACHE.get(key)

    result = func(*args, **kwargs)
    DATA_CACHE.put(key, result)
    return result


def invalidate_cache(pattern: str) -> int:
    """使匹配模式的缓存失效（线程安全）

    Args:
        pattern: 键的匹配模式

    Returns:
        失效的缓存数量
    """
    count = 0
    # 清理DATA_CACHE（使用其内部锁保证线程安全）
    with DATA_CACHE.lock:
        keys_to_remove = [key for key in DATA_CACHE.cache if pattern in str(key)]
        for key in keys_to_remove:
            del DATA_CACHE.cache[key]
            count += 1

    # 清理SEARCH_CACHE（使用其内部锁保证线程安全）
    with SEARCH_CACHE.lock:
        keys_to_remove = [key for key in SEARCH_CACHE.cache if pattern in str(key)]
        for key in keys_to_remove:
            del SEARCH_CACHE.cache[key]
            count += 1

    logger.debug(f"Invalidated {count} cache entries with pattern: {pattern}")
    return count
