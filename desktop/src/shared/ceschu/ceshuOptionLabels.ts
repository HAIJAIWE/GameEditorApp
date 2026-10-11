/**
 * combo / multiCombo 选项的**中文别名表**（定义层，仅供 `systemConfigSchema` 与 `ceshuFields` 引用）。
 *
 * 起因（Python 侧缺陷）：下拉只给英文枚举码，渲染层 `optionLabels?.[option] ?? option`
 * ⇒ 界面裸显示 turn_based / arena / behavior_tree / f2p_p2w 这类内部码。
 *
 * 两条硬约束（由 `tests/unit/ceshuOptionLabels.test.ts` 锁死）：
 * 1. **每个选项都必须配到**——漏配 ⇒ 该选项回退成枚举码，会被守卫抓出来。
 * 2. **渲染文本不得是「全小写 ascii 枚举码」**——专有名词（Unity / FMOD / Elo / Top 100）
 *    与中文标签均合法；所以 `none` 这类值必须显式映射为「无」。
 *
 * 复用：同一枚举集在多处出现（如战斗模式同时是 `combat.combat_mode` 与
 * `systems.battle.config.turn_mode`）⇒ 共用同一张表，避免两处翻译漂移。
 */

/** 无 / 关闭：绝大多数枚举集的默认值，单独抽出以避免逐表重复 */
const NONE: Record<string, string> = { none: '无' }

/** 战斗模式（combat.combat_mode / systems.battle.config.turn_mode 共用） */
export const COMBAT_MODE_LABELS: Record<string, string> = {
  turn_based: '回合制',
  realtime: '即时制',
  semi_realtime: '半即时制',
  auto_battle: '自动战斗',
  atb: 'ATB（行动条）',
  ctb: 'CTB（回合条）',
  srpg_grid: 'SRPG 战棋格'
}

/** 战斗节奏（combat.combat_pace / systems.battle.config.combat_pace 共用） */
export const COMBAT_PACE_LABELS: Record<string, string> = {
  slow: '慢节奏',
  medium: '中节奏',
  fast: '快节奏',
  variable: '可变节奏'
}

/** 付费模式（monetization.payment_model） */
export const PAYMENT_MODEL_LABELS: Record<string, string> = {
  f2p: '免费游玩（F2P）',
  p2p: '付费游玩（P2P）',
  b2p: '买断制（B2P）',
  subscription: '订阅制',
  f2p_p2w: '免费+数值付费（P2W）',
  f2p_cosmetic: '免费+外观付费',
  buy_to_play: '买断游玩'
}

/** 付费模式（systems.economy.config.payment_system，PAYMENT_MODEL 的子集） */
export const PAYMENT_SYSTEM_LABELS: Record<string, string> = {
  f2p: '免费游玩（F2P）',
  p2p: '付费游玩（P2P）',
  f2p_p2w: '免费+数值付费（P2W）',
  f2p_cosmetic: '免费+外观付费',
  buy_to_play: '买断游玩'
}

/** 文档状态（meta.status） */
export const DOC_STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  in_progress: '进行中',
  review: '评审中',
  final: '定稿'
}

/** 保密级别（meta.confidentiality） */
export const CONFIDENTIALITY_LABELS: Record<string, string> = {
  internal: '内部',
  confidential: '保密',
  strictly_confidential: '严格保密',
  public: '公开'
}

/**
 * 策划档位（meta.gdd_scope）。
 * 章数说法必须与 `ceshuConstants` 的 `CHAPTER_PARTS` 一致：标准版 = 文档信息 + 核心设计 9 章，
 * 专业版 = 文档信息 + 全部 16 章（**文档信息段不占章号**，所以不写「17 章」）。
 */
export const GDD_SCOPE_LABELS: Record<string, string> = {
  lite: '标准版（文档信息 + 9 章）',
  full: '专业版（文档信息 + 16 章）'
}

