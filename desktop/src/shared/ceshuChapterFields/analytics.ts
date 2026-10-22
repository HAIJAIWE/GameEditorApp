import type { ChapterDefinition } from './types'

/**
 * 第二十章·数据埋点与指标的字段与默认数据（P2，2026-10-23）。
 *
 * 本章要点：AI 起草的最大风险是「堆指标名词」——DAU、留存、ARPU 罗列一串，
 * 却不给采集口径与目标值；漏斗环节没有转化率，埋点事件名互相撞车、参数缺失。
 * 字段设计怎么防：指标体系用 pipeList 钉死「指标名|定义|统计口径|目标值」四列，
 * 埋点清单钉死「事件名|触发时机|关键参数」三列；关键漏斗按 P1 三件套思路
 * 直接拆出「环节」要点，让注册→新手→核心行为→付费的每一级转化都可逐条核对。
 */
export const ANALYTICS_CHAPTER: ChapterDefinition = {
  fields: [
    {
      key: 'metric_system',
      label: '指标体系',
      kind: 'pipeList',
      columns: [
        { key: 'name', label: '指标名' },
        { key: 'definition', label: '定义' },
        { key: 'caliber', label: '统计口径' },
        { key: 'target', label: '目标值' }
      ]
    },
    { key: 'key_funnels', label: '关键漏斗', kind: 'textarea', placeholder: '一段概述：核心转化链路与每级的目标转化率' },
    { key: 'key_funnels_points', label: '关键漏斗·要点', kind: 'stringList', placeholder: '每行一个环节' },
    { key: 'key_funnels_notes', label: '关键漏斗·补充', kind: 'textarea', placeholder: '分渠道/分版本的漏斗差异等补充说明，可留空' },
    {
      key: 'event_tracking',
      label: '埋点清单',
      kind: 'pipeList',
      columns: [
        { key: 'event', label: '事件名' },
        { key: 'trigger', label: '触发时机' },
        { key: 'params', label: '关键参数' }
      ]
    },
    {
      key: 'dashboards',
      label: '数据看板',
      kind: 'pipeList',
      columns: [
        { key: 'name', label: '看板名' },
        { key: 'audience', label: '使用角色' },
        { key: 'metrics', label: '核心指标' },
        { key: 'refresh', label: '刷新频率' }
      ]
    },
    {
      key: 'alert_monitoring',
      label: '异常监控',
      kind: 'pipeList',
      columns: [
        { key: 'item', label: '监控项' },
        { key: 'threshold', label: '告警阈值' },
        { key: 'channel', label: '通知方式' },
        { key: 'response', label: '响应动作' }
      ]
    }
  ],
  defaults: {
    metric_system: [],
    key_funnels: '',
    key_funnels_points: [],
    key_funnels_notes: '',
    event_tracking: [],
    dashboards: [],
    alert_monitoring: []
  }
}
