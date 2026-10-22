import type { ChapterFieldHints } from './types'

/**
 * 第五章·战斗系统设计的字段契约（P0 补契约，2026-10-23）。
 *
 * 本章要点：战斗各机制（模式/技能/元素/节奏）耦合极强，AI 最易写出互相矛盾的设计，
 * 契约要求每个字段给出产出结构，并附人审可核对的检查点；伤害公式三字段已有契约，跳过。
 */
export const COMBAT_FIELD_HINTS: ChapterFieldHints = {
  combat_mode: {
    aiHint: '从候选中选 1 个主模式并说明理由；须与战斗节奏、技能系统自洽',
    reviewHint: '选项是否来自候选列表；是否与节奏、技能设计互相矛盾'
  },
  skill_system: {
    aiHint: '产出技能体系框架：技能分类、获取与升级方式、消耗与冷却；列 3-5 个代表技能及效果',
    reviewHint: '是否有分类和升级路径；代表技能是否给出效果描述；消耗冷却是否明确'
  },
  buff_debuff: {
    aiHint: '列出主要 Buff/Debuff 类型、持续回合或时间与叠加规则；说明驱散方式',
    reviewHint: '持续与叠加规则是否明确；是否有驱散反制手段；是否与技能系统联动'
  },
  element_system: {
    aiHint: '定义元素种类与相克或反应关系；说明与技能、伤害计算的联动方式',
    reviewHint: '元素关系是否闭环自洽；是否关联技能与伤害公式；反应结果是否可判定'
  },
  combat_pace: {
    aiHint: '从候选中选 1 个节奏档位；给出单场战斗的目标时长与回合数',
    reviewHint: '选项是否来自候选；目标时长是否与模式、关卡设计匹配'
  },
  team_formation: {
    aiHint: '说明队伍人数、站位与职业搭配原则及羁绊效果；给出 1-2 套推荐阵容',
    reviewHint: '人数是否明确；站位与职业是否产生策略差异；是否与角色章联动'
  },
  pvp_design: {
    aiHint: '写出 PVP 模式、匹配规则与奖励；说明数值公平性与防作弊措施',
    reviewHint: '匹配规则是否可执行；奖励是否防刷；是否说明公平性或段位机制'
  },
  pve_design: {
    aiHint: '概述 PVE 关卡类型、难度曲线与通关目标；说明与战斗模式的配合关系',
    reviewHint: '难度曲线是否递增；关卡类型是否至少 2 种；是否呼应战斗节奏'
  },
  boss_mechanics: {
    aiHint: '描述 1-2 个 Boss 的技能阶段、机制要点与应对策略；机制需玩家可理解可执行',
    reviewHint: '阶段转换是否明确；每个机制是否有应对手段；是否与技能系统一致'
  },
  balance_strategy: {
    aiHint: '给出数值平衡原则、调优周期与可量化数据指标；分开说明 PVP 与 PVE 的平衡目标',
    reviewHint: '是否列出可量化指标；调优周期是否明确；PVP 与 PVE 目标是否分开'
  }
}
