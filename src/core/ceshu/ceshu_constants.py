"""策划书常量定义 — 游戏系统配置 schema 与中文名称映射

从 ceshu_model.py 外置，让 model 文件聚焦数据类逻辑。
被 ceshu_model / SystemsEditor / AI 共享引用。
"""
from __future__ import annotations

# 游戏系统中文名称映射（用于 UI 显示）
SYSTEM_LABELS: dict = {
    "battle": "战斗",
    "character": "角色",
    "skill": "技能",
    "equipment": "装备",
    "item": "物品",
    "quest": "任务",
    "social": "社交",
    "economy": "经济",
    "growth": "成长",
    "customization": "自定义外观",
    "content": "关卡内容",
    "gacha": "抽卡系统",
    "competitive": "排位竞技",
}

# 游戏系统的标准 config 字段定义（被 _default_systems / SystemsEditor / AI 共享）
# 字段类型: entry(单行) / textarea(多行) / combobox(下拉) / spinbox(数字) / checkbox(开关)
# 行业标准 v2.9 — 5 种控件类型，按字段语义精确匹配
SYSTEM_CONFIG_SCHEMA: dict = {
    "battle": {
        "turn_mode":         {"label": "战斗模式:", "type": "combobox",
                              "values": ["turn_based", "realtime", "semi_realtime", "auto_battle",
                                         "atb", "ctb", "srpg_grid"]},
        "pvp_type":          {"label": "PVP类型:", "type": "combobox",
                              "values": ["none", "arena", "open_world", "guild_war", "battle_royale"]},
        "team_size":         {"label": "队伍人数:", "type": "spinbox", "from": 1, "to": 12},
        "battle_duration":   {"label": "单局时长(秒):", "type": "spinbox", "from": 5, "to": 1800},
        "damage_formula":    {"label": "伤害公式:", "type": "textarea"},
        "death_penalty":     {"label": "死亡惩罚:", "type": "textarea"},
        "combat_pace":       {"label": "战斗节奏:", "type": "combobox",
                              "values": ["slow", "medium", "fast", "variable"]},
        "buff_limit":        {"label": "Buff上限:", "type": "spinbox", "from": 0, "to": 32},
        "crit_system":       {"label": "暴击系统:", "type": "checkbox"},
        "element_system":    {"label": "元素系统:", "type": "combobox",
                              "values": ["none", "single", "multi", "reaction"]},
        "escape_rule":       {"label": "逃跑机制:", "type": "combobox",
                              "values": ["none", "chance_based", "item_required", "cooldown"]},
        "ai_behavior":       {"label": "AI行为:", "type": "combobox",
                              "values": ["scripted", "behavior_tree", "state_machine", "utility_ai"]},
        "battle_trigger":    {"label": "战斗触发:", "type": "combobox",
                              "values": ["touch", "menu", "zone", "auto"]},
        "battle_view":       {"label": "战斗视角:", "type": "combobox",
                              "values": ["2d_side", "2d_top", "3d_first", "3d_third", "isometric"]},
        "multiplayer_coop":  {"label": "多人协作:", "type": "checkbox"},
    },
    "character": {
        "max_level":         {"label": "等级上限:", "type": "spinbox", "from": 1, "to": 999},
        "init_level":        {"label": "初始等级:", "type": "spinbox", "from": 1, "to": 100},
        "attribute_system":  {"label": "属性体系:", "type": "textarea"},
        "base_attributes":   {"label": "基础属性:", "type": "textarea"},
        "growth_rate":       {"label": "升级成长系数:", "type": "entry"},
        "class_count":       {"label": "职业数量:", "type": "spinbox", "from": 1, "to": 30},
        "class_change":      {"label": "转职系统:", "type": "combobox",
                              "values": ["none", "tier_based", "free_switch", "locked"]},
        "talent_system":     {"label": "天赋系统:", "type": "checkbox"},
        "gender_options":    {"label": "性别选项:", "type": "combobox",
                              "values": ["male_female", "male_female_neutral", "single", "custom"]},
        "character_slot":    {"label": "角色栏位:", "type": "spinbox", "from": 1, "to": 10},
        "respawn_rule":      {"label": "复活规则:", "type": "textarea"},
        "race_enabled":      {"label": "种族系统:", "type": "checkbox"},
        "race_count":        {"label": "种族数量:", "type": "spinbox", "from": 0, "to": 50},
        "race_list":         {"label": "种族列表:", "type": "textarea"},
    },
    "skill": {
        "max_skill_count":   {"label": "技能槽位:", "type": "spinbox", "from": 1, "to": 20},
        "skill_max_level":   {"label": "技能等级上限:", "type": "spinbox", "from": 1, "to": 30},
        "skill_type":        {"label": "技能类型:", "type": "combobox",
                              "values": ["active_only", "active_passive", "active_passive_aura"]},
        "skill_point_source":{"label": "技能点来源:", "type": "textarea"},
        "learn_method":      {"label": "学习方式:", "type": "combobox",
                              "values": ["auto_level", "manual_learn", "quest_reward", "skill_book"]},
        "upgrade_method":    {"label": "升级方式:", "type": "combobox",
                              "values": ["auto_upgrade", "point_invest", "material_cost", "scripted"]},
        "combo_system":      {"label": "连招系统:", "type": "combobox",
                              "values": ["none", "simple", "chain", "branch"]},
        "cooldown_mode":     {"label": "冷却模式:", "type": "combobox",
                              "values": ["per_skill", "global", "shared_group"]},
        "resource_cost":     {"label": "资源消耗:", "type": "textarea"},
        "aoe_rule":          {"label": "范围规则:", "type": "combobox",
                              "values": ["single_target", "multi_target", "aoe_circle", "aoe_cone"]},
        "skill_tree":        {"label": "技能树:", "type": "combobox",
                              "values": ["none", "linear", "branch_tree", "mesh"]},
        "element_type":      {"label": "元素类型:", "type": "combobox",
                             "values": ["none", "fire_ice_electric", "earth_water_fire_wind", "metal_wood_water_fire_earth", "light_dark", "light_dark_wuxing", "dual_element", "custom"]},
    },
    "equipment": {
        "slot_count":        {"label": "装备槽数:", "type": "spinbox", "from": 1, "to": 15},
        "equip_types":       {"label": "装备类型:", "type": "textarea"},
        "quality_levels":    {"label": "品质等级:", "type": "textarea"},
        "enhance_max":       {"label": "强化上限:", "type": "spinbox", "from": 0, "to": 99},
        "enhance_material":  {"label": "强化材料:", "type": "textarea"},
        "set_bonus_enabled": {"label": "套装效果:", "type": "checkbox"},
        "socket_enabled":    {"label": "镶嵌系统:", "type": "checkbox"},
        "durability_enabled":{"label": "耐久系统:", "type": "checkbox"},
        "enchant_system":    {"label": "附魔系统:", "type": "checkbox"},
        "refine_system":     {"label": "精炼系统:", "type": "checkbox"},
        "decompose_system":  {"label": "分解系统:", "type": "checkbox"},
        "score_system":      {"label": "装备评分:", "type": "combobox",
                              "values": ["none", "ilvl", "power_score", "stars"]},
    },
    "item": {
        "item_categories":   {"label": "物品分类:", "type": "textarea"},
        "stack_size_max":    {"label": "最大堆叠:", "type": "spinbox", "from": 1, "to": 9999},
        "rarity_levels":     {"label": "稀有度:", "type": "textarea"},
        "trade_enabled":     {"label": "交易系统:", "type": "checkbox"},
        "drop_bind_rule":    {"label": "掉落绑定:", "type": "combobox",
                              "values": ["none", "bind_on_pickup", "bind_on_equip"]},
        "craft_system":      {"label": "合成系统:", "type": "checkbox"},
        "consumable_system": {"label": "消耗品系统:", "type": "checkbox"},
        "use_effect":        {"label": "使用效果:", "type": "textarea"},
        "bag_size":          {"label": "背包上限:", "type": "spinbox", "from": 20, "to": 500},
        "bank_system":       {"label": "仓库系统:", "type": "checkbox"},
        "drop_system":       {"label": "掉落系统:", "type": "combobox",
                              "values": ["fixed_table", "weighted_table", "dynamic_table"]},
    },
    "quest": {
        "quest_types":             {"label": "任务类型:", "type": "textarea"},
        "daily_quest_limit":       {"label": "日常上限:", "type": "spinbox", "from": 0, "to": 50},
        "weekly_quest_limit":      {"label": "周常上限:", "type": "spinbox", "from": 0, "to": 30},
        "chain_quest_enabled":     {"label": "连环任务:", "type": "checkbox"},
        "story_quest":             {"label": "剧情任务:", "type": "combobox",
                                    "values": ["linear", "branch", "sandbox"]},
        "branch_quest":            {"label": "分支任务:", "type": "combobox",
                                    "values": ["none", "binary", "multi_branch"]},
        "random_quest":            {"label": "随机任务:", "type": "combobox",
                                    "values": ["none", "daily_random", "map_random", "event_random"]},
        "achievement_integration": {"label": "成就系统:", "type": "checkbox"},
        "repeatable":              {"label": "可重复:", "type": "combobox",
                                    "values": ["none", "daily", "weekly", "unlimited"]},
        "quest_track_limit":       {"label": "追踪上限:", "type": "spinbox", "from": 1, "to": 20},
        "reward_rule":             {"label": "奖励规则:", "type": "textarea"},
    },
    "social": {
        "faction_system":    {"label": "阵营系统:", "type": "combobox",
                              "values": ["none", "two_sides", "multi_sides"]},
        "guild_max_members": {"label": "公会人数:", "type": "spinbox", "from": 10, "to": 500},
        "guild_level":       {"label": "公会等级:", "type": "spinbox", "from": 1, "to": 30},
        "guild_war":         {"label": "公会战:", "type": "combobox",
                              "values": ["none", "scheduled", "always_on", "seasonal"]},
        "team_size":         {"label": "组队人数:", "type": "spinbox", "from": 2, "to": 12},
        "friend_max":        {"label": "好友上限:", "type": "spinbox", "from": 10, "to": 500},
        "mentor_system":     {"label": "师徒系统:", "type": "checkbox"},
        "marriage_system":   {"label": "结婚系统:", "type": "checkbox"},
        "enemy_system":      {"label": "仇人系统:", "type": "checkbox"},
        "chat_channels":     {"label": "聊天频道:", "type": "textarea"},
        "mail_system":       {"label": "邮件系统:", "type": "checkbox"},
        "trade_system":      {"label": "交易系统:", "type": "checkbox"},
        "blacklist_system":  {"label": "黑名单:", "type": "checkbox"},
    },
    "economy": {
        "currency_types":     {"label": "货币类型:", "type": "textarea"},
        "init_currency":      {"label": "初始资金:", "type": "textarea"},
        "source_mechanisms":  {"label": "产出机制:", "type": "textarea"},
        "sink_mechanisms":    {"label": "回收机制:", "type": "textarea"},
        "tax_rate":           {"label": "交易税率%:", "type": "spinbox", "from": 0, "to": 30},
        "market_type":        {"label": "市场类型:", "type": "combobox",
                               "values": ["none", "auction", "shop", "player_shop", "hybrid"]},
        "inflation_control":  {"label": "通胀控制:", "type": "textarea"},
        "payment_system":     {"label": "付费模式:", "type": "combobox",
                               "values": ["f2p", "p2p", "f2p_p2w", "f2p_cosmetic", "buy_to_play"]},
        "recharge_tiers":     {"label": "充值档位:", "type": "textarea"},
        "vip_system":         {"label": "VIP系统:", "type": "checkbox"},
        "monthly_card":       {"label": "月卡:", "type": "checkbox"},
        "season_pass":        {"label": "赛季通行证:", "type": "checkbox"},
        "vip_max_level":      {"label": "VIP等级上限:", "type": "spinbox", "from": 0, "to": 100},
        "monthly_card_price": {"label": "月卡价格:", "type": "spinbox", "from": 0, "to": 999},
        "season_pass_price":  {"label": "赛季通行证价格:", "type": "spinbox", "from": 0, "to": 999},
    },
    "growth": {
        "exp_source":          {"label": "经验来源:", "type": "textarea"},
        "exp_curve":           {"label": "经验曲线:", "type": "textarea"},
        "attribute_point":     {"label": "属性点分配:", "type": "combobox",
                                "values": ["auto", "manual", "hybrid"]},
        "breakthrough_enabled":{"label": "突破系统:", "type": "checkbox"},
        "prestige_system":     {"label": "转生系统:", "type": "checkbox"},
        "rank_system":         {"label": "段位系统:", "type": "combobox",
                                "values": ["none", "elo", "star", "tier"]},
        "achievement_score":   {"label": "成就积分:", "type": "checkbox"},
        "achievement_reward":  {"label": "成就奖励:", "type": "textarea"},
        "progression_track":   {"label": "成长轨迹:", "type": "combobox",
                                "values": ["linear", "milestone", "open_sandbox"]},
    },
    "customization": {
        "appearance_slots": {"label": "外观槽位:", "type": "spinbox", "from": 0, "to": 15},
        "dye_system":       {"label": "染色系统:", "type": "checkbox"},
        "mount_enabled":    {"label": "坐骑系统:", "type": "checkbox"},
        "housing_enabled":  {"label": "家园系统:", "type": "checkbox"},
        "title_system":     {"label": "称号系统:", "type": "checkbox"},
        "pet_system":       {"label": "宠物系统:", "type": "checkbox"},
        "follower_system":  {"label": "随从系统:", "type": "checkbox"},
        "emote_system":     {"label": "表情系统:", "type": "checkbox"},
        "skin_system":      {"label": "皮肤系统:", "type": "checkbox"},
        "profile_tag":      {"label": "个性标签:", "type": "checkbox"},
        "avatar_system":    {"label": "头像系统:", "type": "checkbox"},
    },
    "content": {
        "stage_count":       {"label": "关卡总数:", "type": "spinbox", "from": 1, "to": 999},
        "stage_types":       {"label": "关卡类型:", "type": "textarea"},
        "difficulty_tiers":  {"label": "难度档次:", "type": "spinbox", "from": 1, "to": 10},
        "stage_reward":      {"label": "关卡奖励:", "type": "textarea"},
        "chapter_system":    {"label": "章节系统:", "type": "checkbox"},
        "star_rating":       {"label": "关卡星级:", "type": "combobox",
                              "values": ["none", "1-3star", "1-5star"]},
        "sweep_enabled":     {"label": "扫荡功能:", "type": "checkbox"},
        "energy_system":     {"label": "体力系统:", "type": "combobox",
                              "values": ["none", "realtime", "daily_fixed"]},
        "endless_mode":      {"label": "无尽模式:", "type": "checkbox"},
        "weekly_dungeon":    {"label": "周常副本:", "type": "checkbox"},
        "energy_cap":        {"label": "体力上限:", "type": "spinbox", "from": 0, "to": 999},
        "energy_regen":      {"label": "体力恢复(/分):", "type": "spinbox", "from": 0, "to": 60},
    },
    "gacha": {
        "gacha_types":        {"label": "卡池类型:", "type": "textarea"},
        "currency_type":      {"label": "抽卡货币:", "type": "entry"},
        "pity_count":         {"label": "保底次数:", "type": "spinbox", "from": 0, "to": 300},
        "pity_mechanism":     {"label": "保底机制:", "type": "combobox",
                               "values": ["none", "soft_pity", "hard_pity", "both", "ten_pull_guarantee"]},
        "rate_up_enabled":    {"label": "概率UP:", "type": "checkbox"},
        "spark_enabled":      {"label": "兑换系统:", "type": "checkbox"},
        "free_draw":          {"label": "免费抽取:", "type": "combobox",
                               "values": ["none", "daily", "weekly"]},
        "banner_rotation":    {"label": "卡池轮换:", "type": "checkbox"},
        "guarantee_carry":    {"label": "保底继承:", "type": "checkbox"},
        "gacha_price_single": {"label": "单抽价格:", "type": "spinbox", "from": 0, "to": 9999},
        "gacha_price_ten":    {"label": "十连价格:", "type": "spinbox", "from": 0, "to": 99999},
    },
    "competitive": {
        "rank_tiers":          {"label": "段位列表:", "type": "textarea"},
        "season_duration":     {"label": "赛季时长(天):", "type": "spinbox", "from": 7, "to": 365},
        "mmr_system":          {"label": "MMR算法:", "type": "combobox",
                                "values": ["none", "elo", "glicko", "trueskill"]},
        "placement_matches":   {"label": "定级赛场数:", "type": "spinbox", "from": 0, "to": 20},
        "tier_protection":     {"label": "段位保护:", "type": "checkbox"},
        "rank_reward":         {"label": "赛季奖励:", "type": "textarea"},
        "leaderboard":         {"label": "排行榜:", "type": "combobox",
                                "values": ["none", "top100", "top1000", "all"]},
        "matchmaking_pool":    {"label": "匹配池规则:", "type": "textarea"},
        "ban_pick_enabled":    {"label": "B/P系统:", "type": "checkbox"},
        "decay_system":        {"label": "掉段机制:", "type": "checkbox"},
    },
}


