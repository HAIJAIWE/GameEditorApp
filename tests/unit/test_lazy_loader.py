"""lazy_loader.py 懒加载模块单元测试

覆盖 LazyImport / ModuleProxy / BulkLazyLoader 的核心功能，
包括加载、重试、统计和 preload 行为。
"""
import sys
import os

_PROJ_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_SRC = os.path.join(_PROJ_ROOT, "src")
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)

import pytest

from common.lazy_loader import (
    LazyImport,
    ModuleProxy,
    BulkLazyLoader,
    get_lazy_loader,
    lazy,
)


# ── LazyImport 测试 ──

class TestLazyImport:
    """LazyImport 懒加载测试"""

    def test_loads_standard_module(self):
        """懒加载标准库模块"""
        li = LazyImport("json")
        # 模块尚未加载
        assert li._loaded is False
        # 访问属性触发加载
        result = li.dumps({"a": 1})
        assert li._loaded is True
        assert '"a"' in result

    def test_loads_attribute(self):
        """懒加载模块属性"""
        li = LazyImport("json", "dumps")
        assert li._loaded is False
        result = li({"key": "value"})
        assert li._loaded is True
        assert '"key"' in result

    def test_auto_split_module_attr(self):
        """自动从 module_path 分离 attr_name"""
        li = LazyImport("json.dumps")
        assert li._module_path == "json"
        assert li._attr_name == "dumps"
        result = li({"x": 1})
        assert '"x"' in result

    def test_failed_load_resets_state(self):
        """加载失败时重置 _loaded 状态，允许重试"""
        li = LazyImport("nonexistent.module.that.does.not.exist")
        with pytest.raises(ImportError):
            li._load()
        # 失败后状态应允许重试
        assert li._loaded is False
        assert li._module is None

    def test_repr_shows_status(self):
        """__repr__ 显示加载状态"""
        li = LazyImport("json")
        assert "lazy" in repr(li)
        li._load()
        assert "loaded" in repr(li)

    def test_call_on_non_callable_raises(self):
        """对不可调用的模块使用 () 抛出 TypeError"""
        li = LazyImport("json")  # 模块本身不可调用
        with pytest.raises(TypeError):
            li("{}")


# ── ModuleProxy 测试 ──

class TestModuleProxy:
    """ModuleProxy 模块代理测试"""

    def test_proxies_attribute_access(self):
        """代理属性访问"""
        proxy = ModuleProxy("json")
        result = proxy.dumps({"a": 1})
        assert '"a"' in result

    def test_lazy_load(self):
        """代理在首次访问时才加载"""
        proxy = ModuleProxy("json")
        assert proxy._mod is None
        _ = proxy.loads('{"x": 1}')
        assert proxy._mod is not None


# ── BulkLazyLoader 测试 ──

class TestBulkLazyLoader:
    """BulkLazyLoader 批量懒加载测试"""

    def test_register_and_get(self):
        """注册并获取 LazyImport"""
        loader = BulkLazyLoader()
        loader.register("json_mod", "json")
        li = loader.get("json_mod")
        assert isinstance(li, LazyImport)
        assert li._loaded is False

    def test_preload_specific(self):
        """预加载指定别名"""
        loader = BulkLazyLoader()
        loader.register("json_mod", "json")
        loader.preload("json_mod")
        assert loader.get("json_mod")._loaded is True

    def test_preload_unknown_alias_ignored(self):
        """预加载未知别名不报错"""
        loader = BulkLazyLoader()
        loader.preload("nonexistent")  # 不应抛异常

    def test_preload_all(self):
        """预加载所有已注册别名"""
        loader = BulkLazyLoader()
        loader.register("json_mod", "json")
        loader.register("os_mod", "os")
        loader.preload_all()
        assert loader.get_loaded_count() == 2

    def test_preload_all_swallows_errors(self):
        """preload_all 对加载失败的别名只 warning 不抛异常"""
        loader = BulkLazyLoader()
        loader.register("good", "json")
        loader.register("bad", "nonexistent.module.xxx")
        loader.preload_all()  # 不应抛异常
        assert loader.get("good")._loaded is True
        assert loader.get("bad")._loaded is False

    def test_get_loaded_count(self):
        """已加载数量统计"""
        loader = BulkLazyLoader()
        loader.register("a", "json")
        loader.register("b", "os")
        assert loader.get_loaded_count() == 0
        loader.preload("a")
        assert loader.get_loaded_count() == 1

    def test_get_total_count(self):
        """总注册数量统计"""
        loader = BulkLazyLoader()
        loader.register("a", "json")
        loader.register("b", "os")
        assert loader.get_total_count() == 2

    def test_stats(self):
        """stats 返回完整统计信息"""
        loader = BulkLazyLoader()
        loader.register("a", "json")
        loader.preload("a")
        stats = loader.stats()
        assert stats["total"] == 1
        assert stats["loaded"] == 1
        assert stats["pending"] == 0
        assert "a" in stats["modules"]
        assert stats["modules"]["a"] == "loaded"


# ── 工厂函数测试 ──

class TestFactoryFunctions:
    """get_lazy_loader 和 lazy 工厂函数测试"""

    def test_get_lazy_loader_singleton(self):
        """get_lazy_loader 返回单例"""
        l1 = get_lazy_loader()
        l2 = get_lazy_loader()
        assert l1 is l2

    def test_lazy_creates_lazy_import(self):
        """lazy 创建 LazyImport 实例"""
        li = lazy("json")
        assert isinstance(li, LazyImport)
        assert li._loaded is False
