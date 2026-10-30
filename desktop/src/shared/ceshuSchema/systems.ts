/**
 * 章节 `systems` 的按章 schema（档 4 合并，2026-10-24）。
 *
 * 字段定义 / 契约（aiHint/reviewHint/aiDraftable 已内联）/ 三件套拆分清单
 * 全部收进单文件（字段 / 契约 / 拆分 / 默认 / 模板），改一个字段只碰这一处。
 */
import type { ChapterTemplate } from '../ceshu/reference/ceshuTemplates'
import type { ChapterSchema } from './types'
import type { CeshuFieldDef, ChapterData } from '../ceshu/reference/ceshuConstants'

export const SYSTEMS_FIELDS: CeshuFieldDef[] = []

export const SYSTEMS_DEFAULTS: ChapterData = {
  battle: {
    enabled: false,
    name: '战斗',
    config: {
      turn_mode: '',
      pvp_type: '',
      team_size: '',
      battle_duration: '',
      damage_formula: '',
      death_penalty: '',
      combat_pace: '',
      buff_limit: '',
      crit_system: '',
      element_system: '',
      escape_rule: '',
      ai_behavior: '',
      battle_trigger: '',
      battle_view: '',
      multiplayer_coop: ''
    }
  },
  character: {
    enabled: false,
    name: '角色',
    config: {
      max_level: '',
      init_level: '',
      attribute_system: '',
      base_attributes: '',
      growth_rate: '',
      class_count: '',
      class_change: '',
      talent_system: '',
      gender_options: '',
      character_slot: '',
      respawn_rule: '',
      race_enabled: '',
      race_count: '',
      race_list: ''
    }
  },
  skill: {
    enabled: false,
    name: '技能',
    config: {
      max_skill_count: '',
      skill_max_level: '',
      skill_type: '',
      skill_point_source: '',
      learn_method: '',
      upgrade_method: '',
      combo_system: '',
      cooldown_mode: '',
      resource_cost: '',
      aoe_rule: '',
      skill_tree: '',
      element_type: ''
    }
  },
  equipment: {
    enabled: false,
    name: '装备',
    config: {
      slot_count: '',
      equip_types: '',
      quality_levels: '',
      enhance_max: '',
      enhance_material: '',
      set_bonus_enabled: '',
      socket_enabled: '',
      durability_enabled: '',
      enchant_system: '',
      refine_system: '',
      decompose_system: '',
      score_system: ''
    }
  },
  item: {
    enabled: false,
    name: '物品',
    config: {
      item_categories: '',
      stack_size_max: '',
      rarity_levels: '',
      trade_enabled: '',
      drop_bind_rule: '',
      craft_system: '',
      consumable_system: '',
      use_effect: '',
      bag_size: '',
      bank_system: '',
      drop_system: ''
    }
  },
  quest: {
    enabled: false,
    name: '任务',
    config: {
      quest_types: '',
      daily_quest_limit: '',
      weekly_quest_limit: '',
      chain_quest_enabled: '',
      story_quest: '',
      branch_quest: '',
      random_quest: '',
      achievement_integration: '',
      repeatable: '',
      quest_track_limit: '',
      reward_rule: ''
    }
  },
  social: {
    enabled: false,
    name: '社交',
    config: {
      faction_system: '',
      guild_max_members: '',
      guild_level: '',
      guild_war: '',
      team_size: '',
      friend_max: '',
      mentor_system: '',
      marriage_system: '',
      enemy_system: '',
      chat_channels: '',
      mail_system: '',
      trade_system: '',
      blacklist_system: ''
    }
  },
  economy: {
    enabled: false,
    name: '经济',
    config: {
      currency_types: '',
      init_currency: '',
      source_mechanisms: '',
      sink_mechanisms: '',
      tax_rate: '',
      market_type: '',
      inflation_control: '',
      payment_system: '',
      recharge_tiers: '',
      vip_system: '',
      monthly_card: '',
      season_pass: '',
      vip_max_level: '',
      monthly_card_price: '',
      season_pass_price: ''
    }
  },
  growth: {
    enabled: false,
    name: '成长',
    config: {
      exp_source: '',
      exp_curve: '',
      attribute_point: '',
      breakthrough_enabled: '',
      prestige_system: '',
      rank_system: '',
      achievement_score: '',
      achievement_reward: '',
      progression_track: ''
    }
  },
  customization: {
    enabled: false,
    name: '自定义外观',
    config: {
      appearance_slots: '',
      dye_system: '',
      mount_enabled: '',
      housing_enabled: '',
      title_system: '',
      pet_system: '',
      follower_system: '',
      emote_system: '',
      skin_system: '',
      profile_tag: '',
      avatar_system: ''
    }
  },
  content: {
    enabled: false,
    name: '关卡内容',
    config: {
      stage_count: '',
      stage_types: '',
      difficulty_tiers: '',
      stage_reward: '',
      chapter_system: '',
      star_rating: '',
      sweep_enabled: '',
      energy_system: '',
      endless_mode: '',
      weekly_dungeon: '',
      energy_cap: '',
      energy_regen: ''
    }
  },
  gacha: {
    enabled: false,
    name: '抽卡系统',
    config: {
      gacha_types: '',
      currency_type: '',
      pity_count: '',
      pity_mechanism: '',
      rate_up_enabled: '',
      spark_enabled: '',
      free_draw: '',
      banner_rotation: '',
      guarantee_carry: '',
      gacha_price_single: '',
      gacha_price_ten: ''
    }
  },
  competitive: {
    enabled: false,
    name: '排位竞技',
    config: {
      rank_tiers: '',
      season_duration: '',
      mmr_system: '',
      placement_matches: '',
      tier_protection: '',
      rank_reward: '',
      leaderboard: '',
      matchmaking_pool: '',
      ban_pick_enabled: '',
      decay_system: ''
    }
  }
}

export const SYSTEMS_TEMPLATES: ChapterTemplate[] = [
  {
    name: 'RPG 标准系统组合',
    description: 'RPG 推荐启用的核心系统组合',
    tags: [
      'RPG',
      '系统组合'
    ],
    data: {},
    note: '请使用「预设」按钮应用 RPG 系统组合，或手动在第四章勾选系统。'
  }
]

export const SYSTEMS_SCHEMA: ChapterSchema = {
  fields: SYSTEMS_FIELDS,
  splits: [],
  splitHints: undefined,
  defaults: SYSTEMS_DEFAULTS,
  templates: SYSTEMS_TEMPLATES
}