# === v5.0 工业级补充：系统间依赖关系 ===
# 描述各游戏系统之间的硬依赖（被依赖系统必须先启用）
# 用于：1) 启用某系统时自动提示依赖 2) 一致性校验 3) AI 生成时按拓扑顺序生成
SYSTEM_DEPENDENCIES: dict = {
    "battle":        ["character", "skill"],            # 战斗依赖角色与技能
    "skill":         ["character"],                      # 技能依赖角色
    "equipment":     ["character", "item"],              # 装备依赖角色与物品
    "gacha":         ["item", "economy"],                # 抽卡依赖物品与经济
    "growth":        ["character"],                      # 成长依赖角色
    "quest":         ["character", "item"],              # 任务依赖角色与物品
    "social":        ["character"],                      # 社交依赖角色
    "economy":       ["item"],                           # 经济依赖物品
    "competitive":   ["battle", "character"],            # 竞技依赖战斗与角色
    "customization": ["character"],                      # 外观依赖角色
    "content":       ["character", "battle"],            # 关卡依赖角色与战斗
    # item / character 无依赖
}

# 反向依赖：哪些系统依赖某系统（运行时派生）
def get_reverse_dependencies() -> dict:
    """返回反向依赖映射: {system_key: [依赖于它的系统列表]}"""
    rev: dict = {}
    for sys_key, deps in SYSTEM_DEPENDENCIES.items():
        for dep in deps:
            rev.setdefault(dep, []).append(sys_key)
    return rev


