"""EquipmentSystem 装备加成系统单元测试

覆盖 EquipmentBonus 效果计算、EquipmentSystem 槽位管理、装备穿脱与属性计算。
"""
import os
import sys

_PROJ_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_SRC = os.path.join(_PROJ_ROOT, "src")
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)

import pytest

from core.equipment_system import EquipmentBonus, EquipmentSlot, EquipmentSystem

# ── 辅助工厂 ──

def make_bonus(name="武器加成", bonuses=None, percentage_bonuses=None):
    return EquipmentBonus(
        name=name,
        bonuses=bonuses or {"攻击": 10},
        percentage_bonuses=percentage_bonuses or {},
    )


# ── EquipmentBonus 测试 ──

class TestEquipmentBonus:
    """EquipmentBonus 加成计算测试"""

    def test_creation_with_defaults(self):
        """默认值创建"""
        bonus = EquipmentBonus()
        assert bonus.name == ""
        assert bonus.bonuses == {}
        assert bonus.percentage_bonuses == {}

    def test_creation_with_all_params(self):
        """全参数创建"""
        bonus = EquipmentBonus(
            name="神器",
            bonuses={"攻击": 50, "防御": 20},
            percentage_bonuses={"暴击": 15},
        )
        assert bonus.name == "神器"
        assert bonus.bonuses == {"攻击": 50, "防御": 20}
        assert bonus.percentage_bonuses == {"暴击": 15}

    def test_apply_flat_bonus(self):
        """固定值加成"""
        bonus = make_bonus(bonuses={"攻击": 15})
        result = bonus.apply({"攻击": 100})
        assert result["攻击"] == 115

    def test_apply_percentage_bonus(self):
        """百分比加成"""
        bonus = EquipmentBonus(name="百分比", percentage_bonuses={"攻击": 20})
        result = bonus.apply({"攻击": 100})
        assert result["攻击"] == 120.0

    def test_apply_both_bonuses(self):
        """固定值 + 百分比 — 先加固定值，再乘百分比"""
        bonus = EquipmentBonus(
            name="复合",
            bonuses={"攻击": 20},
            percentage_bonuses={"攻击": 10},
        )
        result = bonus.apply({"攻击": 100})
        # 100 + 20 = 120, 120 * 1.1 = 132
        assert result["攻击"] == pytest.approx(132.0)

    def test_apply_to_missing_attr(self):
        """加成应用到基础值中不存在的属性"""
        bonus = make_bonus(bonuses={"魔法": 30})
        result = bonus.apply({"攻击": 100})
        assert result["魔法"] == 30

    def test_apply_does_not_mutate_input(self):
        """apply 不应修改输入字典"""
        bonus = make_bonus(bonuses={"攻击": 10})
        base = {"攻击": 100}
        bonus.apply(base)
        assert base["攻击"] == 100


# ── EquipmentSlot 测试 ──

class TestEquipmentSlot:
    """EquipmentSlot 装备槽测试"""

    def test_creation_with_defaults(self):
        """默认值创建"""
        slot = EquipmentSlot()
        assert slot.slot_name == ""
        assert slot.equipped_item is None
        assert slot.bonus is None

    def test_creation_with_name(self):
        """指定槽位名"""
        slot = EquipmentSlot(slot_name="武器")
        assert slot.slot_name == "武器"
        assert slot.equipped_item is None

    def test_creation_with_equipped(self):
        """已装备状态"""
        bonus = make_bonus()
        slot = EquipmentSlot(slot_name="武器", equipped_item="sword_01", bonus=bonus)
        assert slot.equipped_item == "sword_01"
        assert slot.bonus is not None


# ── EquipmentSystem 槽位管理测试 ──

