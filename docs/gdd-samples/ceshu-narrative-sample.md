# 深潮灯塔

> 版本: v1.0 | 类型: 塔防 | 日期: 2026-10-26

**一句话定位**: 深海灯塔防守，三种塔克制趋光生物

**主要用户**: 喜欢摆位策略的轻度玩家

**次要用户**: 碎片时间的休闲玩家

**设计愿景**: 在无光深海守住最后一座灯塔

**设计支柱**:

| 支柱 | 裁决 | 反例（明确不做） |
| --- | --- | --- |
| 每座塔有克星 | 克制关系决定取舍 | 不做全能塔 |
| 漏怪有代价 | 耐久预算 | 不做一击必杀 |
| 数值可复算 | 公式+期望+容差 | 不做隐藏动态难度 |


**核心循环**: 击杀→生物质→建塔→守更多波

---

## 玩法走读（约 90 秒）

开局 150 生物质，建探照灯；第一只浮游体 1.2 秒击杀，+2 生物质；第 4 波甲壳兽带 40% 护甲，探照灯打不动，必须补腐蚀塔……

---

## 玩法架构

### 状态机

PREPARE → WAVE → LEAK / LOSE → PREPARE

### 游戏系统

| 系统 | 状态 | 数据类型 | 名称 |
|---|---|---|---|
| battle | ⬜ 未启用 | battle | 战斗 |
| character | ⬜ 未启用 | character | 角色 |
| skill | ⬜ 未启用 | skill | 技能 |
| equipment | ⬜ 未启用 | equipment | 装备 |
| item | ⬜ 未启用 | item | 物品 |
| quest | ⬜ 未启用 | quest | 任务 |
| social | ⬜ 未启用 | social | 社交 |
| economy | ⬜ 未启用 | economy | 经济 |
| growth | ⬜ 未启用 | growth | 成长 |
| customization | ⬜ 未启用 | customization | 自定义外观 |
| content | ⬜ 未启用 | content | 关卡内容 |
| gacha | ⬜ 未启用 | gacha | 抽卡系统 |
| competitive | ⬜ 未启用 | competitive | 排位竞技 |

---

## 核心机制

### 第三章·核心玩法

**核心循环**: 击杀→生物质→建塔→守更多波

**新手体验(前30分钟)**: 开局 150 生物质，建探照灯；第一只浮游体 1.2 秒击杀，+2 生物质；第 4 波甲壳兽带 40% 护甲，探照灯打不动，必须补腐蚀塔……

**核心状态机**: PREPARE → WAVE → LEAK / LOSE → PREPARE

### 第五章·战斗系统设计

**伤害公式**: 伤害 = 基础 × 1.5^(等级-1)（甲壳兽护甲 40% 减免直伤，DoT 无视护甲）

### 第四章·游戏系统设计

**battle**:
enabled: 否
name: 战斗
config:
    turn_mode: —
  pvp_type: —
  team_size: —
  battle_duration: —
  damage_formula: —
  death_penalty: —
  combat_pace: —
  buff_limit: —
  crit_system: —
  element_system: —
  escape_rule: —
  ai_behavior: —
  battle_trigger: —
  battle_view: —
  multiplayer_coop: —

**character**:
enabled: 否
name: 角色
config:
    max_level: —
  init_level: —
  attribute_system: —
  base_attributes: —
  growth_rate: —
  class_count: —
  class_change: —
  talent_system: —
  gender_options: —
  character_slot: —
  respawn_rule: —
  race_enabled: —
  race_count: —
  race_list: —

**skill**:
enabled: 否
name: 技能
config:
    max_skill_count: —
  skill_max_level: —
  skill_type: —
  skill_point_source: —
  learn_method: —
  upgrade_method: —
  combo_system: —
  cooldown_mode: —
  resource_cost: —
  aoe_rule: —
  skill_tree: —
  element_type: —

