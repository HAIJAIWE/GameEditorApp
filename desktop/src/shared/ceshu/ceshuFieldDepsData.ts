import type { ChapterKey } from './ceshuConstants'

/**
 * 字段依赖定义层（与 ceshuFieldDeps.ts 的求值逻辑分离）：
 * 依赖类型 / 检查状态常量、展示元信息、FieldDependency 类型、20 条字段依赖规则表。
 * 纯数据，无 IO / 求值逻辑；逻辑层 ceshuFieldDeps.ts 导入此处常量并 re-export 公共 API。
 */

/* ---- 依赖类型 ---- */
export const DEP_TYPE_CONSISTENCY = 'consistency'
export const DEP_TYPE_DERIVED = 'derived'
export const DEP_TYPE_REFERENCE = 'reference'
export type FieldDependencyType =
  | typeof DEP_TYPE_CONSISTENCY
  | typeof DEP_TYPE_DERIVED
  | typeof DEP_TYPE_REFERENCE

/* ---- 检查状态 ---- */
export const STATUS_OK = 'ok'
export const STATUS_WARNING = 'warning'
export const STATUS_VIOLATION = 'violation'
export type FieldDependencyStatus =
  | typeof STATUS_OK
  | typeof STATUS_WARNING
  | typeof STATUS_VIOLATION

/** 状态 → 严重度序号（取最严重者时用；越小越轻） */
export const STATUS_SEVERITY: Record<FieldDependencyStatus, number> = {
  [STATUS_OK]: 0,
  [STATUS_WARNING]: 1,
  [STATUS_VIOLATION]: 2
}

/** 严重度序号 → 状态（STATUS_SEVERITY 的逆查表） */
export const SEVERITY_STATUS: readonly FieldDependencyStatus[] = [STATUS_OK, STATUS_WARNING, STATUS_VIOLATION]

/** 依赖类型中文名（UI 展示用） */
export const DEP_TYPE_LABELS: Record<FieldDependencyType, string> = {
  [DEP_TYPE_CONSISTENCY]: '一致性',
  [DEP_TYPE_DERIVED]: '派生',
  [DEP_TYPE_REFERENCE]: '引用'
}

/** 状态展示元信息（图标/颜色/标签，供面板与图节点着色） */
export const STATUS_META: Record<FieldDependencyStatus, { icon: string; color: string; label: string }> = {
  [STATUS_OK]: { icon: '✅', color: '#22C55E', label: '通过' },
  [STATUS_WARNING]: { icon: '⚠️', color: '#F59E0B', label: '警告' },
  [STATUS_VIOLATION]: { icon: '❌', color: '#EF4444', label: '冲突' }
}

/** 字段级依赖关系定义（对应 Python dataclass FieldDependency） */
export interface FieldDependency {
  source_chapter: ChapterKey
  source_field: string
  target_chapter: ChapterKey
  target_field: string
  dependency_type: FieldDependencyType
  description: string
  /** 自动检查规则名；null 表示不自动检查（与 Python 一致） */
  check_rule: string | null
}

/**
 * 字段依赖规则表（与 Python FIELD_DEPENDENCIES 一致，共 20 条）。
 * - 一致性 consistency：8 条
 * - 派生 derived：5 条
 * - 引用 reference：7 条
 */
