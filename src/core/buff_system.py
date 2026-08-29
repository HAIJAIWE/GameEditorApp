"""Buff效果系统 - 为Buff效果预留属性加成接口"""
from dataclasses import dataclass, field
from enum import Enum


class BuffType(Enum):
    """Buff类型"""
    POSITIVE = "positive"     # 增益
    NEGATIVE = "negative"     # 减益
    NEUTRAL = "neutral"       # 中性


@dataclass
class BuffEffect:
    """Buff效果"""
    name: str = ""
    buff_type: BuffType = BuffType.POSITIVE
    bonuses: dict[str, float] = field(default_factory=dict)  # {attr_name: bonus_value}
    percentage_bonuses: dict[str, float] = field(default_factory=dict)  # {attr_name: bonus_pct}
    duration: int = 0  # 持续回合数，0表示永久
    remaining_turns: int = 0
    is_permanent: bool = False

    def __post_init__(self):
        if self.is_permanent:
            self.remaining_turns = -1
        elif self.duration > 0:
            self.remaining_turns = self.duration

    def apply(self, base_values: dict[str, float]) -> dict[str, float]:
        """应用Buff效果到基础值"""
        result = dict(base_values)
        for attr_name, bonus in self.bonuses.items():
            result[attr_name] = result.get(attr_name, 0) + bonus
        for attr_name, pct in self.percentage_bonuses.items():
            result[attr_name] = result.get(attr_name, 0) * (1 + pct / 100.0)
        return result

    def tick(self) -> bool:
        """
        经过一个回合
        Returns: True if buff is still active, False if expired
        """
        if self.is_permanent:
            return True
        if self.remaining_turns <= 0:
            return False
        self.remaining_turns -= 1
        return self.remaining_turns > 0


class BuffSystem:
    """Buff效果系统"""

    def __init__(self):
        self.active_buffs: list[BuffEffect] = []
        self.buff_templates: dict[str, BuffEffect] = {}

    def register_buff_template(self, template_id: str, buff: BuffEffect):
        """注册Buff模板"""
        self.buff_templates[template_id] = buff

    def apply_buff(self, template_id: str, duration: int = 0, is_permanent: bool = False) -> bool:
        """应用Buff"""
        if template_id not in self.buff_templates:
            return False

        template = self.buff_templates[template_id]
        buff = BuffEffect(
            name=template.name,
            buff_type=template.buff_type,
            bonuses=dict(template.bonuses),
            percentage_bonuses=dict(template.percentage_bonuses),
            duration=duration if duration > 0 else template.duration,
            is_permanent=is_permanent or template.is_permanent,
        )
        self.active_buffs.append(buff)
        return True

    def remove_buff(self, buff_name: str) -> bool:
        """移除Buff"""
        for i, buff in enumerate(self.active_buffs):
            if buff.name == buff_name:
                self.active_buffs.pop(i)
                return True
        return False

    def tick_all(self) -> list[str]:
        """
        所有Buff经过一个回合
        Returns: 过期的Buff名称列表
        """
        expired = []
        remaining = []
        for buff in self.active_buffs:
            if buff.tick():
                remaining.append(buff)
            else:
                expired.append(buff.name)
        self.active_buffs = remaining
        return expired

    def get_total_bonus(self) -> BuffEffect:
        """获取总加成"""
        total = BuffEffect(name="总Buff加成")
        for buff in self.active_buffs:
            for attr_name, bonus in buff.bonuses.items():
                total.bonuses[attr_name] = total.bonuses.get(attr_name, 0) + bonus
            for attr_name, pct in buff.percentage_bonuses.items():
                total.percentage_bonuses[attr_name] = total.percentage_bonuses.get(attr_name, 0) + pct
        return total

    def apply_to_base_values(self, base_values: dict[str, float]) -> dict[str, float]:
        """将Buff加成应用到基础值"""
        result = dict(base_values)
        for buff in self.active_buffs:
            result = buff.apply(result)
        return result

    def get_active_buffs(self) -> list[dict]:
        """获取活跃Buff信息"""
        return [
            {
                "name": buff.name,
                "type": buff.buff_type.value,
                "remaining": buff.remaining_turns if not buff.is_permanent else "永久",
            }
            for buff in self.active_buffs
        ]
