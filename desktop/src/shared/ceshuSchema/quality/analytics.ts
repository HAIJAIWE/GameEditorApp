/**
 * 章节 `analytics` 的按章 schema（档 4 合并，2026-10-24）。
 *
 * 字段定义 / 契约（aiHint/reviewHint/aiDraftable 已内联）/ 三件套拆分清单
 * 全部收进单文件（字段 / 契约 / 拆分 / 默认 / 模板），改一个字段只碰这一处。
 */
import type { ChapterTemplate } from '../../ceshu/reference'
import type { ChapterSchema } from '../core'
import type { CeshuFieldDef, ChapterData } from '../../ceshu/reference'

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

export const ANALYTICS_DEFAULTS: ChapterData = {
  metric_system: [],
  key_funnels: '',
  key_funnels_points: [],
  key_funnels_notes: '',
  event_tracking: [],
  dashboards: [],
  alert_monitoring: []
}

export const ANALYTICS_TEMPLATES: ChapterTemplate[] = [
  {
    name: '指标体系与埋点（示例）',
    description: '覆盖核心指标、关键漏斗、埋点清单、看板与异常监控，口径可复现',
    tags: ['数据', '埋点', '指标', '示例'],
    data: {
      metric_system: [
        { name: 'DAU', definition: '日活跃用户数', caliber: '自然日去重，UTC+8 0 点切分', target: '20 万' },
        { name: '付费率', definition: '当日付费人数 / 当日活跃', caliber: '自然日，去重', target: '6%' },
        { name: 'ARPU', definition: '日均收入 / 日均活跃', caliber: '自然日', target: '¥8' },
        { name: '剧情通关率', definition: '通关第一章人数 / 进入第一章人数', caliber: '7 日窗口', target: '≥70%' },
        { name: 'D30 留存', definition: '注册 30 日后仍活跃比例', caliber: 'cohort 去重', target: '≥18%' },
        { name: '抽卡 ARPU', definition: '卡池收入 / 抽卡人数', caliber: '卡池周期', target: '¥45' },
        { name: '论剑参与率', definition: '赛季参与论剑人数 / 活跃', caliber: '赛季', target: '≥35%' },
        { name: '日均时长', definition: '人均在线时长', caliber: '自然日', target: '42 min' }
      ],
      key_funnels: '核心漏斗：注册 → 新手引导 → 首场战斗 → 首次抽卡 → 首次付费。各级定义见要点，目标转化率与指标体系对齐。',
      key_funnels_points: [
        '注册→新手引导完成：进入条件=注册成功，目标 ≥ 92%',
        '新手引导→首场战斗：进入条件=引导完成，目标 ≥ 85%',
        '首场战斗→首次抽卡：进入条件=战斗胜利，目标 ≥ 60%',
        '首次抽卡→首次付费：进入条件=抽卡，目标 ≥ 12%',
        '首日→D7 留存：进入条件=首日活跃，目标 ≥ 25%'
      ],
      key_funnels_notes: '分渠道漏斗差异：买量渠道首充转化偏低，需单独看板。',
      event_tracking: [
        { event: 'user_register', trigger: '注册成功', params: 'channel, device_model' },
        { event: 'combat_win', trigger: '战斗胜利结算', params: 'level_id, duration, team_power' },
        { event: 'gacha_draw', trigger: '抽卡完成', params: 'pool_id, count, is_up' },
        { event: 'pay_success', trigger: '支付成功', params: 'order_id, amount, product_id' },
        { event: 'chapter_clear', trigger: '章节通关', params: 'chapter_id, time_cost' },
        { event: 'quest_accept', trigger: '接取宗门任务', params: 'quest_id, repeat' }
      ],
      dashboards: [
        { name: '实时大盘', audience: '制作人 / 运营', metrics: 'DAU / 付费率 / 收入', refresh: '5 min' },
        { name: '留存看板', audience: '增长', metrics: 'D1 / D7 / D30', refresh: '每日' },
        { name: '经济监控', audience: '数值', metrics: '货币产出 / 消耗 / 通胀', refresh: '每小时' }
      ],
      alert_monitoring: [
        { item: '崩溃率', threshold: '>1%', channel: '企业微信告警群', response: '10 min 内定位，热更' },
        { item: '付费成功率', threshold: '<95%', channel: '企业微信告警群', response: '查支付通道' },
        { item: '抽卡掉率偏离', threshold: '偏离公示 ±20%', channel: '数值群', response: '核对保底逻辑' }
      ]
    }
  }
]

export const ANALYTICS_SCHEMA: ChapterSchema = {
  fields: ANALYTICS_FIELDS,
  splits: [],
  splitHints: undefined,
  defaults: ANALYTICS_DEFAULTS,
  templates: ANALYTICS_TEMPLATES
}