export const FIELD_DEPENDENCIES: readonly FieldDependency[] = [
  // 一致性依赖（consistency）
  {
    source_chapter: 'combat',
    source_field: 'combat_mode',
    target_chapter: 'systems',
    target_field: 'battle.config.turn_mode',
    dependency_type: DEP_TYPE_CONSISTENCY,
    description: '战斗模式与系统回合制设置应一致',
    check_rule: 'check_combat_turn_consistency'
  },
  {
    source_chapter: 'monetization',
    source_field: 'payment_model',
    target_chapter: 'systems',
    target_field: 'economy.config.payment_system',
    dependency_type: DEP_TYPE_CONSISTENCY,
    description: '付费模式与经济系统应一致',
    check_rule: 'check_payment_consistency'
  },
  {
    source_chapter: 'monetization',
    source_field: 'pricing_tiers',
    target_chapter: 'systems',
    target_field: 'economy.config.recharge_tiers',
    dependency_type: DEP_TYPE_CONSISTENCY,
    description: '定价档位与充值档位应一致',
    check_rule: 'check_pricing_tiers_consistency'
  },
  {
    source_chapter: 'economy',
    source_field: 'currency_types',
    target_chapter: 'systems',
    target_field: 'economy.config.currency_types',
    dependency_type: DEP_TYPE_CONSISTENCY,
    description: '经济货币类型与系统配置应一致',
    check_rule: 'check_currency_types_consistency'
  },
  {
    source_chapter: 'risk_handling',
    source_field: 'risk_matrix',
    target_chapter: 'resources',
    target_field: 'risk_matrix',
    dependency_type: DEP_TYPE_CONSISTENCY,
    description: '风险矩阵与资源规划应同步',
    check_rule: 'check_risk_matrix_consistency'
  },
  {
    source_chapter: 'mvp',
    source_field: 'milestones',
    target_chapter: 'tech',
    target_field: 'milestones',
    dependency_type: DEP_TYPE_CONSISTENCY,
    description: 'MVP 里程碑应与技术里程碑对齐',
    check_rule: 'check_mvp_milestones_consistency'
  },
  {
    source_chapter: 'accessibility',
    source_field: 'language_list',
    target_chapter: 'resources',
    target_field: 'localization',
    dependency_type: DEP_TYPE_CONSISTENCY,
    description: '可访问性语言列表与资源本地化应一致',
    check_rule: 'check_language_list_consistency'
  },
  {
    source_chapter: 'story',
    source_field: 'factions',
    target_chapter: 'systems',
    target_field: 'social.config.faction_system',
    dependency_type: DEP_TYPE_CONSISTENCY,
    description: '世界观阵营与社交系统阵营应协同',
    check_rule: 'check_faction_consistency'
  },

  // 派生依赖（derived）
  {
    source_chapter: 'story',
    source_field: 'main_npc_count',
    target_chapter: 'systems',
    target_field: 'character.config.class_count',
    dependency_type: DEP_TYPE_DERIVED,
    description: 'NPC 数量应与角色系统规模匹配',
    check_rule: 'check_npc_count'
  },
  {
    source_chapter: 'numeric',
    source_field: 'core_formulas',
    target_chapter: 'combat',
    target_field: 'damage_formula',
    dependency_type: DEP_TYPE_DERIVED,
    description: '数值核心公式应派生自战斗伤害公式',
    check_rule: 'check_formula_derivation'
  },
  {
    source_chapter: 'audio',
    source_field: 'music_style',
    target_chapter: 'art',
    target_field: 'art_style',
    dependency_type: DEP_TYPE_DERIVED,
    description: '音乐风格应由美术风格派生',
    check_rule: 'check_style_derivation'
  },
  {
    source_chapter: 'gameplay',
    source_field: 'core_loop',
    target_chapter: 'combat',
    target_field: 'combat_mode',
    dependency_type: DEP_TYPE_DERIVED,
    description: '核心循环应由战斗模式派生',
    check_rule: 'check_core_loop_derivation'
  },
  {
    source_chapter: 'art',
    source_field: 'character_design',
    target_chapter: 'story',
    target_field: 'protagonist',
    dependency_type: DEP_TYPE_DERIVED,
    description: '美术角色设计应由角色设定派生',
    check_rule: 'check_character_design_derivation'
  },

  // 引用依赖（reference，均无自动检查规则）
  {
    source_chapter: 'market_analysis',
    source_field: 'target_market',
    target_chapter: 'accessibility',
    target_field: 'localization_strategy',
    dependency_type: DEP_TYPE_REFERENCE,
    description: '目标市场决定本地化策略',
    check_rule: null
  },
  {
    source_chapter: 'market_analysis',
    source_field: 'competitors',
    target_chapter: 'monetization',
    target_field: 'payment_model',
    dependency_type: DEP_TYPE_REFERENCE,
    description: '竞品分析影响付费模式选择',
    check_rule: null
  },
  {
    source_chapter: 'vision',
    source_field: 'differentiation',
    target_chapter: 'market_analysis',
    target_field: 'market_positioning',
    dependency_type: DEP_TYPE_REFERENCE,
    description: '差异化定位与市场定位相互引用',
    check_rule: null
  },
  {
    source_chapter: 'tech',
    source_field: 'engine',
    target_chapter: 'art',
    target_field: 'art_style',
    dependency_type: DEP_TYPE_REFERENCE,
    description: '技术引擎选型影响美术风格可行性',
    check_rule: null
  },
  {
    source_chapter: 'resources',
    source_field: 'budget',
    target_chapter: 'mvp',
    target_field: 'budget_estimate',
    dependency_type: DEP_TYPE_REFERENCE,
    description: '资源预算应参考 MVP 预算估算',
    check_rule: null
  },
  {
    source_chapter: 'story',
    source_field: 'boss_design',
    target_chapter: 'combat',
    target_field: 'boss_mechanics',
    dependency_type: DEP_TYPE_REFERENCE,
    description: 'Boss 设计与战斗 Boss 机制相互引用',
    check_rule: null
  },
  {
    source_chapter: 'meta',
    source_field: 'positioning',
    target_chapter: 'market_analysis',
    target_field: 'market_positioning',
    dependency_type: DEP_TYPE_REFERENCE,
    description: '项目定位与市场定位相互引用',
    check_rule: null
  }
]
