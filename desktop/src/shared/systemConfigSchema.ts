import type { SystemConfigFieldDef } from './ceshuConstants'

/**
 * 13 个游戏系统的标准 config 字段定义（自 Python ceshu_constants.py SYSTEM_CONFIG_SCHEMA 匹平迁移）。
 * 字段类型映射：entry→text / textarea→textarea / combobox→combo / spinbox→number(from,to) / checkbox→checkbox
 */

function text(label: string): SystemConfigFieldDef {
  return { label, kind: 'text' }
}

function textarea(label: string): SystemConfigFieldDef {
  return { label, kind: 'textarea' }
}

function checkbox(label: string): SystemConfigFieldDef {
  return { label, kind: 'checkbox' }
}

function combo(label: string, values: string[]): SystemConfigFieldDef {
  return { label, kind: 'combo', values }
}

function number(label: string, from: number, to: number): SystemConfigFieldDef {
  return { label, kind: 'number', from, to }
}

export const SYSTEM_CONFIG_SCHEMA: Record<string, Record<string, SystemConfigFieldDef>> = {
  battle: {
    turn_mode: combo('战斗模式', ['turn_based', 'realtime', 'semi_realtime', 'auto_battle', 'atb', 'ctb', 'srpg_grid']),
    pvp_type: combo('PVP类型', ['none', 'arena', 'open_world', 'guild_war', 'battle_royale']),
    team_size: number('队伍人数', 1, 12),
    battle_duration: number('单局时长(秒)', 5, 1800),
    damage_formula: textarea('伤害公式'),
    death_penalty: textarea('死亡惩罚'),
    combat_pace: combo('战斗节奏', ['slow', 'medium', 'fast', 'variable']),
    buff_limit: number('Buff上限', 0, 32),
    crit_system: checkbox('暴击系统'),
    element_system: combo('元素系统', ['none', 'single', 'multi', 'reaction']),
    escape_rule: combo('逃跑机制', ['none', 'chance_based', 'item_required', 'cooldown']),
    ai_behavior: combo('AI行为', ['scripted', 'behavior_tree', 'state_machine', 'utility_ai']),
    battle_trigger: combo('战斗触发', ['touch', 'menu', 'zone', 'auto']),
    battle_view: combo('战斗视角', ['2d_side', '2d_top', '3d_first', '3d_third', 'isometric']),
    multiplayer_coop: checkbox('多人协作')
  },
  character: {
    max_level: number('等级上限', 1, 999),
    init_level: number('初始等级', 1, 100),
    attribute_system: textarea('属性体系'),
    base_attributes: textarea('基础属性'),
    growth_rate: text('升级成长系数'),
    class_count: number('职业数量', 1, 30),
    class_change: combo('转职系统', ['none', 'tier_based', 'free_switch', 'locked']),
    talent_system: checkbox('天赋系统'),
    gender_options: combo('性别选项', ['male_female', 'male_female_neutral', 'single', 'custom']),
    character_slot: number('角色栏位', 1, 10),
    respawn_rule: textarea('复活规则'),
    race_enabled: checkbox('种族系统'),
    race_count: number('种族数量', 0, 50),
    race_list: textarea('种族列表')
  },
  skill: {
    max_skill_count: number('技能槽位', 1, 20),
    skill_max_level: number('技能等级上限', 1, 30),
    skill_type: combo('技能类型', ['active_only', 'active_passive', 'active_passive_aura']),
    skill_point_source: textarea('技能点来源'),
    learn_method: combo('学习方式', ['auto_level', 'manual_learn', 'quest_reward', 'skill_book']),
    upgrade_method: combo('升级方式', ['auto_upgrade', 'point_invest', 'material_cost', 'scripted']),
    combo_system: combo('连招系统', ['none', 'simple', 'chain', 'branch']),
    cooldown_mode: combo('冷却模式', ['per_skill', 'global', 'shared_group']),
    resource_cost: textarea('资源消耗'),
    aoe_rule: combo('范围规则', ['single_target', 'multi_target', 'aoe_circle', 'aoe_cone']),
    skill_tree: combo('技能树', ['none', 'linear', 'branch_tree', 'mesh']),
    element_type: combo('元素类型', [
      'none',
      'fire_ice_electric',
      'earth_water_fire_wind',
      'metal_wood_water_fire_earth',
      'light_dark',
      'light_dark_wuxing',
      'dual_element',
      'custom'
    ])
  },
  equipment: {
    slot_count: number('装备槽数', 1, 15),
    equip_types: textarea('装备类型'),
    quality_levels: textarea('品质等级'),
    enhance_max: number('强化上限', 0, 99),
    enhance_material: textarea('强化材料'),
    set_bonus_enabled: checkbox('套装效果'),
    socket_enabled: checkbox('镶嵌系统'),
    durability_enabled: checkbox('耐久系统'),
    enchant_system: checkbox('附魔系统'),
    refine_system: checkbox('精炼系统'),
    decompose_system: checkbox('分解系统'),
    score_system: combo('装备评分', ['none', 'ilvl', 'power_score', 'stars'])
  },
  item: {
    item_categories: textarea('物品分类'),
    stack_size_max: number('最大堆叠', 1, 9999),
    rarity_levels: textarea('稀有度'),
    trade_enabled: checkbox('交易系统'),
    drop_bind_rule: combo('掉落绑定', ['none', 'bind_on_pickup', 'bind_on_equip']),
    craft_system: checkbox('合成系统'),
    consumable_system: checkbox('消耗品系统'),
    use_effect: textarea('使用效果'),
    bag_size: number('背包上限', 20, 500),
    bank_system: checkbox('仓库系统'),
    drop_system: combo('掉落系统', ['fixed_table', 'weighted_table', 'dynamic_table'])
  },
  quest: {
    quest_types: textarea('任务类型'),
    daily_quest_limit: number('日常上限', 0, 50),
    weekly_quest_limit: number('周常上限', 0, 30),
    chain_quest_enabled: checkbox('连环任务'),
    story_quest: combo('剧情任务', ['linear', 'branch', 'sandbox']),
    branch_quest: combo('分支任务', ['none', 'binary', 'multi_branch']),
    random_quest: combo('随机任务', ['none', 'daily_random', 'map_random', 'event_random']),
    achievement_integration: checkbox('成就系统'),
    repeatable: combo('可重复', ['none', 'daily', 'weekly', 'unlimited']),
    quest_track_limit: number('追踪上限', 1, 20),
    reward_rule: textarea('奖励规则')
  },
  social: {
    faction_system: combo('阵营系统', ['none', 'two_sides', 'multi_sides']),
    guild_max_members: number('公会人数', 10, 500),
    guild_level: number('公会等级', 1, 30),
    guild_war: combo('公会战', ['none', 'scheduled', 'always_on', 'seasonal']),
    team_size: number('组队人数', 2, 12),
    friend_max: number('好友上限', 10, 500),
    mentor_system: checkbox('师徒系统'),
    marriage_system: checkbox('结婚系统'),
    enemy_system: checkbox('仇人系统'),
    chat_channels: textarea('聊天频道'),
    mail_system: checkbox('邮件系统'),
    trade_system: checkbox('交易系统'),
    blacklist_system: checkbox('黑名单')
  },
  economy: {
    currency_types: textarea('货币类型'),
    init_currency: textarea('初始资金'),
    source_mechanisms: textarea('产出机制'),
    sink_mechanisms: textarea('回收机制'),
    tax_rate: number('交易税率%', 0, 30),
    market_type: combo('市场类型', ['none', 'auction', 'shop', 'player_shop', 'hybrid']),
    inflation_control: textarea('通胀控制'),
    payment_system: combo('付费模式', ['f2p', 'p2p', 'f2p_p2w', 'f2p_cosmetic', 'buy_to_play']),
    recharge_tiers: textarea('充值档位'),
    vip_system: checkbox('VIP系统'),
    monthly_card: checkbox('月卡'),
    season_pass: checkbox('赛季通行证'),
    vip_max_level: number('VIP等级上限', 0, 100),
    monthly_card_price: number('月卡价格', 0, 999),
    season_pass_price: number('赛季通行证价格', 0, 999)
  },
  growth: {
    exp_source: textarea('经验来源'),
    exp_curve: textarea('经验曲线'),
    attribute_point: combo('属性点分配', ['auto', 'manual', 'hybrid']),
    breakthrough_enabled: checkbox('突破系统'),
    prestige_system: checkbox('转生系统'),
    rank_system: combo('段位系统', ['none', 'elo', 'star', 'tier']),
    achievement_score: checkbox('成就积分'),
    achievement_reward: textarea('成就奖励'),
    progression_track: combo('成长轨迹', ['linear', 'milestone', 'open_sandbox'])
  },
  customization: {
    appearance_slots: number('外观槽位', 0, 15),
    dye_system: checkbox('染色系统'),
    mount_enabled: checkbox('坐骑系统'),
    housing_enabled: checkbox('家园系统'),
    title_system: checkbox('称号系统'),
    pet_system: checkbox('宠物系统'),
    follower_system: checkbox('随从系统'),
    emote_system: checkbox('表情系统'),
    skin_system: checkbox('皮肤系统'),
    profile_tag: checkbox('个性标签'),
    avatar_system: checkbox('头像系统')
  },
  content: {
    stage_count: number('关卡总数', 1, 999),
    stage_types: textarea('关卡类型'),
    difficulty_tiers: number('难度档次', 1, 10),
    stage_reward: textarea('关卡奖励'),
    chapter_system: checkbox('章节系统'),
    star_rating: combo('关卡星级', ['none', '1-3star', '1-5star']),
    sweep_enabled: checkbox('扫荡功能'),
    energy_system: combo('体力系统', ['none', 'realtime', 'daily_fixed']),
    endless_mode: checkbox('无尽模式'),
    weekly_dungeon: checkbox('周常副本'),
    energy_cap: number('体力上限', 0, 999),
    energy_regen: number('体力恢复(/分)', 0, 60)
  },
  gacha: {
    gacha_types: textarea('卡池类型'),
    currency_type: text('抽卡货币'),
    pity_count: number('保底次数', 0, 300),
    pity_mechanism: combo('保底机制', ['none', 'soft_pity', 'hard_pity', 'both', 'ten_pull_guarantee']),
    rate_up_enabled: checkbox('概率UP'),
    spark_enabled: checkbox('兑换系统'),
    free_draw: combo('免费抽取', ['none', 'daily', 'weekly']),
    banner_rotation: checkbox('卡池轮换'),
    guarantee_carry: checkbox('保底继承'),
    gacha_price_single: number('单抽价格', 0, 9999),
    gacha_price_ten: number('十连价格', 0, 99999)
  },
  competitive: {
    rank_tiers: textarea('段位列表'),
    season_duration: number('赛季时长(天)', 7, 365),
    mmr_system: combo('MMR算法', ['none', 'elo', 'glicko', 'trueskill']),
    placement_matches: number('定级赛场数', 0, 20),
    tier_protection: checkbox('段位保护'),
    rank_reward: textarea('赛季奖励'),
    leaderboard: combo('排行榜', ['none', 'top100', 'top1000', 'all']),
    matchmaking_pool: textarea('匹配池规则'),
    ban_pick_enabled: checkbox('B/P系统'),
    decay_system: checkbox('掉段机制')
  }
}