"""事件总线 - 解耦跨组件通信"""

from collections import defaultdict
from collections.abc import Callable
import logging
import threading
from typing import Any
from weakref import WeakMethod, ref

_logger = logging.getLogger("GameEditorApp.EventBus")


class EventBus:
    _instance = None
    _listeners: dict = {}  # 在 __new__ 中替换为 defaultdict(list) 实例属性
    _lock = threading.Lock()
    _emit_lock = threading.Lock()  # 保护 emit/on/off 的并发访问

    def __new__(cls) -> EventBus:
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._listeners = defaultdict(list)
        return cls._instance

    def has_listeners(self, event: str) -> bool:
        with self._emit_lock:
            return len(self._listeners.get(event, [])) > 0

    def on(self, event: str, callback: Callable, weak: bool = True) -> None:
        # cb 可能为弱引用包装 (WeakMethod / weakref.ref) 或原始回调，统一用 Any 承载
        cb: Any
        if weak:
            try:
                cb = WeakMethod(callback) if hasattr(callback, '__self__') else ref(callback)
            except TypeError:
                cb = callback
        else:
            cb = callback
        with self._emit_lock:
            self._listeners[event].append(cb)

    def off(self, event: str, callback: Callable) -> None:
        with self._emit_lock:
            self._listeners[event] = [
                cb for cb in self._listeners[event]
                if not (isinstance(cb, (ref, WeakMethod)) and cb() is callback)
                and cb is not callback
            ]

    def emit(self, event: str, **kwargs) -> None:
        # 在锁内快照监听器列表，避免迭代时被并发修改
        with self._emit_lock:
            listeners = list(self._listeners.get(event, []))
        if not listeners:
            return
        dead = []
        for idx, cb in enumerate(listeners):
            try:
                if isinstance(cb, (ref, WeakMethod)):
                    fn = cb()
                    if fn is None:
                        dead.append(idx)
                        continue
                    fn(**kwargs)
                else:
                    cb(**kwargs)
            except Exception:
                _logger.error(
                    "事件 '%s' 的回调执行异常", event, exc_info=True
                )
        # 清理失效的弱引用（在锁内操作原列表）
        if dead:
            with self._emit_lock:
                current = self._listeners.get(event, [])
                # 基于对象身份过滤失效引用（避免索引偏移）
                dead_objs = set(id(listeners[i]) for i in dead)
                self._listeners[event] = [cb for cb in current if id(cb) not in dead_objs]

    def clear(self, event: str = None) -> None:
        """清除指定事件的所有监听器；event 为 None 时清除全部"""
        with self._emit_lock:
            if event is None:
                self._listeners.clear()
            else:
                self._listeners.pop(event, None)