# === v5.0 工业级补充：按模块类型推荐系统组合 ===
# 用于 AI 生成时根据 module_type 自动推荐应启用的系统
MODULE_SYSTEM_RECOMMENDATIONS: dict = {
    "rpg": {
        "label": "RPG 角色扮演",
        "core_systems":   ["character", "battle", "skill", "equipment", "growth", "quest", "item"],
        "optional_systems": ["social", "economy", "customization", "content"],
    },
    "arpg": {
        "label": "ARPG 动作角色扮演",
        "core_systems":   ["character", "battle", "skill", "equipment", "growth", "item"],
        "optional_systems": ["quest", "content", "customization"],
    },
    "mmorpg": {
        "label": "MMORPG 大型多人在线 RPG",
        "core_systems":   ["character", "battle", "skill", "equipment", "growth", "quest", "item",
                           "social", "economy", "content"],
        "optional_systems": ["customization", "gacha", "competitive"],
    },
    "slg": {
        "label": "SLG 策略",
        "core_systems":   ["character", "social", "economy", "quest", "content"],
        "optional_systems": ["battle", "growth", "equipment", "item"],
    },
    "moba": {
        "label": "MOBA 多人在线战术竞技",
        "core_systems":   ["character", "battle", "skill", "equipment", "competitive"],
        "optional_systems": ["growth", "customization"],
    },
    "fps": {
        "label": "FPS 第一人称射击",
        "core_systems":   ["character", "battle", "equipment", "competitive"],
        "optional_systems": ["social", "growth", "customization"],
    },
    "strategy": {
        "label": "策略",
        "core_systems":   ["character", "battle", "social", "economy", "content"],
        "optional_systems": ["quest", "growth", "equipment", "item"],
    },
    "card": {
        "label": "卡牌",
        "core_systems":   ["character", "skill", "item", "gacha", "economy"],
        "optional_systems": ["quest", "social", "competitive"],
    },
    "roguelike": {
        "label": "Roguelike",
        "core_systems":   ["character", "battle", "skill", "item", "growth", "content"],
        "optional_systems": ["equipment", "quest"],
    },
    "casual": {
        "label": "休闲",
        "core_systems":   ["character", "item", "quest"],
        "optional_systems": ["battle", "skill", "growth", "social", "customization"],
    },
    "survival": {
        "label": "生存",
        "core_systems":   ["character", "item", "equipment", "content", "growth"],
        "optional_systems": ["battle", "skill", "social", "economy", "quest"],
    },
    "sandbox": {
        "label": "沙盒",
        "core_systems":   ["character", "item", "content"],
        "optional_systems": ["battle", "skill", "equipment", "social", "economy", "growth",
                             "customization", "quest"],
    },
}


