"""属性系统单元测试"""
import os
import sys

_PROJ_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_SRC = os.path.join(_PROJ_ROOT, 'src')
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)

from core.attr_system import AttributeSystem, AttrType, CircularDependencyError


def test_basic_calculation():
    """测试基础计算功能"""
    system = AttributeSystem()

    # 设置基础属性值
    base_values = {
        "力量": 10,
        "智力": 8,
        "敏捷": 12,
        "体质": 15,
    }

    # 计算所有属性
    results = system.calculate_all(base_values)

    # 验证结果
    expected_hp = 10*10 + 15*20 + 12*5  # 460
    assert abs(results["HP"] - expected_hp) < 0.1, f"HP 计算错误: 期望 {expected_hp}, 实际 {results['HP']}"

    expected_mp = 8*15 + 15*5  # 195
    assert abs(results["MP"] - expected_mp) < 0.1, f"MP 计算错误: 期望 {expected_mp}, 实际 {results['MP']}"

    expected_attack = 10*2 + 12*1  # 32
    assert abs(results["物攻"] - expected_attack) < 0.1, f"物攻计算错误: 期望 {expected_attack}, 实际 {results['物攻']}"

    print("✅ 基础计算测试通过")


def test_formula_string():
    """测试公式字符串生成"""
    system = AttributeSystem()
    hp_attr = system.attributes["HP"]

    formula_str = hp_attr.formula.to_string("HP")
    print(f"HP 公式: {formula_str}")
    assert "力量" in formula_str
    assert "体质" in formula_str
    print("✅ 公式字符串测试通过")


def test_circular_dependency():
    """测试循环依赖检测"""
    system = AttributeSystem()

    # 创建循环依赖：A -> B -> A
    system.attributes["A"] = system.attributes.get("力量")  # 复用已有的
    from core.attr_system import AttributeDefinition
    system.attributes["TestA"] = AttributeDefinition("TestA", AttrType.DERIVED)
    system.attributes["TestA"].formula.coefficients = {"TestB": 1}
    system.attributes["TestB"] = AttributeDefinition("TestB", AttrType.DERIVED)
    system.attributes["TestB"].formula.coefficients = {"TestA": 1}

    try:
        system.calculate_all({"力量": 10})
        raise AssertionError("循环依赖检测失败：未抛出 CircularDependencyError")
    except CircularDependencyError:
        assert True


def test_add_remove_attribute():
    """测试添加/删除属性"""
    system = AttributeSystem()
    initial_count = len(system.attributes)

    # 添加新属性
    system.add_attribute("物理穿透", AttrType.COMBAT, "战斗属性")
    assert len(system.attributes) == initial_count + 1
    assert "物理穿透" in system.attributes
    print("✅ 添加属性测试通过")

    # 删除属性
    system.remove_attribute("物理穿透")
    assert len(system.attributes) == initial_count
    assert "物理穿透" not in system.attributes
    print("✅ 删除属性测试通过")


def test_rename_attribute():
    """测试重命名属性"""
    system = AttributeSystem()

    # 重命名
    system.rename_attribute("力量", "攻击力")
    assert "攻击力" in system.attributes
    assert "力量" not in system.attributes
    print("✅ 重命名属性测试通过")

    # 恢复原名
    system.rename_attribute("攻击力", "力量")
    assert "力量" in system.attributes


def test_json_serialization():
    """测试JSON序列化"""
    system = AttributeSystem()

    # 序列化
    data = system.to_dict()
    assert "HP" in data
    assert data["HP"]["type"] == "derived"
    print("✅ JSON序列化测试通过")

    # 反序列化
    restored = AttributeSystem.from_dict(data)
    assert len(restored.attributes) == len(system.attributes)
    assert restored.attributes["HP"].formula.coefficients == system.attributes["HP"].formula.coefficients
    print("✅ JSON反序列化测试通过")


def test_comprehensive():
    """综合测试"""
    print("\n=== 开始综合测试 ===\n")

    # 1. 创建系统
    system = AttributeSystem()
    print(f"✅ 创建属性系统，共 {len(system.attributes)} 个属性")

    # 2. 设置基础值
    base_values = {"力量": 20, "智力": 15, "敏捷": 18, "体质": 25}
    print(f"✅ 设置基础属性: {base_values}")

    # 3. 计算所有
    results = system.calculate_all(base_values)
    print("✅ 计算完成:")
    for name, value in results.items():
        attr = system.attributes[name]
        print(f"   {attr.display_name}: {value:.1f}")

    # 4. 添加自定义属性
    system.add_attribute("物理穿透", AttrType.COMBAT, "战斗属性")
    system.attributes["物理穿透"].formula.coefficients = {"力量": 0.5, "敏捷": 0.3}
    print("\n✅ 添加自定义属性 '物理穿透'")

    # 5. 重新计算
    results = system.calculate_all(base_values)
    print(f"✅ 重新计算后 物理穿透 = {results['物理穿透']:.1f}")

    # 6. 验证
    expected_penetration = 20*0.5 + 18*0.3  # 15.4
    assert abs(results["物理穿透"] - expected_penetration) < 0.1
    print(f"✅ 验证通过：期望 {expected_penetration}, 实际 {results['物理穿透']:.1f}")

    print("\n=== 综合测试全部通过！===")


if __name__ == "__main__":
    print("=" * 50)
    print("属性系统单元测试")
    print("=" * 50)

    test_basic_calculation()
    test_formula_string()
    test_circular_dependency()
    test_add_remove_attribute()
    test_rename_attribute()
    test_json_serialization()
    test_comprehensive()

    print("\n" + "=" * 50)
    print("所有测试通过！✅")
    print("=" * 50)
