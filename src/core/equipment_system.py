"""装备加成系统 - 为装备系统预留属性加成接口"""
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class EquipmentBonus:
    """装备加成"""
    name: str = ""
    bonuses: dict[str, float] = field(default_factory=dict)  # {attr_name: bonus_value}
    percentage_bonuses: dict[str, float] = field(default_factory=dict)  # {attr_name: bonus_pct}

    def apply(self, base_values: dict[str, float]) -> dict[str, float]:
        """应用加成到基础值"""
        result = dict(base_values)
        for attr_name, bonus in self.bonuses.items():
            result[attr_name] = result.get(attr_name, 0) + bonus
        for attr_name, pct in self.percentage_bonuses.items():
            result[attr_name] = result.get(attr_name, 0) * (1 + pct / 100.0)
        return result


@dataclass
class EquipmentSlot:
    """装备槽"""
    slot_name: str = ""
    equipped_item: Optional[str] = None
    bonus: Optional[EquipmentBonus] = None


class EquipmentSystem:
    """装备加成系统"""

    def __init__(self):
        self.slots: dict[str, EquipmentSlot] = {}
        self.items: dict[str, EquipmentBonus] = {}
        self._setup_default_slots()

    def _setup_default_slots(self):
        """设置默认装备槽"""
        for slot in ["武器", "头盔", "胸甲", "手套", "靴子", "饰品", "戒指"]:
            self.slots[slot] = EquipmentSlot(slot_name=slot)

    def register_item(self, item_id: str, bonus: EquipmentBonus):
        """注册物品"""
        self.items[item_id] = bonus

    def equip_item(self, slot_name: str, item_id: str) -> bool:
        """装备物品"""
        if slot_name not in self.slots:
            return False
        if item_id not in self.items:
            return False

        slot = self.slots[slot_name]
        slot.equipped_item = item_id
        slot.bonus = self.items[item_id]
        return True

    def unequip_item(self, slot_name: str) -> bool:
        """卸下物品"""
        if slot_name not in self.slots:
            return False

        slot = self.slots[slot_name]
        slot.equipped_item = None
        slot.bonus = None
        return True

    def get_total_bonus(self) -> EquipmentBonus:
        """获取总加成"""
        total = EquipmentBonus(name="总装备加成")
        for slot in self.slots.values():
            if slot.bonus:
                for attr_name, bonus in slot.bonus.bonuses.items():
                    total.bonuses[attr_name] = total.bonuses.get(attr_name, 0) + bonus
                for attr_name, pct in slot.bonus.percentage_bonuses.items():
                    total.percentage_bonuses[attr_name] = total.percentage_bonuses.get(attr_name, 0) + pct
        return total

    def apply_to_base_values(self, base_values: dict[str, float]) -> dict[str, float]:
        """将装备加成应用到基础值"""
        total_bonus = self.get_total_bonus()
        return total_bonus.apply(base_values)

    def get_slot_names(self) -> list[str]:
        """获取所有装备槽名称"""
        return list(self.slots.keys())

    def get_equipped_items(self) -> dict[str, str]:
        """获取已装备的物品 {slot_name: item_id}"""
        return {
            slot_name: slot.equipped_item
            for slot_name, slot in self.slots.items()
            if slot.equipped_item
        }