# === v5.0 工业级补充：混合玩法组合预设 ===
# 用于 AI 生成时根据风格+模块组合自动套用预设配置
# 每个预设包含：风格 + 主模块 + 副模块 + 推荐系统 + 风格术语表 key + 特色说明
HYBRID_GAMEPLAY_PRESETS: dict = {
    "xianxia_rpg": {
        "label": "仙侠 RPG",
        "style": "xianxia",
        "module_type": "rpg",
        "secondary_modules": ["social"],  # 宗门/门派
        "recommended_systems": ["character", "battle", "skill", "equipment", "growth",
                                 "quest", "item", "social", "economy"],
        "highlight": "境界划分、宗门门派、法宝丹药、渡劫飞升",
    },
    "xianxia_mmorpg": {
        "label": "仙侠 MMORPG",
        "style": "xianxia",
        "module_type": "mmorpg",
        "secondary_modules": ["competitive"],
        "recommended_systems": ["character", "battle", "skill", "equipment", "growth",
                                 "quest", "item", "social", "economy", "content",
                                 "customization", "competitive"],
        "highlight": "万人宗门战、跨服斗法、法宝熔炼、仙魔阵营",
    },
    "wuxia_slg": {
        "label": "武侠 SLG",
        "style": "wuxia",
        "module_type": "slg",
        "secondary_modules": ["rpg"],
        "recommended_systems": ["character", "social", "economy", "quest", "content",
                                 "battle", "growth", "equipment", "item"],
        "highlight": "江湖门派经营、武林盟主争夺、武功秘籍收集、势力版图",
    },
    "scifi_fps": {
        "label": "科幻 FPS",
        "style": "sci-fi",
        "module_type": "fps",
        "secondary_modules": ["rpg"],
        "recommended_systems": ["character", "battle", "equipment", "competitive",
                                 "growth", "customization", "social"],
        "highlight": "机甲装备、能量护盾、外星战场、阵营对抗",
    },
    "scifi_survival": {
        "label": "末日生存",
        "style": "post_apoc",
        "module_type": "survival",
        "secondary_modules": ["sandbox"],
        "recommended_systems": ["character", "item", "equipment", "content", "growth",
                                 "battle", "skill", "social", "economy", "quest"],
        "highlight": "资源搜刮、庇护所建造、变异生物、避难所经营",
    },
    "fantasy_arpg": {
        "label": "奇幻 ARPG",
        "style": "fantasy",
        "module_type": "arpg",
        "secondary_modules": ["roguelike"],
        "recommended_systems": ["character", "battle", "skill", "equipment", "growth",
                                 "item", "quest", "content", "customization"],
        "highlight": "龙与魔法、地牢探险、装备词缀、技能树",
    },
    "modern_card": {
        "label": "现代卡牌",
        "style": "realistic",
        "module_type": "card",
        "secondary_modules": ["rpg"],
        "recommended_systems": ["character", "skill", "item", "gacha", "economy",
                                 "quest", "social", "competitive"],
        "highlight": "卡组构筑、抽卡保底、天梯竞技、卡牌合成",
    },
    "fantasy_moba": {
        "label": "奇幻 MOBA",
        "style": "fantasy",
        "module_type": "moba",
        "secondary_modules": [],
        "recommended_systems": ["character", "battle", "skill", "equipment", "competitive",
                                 "growth", "customization"],
        "highlight": "英雄设计、B/P 系统、匹配算法、皮肤系统",
    },
    "steampunk_strategy": {
        "label": "蒸汽朋克策略",
        "style": "steampunk",
        "module_type": "strategy",
        "secondary_modules": ["slg"],
        "recommended_systems": ["character", "battle", "social", "economy", "content",
                                 "quest", "growth", "equipment", "item"],
        "highlight": "机械兵团、蒸汽科技树、资源争夺、领土扩张",
    },
    "cyberpunk_rpg": {
        "label": "赛博朋克 RPG",
        "style": "cyberpunk",
        "module_type": "rpg",
        "secondary_modules": ["fps"],
        "recommended_systems": ["character", "battle", "skill", "equipment", "growth",
                                 "quest", "item", "social", "customization"],
        "highlight": "义体改造、黑客技能、企业阵营、夜之城探索",
    },
    # === v5.0 优化4: 补充 8 个工业级预设 ===
    "dark_fantasy_roguelike": {
        "label": "暗黑奇幻 Roguelike",
        "style": "dark",
        "module_type": "roguelike",
        "secondary_modules": ["arpg"],
        "recommended_systems": ["character", "battle", "skill", "equipment", "growth",
                                 "item", "content", "quest"],
        "highlight": "永久死亡、随机地牢、黑暗氛围、装备词缀随机",
    },
    "modern_military_fps": {
        "label": "现代军事 FPS",
        "style": "realistic",
        "module_type": "fps",
        "secondary_modules": ["competitive"],
        "recommended_systems": ["character", "battle", "equipment", "competitive",
                                 "social", "customization", "growth"],
        "highlight": "真实武器、战术小队、排位赛、皮肤经济",
    },
    "anime_openworld": {
        "label": "二次元开放世界",
        "style": "anime",
        "module_type": "open_world",
        "secondary_modules": ["rpg", "gacha"],
        "recommended_systems": ["character", "battle", "skill", "equipment", "growth",
                                 "quest", "item", "social", "content", "customization",
                                 "economy"],
        "highlight": "大世界探索、角色抽卡、元素反应、剧情演出",
    },
    "xianxia_card": {
        "label": "修仙卡牌",
        "style": "xianxia",
        "module_type": "card",
        "secondary_modules": ["rpg"],
        "recommended_systems": ["character", "skill", "item", "gacha", "economy",
                                 "quest", "social", "growth"],
        "highlight": "仙人卡组、境界突破、宗门卡池、渡劫玩法",
    },
    "post_apoc_tower_defense": {
        "label": "末日塔防",
        "style": "post_apoc",
        "module_type": "tower_defense",
        "secondary_modules": ["survival"],
        "recommended_systems": ["character", "item", "equipment", "content", "battle",
                                 "skill", "growth", "economy"],
        "highlight": "废土防御塔、丧尸波次、资源管理、幸存者招募",
    },
    "wuxia_arpg": {
        "label": "武侠 ARPG",
        "style": "wuxia",
        "module_type": "arpg",
        "secondary_modules": ["rpg"],
        "recommended_systems": ["character", "battle", "skill", "equipment", "growth",
                                 "quest", "item", "content", "customization"],
        "highlight": "武功连招、轻功攀爬、江湖剧情、神兵利器",
    },
    "fantasy_slg": {
        "label": "奇幻 SLG",
        "style": "fantasy",
        "module_type": "slg",
        "secondary_modules": ["rpg"],
        "recommended_systems": ["character", "social", "economy", "quest", "content",
                                 "battle", "growth", "equipment", "item"],
        "highlight": "种族阵营、领地建设、魔法军团、王座争霸",
    },
    "cyberpunk_moba": {
        "label": "赛博 MOBA",
        "style": "cyberpunk",
        "module_type": "moba",
        "secondary_modules": ["fps"],
        "recommended_systems": ["character", "battle", "skill", "equipment", "competitive",
                                 "growth", "customization", "social"],
        "highlight": "义体英雄、技能组合、企业战队、霓虹地图",
    },
}


