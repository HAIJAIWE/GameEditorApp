"""BuffSystem Buff效果系统单元测试

覆盖 BuffEffect 的创建、叠加、过期、效果计算，以及 BuffSystem 的模板管理与应用。
"""
import os
import sys

_PROJ_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_SRC = os.path.join(_PROJ_ROOT, "src")
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)

import pytest

from core.buff_system import BuffEffect, BuffSystem, BuffType

# ── 辅助工厂 ──

def make_buff(name="攻击增益", buff_type=BuffType.POSITIVE,
              bonuses=None, percentage_bonuses=None,
              duration=3, is_permanent=False):
    return BuffEffect(
        name=name,
        buff_type=buff_type,
        bonuses=bonuses or {"攻击": 10},
        percentage_bonuses=percentage_bonuses or {},
        duration=duration,
        is_permanent=is_permanent,
    )


# ── BuffEffect 测试 ──

class TestBuffEffectCreation:
    """BuffEffect 创建与属性测试"""

    def test_creation_with_defaults(self):
        """默认值创建"""
        buff = BuffEffect()
        assert buff.name == ""
        assert buff.buff_type == BuffType.POSITIVE
        assert buff.bonuses == {}
        assert buff.percentage_bonuses == {}
        assert buff.duration == 0
        assert buff.is_permanent is False

    def test_creation_with_all_params(self):
        """全参数创建"""
        buff = BuffEffect(
            name="狂暴",
            buff_type=BuffType.NEGATIVE,
            bonuses={"攻击": 20},
            percentage_bonuses={"速度": -10},
            duration=5,
        )
        assert buff.name == "狂暴"
        assert buff.buff_type == BuffType.NEGATIVE
        assert buff.bonuses == {"攻击": 20}
        assert buff.percentage_bonuses == {"速度": -10}
        assert buff.duration == 5
        assert buff.remaining_turns == 5

    def test_post_init_permanent(self):
        """永久 buff — remaining_turns 设为 -1"""
        buff = BuffEffect(name="永久增益", is_permanent=True)
        assert buff.remaining_turns == -1

    def test_post_init_with_duration(self):
        """有持续时间的 buff — remaining_turns = duration"""
        buff = BuffEffect(name="临时增益", duration=5)
        assert buff.remaining_turns == 5

    def test_post_init_no_duration_not_permanent(self):
        """无持续时间且非永久 — remaining_turns = 0"""
        buff = BuffEffect(name="无持续")
        assert buff.remaining_turns == 0

    def test_buff_type_values(self):
        """BuffType 枚举值"""
        assert BuffType.POSITIVE.value == "positive"
        assert BuffType.NEGATIVE.value == "negative"
        assert BuffType.NEUTRAL.value == "neutral"


class TestBuffEffectApply:
    """BuffEffect.apply 效果计算测试"""

    def test_apply_flat_bonus(self):
        """固定值加成"""
        buff = BuffEffect(name="力量增益", bonuses={"攻击": 15})
        result = buff.apply({"攻击": 100})
        assert result["攻击"] == 115

    def test_apply_percentage_bonus(self):
        """百分比加成"""
        buff = BuffEffect(name="狂暴", percentage_bonuses={"攻击": 20})
        result = buff.apply({"攻击": 100})
        assert result["攻击"] == 120.0

    def test_apply_both_bonuses(self):
        """固定值 + 百分比同时生效 — 先加固定值，再乘百分比"""
        buff = BuffEffect(
            name="复合增益",
            bonuses={"攻击": 20},
            percentage_bonuses={"攻击": 10},
        )
        result = buff.apply({"攻击": 100})
        # 100 + 20 = 120, 120 * 1.1 = 132
        assert result["攻击"] == pytest.approx(132.0)

    def test_apply_to_missing_attr(self):
        """加成应用到基础值中不存在的属性 — 从 0 开始"""
        buff = BuffEffect(name="新属性", bonuses={"魔法": 30})
        result = buff.apply({"攻击": 100})
        assert result["魔法"] == 30
        assert result["攻击"] == 100

    def test_apply_does_not_mutate_input(self):
        """apply 不应修改输入字典"""
        buff = BuffEffect(name="增益", bonuses={"攻击": 10})
        base = {"攻击": 100}
        buff.apply(base)
        assert base["攻击"] == 100

    def test_apply_negative_percentage(self):
        """负百分比加成（减益）"""
        buff = BuffEffect(
            name="减速",
            buff_type=BuffType.NEGATIVE,
            percentage_bonuses={"速度": -50},
        )
        result = buff.apply({"速度": 100})
        assert result["速度"] == 50.0