/**
 * 引擎 / 音频引擎：**专有名词中英同形**，别名表按原样登记。
 * 仍要显式登记的原因：守卫要求所有 combo 都带 `optionLabels`，
 * 否则「新增 combo 时忘了判断要不要配中文」这类漏配只能靠肉眼发现。
 */
export const ENGINE_LABELS: Record<string, string> = {
  Unity: 'Unity',
  'Unreal Engine': 'Unreal Engine',
  Godot: 'Godot',
  Cocos2d: 'Cocos2d',
  PyGame: 'PyGame',
  自定义引擎: '自定义引擎',
  其他: '其他'
}

/** @see ENGINE_LABELS */
export const AUDIO_ENGINE_LABELS: Record<string, string> = {
  FMOD: 'FMOD',
  Wwise: 'Wwise',
  'CRI ADX': 'CRI ADX',
  'Unity Audio': 'Unity Audio',
  'Unreal Audio': 'Unreal Audio',
  自研: '自研'
}

/* ---- 各游戏系统 config 专有枚举 ---- */

export const PVP_TYPE_LABELS: Record<string, string> = {
  ...NONE,
  arena: '竞技场',
  open_world: '开放世界 PVP',
  guild_war: '公会战',
  battle_royale: '大逃杀'
}

export const ELEMENT_SYSTEM_LABELS: Record<string, string> = {
  ...NONE,
  single: '单一元素',
  multi: '多元素',
  reaction: '元素反应'
}

export const ESCAPE_RULE_LABELS: Record<string, string> = {
  ...NONE,
  chance_based: '概率逃跑',
  item_required: '道具逃跑',
  cooldown: '冷却后可逃'
}

export const AI_BEHAVIOR_LABELS: Record<string, string> = {
  scripted: '脚本 AI',
  behavior_tree: '行为树',
  state_machine: '状态机',
  utility_ai: '效用 AI'
}

export const BATTLE_TRIGGER_LABELS: Record<string, string> = {
  touch: '接触触发',
  menu: '菜单触发',
  zone: '区域触发',
  auto: '自动触发'
}

export const BATTLE_VIEW_LABELS: Record<string, string> = {
  '2d_side': '2D 横版',
  '2d_top': '2D 俯视',
  '3d_first': '3D 第一人称',
  '3d_third': '3D 第三人称',
  isometric: '等距视角'
}

export const CLASS_CHANGE_LABELS: Record<string, string> = {
  ...NONE,
  tier_based: '阶职转职',
  free_switch: '自由切换',
  locked: '固定职业'
}

export const GENDER_OPTIONS_LABELS: Record<string, string> = {
  male_female: '男 / 女',
  male_female_neutral: '男 / 女 / 中性',
  single: '单一性别',
  custom: '自定义'
}

export const SKILL_TYPE_LABELS: Record<string, string> = {
  active_only: '仅主动技能',
  active_passive: '主动 + 被动',
  active_passive_aura: '主动 + 被动 + 光环'
}

export const LEARN_METHOD_LABELS: Record<string, string> = {
  auto_level: '升级自动习得',
  manual_learn: '手动学习',
  quest_reward: '任务奖励',
  skill_book: '技能书'
}

export const UPGRADE_METHOD_LABELS: Record<string, string> = {
  auto_upgrade: '自动升级',
  point_invest: '技能点投入',
  material_cost: '材料消耗',
  scripted: '剧情解锁'
}

export const COMBO_SYSTEM_LABELS: Record<string, string> = {
  ...NONE,
  simple: '简单连招',
  chain: '链式连招',
  branch: '分支连招'
}

export const COOLDOWN_MODE_LABELS: Record<string, string> = {
  per_skill: '逐技能冷却',
  global: '全局冷却',
  shared_group: '分组共享冷却'
}

export const AOE_RULE_LABELS: Record<string, string> = {
  single_target: '单体',
  multi_target: '多目标',
  aoe_circle: '圆形范围',
  aoe_cone: '扇形范围'
}

export const SKILL_TREE_LABELS: Record<string, string> = {
  ...NONE,
  linear: '线性',
  branch_tree: '分支树',
  mesh: '网状'
}

