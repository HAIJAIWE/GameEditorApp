/**
 * 章节 `live_ops` 的按章 schema（档 4 合并，2026-10-24）。
 *
 * 字段定义 / 契约（aiHint/reviewHint/aiDraftable 已内联）/ 三件套拆分清单
 * 全部收进单文件（字段 / 契约 / 拆分 / 默认 / 模板），改一个字段只碰这一处。
 */
import type { ChapterTemplate } from '../../ceshu/reference'
import type { ChapterSchema } from '../core'
import type { CeshuFieldDef, ChapterData } from '../../ceshu/reference'

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

export const LIVE_OPS_TEMPLATES: ChapterTemplate[] = [
  {
    name: '长线运营框架（示例）',
    description: '以节气 / 剧情版本双轴驱动的运营节奏，覆盖活动体系、日历与留存手段',
    tags: ['运营', '活动', '示例'],
    data: {
      ops_goals: '运营目标：上线 3 月 DAU 稳定 20 万；首月付费率 6%；主线第一章通关率 ≥ 70%；月留存 D30 ≥ 18%。',
      activity_system: '活动体系：以「仙侠节气 + 剧情节点」双轴驱动。常驻玩法（秘境 / 论剑）保日常活跃，限时活动（仙缘节 / 渡劫大典）做脉冲拉收，剧情版本（每 6 周一大章）做长线留存。活动奖励与数值章经济产出自洽，不发放破坏战力的数值碾压道具。',
      activity_system_points: [
        '节气活动：清明 / 中秋等现实节气联动，轻量收集 + 限定时装，周期 2 周',
        '剧情版本活动：新章上线配套「重温前情 + 前瞻彩蛋」，周期随版本',
        '竞技活动：论剑大会（赛季制，每 4 周一赛季），奖励段位外观',
        '社交活动：双修 / 宗门任务，拉动轻社交与回流',
        '付费活动：限时卡池 UP + 累充礼包，保底与掉率公示'
      ],
      activity_system_notes: '活动排期用「节气 + 版本」双日历，避免同周叠 2 个脉冲活动；付费活动与常驻经济隔离，防止通货膨胀。',
      activity_calendar: [
        { window: '上线第 1 月', name: '开服盛典', goal: '拉新 + 首充', placement: '首页 Banner + 推送' },
        { window: '上线第 2 月', name: '仙缘节', goal: '付费脉冲', placement: '活动中心 + 邮件' },
        { window: '上线第 3 月', name: '第一章·云海篇', goal: '剧情版本留存', placement: '剧情入口 + 首页' },
        { window: '持续每 4 周', name: '论剑大会', goal: '竞技活跃', placement: '竞技入口' }
      ],
      retention_measures: [
        '次日回流：离线收益 + 一键追剧情（触发：离线 ≥ 24h，预期回流 +8%）',
        '7 日防流失：卡关推送「本命功法推荐」+ 免费体力（触发：3 日未通关，预期 D7 +5%）',
        '月回流：老玩家专属「故人重逢」剧情（触发：月活下降，预期回流 +3%）'
      ],
      version_cadence: [
        { type: '大版本', cycle: '每 6 周', mix: '新剧情章 + 新系统 + 新角色' },
        { type: '小版本', cycle: '每 2 周', mix: '活动 + 平衡性调整 + 修复' },
        { type: '热更', cycle: '按需', mix: '紧急 Bug / 数值回滚' }
      ]
    }
  }
]

export const LIVE_OPS_SCHEMA: ChapterSchema = {
  fields: LIVE_OPS_FIELDS,
  splits: [],
  splitHints: undefined,
  defaults: LIVE_OPS_DEFAULTS,
  templates: LIVE_OPS_TEMPLATES
}