class TestBuffEffectTick:
    """BuffEffect.tick 过期处理测试"""

    def test_tick_permanent_buff(self):
        """永久 buff — tick 始终返回 True"""
        buff = BuffEffect(name="永久", is_permanent=True)
        for _ in range(10):
            assert buff.tick() is True

    def test_tick_expires_after_duration(self):
        """有持续时间的 buff — duration 次后过期"""
        buff = BuffEffect(name="临时", duration=3)
        assert buff.remaining_turns == 3
        # tick 1: remaining 2 → True
        assert buff.tick() is True
        # tick 2: remaining 1 → True
        assert buff.tick() is True
        # tick 3: remaining 0 → False (expired)
        assert buff.tick() is False

    def test_tick_already_expired(self):
        """已过期的 buff — tick 返回 False"""
        buff = BuffEffect(name="已过期", duration=0)
        assert buff.remaining_turns == 0
        assert buff.tick() is False

    def test_tick_decrements_remaining(self):
        """tick 递减 remaining_turns"""
        buff = BuffEffect(name="倒计时", duration=5)
        buff.tick()
        assert buff.remaining_turns == 4
        buff.tick()
        assert buff.remaining_turns == 3


# ── BuffSystem 测试 ──

class TestBuffSystemTemplates:
    """BuffSystem 模板管理测试"""

    def test_register_and_apply_template(self):
        """注册模板并应用"""
        system = BuffSystem()
        template = make_buff(name="攻击增益", bonuses={"攻击": 10}, duration=3)
        system.register_buff_template("atk_buff", template)
        assert "atk_buff" in system.buff_templates

        result = system.apply_buff("atk_buff")
        assert result is True
        assert len(system.active_buffs) == 1
        assert system.active_buffs[0].name == "攻击增益"

    def test_apply_nonexistent_template(self):
        """应用不存在的模板 — 返回 False"""
        system = BuffSystem()
        assert system.apply_buff("nonexistent") is False
        assert len(system.active_buffs) == 0

    def test_apply_buff_with_custom_duration(self):
        """应用 buff 时覆盖持续时间"""
        system = BuffSystem()
        template = make_buff(name="增益", duration=3)
        system.register_buff_template("buff1", template)

        system.apply_buff("buff1", duration=10)
        assert system.active_buffs[0].remaining_turns == 10
        assert system.active_buffs[0].duration == 10

    def test_apply_buff_as_permanent(self):
        """应用 buff 时设为永久"""
        system = BuffSystem()
        template = make_buff(name="增益", duration=3)
        system.register_buff_template("buff1", template)

        system.apply_buff("buff1", is_permanent=True)
        assert system.active_buffs[0].is_permanent is True
        assert system.active_buffs[0].remaining_turns == -1

    def test_apply_buff_copies_template_data(self):
        """应用 buff 时复制模板数据，不共享引用"""
        system = BuffSystem()
        template = make_buff(name="增益", bonuses={"攻击": 10})
        system.register_buff_template("buff1", template)

        system.apply_buff("buff1")
        active = system.active_buffs[0]
        active.bonuses["攻击"] = 999
        # 模板不受影响
        assert template.bonuses["攻击"] == 10


class TestBuffSystemStacking:
    """BuffSystem 叠加规则测试"""

    def test_same_name_buffs_stack(self):
        """同名 buff 可叠加（都加入 active_buffs）"""
        system = BuffSystem()
        template = make_buff(name="攻击增益", bonuses={"攻击": 10}, duration=3)
        system.register_buff_template("atk", template)

        system.apply_buff("atk")
        system.apply_buff("atk")
        assert len(system.active_buffs) == 2

    def test_different_name_buffs_coexist(self):
        """不同名 buff 共存"""
        system = BuffSystem()
        system.register_buff_template("atk", make_buff(name="攻击增益", bonuses={"攻击": 10}))
        system.register_buff_template("def", make_buff(name="防御增益", bonuses={"防御": 5}))

        system.apply_buff("atk")
        system.apply_buff("def")
        assert len(system.active_buffs) == 2
        names = {b.name for b in system.active_buffs}
        assert names == {"攻击增益", "防御增益"}

    def test_same_name_bonus_sums_in_total(self):
        """同名 buff 的加成在 get_total_bonus 中累加"""
        system = BuffSystem()
        system.register_buff_template("atk", make_buff(name="攻击增益", bonuses={"攻击": 10}))
        system.apply_buff("atk")
        system.apply_buff("atk")

        total = system.get_total_bonus()
        assert total.bonuses["攻击"] == 20


class TestBuffSystemRemove:
    """BuffSystem.remove_buff 测试"""

    def test_remove_existing_buff(self):
        """移除存在的 buff"""
        system = BuffSystem()
        system.register_buff_template("atk", make_buff(name="攻击增益"))
        system.apply_buff("atk")
        assert len(system.active_buffs) == 1

        result = system.remove_buff("攻击增益")
        assert result is True
        assert len(system.active_buffs) == 0

    def test_remove_nonexistent_buff(self):
        """移除不存在的 buff — 返回 False"""
        system = BuffSystem()
        result = system.remove_buff("不存在")
        assert result is False

    def test_remove_only_first_matching(self):
        """同名 buff 只移除第一个"""
        system = BuffSystem()
        system.register_buff_template("atk", make_buff(name="攻击增益"))
        system.apply_buff("atk")
        system.apply_buff("atk")
        assert len(system.active_buffs) == 2

        system.remove_buff("攻击增益")
        assert len(system.active_buffs) == 1


