import type { ChapterFieldHints } from './types'

/**
 * 第十九章·运营与活动的字段契约（P2，2026-10-23）。
 *
 * 与字段设计的对应关系见 `ceshuChapterFields/liveOps.ts` 文件头：
 * 日历四列与三件套分工，在这里落成「AI 产出物 + 人审检查点」。
 */
export const LIVE_OPS_FIELD_HINTS: ChapterFieldHints = {
  ops_goals: {
    aiHint: '3-5 条目标，每条：指标 + 目标值 + 时间窗',
    reviewHint: '目标是否可量化可采集；是否与数据分析章指标体系一致'
  },
  activity_system: {
    aiHint: '一段概述：活动类型 × 玩法载体 × 奖励的框架与设计原则；具体活动条目走「要点」字段，不要在这里罗列',
    reviewHint: '本体是否只讲框架与原则；要点是否覆盖主要活动类型与奖励量级'
  },
  activity_system_points: {
    aiHint: '3-6 条：每类活动的类型、玩法载体、奖励量级与刷新周期',
    reviewHint: '条目是否可逐条核对；奖励量级是否给数值区间、与经济章产出自洽'
  },
  activity_system_notes: {
    aiHint: '活动排期冲突规避、与商业化章礼包的分工等补充说明，可留空',
    reviewHint: '是否只放补充信息，没有把要点又抄一遍'
  },
  activity_calendar: {
    aiHint: '每行一个活动，按时间窗口/活动名/目标/资源位四列填写；至少覆盖上线后 3 个月',
    reviewHint: '时间窗口是否互不重叠；资源位是否具体；目标是否与 ops_goals 对得上'
  },
  retention_measures: {
    aiHint: '3-6 个手段：每行一个，含触发条件与预期效果',
    reviewHint: '手段是否可落地；是否与活动体系、版本节奏互相重复'
  },
  version_cadence: {
    aiHint: '每行一种版本，按版本类型/周期/内容配比三列填写；区分大版本、小版本与热更',
    reviewHint: '周期是否与开发里程碑匹配；内容配比是否落到活动日历上'
  }
}