**equipment**:
enabled: 否
name: 装备
config:
    slot_count: —
  equip_types: —
  quality_levels: —
  enhance_max: —
  enhance_material: —
  set_bonus_enabled: —
  socket_enabled: —
  durability_enabled: —
  enchant_system: —
  refine_system: —
  decompose_system: —
  score_system: —

**item**:
enabled: 否
name: 物品
config:
    item_categories: —
  stack_size_max: —
  rarity_levels: —
  trade_enabled: —
  drop_bind_rule: —
  craft_system: —
  consumable_system: —
  use_effect: —
  bag_size: —
  bank_system: —
  drop_system: —

**quest**:
enabled: 否
name: 任务
config:
    quest_types: —
  daily_quest_limit: —
  weekly_quest_limit: —
  chain_quest_enabled: —
  story_quest: —
  branch_quest: —
  random_quest: —
  achievement_integration: —
  repeatable: —
  quest_track_limit: —
  reward_rule: —

**social**:
enabled: 否
name: 社交
config:
    faction_system: —
  guild_max_members: —
  guild_level: —
  guild_war: —
  team_size: —
  friend_max: —
  mentor_system: —
  marriage_system: —
  enemy_system: —
  chat_channels: —
  mail_system: —
  trade_system: —
  blacklist_system: —

**economy**:
enabled: 否
name: 经济
config:
    currency_types: —
  init_currency: —
  source_mechanisms: —
  sink_mechanisms: —
  tax_rate: —
  market_type: —
  inflation_control: —
  payment_system: —
  recharge_tiers: —
  vip_system: —
  monthly_card: —
  season_pass: —
  vip_max_level: —
  monthly_card_price: —
  season_pass_price: —

**growth**:
enabled: 否
name: 成长
config:
    exp_source: —
  exp_curve: —
  attribute_point: —
  breakthrough_enabled: —
  prestige_system: —
  rank_system: —
  achievement_score: —
  achievement_reward: —
  progression_track: —

**customization**:
enabled: 否
name: 自定义外观
config:
    appearance_slots: —
  dye_system: —
  mount_enabled: —
  housing_enabled: —
  title_system: —
  pet_system: —
  follower_system: —
  emote_system: —
  skin_system: —
  profile_tag: —
  avatar_system: —

**content**:
enabled: 否
name: 关卡内容
config:
    stage_count: —
  stage_types: —
  difficulty_tiers: —
  stage_reward: —
  chapter_system: —
  star_rating: —
  sweep_enabled: —
  energy_system: —
  endless_mode: —
  weekly_dungeon: —
  energy_cap: —
  energy_regen: —

**gacha**:
enabled: 否
name: 抽卡系统
config:
    gacha_types: —
  currency_type: —
  pity_count: —
  pity_mechanism: —
  rate_up_enabled: —
  spark_enabled: —
  free_draw: —
  banner_rotation: —
  guarantee_carry: —
  gacha_price_single: —
  gacha_price_ten: —

**competitive**:
enabled: 否
name: 排位竞技
config:
    rank_tiers: —
  season_duration: —
  mmr_system: —
  placement_matches: —
  tier_protection: —
  rank_reward: —
  leaderboard: —
  matchmaking_pool: —
  ban_pick_enabled: —
  decay_system: —

---

## 数值设计

**core_formula**: HP(w) = ceil(18 × 1.16^(w-1))；gold(w) = ceil(2 × 1.08^(w-1))

---

## 首个可玩范围（MVP）

**MVP 范围**: 20 波防守 + 3 种塔 + 漏怪扣耐久 + 胜负与重开

**团队规模**: 0

---

## 原型验证

**原型验收记录**: 首载无错误；建塔扣费 150→100；×5 加速 wave0→1；耐久 1 漏怪→「灯塔熄灭」；重开 wave0/hp20

---

## 变更记录

- 版本：v1.0
- 更新：2026-10-26 13:59:08

---

## 附录：模块细节

### 3. 第二章·世界观与角色

**主要 NPC 数量**: 0

### 9. 第八章·美术设计

**美术风格**: 深海霓虹：深蓝底 + 青绿生物光

### 10. 第九章·音频设计

**音效数量估算**: 0
