import type { ChapterFieldHints } from './types'

/**
 * 第十四章·MVP 规划的字段契约（P0 补契约，2026-10-23）。
 *
 * 本章要点：AI 起草 MVP 易把范围写得贪多、指标写得虚，
 * 契约要求范围可砍、里程碑可验收、标准可量化；团队规模与预算属资源决策，标人定不交 AI。
 *
 * P1 结构拆分：success_criteria / playtest_plan 拆为「本体 + 要点 + 补充」
 * 三件套——本体只留成功定义与整体安排，可采集指标、每轮试玩安排进要点字段逐条核对。
 */
export const MVP_FIELD_HINTS: ChapterFieldHints = {
  mvp_scope: {
    aiHint: '列出 MVP 必含的最小玩法闭环与明确不做的事；每项说明为什么最小必要',
    reviewHint: '是否形成可玩闭环；不做什么是否写明；是否与核心特性一致'
  },
  mvp_timeline: {
    aiHint: '给出各阶段起止时间与产出；阶段按玩法原型→垂直切片→内容填充排序',
    reviewHint: '阶段顺序是否合理；起止时间是否覆盖到上线；是否与里程碑一致'
  },
  core_features: {
    aiHint: '每行一个 MVP 核心特性，注明验证目标；只列验证核心假设的必需项',
    reviewHint: '每条是否服务核心假设；是否与范围一致；有无混入暂缓项'
  },
  cut_features: {
    aiHint: '每行一个暂缓特性，注明暂缓原因与预计回归版本；不与核心特性重复',
    reviewHint: '暂缓原因是否成立；是否与核心特性重复；是否注明回归版本'
  },
  milestones: {
    aiHint: '每行一个里程碑，按名称/日期/交付物/验收标准四列填写；验收标准要可判定',
    reviewHint: '日期是否递进；交付物是否可交付；验收标准是否可判定'
  },
  success_criteria: {
    aiHint: '一段概述：MVP 成功的定义与判定逻辑；具体指标条目走「要点」字段',
    reviewHint: '指标是否可采集；每条是否有目标值；是否剔除不可测表述'
  },
  success_criteria_points: {
    aiHint: '3-6 条：每条一个可采集指标 + 目标值（如次留 40%）',
    reviewHint: '指标是否可采集可验证；有没有「用户体验良好」这类不可测表述'
  },
  success_criteria_notes: {
    aiHint: '要点之外的补充说明：指标的采集方式或判定口径，可留空',
    reviewHint: '补充是否与要点重复；采集方式是否可落地'
  },
  team_size: {
    aiDraftable: false,
    reviewHint: '人数是否与实际编制一致；角色是否覆盖 MVP 范围所需'
  },
  budget_estimate: {
    aiDraftable: false,
    reviewHint: '是否按阶段或科目拆分；是否与商业化目标匹配；是否留有缓冲'
  },
  playtest_plan: {
    aiHint: '一段概述：试玩的整体安排与目标；每轮的对象/样本量/问题走「要点」逐条列',
    reviewHint: '每轮是否有明确验证问题；样本量是否足够；指标是否与成功标准一致'
  },
  playtest_plan_points: {
    aiHint: '3-6 条：每轮一条，含对象/样本量/要验证的问题/采集指标',
    reviewHint: '每轮是否有验证问题与采集指标；样本量是否写明；指标是否与成功标准一致'
  },
  playtest_plan_notes: {
    aiHint: '要点之外的补充说明：招募渠道、场地或伦理合规事项，可留空',
    reviewHint: '补充是否与要点重复；合规事项是否写清'
  }
}
