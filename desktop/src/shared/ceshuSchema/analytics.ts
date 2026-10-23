/**
 * 章节 `analytics` 的按章 schema（档 4 合并，2026-10-24）。
 *
 * 字段定义 / 契约（aiHint/reviewHint/aiDraftable 已内联）/ 三件套拆分清单
 * 全部收进单文件；旧 ceshuFieldHints/ceshuFieldSplits 仅做 re-export 兜底。
 * 改一个字段只碰这一处。
 */
import type { ChapterSchema } from './types'
import type { CeshuFieldDef } from '../ceshuConstants'

export const ANALYTICS_FIELDS: CeshuFieldDef[] = [
  {
    key: 'metric_system',
    label: '指标体系',
    kind: 'pipeList',
    columns: [
      {
        key: 'name',
        label: '指标名'
      },
      {
        key: 'definition',
        label: '定义'
      },
      {
        key: 'caliber',
        label: '统计口径'
      },
      {
        key: 'target',
        label: '目标值'
      }
    ],
    aiHint: '8-12 个指标，每行一个，按指标名/定义/统计口径/目标值四列填写；口径写清统计窗口与去重规则',
    reviewHint: '每个指标是否都有目标值；口径是否可复现；是否与运营章 ops_goals 对得上'
  },
  {
    key: 'key_funnels',
    label: '关键漏斗',
    kind: 'textarea',
    placeholder: '一段概述：核心转化链路与每级的目标转化率',
    aiHint: '一段概述：注册→新手→核心行为→付费的链路与每级目标转化率；各级定义走「环节」字段',
    reviewHint: '本体是否给出全链路；环节是否覆盖注册到付费、级间是否衔接无断点'
  },
  {
    key: 'key_funnels_points',
    label: '关键漏斗·要点',
    kind: 'stringList',
    placeholder: '每行一个环节',
    aiHint: '4-6 个环节：每行一个，含进入条件、流出条件与目标转化率',
    reviewHint: '环节是否可逐条核对；每级是否都有目标转化率；事件是否与埋点清单对得上'
  },
  {
    key: 'key_funnels_notes',
    label: '关键漏斗·补充',
    kind: 'textarea',
    placeholder: '分渠道/分版本的漏斗差异等补充说明，可留空',
    aiHint: '分渠道、分版本的漏斗差异等补充说明，可留空',
    reviewHint: '是否只放补充信息，没有把环节又抄一遍'
  },
  {
    key: 'event_tracking',
    label: '埋点清单',
    kind: 'pipeList',
    columns: [
      {
        key: 'event',
        label: '事件名'
      },
      {
        key: 'trigger',
        label: '触发时机'
      },
      {
        key: 'params',
        label: '关键参数'
      }
    ],
    aiHint: '每行一个事件，按事件名/触发时机/关键参数三列填写；命名统一小写下划线；涉及埋点平台时名称必须真实存在，不确定标『待确认』',
    reviewHint: '事件名是否全局唯一不撞车；参数是否含分析所需维度；平台名是否真实或已标待确认'
  },
  {
    key: 'dashboards',
    label: '数据看板',
    kind: 'pipeList',
    columns: [
      {
        key: 'name',
        label: '看板名'
      },
      {
        key: 'audience',
        label: '使用角色'
      },
      {
        key: 'metrics',
        label: '核心指标'
      },
      {
        key: 'refresh',
        label: '刷新频率'
      }
    ],
    aiHint: '每行一个看板，按看板名/使用角色/核心指标/刷新频率四列填写；涉及分析平台时名称必须真实存在，不确定标『待确认』',
    reviewHint: '看板是否按角色分层；核心指标是否来自指标体系；平台名是否真实或已标待确认'
  },
  {
    key: 'alert_monitoring',
    label: '异常监控',
    kind: 'pipeList',
    columns: [
      {
        key: 'item',
        label: '监控项'
      },
      {
        key: 'threshold',
        label: '告警阈值'
      },
      {
        key: 'channel',
        label: '通知方式'
      },
      {
        key: 'response',
        label: '响应动作'
      }
    ],
    aiHint: '每行一个监控项，按监控项/告警阈值/通知方式/响应动作四列填写；告警渠道名称必须真实存在，不确定标『待确认』',
    reviewHint: '阈值是否可计算；是否指定通知对象；崩溃、掉率类高危项是否覆盖'
  }
]

export const ANALYTICS_SCHEMA: ChapterSchema = {
  fields: ANALYTICS_FIELDS,
  splits: [],
  splitHints: undefined
}
