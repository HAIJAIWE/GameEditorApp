import type { ChapterDefinition } from './types'

/**
 * 第二十二章·上线与发行的字段与默认数据（P2，2026-10-23）。
 *
 * 本章要点：AI 起草的最大风险是「把发行写成宣传稿」——阶段没有判定标准、
 * 渠道名与分成张口就来、软启动放量线缺失。防法：① 发行计划拆三件套，
 * 里程碑进要点逐条核对，每条必须带可验证的达标线；② 渠道策略用 pipeList
 * 锁四列，契约要求渠道名真实存在、无依据的数字标『待确认』；③ 合规要求
 * 涉法务结论，标人定不交 AI；④ 上线检查单用 stringList 可逐项勾验。
 */
export const PUBLISHING_CHAPTER: ChapterDefinition = {
  fields: [
    { key: 'publish_plan', label: '发行计划', kind: 'textarea' },
    { key: 'publish_plan_points', label: '发行计划·要点', kind: 'stringList' },
    { key: 'publish_plan_notes', label: '发行计划·补充', kind: 'textarea' },
    {
      key: 'channel_strategy',
      label: '渠道策略',
      kind: 'pipeList',
      columns: [
        { key: 'channel', label: '渠道' },
        { key: 'asset_req', label: '素材要求' },
        { key: 'revenue_share', label: '分成' },
        { key: 'expected_scale', label: '预期量级' }
      ]
    },
    { key: 'compliance', label: '合规要求', kind: 'textarea' },
    { key: 'marketing_rhythm', label: '市场宣传', kind: 'textarea' },
    { key: 'soft_launch', label: '软启动方案', kind: 'textarea' },
    { key: 'soft_launch_points', label: '软启动方案·要点', kind: 'stringList' },
    { key: 'soft_launch_notes', label: '软启动方案·补充', kind: 'textarea' },
    { key: 'launch_checklist', label: '上线检查单', kind: 'stringList' }
  ],
  defaults: {
    publish_plan: '',
    publish_plan_points: [],
    publish_plan_notes: '',
    channel_strategy: [],
    compliance: '',
    marketing_rhythm: '',
    soft_launch: '',
    soft_launch_points: [],
    soft_launch_notes: '',
    launch_checklist: []
  }
}