class TestEquipmentSystemSlots:
    """EquipmentSystem 默认槽位与槽位查询测试"""

    def test_default_slots_initialized(self):
        """初始化时创建 7 个默认槽位"""
        system = EquipmentSystem()
        expected = ["武器", "头盔", "胸甲", "手套", "靴子", "饰品", "戒指"]
        assert set(system.get_slot_names()) == set(expected)

    def test_all_slots_empty_initially(self):
        """初始所有槽位为空"""
        system = EquipmentSystem()
        for slot in system.slots.values():
            assert slot.equipped_item is None
            assert slot.bonus is None

    def test_get_slot_names(self):
        """get_slot_names 返回槽位名列表"""
        system = EquipmentSystem()
        names = system.get_slot_names()
        assert len(names) == 7
        assert "武器" in names

    def test_get_equipped_items_empty(self):
        """无装备时 get_equipped_items 返回空字典"""
        system = EquipmentSystem()
        assert system.get_equipped_items() == {}


# ── EquipmentSystem 装备穿脱测试 ──

class TestEquipmentSystemEquip:
    """EquipmentSystem 装备/卸下测试"""

    def test_register_and_equip_item(self):
        """注册物品并装备"""
        system = EquipmentSystem()
        system.register_item("sword_01", make_bonus(name="铁剑", bonuses={"攻击": 15}))

        result = system.equip_item("武器", "sword_01")
        assert result is True
        assert system.slots["武器"].equipped_item == "sword_01"
        assert system.slots["武器"].bonus is not None
        assert system.slots["武器"].bonus.name == "铁剑"

    def test_equip_nonexistent_slot(self):
        """装备到不存在的槽位 — 返回 False"""
        system = EquipmentSystem()
        system.register_item("sword_01", make_bonus())
        assert system.equip_item("不存在的槽", "sword_01") is False

    def test_equip_nonexistent_item(self):
        """装备未注册的物品 — 返回 False"""
        system = EquipmentSystem()
        assert system.equip_item("武器", "nonexistent_item") is False

    def test_equip_replaces_existing(self):
        """替换已装备的物品"""
        system = EquipmentSystem()
        system.register_item("sword_01", make_bonus(name="铁剑", bonuses={"攻击": 10}))
        system.register_item("sword_02", make_bonus(name="神剑", bonuses={"攻击": 50}))

        system.equip_item("武器", "sword_01")
        system.equip_item("武器", "sword_02")

        assert system.slots["武器"].equipped_item == "sword_02"
        assert system.slots["武器"].bonus.name == "神剑"

    def test_unequip_item(self):
        """卸下装备"""
        system = EquipmentSystem()
        system.register_item("sword_01", make_bonus())
        system.equip_item("武器", "sword_01")

        result = system.unequip_item("武器")
        assert result is True
        assert system.slots["武器"].equipped_item is None
        assert system.slots["武器"].bonus is None

    def test_unequip_empty_slot(self):
        """卸下空槽位 — 返回 True（无副作用）"""
        system = EquipmentSystem()
        result = system.unequip_item("武器")
        assert result is True
        assert system.slots["武器"].equipped_item is None

    def test_unequip_nonexistent_slot(self):
        """卸下不存在的槽位 — 返回 False"""
        system = EquipmentSystem()
        assert system.unequip_item("不存在的槽") is False

    def test_get_equipped_items_after_equipping(self):
        """装备后 get_equipped_items 返回已装备映射"""
        system = EquipmentSystem()
        system.register_item("sword_01", make_bonus())
        system.register_item("helm_01", make_bonus(name="头盔", bonuses={"防御": 5}))
        system.equip_item("武器", "sword_01")
        system.equip_item("头盔", "helm_01")

        equipped = system.get_equipped_items()
        assert equipped == {"武器": "sword_01", "头盔": "helm_01"}


# ── EquipmentSystem 属性计算测试 ──

