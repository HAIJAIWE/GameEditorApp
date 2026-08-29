"""EventBus 事件总线模块单元测试

覆盖单例模式、on/emit/off 基本流程、弱引用自动清理、clear() 方法、
线程安全（并发 emit/on）以及异常隔离（单个回调异常不影响其他回调）。
"""
import sys
import os
import gc
import threading

_PROJ_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_SRC = os.path.join(_PROJ_ROOT, "src")
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)

import pytest

from common.event_bus import EventBus


# ── 测试辅助 ──

class _Listener:
    """用于测试弱引用绑定方法的接收器"""

    def __init__(self):
        self.received = []

    def on_event(self, **kwargs):
        self.received.append(kwargs)


@pytest.fixture(autouse=True)
def _reset_event_bus():
    """每个测试前后清空 EventBus 单例的监听器，保证测试隔离"""
    bus = EventBus()
    bus.clear()
    yield
    bus.clear()


# ── 单例与基本流程 ──

class TestEventBusSingleton:
    """EventBus 单例模式测试"""

    def test_singleton_identity(self):
        """两次实例化应返回同一对象"""
        a = EventBus()
        b = EventBus()
        assert a is b

    def test_singleton_shared_state(self):
        """单例共享监听器状态 — 一个实例注册后另一个实例可见"""
        a = EventBus()
        b = EventBus()
        received = []
        b.on("evt", lambda **kw: received.append(kw), weak=False)
        a.emit("evt", x=1)
        assert received == [{"x": 1}]


class TestEventBusOnEmitOff:
    """on/emit/off 基本流程测试"""

    def test_on_emit_basic(self):
        """注册并触发 — 回调接收全部 kwargs"""
        bus = EventBus()
        received = []
        bus.on("evt", lambda **kw: received.append(kw), weak=False)
        bus.emit("evt", x=1, name="foo")
        assert received == [{"x": 1, "name": "foo"}]

    def test_emit_no_listeners_no_crash(self):
        """触发无监听的事件不应抛异常"""
        bus = EventBus()
        # 不应抛异常
        bus.emit("nonexistent", x=1)
        bus.emit("also_empty")

    def test_multiple_listeners_all_called(self):
        """同一事件的多个监听器按注册顺序全部被调用"""
        bus = EventBus()
        order = []
        bus.on("e", lambda **kw: order.append("first"), weak=False)
        bus.on("e", lambda **kw: order.append("second"), weak=False)
        bus.on("e", lambda **kw: order.append("third"), weak=False)
        bus.emit("e")
        assert order == ["first", "second", "third"]

    def test_has_listeners(self):
        """has_listeners 正确反映监听器存在性"""
        bus = EventBus()
        assert bus.has_listeners("evt") is False
        bus.on("evt", lambda **kw: None, weak=False)
        assert bus.has_listeners("evt") is True
        assert bus.has_listeners("other") is False

    def test_off_removes_callback(self):
        """off 移除指定回调 — 移除后不再被触发"""
        bus = EventBus()
        received = []

        def cb(**kwargs):
            received.append(kwargs)

        bus.on("evt", cb, weak=False)
        assert bus.has_listeners("evt")
        bus.emit("evt", x=1)
        assert len(received) == 1

        bus.off("evt", cb)
        assert not bus.has_listeners("evt")
        bus.emit("evt", x=2)
        assert len(received) == 1  # 没有再次被调用

    def test_off_only_removes_target(self):
        """off 仅移除目标回调，保留其他回调"""
        bus = EventBus()
        calls = []
        cb_a = lambda **kw: calls.append("a")
        cb_b = lambda **kw: calls.append("b")
        bus.on("e", cb_a, weak=False)
        bus.on("e", cb_b, weak=False)
        bus.off("e", cb_a)
        bus.emit("e")
        assert calls == ["b"]


# ── 弱引用自动清理 ──