export const ELEMENT_TYPE_LABELS: Record<string, string> = {
  ...NONE,
  fire_ice_electric: '火 / 冰 / 电',
  earth_water_fire_wind: '地 / 水 / 火 / 风',
  metal_wood_water_fire_earth: '金 / 木 / 水 / 火 / 土',
  light_dark: '光 / 暗',
  light_dark_wuxing: '光 / 暗 + 五行',
  dual_element: '双元素',
  custom: '自定义'
}

export const SCORE_SYSTEM_LABELS: Record<string, string> = {
  ...NONE,
  ilvl: '物品等级（iLvl）',
  power_score: '战力评分',
  stars: '星级'
}

export const DROP_BIND_RULE_LABELS: Record<string, string> = {
  ...NONE,
  bind_on_pickup: '拾取绑定',
  bind_on_equip: '装备绑定'
}

export const DROP_SYSTEM_LABELS: Record<string, string> = {
  fixed_table: '固定掉落表',
  weighted_table: '权重掉落表',
  dynamic_table: '动态掉落表'
}

export const STORY_QUEST_LABELS: Record<string, string> = {
  linear: '线性',
  branch: '分支',
  sandbox: '沙盒'
}

export const BRANCH_QUEST_LABELS: Record<string, string> = {
  ...NONE,
  binary: '二选一',
  multi_branch: '多分支'
}

export const RANDOM_QUEST_LABELS: Record<string, string> = {
  ...NONE,
  daily_random: '每日随机',
  map_random: '地图随机',
  event_random: '活动随机'
}

export const REPEATABLE_LABELS: Record<string, string> = {
  ...NONE,
  daily: '每日',
  weekly: '每周',
  unlimited: '无限重复'
}

export const FACTION_SYSTEM_LABELS: Record<string, string> = {
  ...NONE,
  two_sides: '双阵营',
  multi_sides: '多阵营'
}

export const GUILD_WAR_LABELS: Record<string, string> = {
  ...NONE,
  scheduled: '定时开启',
  always_on: '常驻开放',
  seasonal: '赛季制'
}

export const MARKET_TYPE_LABELS: Record<string, string> = {
  ...NONE,
  auction: '拍卖行',
  shop: '商店',
  player_shop: '玩家商店',
  hybrid: '混合'
}

export const ATTRIBUTE_POINT_LABELS: Record<string, string> = {
  auto: '自动分配',
  manual: '手动分配',
  hybrid: '混合分配'
}

export const RANK_SYSTEM_LABELS: Record<string, string> = {
  ...NONE,
  elo: 'Elo 积分',
  star: '星级',
  tier: '段位分级'
}

export const PROGRESSION_TRACK_LABELS: Record<string, string> = {
  linear: '线性成长',
  milestone: '里程碑式',
  open_sandbox: '开放沙盒'
}

export const STAR_RATING_LABELS: Record<string, string> = {
  ...NONE,
  '1-3star': '1-3 星',
  '1-5star': '1-5 星'
}

export const ENERGY_SYSTEM_LABELS: Record<string, string> = {
  ...NONE,
  realtime: '实时恢复',
  daily_fixed: '每日固定'
}

export const PITY_MECHANISM_LABELS: Record<string, string> = {
  ...NONE,
  soft_pity: '软保底',
  hard_pity: '硬保底',
  both: '软硬双保底',
  ten_pull_guarantee: '十连必出'
}

export const FREE_DRAW_LABELS: Record<string, string> = {
  ...NONE,
  daily: '每日免费',
  weekly: '每周免费'
}

export const MMR_SYSTEM_LABELS: Record<string, string> = {
  ...NONE,
  elo: 'Elo',
  glicko: 'Glicko',
  trueskill: 'TrueSkill'
}

export const LEADERBOARD_LABELS: Record<string, string> = {
  ...NONE,
  top100: 'Top 100',
  top1000: 'Top 1000',
  all: '全量排行'
}
