"""游戏模板系统 - 预定义常见游戏类型的属性配置"""
from core.attr_system import AttributeSystem, AttrType, Formula


class GameTemplates:
    """游戏模板 - 提供常见游戏类型的预设属性配置"""

    @staticmethod
    def simple_rpg() -> AttributeSystem:
        """简单RPG - 适合入门级RPG游戏"""
        system = AttributeSystem()
        system.attributes.clear()

        # 基础属性
        for name in ["力量", "智力", "敏捷", "体质"]:
            system.attributes[name] = system._create_attr(name, AttrType.BASE, "基础属性")

        # 派生属性
        system.attributes["HP"] = system._create_attr("HP", AttrType.DERIVED, "派生属性")
        system.attributes["HP"].formula = Formula(coefficients={"力量": 10, "体质": 20, "敏捷": 5})

        system.attributes["MP"] = system._create_attr("MP", AttrType.DERIVED, "派生属性")
        system.attributes["MP"].formula = Formula(coefficients={"智力": 15, "体质": 5})

        system.attributes["物攻"] = system._create_attr("物攻", AttrType.DERIVED, "派生属性")
        system.attributes["物攻"].formula = Formula(coefficients={"力量": 2, "敏捷": 1})

        system.attributes["物防"] = system._create_attr("物防", AttrType.DERIVED, "派生属性")
        system.attributes["物防"].formula = Formula(coefficients={"体质": 3})

        system.attributes["魔攻"] = system._create_attr("魔攻", AttrType.DERIVED, "派生属性")
        system.attributes["魔攻"].formula = Formula(coefficients={"智力": 2})

        system.attributes["魔防"] = system._create_attr("魔防", AttrType.DERIVED, "派生属性")
        system.attributes["魔防"].formula = Formula(coefficients={"智力": 1, "体质": 1})

        return system

    @staticmethod
    def complex_rpg() -> AttributeSystem:
        """复杂RPG - 适合中大型RPG游戏"""
        system = AttributeSystem()
        system.attributes.clear()

        # 基础属性
        for name in ["力量", "智力", "敏捷", "体质", "精神", "幸运"]:
            system.attributes[name] = system._create_attr(name, AttrType.BASE, "基础属性")

        # 派生属性
        system.attributes["HP"] = system._create_attr("HP", AttrType.DERIVED, "派生属性")
        system.attributes["HP"].formula = Formula(coefficients={"力量": 10, "体质": 20, "敏捷": 5, "精神": 3})

        system.attributes["MP"] = system._create_attr("MP", AttrType.DERIVED, "派生属性")
        system.attributes["MP"].formula = Formula(coefficients={"智力": 15, "精神": 10, "体质": 5})

        system.attributes["物攻"] = system._create_attr("物攻", AttrType.DERIVED, "派生属性")
        system.attributes["物攻"].formula = Formula(coefficients={"力量": 2, "敏捷": 1, "幸运": 0.5})

        system.attributes["物防"] = system._create_attr("物防", AttrType.DERIVED, "派生属性")
        system.attributes["物防"].formula = Formula(coefficients={"力量": 0.5, "体质": 2, "敏捷": 0.5})

        system.attributes["魔攻"] = system._create_attr("魔攻", AttrType.DERIVED, "派生属性")
        system.attributes["魔攻"].formula = Formula(coefficients={"智力": 3, "精神": 1})

        system.attributes["魔防"] = system._create_attr("魔防", AttrType.DERIVED, "派生属性")
        system.attributes["魔防"].formula = Formula(coefficients={"智力": 1, "精神": 2, "体质": 1})

        system.attributes["速度"] = system._create_attr("速度", AttrType.DERIVED, "派生属性")
        system.attributes["速度"].formula = Formula(coefficients={"敏捷": 2, "幸运": 0.5})

        # 战斗属性
        system.attributes["暴击率"] = system._create_attr("暴击率", AttrType.COMBAT, "战斗属性")
        system.attributes["暴击率"].formula = Formula(coefficients={"敏捷": 0.4, "幸运": 0.6}, base_value=5, max_value=100)

        system.attributes["暴击伤害"] = system._create_attr("暴击伤害", AttrType.COMBAT, "战斗属性")
        system.attributes["暴击伤害"].formula = Formula(coefficients={"力量": 0.5, "幸运": 1}, base_value=150)

        system.attributes["命中率"] = system._create_attr("命中率", AttrType.COMBAT, "战斗属性")
        system.attributes["命中率"].formula = Formula(coefficients={"敏捷": 0.3, "幸运": 0.2}, base_value=85, max_value=100)

        system.attributes["闪避率"] = system._create_attr("闪避率", AttrType.COMBAT, "战斗属性")
        system.attributes["闪避率"].formula = Formula(coefficients={"敏捷": 0.4, "幸运": 0.3}, base_value=5, max_value=100)

        system.attributes["回血/回合"] = system._create_attr("回血/回合", AttrType.COMBAT, "战斗属性")
        system.attributes["回血/回合"].formula = Formula(coefficients={"体质": 1, "精神": 0.5})

        system.attributes["回蓝/回合"] = system._create_attr("回蓝/回合", AttrType.COMBAT, "战斗属性")
        system.attributes["回蓝/回合"].formula = Formula(coefficients={"精神": 1, "智力": 0.5})

        return system

    @staticmethod
    def strategy_game() -> AttributeSystem:
        """策略游戏 - 适合SLG/战棋类游戏"""
        system = AttributeSystem()
        system.attributes.clear()

        # 基础属性
        for name in ["攻击", "防御", "速度", "智慧", "统率", "魅力"]:
            system.attributes[name] = system._create_attr(name, AttrType.BASE, "基础属性")

        # 派生属性
        system.attributes["物理伤害"] = system._create_attr("物理伤害", AttrType.DERIVED, "派生属性")
        system.attributes["物理伤害"].formula = Formula(coefficients={"攻击": 1.5, "统率": 0.5})

        system.attributes["物理减伤"] = system._create_attr("物理减伤", AttrType.DERIVED, "派生属性")
        system.attributes["物理减伤"].formula = Formula(coefficients={"防御": 1, "统率": 0.3})

        system.attributes["法术伤害"] = system._create_attr("法术伤害", AttrType.DERIVED, "派生属性")
        system.attributes["法术伤害"].formula = Formula(coefficients={"智慧": 1.5, "魅力": 0.5})

        system.attributes["法术抗性"] = system._create_attr("法术抗性", AttrType.DERIVED, "派生属性")
        system.attributes["法术抗性"].formula = Formula(coefficients={"智慧": 1, "魅力": 0.3})

        system.attributes["行动力"] = system._create_attr("行动力", AttrType.DERIVED, "派生属性")
        system.attributes["行动力"].formula = Formula(coefficients={"速度": 2, "统率": 1})

        system.attributes["士气"] = system._create_attr("士气", AttrType.DERIVED, "派生属性")
        system.attributes["士气"].formula = Formula(coefficients={"魅力": 2, "统率": 1.5})

        # 战斗属性
        system.attributes["先手率"] = system._create_attr("先手率", AttrType.COMBAT, "战斗属性")
        system.attributes["先手率"].formula = Formula(coefficients={"速度": 0.5}, base_value=50, max_value=100)

        system.attributes["技能触发率"] = system._create_attr("技能触发率", AttrType.COMBAT, "战斗属性")
        system.attributes["技能触发率"].formula = Formula(coefficients={"智慧": 0.3, "魅力": 0.2}, base_value=10, max_value=100)

        return system

    @staticmethod
    def card_game() -> AttributeSystem:
        """卡牌游戏 - 适合CCG/TCG类游戏"""
        system = AttributeSystem()
        system.attributes.clear()

        # 基础属性
        for name in ["攻击", "生命", "护甲", "速度", "暴击", "穿透"]:
            system.attributes[name] = system._create_attr(name, AttrType.BASE, "基础属性")

        # 派生属性
        system.attributes["实际伤害"] = system._create_attr("实际伤害", AttrType.DERIVED, "派生属性")
        system.attributes["实际伤害"].formula = Formula(coefficients={"攻击": 1, "暴击": 0.5, "穿透": 0.3})

        system.attributes["实际生命"] = system._create_attr("实际生命", AttrType.DERIVED, "派生属性")
        system.attributes["实际生命"].formula = Formula(coefficients={"生命": 1, "护甲": 10})

        system.attributes["速度加成"] = system._create_attr("速度加成", AttrType.DERIVED, "派生属性")
        system.attributes["速度加成"].formula = Formula(coefficients={"速度": 1})

        # 战斗属性
        system.attributes["暴击倍率"] = system._create_attr("暴击倍率", AttrType.COMBAT, "战斗属性")
        system.attributes["暴击倍率"].formula = Formula(coefficients={"暴击": 0.5}, base_value=1.5)

        system.attributes["穿透率"] = system._create_attr("穿透率", AttrType.COMBAT, "战斗属性")
        system.attributes["穿透率"].formula = Formula(coefficients={"穿透": 0.4}, max_value=100)

        return system

    @staticmethod
    def mmo_rpg() -> AttributeSystem:
        """大型MMO - 适合大型多人在线游戏"""
        system = AttributeSystem()
        system.attributes.clear()

        # 基础属性
        for name in ["力量", "智力", "敏捷", "体质", "精神", "幸运", "意志", "感知"]:
            system.attributes[name] = system._create_attr(name, AttrType.BASE, "基础属性")

        # 派生属性
        system.attributes["HP"] = system._create_attr("HP", AttrType.DERIVED, "派生属性")
        system.attributes["HP"].formula = Formula(coefficients={"力量": 10, "体质": 25, "敏捷": 5, "意志": 3})

        system.attributes["MP"] = system._create_attr("MP", AttrType.DERIVED, "派生属性")
        system.attributes["MP"].formula = Formula(coefficients={"智力": 15, "精神": 12, "感知": 5})

        system.attributes["物攻"] = system._create_attr("物攻", AttrType.DERIVED, "派生属性")
        system.attributes["物攻"].formula = Formula(coefficients={"力量": 2.5, "敏捷": 1.2, "幸运": 0.5})

        system.attributes["物防"] = system._create_attr("物防", AttrType.DERIVED, "派生属性")
        system.attributes["物防"].formula = Formula(coefficients={"力量": 0.8, "体质": 2.5, "意志": 1})

        system.attributes["魔攻"] = system._create_attr("魔攻", AttrType.DERIVED, "派生属性")
        system.attributes["魔攻"].formula = Formula(coefficients={"智力": 3, "精神": 1.5, "感知": 0.5})

        system.attributes["魔防"] = system._create_attr("魔防", AttrType.DERIVED, "派生属性")
        system.attributes["魔防"].formula = Formula(coefficients={"智力": 1.2, "精神": 2, "意志": 1.5})

        system.attributes["速度"] = system._create_attr("速度", AttrType.DERIVED, "派生属性")
        system.attributes["速度"].formula = Formula(coefficients={"敏捷": 2.5, "幸运": 0.8})

        system.attributes["能量"] = system._create_attr("能量", AttrType.DERIVED, "派生属性")
        system.attributes["能量"].formula = Formula(coefficients={"体质": 3, "意志": 2})

        # 战斗属性
        system.attributes["暴击率"] = system._create_attr("暴击率", AttrType.COMBAT, "战斗属性")
        system.attributes["暴击率"].formula = Formula(coefficients={"敏捷": 0.5, "幸运": 0.8}, base_value=5, max_value=100)

        system.attributes["暴击伤害"] = system._create_attr("暴击伤害", AttrType.COMBAT, "战斗属性")
        system.attributes["暴击伤害"].formula = Formula(coefficients={"力量": 0.8, "幸运": 1.2}, base_value=150)

        system.attributes["命中率"] = system._create_attr("命中率", AttrType.COMBAT, "战斗属性")
        system.attributes["命中率"].formula = Formula(coefficients={"敏捷": 0.4, "感知": 0.5}, base_value=85, max_value=100)

        system.attributes["闪避率"] = system._create_attr("闪避率", AttrType.COMBAT, "战斗属性")
        system.attributes["闪避率"].formula = Formula(coefficients={"敏捷": 0.5, "幸运": 0.4}, base_value=5, max_value=100)

        system.attributes["格挡率"] = system._create_attr("格挡率", AttrType.COMBAT, "战斗属性")
        system.attributes["格挡率"].formula = Formula(coefficients={"体质": 0.3, "意志": 0.5}, base_value=0, max_value=100)

        system.attributes["回血/回合"] = system._create_attr("回血/回合", AttrType.COMBAT, "战斗属性")
        system.attributes["回血/回合"].formula = Formula(coefficients={"体质": 1.5, "精神": 0.8, "意志": 0.5})

        system.attributes["回蓝/回合"] = system._create_attr("回蓝/回合", AttrType.COMBAT, "战斗属性")
        system.attributes["回蓝/回合"].formula = Formula(coefficients={"精神": 1.2, "智力": 0.5, "感知": 0.3})

        system.attributes["经验加成"] = system._create_attr("经验加成", AttrType.COMBAT, "战斗属性")
        system.attributes["经验加成"].formula = Formula(coefficients={"幸运": 0.5, "感知": 0.3}, base_value=100)

        system.attributes["掉落倍率"] = system._create_attr("掉落倍率", AttrType.COMBAT, "战斗属性")
        system.attributes["掉落倍率"].formula = Formula(coefficients={"幸运": 0.8}, base_value=100)

        system.attributes["稀有掉落率"] = system._create_attr("稀有掉落率", AttrType.COMBAT, "战斗属性")
        system.attributes["稀有掉落率"].formula = Formula(coefficients={"幸运": 0.3, "感知": 0.2}, base_value=1, max_value=100)

        return system

    @staticmethod
    def action_game() -> AttributeSystem:
        """动作游戏 - 适合ACT/ARPG类游戏"""
        system = AttributeSystem()
        system.attributes.clear()

        # 基础属性
        for name in ["力量", "敏捷", "体质", "技巧", "运气"]:
            system.attributes[name] = system._create_attr(name, AttrType.BASE, "基础属性")

        # 派生属性
        system.attributes["HP"] = system._create_attr("HP", AttrType.DERIVED, "派生属性")
        system.attributes["HP"].formula = Formula(coefficients={"力量": 15, "体质": 20, "技巧": 5})

        system.attributes["体力"] = system._create_attr("体力", AttrType.DERIVED, "派生属性")
        system.attributes["体力"].formula = Formula(coefficients={"体质": 25, "力量": 10})

        system.attributes["攻击力"] = system._create_attr("攻击力", AttrType.DERIVED, "派生属性")
        system.attributes["攻击力"].formula = Formula(coefficients={"力量": 3, "技巧": 1.5})

        system.attributes["防御力"] = system._create_attr("防御力", AttrType.DERIVED, "派生属性")
        system.attributes["防御力"].formula = Formula(coefficients={"体质": 2, "力量": 1})

        system.attributes["连击加成"] = system._create_attr("连击加成", AttrType.DERIVED, "派生属性")
        system.attributes["连击加成"].formula = Formula(coefficients={"技巧": 0.5, "敏捷": 0.3})

        # 战斗属性
        system.attributes["暴击率"] = system._create_attr("暴击率", AttrType.COMBAT, "战斗属性")
        system.attributes["暴击率"].formula = Formula(coefficients={"技巧": 0.6, "运气": 0.4}, base_value=5, max_value=100)

        system.attributes["暴击伤害"] = system._create_attr("暴击伤害", AttrType.COMBAT, "战斗属性")
        system.attributes["暴击伤害"].formula = Formula(coefficients={"力量": 1, "技巧": 0.5}, base_value=150)

        system.attributes["无敌帧"] = system._create_attr("无敌帧", AttrType.COMBAT, "战斗属性")
        system.attributes["无敌帧"].formula = Formula(coefficients={"技巧": 0.2, "运气": 0.3}, base_value=0.5)

        system.attributes["硬直恢复"] = system._create_attr("硬直恢复", AttrType.COMBAT, "战斗属性")
        system.attributes["硬直恢复"].formula = Formula(coefficients={"体质": 0.5, "力量": 0.3})

        return system

    @staticmethod
    def get_template_names() -> list[str]:
        """获取所有模板名称"""
        return ["简单RPG", "复杂RPG", "策略游戏", "卡牌游戏", "大型MMO", "动作游戏"]

    @staticmethod
    def get_template(name: str) -> AttributeSystem:
        """根据名称获取模板"""
        templates = {
            "简单RPG": GameTemplates.simple_rpg,
            "复杂RPG": GameTemplates.complex_rpg,
            "策略游戏": GameTemplates.strategy_game,
            "卡牌游戏": GameTemplates.card_game,
            "大型MMO": GameTemplates.mmo_rpg,
            "动作游戏": GameTemplates.action_game,
        }
        factory = templates.get(name)
        if factory:
            return factory()
        raise ValueError(f"未知的模板: {name}")

    @staticmethod
    def create_custom_template(base_attrs: list[str], derived_configs: dict, combat_configs: dict) -> AttributeSystem:
        """
        创建自定义模板
        
        Args:
            base_attrs: 基础属性名称列表
            derived_configs: 派生属性配置 {name: {"coefficients": {...}, "base_value": x, "max_value": x}}
            combat_configs: 战斗属性配置 {name: {"coefficients": {...}, "base_value": x, "max_value": x}}
        """
        system = AttributeSystem()
        system.attributes.clear()

        # 创建基础属性
        for name in base_attrs:
            system.attributes[name] = system._create_attr(name, AttrType.BASE, "基础属性")

        # 创建派生属性
        for name, config in derived_configs.items():
            attr = system._create_attr(name, AttrType.DERIVED, "派生属性")
            attr.formula = Formula(
                coefficients=config.get("coefficients", {}),
                base_value=config.get("base_value", 0),
                max_value=config.get("max_value"),
            )
            system.attributes[name] = attr

        # 创建战斗属性
        for name, config in combat_configs.items():
            attr = system._create_attr(name, AttrType.COMBAT, "战斗属性")
            attr.formula = Formula(
                coefficients=config.get("coefficients", {}),
                base_value=config.get("base_value", 0),
                max_value=config.get("max_value"),
            )
            system.attributes[name] = attr

        return system