class TestEventBusWeakRef:
    """弱引用自动清理测试"""

    def test_weak_ref_plain_function_cleanup(self):
        """普通函数弱引用 — 函数对象被回收后 emit 不再调用并清理死引用"""
        bus = EventBus()

        def make_cb():
            recv = []

            def cb(**kwargs):
                recv.append(kwargs)
            return cb, recv

        cb, recv = make_cb()
        bus.on("evt", cb)  # weak=True 默认，普通函数 → ref
        bus.emit("evt", x=1)
        assert recv == [{"x": 1}]
        assert bus.has_listeners("evt")

        del cb
        gc.collect()
        # 死引用应被跳过，不抛异常
        bus.emit("evt", x=2)
        assert recv == [{"x": 1}]  # 没有再次调用
        # 死引用被清理后不再有监听器
        assert not bus.has_listeners("evt")

    def test_weak_ref_bound_method_cleanup(self):
        """绑定方法弱引用 — 对象回收后 WeakMethod 失效并被清理"""
        bus = EventBus()
        listener = _Listener()
        bus.on("evt", listener.on_event)  # weak=True → WeakMethod
        bus.emit("evt", x=1)
        assert listener.received == [{"x": 1}]
        assert bus.has_listeners("evt")

        del listener
        gc.collect()
        bus.emit("evt", x=2)  # 不应抛异常
        # WeakMethod 失效后被清理
        assert not bus.has_listeners("evt")

    def test_non_weak_callback_survives(self):
        """weak=False 时强引用 — 对象即使无外部引用仍保留"""
        bus = EventBus()

        class _Holder:
            def __init__(self):
                self.count = 0

            def cb(self, **kwargs):
                self.count += 1

        holder = _Holder()
        bus.on("evt", holder.cb, weak=False)
        del holder
        gc.collect()
        # 强引用仍持有，回调仍存在
        assert bus.has_listeners("evt")
        bus.emit("evt")  # 不抛异常


# ── clear 方法 ──

class TestEventBusClear:
    """clear() 方法测试"""

    def test_clear_all_events(self):
        """clear() 无参数清除全部监听器"""
        bus = EventBus()
        bus.on("a", lambda **kw: None, weak=False)
        bus.on("b", lambda **kw: None, weak=False)
        bus.on("c", lambda **kw: None, weak=False)
        assert bus.has_listeners("a")
        bus.clear()
        assert not bus.has_listeners("a")
        assert not bus.has_listeners("b")
        assert not bus.has_listeners("c")

    def test_clear_specific_event(self):
        """clear(event) 仅清除指定事件，保留其他事件"""
        bus = EventBus()
        bus.on("a", lambda **kw: None, weak=False)
        bus.on("b", lambda **kw: None, weak=False)
        bus.clear("a")
        assert not bus.has_listeners("a")
        assert bus.has_listeners("b")

    def test_clear_nonexistent_event_no_crash(self):
        """clear 不存在的事件不应抛异常"""
        bus = EventBus()
        bus.clear("nonexistent")


# ── 异常隔离 ──

class TestEventBusExceptionIsolation:
    """异常隔离测试 — 一个回调异常不影响其他回调"""

    def test_exception_in_one_callback_does_not_stop_others(self):
        """回调抛异常时，其他回调仍被调用"""
        bus = EventBus()
        order = []

        def cb1(**kw):
            order.append(1)

        def bad(**kw):
            raise RuntimeError("boom")

        def cb2(**kw):
            order.append(2)

        bus.on("e", cb1, weak=False)
        bus.on("e", bad, weak=False)
        bus.on("e", cb2, weak=False)
        # 不应抛异常
        bus.emit("e")
        assert order == [1, 2]

    def test_exception_in_all_callbacks_no_raise(self):
        """所有回调都抛异常时 emit 也不抛"""
        bus = EventBus()
        bus.on("e", lambda **kw: (_ for _ in ()).throw(ValueError("x")), weak=False)
        bus.on("e", lambda **kw: (_ for _ in ()).throw(KeyError("y")), weak=False)
        bus.emit("e")  # 不抛异常


# ── 线程安全 ──

class TestEventBusThreadSafety:
    """线程安全测试 — 并发 emit/on 不出错"""

    def test_concurrent_emit(self):
        """多线程并发 emit — 所有回调都被正确触发"""
        bus = EventBus()
        counter = {"n": 0}
        lock = threading.Lock()

        def cb(**kw):
            with lock:
                counter["n"] += 1

        bus.on("e", cb, weak=False)
        errors = []

        def worker():
            try:
                for _ in range(50):
                    bus.emit("e", v=1)
            except Exception as ex:
                errors.append(ex)

        threads = [threading.Thread(target=worker) for _ in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        assert errors == []
        assert counter["n"] == 250  # 5 线程 × 50 次

    def test_concurrent_on_and_emit(self):
        """并发 on + emit — 锁机制保证不抛异常、不损坏数据结构"""
        bus = EventBus()
        errors = []

        def emitter():
            try:
                for _ in range(100):
                    bus.emit("e", x=1)
            except Exception as ex:
                errors.append(ex)

        def registerer():
            try:
                for _ in range(100):
                    bus.on("e", lambda **kw: None, weak=False)
            except Exception as ex:
                errors.append(ex)

        t1 = threading.Thread(target=emitter)
        t2 = threading.Thread(target=registerer)
        t1.start()
        t2.start()
        t1.join()
        t2.join()
        assert errors == []
        # 并发结束后仍能正常工作
        bus.emit("e", x=2)