def get_preset_by_key(preset_key: str) -> dict | None:
    """按 key 获取混合玩法预设"""
    return HYBRID_GAMEPLAY_PRESETS.get(preset_key)


def find_preset(style: str, module_type: str) -> dict | None:
    """根据风格+模块类型查找最匹配的预设"""
    for key, preset in HYBRID_GAMEPLAY_PRESETS.items():
        if preset["style"] == style and preset["module_type"] == module_type:
            return {"key": key, **preset}
    # 退化匹配：仅风格
    for key, preset in HYBRID_GAMEPLAY_PRESETS.items():
        if preset["style"] == style:
            return {"key": key, **preset}
    # 退化匹配：仅模块
    for key, preset in HYBRID_GAMEPLAY_PRESETS.items():
        if preset["module_type"] == module_type:
            return {"key": key, **preset}
    return None


def get_recommended_systems(module_type: str) -> tuple[list, list]:
    """返回 (core_systems, optional_systems)"""
    rec = MODULE_SYSTEM_RECOMMENDATIONS.get(module_type)
    if rec:
        return rec["core_systems"], rec["optional_systems"]
    return [], []


def check_system_dependencies(enabled_systems: list) -> list:
    """检查已启用系统的依赖是否满足

    Args:
        enabled_systems: 已启用的系统 key 列表

    Returns:
        list[dict]: 缺失依赖列表，每项 {"system": str, "missing": [str]}
    """
    missing_list = []
    enabled_set = set(enabled_systems)
    for sys_key in enabled_systems:
        deps = SYSTEM_DEPENDENCIES.get(sys_key, [])
        missing = [d for d in deps if d not in enabled_set]
        if missing:
            missing_list.append({"system": sys_key, "missing": missing})
    return missing_list