class TestBuffSystemTickAll:
    """BuffSystem.tick_all 过期处理测试"""

    def test_tick_all_returns_expired_names(self):
        """tick_all 返回过期 buff 的名称列表"""
        system = BuffSystem()
        system.register_buff_template("short", make_buff(name="短增益", duration=1))
        system.register_buff_template("long", make_buff(name="长增益", duration=3))
        system.apply_buff("short")
        system.apply_buff("long")

        expired = system.tick_all()
        # short (duration=1): tick → remaining=0 → expired
        assert "短增益" in expired
        assert "长增益" not in expired
        assert len(system.active_buffs) == 1

    def test_tick_all_empty_list(self):
        """空 buff 列表 — tick_all 返回空列表"""
        system = BuffSystem()
        expired = system.tick_all()
        assert expired == []

    def test_tick_all_permanent_not_expired(self):
        """永久 buff 不会过期"""
        system = BuffSystem()
        system.register_buff_template("perm", make_buff(name="永久增益", is_permanent=True))
        system.apply_buff("perm")

        for _ in range(10):
            expired = system.tick_all()
            assert expired == []
        assert len(system.active_buffs) == 1

    def test_tick_all_all_expired(self):
        """所有 buff 过期"""
        system = BuffSystem()
        system.register_buff_template("b1", make_buff(name="增益1", duration=1))
        system.register_buff_template("b2", make_buff(name="增益2", duration=1))
        system.apply_buff("b1")
        system.apply_buff("b2")

        expired = system.tick_all()
        assert len(expired) == 2
        assert len(system.active_buffs) == 0


class TestBuffSystemApplyToBase:
    """BuffSystem.apply_to_base_values 测试"""

    def test_apply_to_base_single_buff(self):
        """单个 buff 应用到基础值"""
        system = BuffSystem()
        system.register_buff_template("atk", make_buff(
            name="攻击增益", bonuses={"攻击": 20}, percentage_bonuses={},
        ))
        system.apply_buff("atk")

        result = system.apply_to_base_values({"攻击": 100})
        assert result["攻击"] == 120

    def test_apply_to_base_multiple_buffs(self):
        """多个 buff 顺序应用"""
        system = BuffSystem()
        system.register_buff_template("flat", BuffEffect(
            name="固定加成", bonuses={"攻击": 20},
        ))
        system.register_buff_template("pct", BuffEffect(
            name="百分比加成", percentage_bonuses={"攻击": 10},
        ))
        system.apply_buff("flat")
        system.apply_buff("pct")

        result = system.apply_to_base_values({"攻击": 100})
        # flat: 100 + 20 = 120
        # pct: 120 * 1.1 = 132
        assert result["攻击"] == pytest.approx(132.0)

    def test_apply_to_base_empty(self):
        """无 buff 时返回原始值"""
        system = BuffSystem()
        result = system.apply_to_base_values({"攻击": 100, "防御": 50})
        assert result == {"攻击": 100, "防御": 50}

    def test_apply_to_base_does_not_mutate_input(self):
        """不应修改输入字典"""
        system = BuffSystem()
        system.register_buff_template("atk", make_buff(name="增益", bonuses={"攻击": 10}))
        system.apply_buff("atk")

        base = {"攻击": 100}
        system.apply_to_base_values(base)
        assert base["攻击"] == 100


class TestBuffSystemGetActiveBuffs:
    """BuffSystem.get_active_buffs 测试"""

    def test_get_active_buffs_format(self):
        """获取活跃 buff 信息格式"""
        system = BuffSystem()
        system.register_buff_template("atk", make_buff(name="攻击增益", duration=3))
        system.apply_buff("atk")

        info = system.get_active_buffs()
        assert len(info) == 1
        assert info[0]["name"] == "攻击增益"
        assert info[0]["type"] == "positive"
        assert info[0]["remaining"] == 3

    def test_get_active_buffs_permanent(self):
        """永久 buff 的 remaining 显示为 '永久'"""
        system = BuffSystem()
        system.register_buff_template("perm", make_buff(name="永久增益", is_permanent=True))
        system.apply_buff("perm")

        info = system.get_active_buffs()
        assert info[0]["remaining"] == "永久"

    def test_get_active_buffs_empty(self):
        """空 buff 列表"""
        system = BuffSystem()
        assert system.get_active_buffs() == []

    def test_get_total_bonus_empty(self):
        """空 buff 列表 — get_total_bonus 返回空加成"""
        system = BuffSystem()
        total = system.get_total_bonus()
        assert total.bonuses == {}
        assert total.percentage_bonuses == {}

    def test_get_total_bonus_multiple_buffs(self):
        """多个 buff 的总加成"""
        system = BuffSystem()
        system.register_buff_template("atk", BuffEffect(
            name="攻击", bonuses={"攻击": 10}, percentage_bonuses={"攻击": 5},
        ))
        system.register_buff_template("def", BuffEffect(
            name="防御", bonuses={"防御": 20}, percentage_bonuses={"防御": 10},
        ))
        system.apply_buff("atk")
        system.apply_buff("def")

        total = system.get_total_bonus()
        assert total.bonuses == {"攻击": 10, "防御": 20}
        assert total.percentage_bonuses == {"攻击": 5, "防御": 10}
