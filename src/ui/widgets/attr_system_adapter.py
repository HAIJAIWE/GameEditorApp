"""属性系统集成适配器 - 桥接新旧系统"""
import sys

sys.path.insert(0, r'd:\游戏项目\角色技能库\GameEditorApp')

from core.attr_system import AttributeSystem, AttrType, Formula


class AttrSystemAdapter:
    """
    属性系统适配器 - 将新系统适配到旧系统接口
    
    功能：
    1. 从旧系统数据加载到新系统
    2. 从新系统数据导出到旧系统格式
    3. 保持向后兼容
    """

    @staticmethod
    def from_legacy_data(legacy_data: dict) -> AttributeSystem:
        """
        从旧系统数据加载到新系统
        
        旧系统数据格式：
        {
            'attr_list': [
                {"name": "力量", "category": "基础", "formula": "5"},
                {"name": "HP", "category": "派生", "formula": "=力量*10+体质*20+敏捷*5"},
                ...
            ]
        }
        """
        system = AttributeSystem()
        system.attributes.clear()  # 清空默认属性

        attr_list = legacy_data.get('attr_list', [])

        for item in attr_list:
            if not isinstance(item, dict):
                continue

            name = item.get('name', '').strip()
            if not name:
                continue

            category = item.get('category', '自定义')
            formula_str = item.get('formula', '0')

            # 确定属性类型
            if category in ('基础',):
                attr_type = AttrType.BASE
            elif category in ('战斗',):
                attr_type = AttrType.COMBAT
            else:
                attr_type = AttrType.DERIVED

            # 创建属性定义
            from core.attr_system import AttributeDefinition
            attr = AttributeDefinition(
                name=name,
                attr_type=attr_type,
                category=category,
                display_name=name
            )

            # 解析公式
            if attr_type == AttrType.BASE:
                # 基础属性的公式是常数
                try:
                    attr.formula.base_value = float(formula_str)
                except (ValueError, TypeError):
                    attr.formula.base_value = 0
            else:
                # 派生/战斗属性的公式是表达式
                attr.formula = Formula.from_legacy_string(formula_str, [])

            system.attributes[name] = attr

        return system

    @staticmethod
    def to_legacy_data(system: AttributeSystem) -> dict:
        """
        从新系统数据导出到旧系统格式
        
        返回旧系统数据格式：
        {
            'attr_list': [
                {"name": "力量", "category": "基础", "formula": "5"},
                {"name": "HP", "category": "派生", "formula": "=力量*10+体质*20+敏捷*5"},
                ...
            ]
        }
        """
        attr_list = []

        for name, attr in system.attributes.items():
            if attr.attr_type == AttrType.BASE:
                # 基础属性：公式是常数
                val = attr.formula.base_value
                formula_str = str(int(val)) if val == int(val) else str(val)
            else:
                # 派生/战斗属性：公式是表达式
                # 去掉开头的 "= "，使其与旧格式一致
                formula_str = attr.formula.to_legacy_string()
                if formula_str.startswith("= "):
                    formula_str = "=" + formula_str[2:]

            # 映射类别
            category_map = {
                AttrType.BASE: '基础',
                AttrType.DERIVED: '派生',
                AttrType.COMBAT: '战斗',
            }
            category = category_map.get(attr.attr_type, '自定义')

            attr_list.append({
                'name': attr.display_name or attr.name,
                'category': category,
                'formula': formula_str,
            })

        return {'attr_list': attr_list}


def test_adapter():
    """测试适配器功能"""
    print("=" * 60)
    print("测试属性系统适配器")
    print("=" * 60)

    # 1. 旧系统数据
    legacy_data = {
        'attr_list': [
            {"name": "力量", "category": "基础", "formula": "20"},
            {"name": "智力", "category": "基础", "formula": "15"},
            {"name": "敏捷", "category": "基础", "formula": "18"},
            {"name": "体质", "category": "基础", "formula": "25"},
            {"name": "HP", "category": "派生", "formula": "=力量*10+体质*20+敏捷*5"},
            {"name": "MP", "category": "派生", "formula": "=智力*15+体质*5"},
            {"name": "物攻", "category": "派生", "formula": "=力量*2+敏捷*1"},
            {"name": "暴击率", "category": "战斗", "formula": "=8.0"},
        ]
    }

    print("\n【1. 旧系统数据】")
    print(f"属性数量: {len(legacy_data['attr_list'])}")
    for item in legacy_data['attr_list']:
        print(f"  {item['name']} ({item['category']}): {item['formula']}")

    # 2. 加载到新系统
    print("\n【2. 加载到新系统】")
    system = AttrSystemAdapter.from_legacy_data(legacy_data)
    print(f"属性数量: {len(system.attributes)}")
    for name, attr in system.attributes.items():
        print(f"  {name} ({attr.category}): {attr.formula.to_legacy_string()}")

    # 3. 计算测试
    print("\n【3. 计算测试】")
    # 注意：新系统需要显式设置基础属性值
    base_values = {
        "力量": 20,
        "智力": 15,
        "敏捷": 18,
        "体质": 25,
    }
    results = system.calculate_all(base_values)
    print(f"HP = {results.get('HP', 0):.1f}")
    print(f"MP = {results.get('MP', 0):.1f}")
    print(f"物攻 = {results.get('物攻', 0):.1f}")

    # 4. 导出回旧系统
    print("\n【4. 导出回旧系统】")
    new_legacy_data = AttrSystemAdapter.to_legacy_data(system)
    print(f"属性数量: {len(new_legacy_data['attr_list'])}")
    for item in new_legacy_data['attr_list']:
        print(f"  {item['name']} ({item['category']}): {item['formula']}")

    # 5. 验证数据一致性
    print("\n【5. 验证数据一致性】")
    original_attrs = {item['name']: item for item in legacy_data['attr_list']}
    exported_attrs = {item['name']: item for item in new_legacy_data['attr_list']}

    consistent = True
    for name in original_attrs:
        if name in exported_attrs:
            if original_attrs[name]['formula'] != exported_attrs[name]['formula']:
                print(f"  不一致: {name}")
                print(f"    原始: {original_attrs[name]['formula']}")
                print(f"    导出: {exported_attrs[name]['formula']}")
                consistent = False

    if consistent:
        print("  数据完全一致！")

    print("\n" + "=" * 60)
    print("适配器测试完成！")
    print("=" * 60)


if __name__ == "__main__":
    test_adapter()
