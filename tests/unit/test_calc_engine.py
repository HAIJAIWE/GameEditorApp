"""属性计算引擎单元测试"""
import os
import sys

_PROJ_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_SRC = os.path.join(_PROJ_ROOT, 'src')
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)

import pytest

from common.graph import CircularDependencyError
from core.calc_engine import AttributeCalcEngine


class TestSetAndGetBaseValue:
    """基础属性值设置与获取测试"""

    def test_set_and_get_base_value(self):
        """设置并获取基础属性值"""
        engine = AttributeCalcEngine()
        engine.set_base_value("力量", 100)
        assert engine.get_base_value("力量") == 100

    def test_get_nonexistent_base_value(self):
        """获取未设置的基础属性值应返回 0"""
        engine = AttributeCalcEngine()
        assert engine.get_base_value("不存在") == 0


class TestTopologicalSort:
    """拓扑排序测试"""

    def test_topological_sort(self):
        """依赖关系应该被正确排序"""
        engine = AttributeCalcEngine()
        engine.set_attr_def("力量", "base", {})
        engine.set_attr_def("体质", "base", {})
        engine.set_attr_def("HP", "derived", {"力量": 10, "体质": 20})
        engine.set_attr_def("攻击力", "derived", {"力量": 2})

        result = engine.topological_sort()
        # 基础属性应该在派生属性之前
        assert result.index("力量") < result.index("HP")
        assert result.index("体质") < result.index("HP")
        assert result.index("力量") < result.index("攻击力")

    def test_circular_dependency(self):
        """循环依赖应该抛出异常"""
        engine = AttributeCalcEngine()
        engine.set_attr_def("A", "derived", {"B": 1})
        engine.set_attr_def("B", "derived", {"A": 1})
        with pytest.raises(CircularDependencyError):
            engine.topological_sort()


class TestCalculateAll:
    """全量计算测试"""

    def test_calculate_all(self):
        """派生属性应该从基础属性值计算得出"""
        engine = AttributeCalcEngine()
        engine.set_attr_def("力量", "base", {})
        engine.set_attr_def("体质", "base", {})
        engine.set_attr_def("HP", "derived", {"力量": 10, "体质": 20})
        engine.set_attr_def("攻击力", "derived", {"力量": 2})

        engine.set_base_value("力量", 50)
        engine.set_base_value("体质", 30)

        results = engine.calculate_all()
        assert results["力量"] == 50
        assert results["体质"] == 30
        assert results["HP"] == 50 * 10 + 30 * 20  # 500 + 600 = 1100
        assert results["攻击力"] == 50 * 2  # 100


class TestRemoveAttr:
    """属性删除测试"""

    def test_remove_attr(self):
        """删除属性应该清理公式引用"""
        engine = AttributeCalcEngine()
        engine.set_attr_def("力量", "base", {})
        engine.set_attr_def("HP", "derived", {"力量": 10})

        engine.remove_attr("力量")

        # 力量应该被删除
        assert "力量" not in engine.attrs
        # HP 的公式中不应再引用力量
        assert "力量" not in engine.attrs["HP"]["formula"]

    def test_remove_attr_cleans_formula_references(self):
        """删除属性后其他属性公式中的引用应被清理"""
        engine = AttributeCalcEngine()
        engine.set_attr_def("str", "base", {})
        engine.set_attr_def("con", "base", {})
        engine.set_attr_def("hp", "derived", {"str": 10, "con": 20})

        engine.remove_attr("str")

        assert "str" not in engine.attrs["hp"]["formula"]
        assert "con" in engine.attrs["hp"]["formula"]
