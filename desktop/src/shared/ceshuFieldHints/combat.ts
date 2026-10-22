import type { ChapterFieldHints } from './types'

/**
 * 第五章·战斗系统设计的字段契约（P0 补契约，2026-10-23）。
 *
 * 本章要点：战斗各机制（模式/技能/元素/节奏）耦合极强，AI 最易写出互相矛盾的设计，
 * 契约要求每个字段给出产出结构，并附人审可核对的检查点；伤害公式三字段已有契约，跳过。
 *
 * P1 三件套拆分（2026-10-23）：8 个 textarea 拆为「本体 + 要点 + 补充」。
 * 本体 aiHint 改为「一段概述 + 分工语义」，具体可核对条目走 xxx_points。
 */
export const COMBAT_FIELD_HINTS: ChapterFieldHints = {
  combat_mode: {
    aiHint: '从候选中选 1 个主模式并说明理由；须与战斗节奏、技能系统自洽',
    reviewHint: '选项是否来自候选列表；是否与节奏、技能设计互相矛盾'
  },
  skill_system: {
    aiHint: '一段概述：技能体系的设计目标与整体结构；具体技能条目走「要点」字段，不要在这里罗列',
    reviewHint: '本体是否只讲目标与结构；要点是否覆盖分类、升级路径与代表技能'
  },
  skill_system_points: {
    aiHint: '3-6 条：技能分类、代表技能、消耗与冷却量级、解锁节奏',
    reviewHint: '条目是否可逐条核对；与本体的概述是否重复'
  },
  skill_system_notes: {
    aiHint: '技能设计思路、参考作品等要点之外的补充说明，可留空',
    reviewHint: '是否只放补充信息，没有把要点又抄一遍'
  },
  buff_debuff: {
    aiHint: '一段概述：Buff/Debuff 系统的定位与设计原则；具体效果条目走「要点」字段',
    reviewHint: '本体是否只讲定位与原则；要点是否覆盖主要类型与规则'
  },
  buff_debuff_points: {
    aiHint: '3-6 条：主要 Buff/Debuff 类型、持续时长、叠加与驱散规则',
    reviewHint: '条目是否可逐条核对；持续与叠加规则是否明确可执行'
  },
  buff_debuff_notes: {
    aiHint: '与技能、装备联动的补充说明，可留空',
    reviewHint: '是否只放补充信息，没有把要点又抄一遍'
  },
  element_system: {
    aiHint: '一段概述：元素系统的定位与相克/反应框架；具体元素条目走「要点」字段',
    reviewHint: '本体是否只讲框架；要点是否覆盖元素种类与反应结果'
  },
  element_system_points: {
    aiHint: '3-6 条：元素种类、相克关系、反应结果与技能伤害联动方式',
    reviewHint: '条目是否可逐条核对；元素关系是否闭环自洽'
  },
  element_system_notes: {
    aiHint: '元素与技能、伤害计算联动的补充说明，可留空',
    reviewHint: '是否只放补充信息，没有把要点又抄一遍'
  },
  combat_pace: {
    aiHint: '从候选中选 1 个节奏档位；给出单场战斗的目标时长与回合数',
    reviewHint: '选项是否来自候选；目标时长是否与模式、关卡设计匹配'
  },
  team_formation: {
    aiHint: '一段概述：队伍编排的设计目标与策略空间；具体阵容与站位走「要点」字段',
    reviewHint: '本体是否只讲目标；要点是否给出人数、站位与推荐阵容'
  },
  team_formation_points: {
    aiHint: '3-6 条：队伍人数、站位规则、职业搭配、推荐阵容与羁绊效果',
    reviewHint: '条目是否可逐条核对；站位与职业是否产生策略差异'
  },
  team_formation_notes: {
    aiHint: '站位示例、与角色章联动的补充说明，可留空',
    reviewHint: '是否只放补充信息，没有把要点又抄一遍'
  },
  pvp_design: {
    aiHint: '一段概述：PVP 模式的定位与公平性方针；匹配、奖励等规则条目走「要点」字段',
    reviewHint: '本体是否只讲定位与方针；要点是否覆盖匹配规则与奖励'
  },
  pvp_design_points: {
    aiHint: '3-6 条：模式玩法、匹配规则、段位与奖励、防作弊措施',
    reviewHint: '条目是否可逐条核对；匹配规则是否可执行、奖励是否防刷'
  },
  pvp_design_notes: {
    aiHint: '赛季安排、社交压力处理的补充说明，可留空',
    reviewHint: '是否只放补充信息，没有把要点又抄一遍'
  },
  pve_design: {
    aiHint: '一段概述：PVE 内容的定位与难度曲线思路；关卡类型条目走「要点」字段',
    reviewHint: '本体是否只讲定位与思路；要点是否覆盖关卡类型与目标'
  },
  pve_design_points: {
    aiHint: '3-6 条：关卡类型、难度曲线、通关目标与奖励',
    reviewHint: '条目是否可逐条核对；难度曲线是否递增、关卡类型是否至少 2 种'
  },
  pve_design_notes: {
    aiHint: '关卡与战斗节奏配合关系的补充说明，可留空',
    reviewHint: '是否只放补充信息，没有把要点又抄一遍'
  },
  boss_mechanics: {
    aiHint: '一段概述：Boss 战的设计目标与机制风格；具体机制条目走「要点」字段',
    reviewHint: '本体是否只讲目标与风格；要点是否覆盖阶段与应对手段'
  },
  boss_mechanics_points: {
    aiHint: '3-6 条：Boss 阶段、技能机制要点、玩家应对策略',
    reviewHint: '条目是否可逐条核对；阶段转换是否明确、每个机制是否有应对手段'
  },
  boss_mechanics_notes: {
    aiHint: 'Boss 背景与演出联动的补充说明，可留空',
    reviewHint: '是否只放补充信息，没有把要点又抄一遍'
  },
  balance_strategy: {
    aiHint: '一段概述：数值平衡的总体原则与调优机制；具体指标条目走「要点」字段',
    reviewHint: '本体是否只讲原则；要点是否列出可量化指标与调优周期'
  },
  balance_strategy_points: {
    aiHint: '3-6 条：平衡原则、可量化指标、调优周期、PVP 与 PVE 分目标',
    reviewHint: '条目是否可逐条核对；指标是否可量化、PVP 与 PVE 目标是否分开'
  },
  balance_strategy_notes: {
    aiHint: '数据来源、历史调优案例的补充说明，可留空',
    reviewHint: '是否只放补充信息，没有把要点又抄一遍'
  }
}