class TestEquipmentSystemBonus:
    """EquipmentSystem 属性加成计算测试"""

    def test_get_total_bonus_empty(self):
        """无装备时总加成为空"""
        system = EquipmentSystem()
        total = system.get_total_bonus()
        assert total.bonuses == {}
        assert total.percentage_bonuses == {}

    def test_get_total_bonus_single_slot(self):
        """单件装备的总加成"""
        system = EquipmentSystem()
        system.register_item("sword", make_bonus(bonuses={"攻击": 20}))
        system.equip_item("武器", "sword")

        total = system.get_total_bonus()
        assert total.bonuses == {"攻击": 20}

    def test_get_total_bonus_multiple_slots(self):
        """多件装备的总加成累加"""
        system = EquipmentSystem()
        system.register_item("sword", make_bonus(bonuses={"攻击": 20}))
        system.register_item("helm", make_bonus(name="头盔", bonuses={"防御": 10, "生命": 50}))
        system.equip_item("武器", "sword")
        system.equip_item("头盔", "helm")

        total = system.get_total_bonus()
        assert total.bonuses == {"攻击": 20, "防御": 10, "生命": 50}

    def test_get_total_bonus_sums_same_attr(self):
        """多件装备加成同一属性 — 累加"""
        system = EquipmentSystem()
        system.register_item("sword", make_bonus(bonuses={"攻击": 20}))
        system.register_item("ring", make_bonus(name="戒指", bonuses={"攻击": 5}))
        system.equip_item("武器", "sword")
        system.equip_item("戒指", "ring")

        total = system.get_total_bonus()
        assert total.bonuses["攻击"] == 25

    def test_get_total_bonus_with_percentages(self):
        """百分比加成累加"""
        system = EquipmentSystem()
        system.register_item("ring1", EquipmentBonus(
            name="戒指1", percentage_bonuses={"攻击": 10},
        ))
        system.register_item("ring2", EquipmentBonus(
            name="戒指2", percentage_bonuses={"攻击": 5},
        ))
        system.equip_item("戒指", "ring1")
        system.equip_item("饰品", "ring2")

        total = system.get_total_bonus()
        assert total.percentage_bonuses["攻击"] == 15

    def test_apply_to_base_values_empty(self):
        """无装备时返回原始值"""
        system = EquipmentSystem()
        result = system.apply_to_base_values({"攻击": 100})
        assert result == {"攻击": 100}

    def test_apply_to_base_values_with_equipment(self):
        """装备加成应用到基础值"""
        system = EquipmentSystem()
        system.register_item("sword", EquipmentBonus(
            name="剑", bonuses={"攻击": 20}, percentage_bonuses={"攻击": 10},
        ))
        system.equip_item("武器", "sword")

        result = system.apply_to_base_values({"攻击": 100})
        # get_total_bonus: bonuses={"攻击":20}, pct={"攻击":10}
        # apply: 100 + 20 = 120, 120 * 1.1 = 132
        assert result["攻击"] == pytest.approx(132.0)

    def test_apply_to_base_values_does_not_mutate_input(self):
        """不应修改输入字典"""
        system = EquipmentSystem()
        system.register_item("sword", make_bonus(bonuses={"攻击": 10}))
        system.equip_item("武器", "sword")

        base = {"攻击": 100}
        system.apply_to_base_values(base)
        assert base["攻击"] == 100

    def test_apply_to_base_values_multiple_equipment(self):
        """多件装备加成应用到基础值"""
        system = EquipmentSystem()
        system.register_item("sword", make_bonus(bonuses={"攻击": 20}))
        system.register_item("helm", make_bonus(name="头盔", bonuses={"防御": 10}))
        system.equip_item("武器", "sword")
        system.equip_item("头盔", "helm")

        result = system.apply_to_base_values({"攻击": 100, "防御": 50})
        assert result["攻击"] == 120
        assert result["防御"] == 60

    def test_unequip_removes_bonus_from_total(self):
        """卸下装备后总加成不再包含该装备"""
        system = EquipmentSystem()
        system.register_item("sword", make_bonus(bonuses={"攻击": 20}))
        system.equip_item("武器", "sword")
        assert system.get_total_bonus().bonuses == {"攻击": 20}

        system.unequip_item("武器")
        assert system.get_total_bonus().bonuses == {}
