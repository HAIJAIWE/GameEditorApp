import type { ChapterDefinition } from './types'

/**
 * 第十九章·运营与活动的字段与默认数据（P2，2026-10-23）。
 *
 * 本章要点：AI 起草的最大风险是「堆活动名词」——签到、抽奖、联动罗列一堆，
 * 却不给触发条件、奖励量级与资源位，活动之间互相撞车、还与经济章货币产出重复。
 * 字段设计怎么防：活动日历用 pipeList 钉死「时间窗口|活动名|目标|资源位」四列，
 * 倒逼每个活动落到排期与资源上；活动体系按 P1 三件套思路直接拆出「要点」，
 * 每类活动一行可逐条核对，避免本体又长又空。
 */
export const LIVE_OPS_CHAPTER: ChapterDefinition = {
  fields: [
    { key: 'ops_goals', label: '运营目标', kind: 'textarea', placeholder: '每条目标：指标 + 目标值 + 时间窗' },
    {
      key: 'activity_system',
      label: '活动体系',
      kind: 'textarea',
      placeholder: '一段概述：活动类型 × 玩法载体 × 奖励的框架'
    },
    {
      key: 'activity_system_points',
      label: '活动体系·要点',
      kind: 'stringList',
      placeholder: '每行一类活动'
    },
    {
      key: 'activity_system_notes',
      label: '活动体系·补充',
      kind: 'textarea',
      placeholder: '排期冲突规避等补充说明，可留空'
    },
    {
      key: 'activity_calendar',
      label: '活动日历',
      kind: 'pipeList',
      columns: [
        { key: 'window', label: '时间窗口' },
        { key: 'name', label: '活动名' },
        { key: 'goal', label: '目标' },
        { key: 'placement', label: '资源位' }
      ]
    },
    { key: 'retention_measures', label: '留存与拉回手段', kind: 'stringList', placeholder: '每行一个手段' },
    {
      key: 'version_cadence',
      label: '版本运营节奏',
      kind: 'pipeList',
      columns: [
        { key: 'type', label: '版本类型' },
        { key: 'cycle', label: '周期' },
        { key: 'mix', label: '内容配比' }
      ]
    }
  ],
  defaults: {
    ops_goals: '',
    activity_system: '',
    activity_system_points: [],
    activity_system_notes: '',
    activity_calendar: [],
    retention_measures: [],
    version_cadence: []
  }
}
