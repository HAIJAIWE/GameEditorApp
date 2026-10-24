/**
 * 章节 `live_ops` 的按章 schema（档 4 合并，2026-10-24）。
 *
 * 字段定义 / 契约（aiHint/reviewHint/aiDraftable 已内联）/ 三件套拆分清单
 * 全部收进单文件（字段 / 契约 / 拆分 / 默认 / 模板），改一个字段只碰这一处。
 */
import type { ChapterTemplate } from '../ceshuTemplates'
import type { ChapterSchema } from './types'
import type { CeshuFieldDef, ChapterData } from '../ceshuConstants'

export const LIVE_OPS_FIELDS: CeshuFieldDef[] = [
  {
    key: 'ops_goals',
    label: '运营目标',
    kind: 'textarea',
    placeholder: '每条目标：指标 + 目标值 + 时间窗',
    aiHint: '3-5 条目标，每条：指标 + 目标值 + 时间窗',
    reviewHint: '目标是否可量化可采集；是否与数据分析章指标体系一致'
  },
  {
    key: 'activity_system',
    label: '活动体系',
    kind: 'textarea',
    placeholder: '一段概述：活动类型 × 玩法载体 × 奖励的框架',
    aiHint: '一段概述：活动类型 × 玩法载体 × 奖励的框架与设计原则；具体活动条目走「要点」字段，不要在这里罗列',
    reviewHint: '本体是否只讲框架与原则；要点是否覆盖主要活动类型与奖励量级'
  },
  {
    key: 'activity_system_points',
    label: '活动体系·要点',
    kind: 'stringList',
    placeholder: '每行一类活动',
    aiHint: '3-6 条：每类活动的类型、玩法载体、奖励量级与刷新周期',
    reviewHint: '条目是否可逐条核对；奖励量级是否给数值区间、与经济章产出自洽'
  },
  {
    key: 'activity_system_notes',
    label: '活动体系·补充',
    kind: 'textarea',
    placeholder: '排期冲突规避等补充说明，可留空',
    aiHint: '活动排期冲突规避、与商业化章礼包的分工等补充说明，可留空',
    reviewHint: '是否只放补充信息，没有把要点又抄一遍'
  },
  {
    key: 'activity_calendar',
    label: '活动日历',
    kind: 'pipeList',
    columns: [
      {
        key: 'window',
        label: '时间窗口'
      },
      {
        key: 'name',
        label: '活动名'
      },
      {
        key: 'goal',
        label: '目标'
      },
      {
        key: 'placement',
        label: '资源位'
      }
    ],
    aiHint: '每行一个活动，按时间窗口/活动名/目标/资源位四列填写；至少覆盖上线后 3 个月',
    reviewHint: '时间窗口是否互不重叠；资源位是否具体；目标是否与 ops_goals 对得上'
  },
  {
    key: 'retention_measures',
    label: '留存与拉回手段',
    kind: 'stringList',
    placeholder: '每行一个手段',
    aiHint: '3-6 个手段：每行一个，含触发条件与预期效果',
    reviewHint: '手段是否可落地；是否与活动体系、版本节奏互相重复'
  },
  {
    key: 'version_cadence',
    label: '版本运营节奏',
    kind: 'pipeList',
    columns: [
      {
        key: 'type',
        label: '版本类型'
      },
      {
        key: 'cycle',
        label: '周期'
      },
      {
        key: 'mix',
        label: '内容配比'
      }
    ],
    aiHint: '每行一种版本，按版本类型/周期/内容配比三列填写；区分大版本、小版本与热更',
    reviewHint: '周期是否与开发里程碑匹配；内容配比是否落到活动日历上'
  }
]

export const LIVE_OPS_DEFAULTS: ChapterData = {
  ops_goals: '',
  activity_system: '',
  activity_system_points: [],
  activity_system_notes: '',
  activity_calendar: [],
  retention_measures: [],
  version_cadence: []
}

export const LIVE_OPS_TEMPLATES: ChapterTemplate[] = []

export const LIVE_OPS_SCHEMA: ChapterSchema = {
  fields: LIVE_OPS_FIELDS,
  splits: [],
  splitHints: undefined,
  defaults: LIVE_OPS_DEFAULTS,
  templates: LIVE_OPS_TEMPLATES
}
