/**
 * 章节 `publishing` 的按章 schema（档 4 合并，2026-10-24）。
 *
 * 字段定义 / 契约（aiHint/reviewHint/aiDraftable 已内联）/ 三件套拆分清单
 * 全部收进单文件（字段 / 契约 / 拆分 / 默认 / 模板），改一个字段只碰这一处。
 */
import type { ChapterTemplate } from '../../ceshu/reference'
import type { ChapterSchema } from '../core'
import type { CeshuFieldDef, ChapterData } from '../../ceshu/reference'

export const PUBLISHING_FIELDS: CeshuFieldDef[] = [
  {
    key: 'publish_plan',
    label: '发行计划',
    kind: 'textarea',
    aiHint: '一段概述：发行节奏与阶段目标；里程碑条目走「要点」字段',
    reviewHint: '阶段是否可验证；软启动与全量发行的判定标准是否明确'
  },
  {
    key: 'publish_plan_points',
    label: '发行计划·要点',
    kind: 'stringList',
    aiHint: '3-6 条：每条一个发行阶段 + 时间点 + 进入下一阶段的达标线',
    reviewHint: '每条是否有时间与可验证达标线；阶段顺序是否合理'
  },
  {
    key: 'publish_plan_notes',
    label: '发行计划·补充',
    kind: 'textarea',
    aiHint: '里程碑之外的补充说明，可留空',
    reviewHint: '是否只放补充信息，没有把要点又抄一遍'
  },
  {
    key: 'channel_strategy',
    label: '渠道策略',
    kind: 'pipeList',
    columns: [
      {
        key: 'channel',
        label: '渠道'
      },
      {
        key: 'asset_req',
        label: '素材要求'
      },
      {
        key: 'revenue_share',
        label: '分成'
      },
      {
        key: 'expected_scale',
        label: '预期量级'
      }
    ],
    aiHint: '每行一个真实存在的渠道，按渠道|素材要求|分成|预期量级四列填写；渠道名须真实存在，无依据的分成或量级标『待确认』',
    reviewHint: '渠道名是否真实存在；四列是否齐全；数字是否有依据或待确认'
  },
  {
    key: 'compliance',
    label: '合规要求',
    kind: 'textarea',
    aiDraftable: false,
    reviewHint: '版号/分级/隐私政策要点是否齐全；责任人与时间节点是否明确；结论是否经法务确认'
  },
  {
    key: 'marketing_rhythm',
    label: '市场宣传',
    kind: 'textarea',
    aiHint: '按预热/首发/长线三阶段写宣传节奏：各阶段目标、动作、素材与投放渠道',
    reviewHint: '三阶段是否齐全；动作是否有时间点；素材是否与渠道策略对应'
  },
  {
    key: 'soft_launch',
    label: '软启动方案',
    kind: 'textarea',
    aiHint: '一段概述：软启动的地区选择思路与核心观察指标；地区条目与放量标准走「要点」字段',
    reviewHint: '本体是否只讲思路；要点是否给出地区、指标与放量标准'
  },
  {
    key: 'soft_launch_points',
    label: '软启动方案·要点',
    kind: 'stringList',
    aiHint: '3-6 条：每条一个软启动地区 + 观察指标 + 放量（进入全量）标准',
    reviewHint: '每条是否有可判定的放量标准；地区选择是否与目标市场一致'
  },
  {
    key: 'soft_launch_notes',
    label: '软启动方案·补充',
    kind: 'textarea',
    aiHint: '软启动风险预案的补充说明，可留空',
    reviewHint: '是否只放补充信息，没有把要点又抄一遍'
  },
  {
    key: 'launch_checklist',
    label: '上线检查单',
    kind: 'stringList',
    aiHint: '逐行列出发布前必检项：提包、合规、支付、客服、监控各至少 1 条',
    reviewHint: '是否覆盖提包/合规/支付/客服/监控；每条是否可勾选验证'
  }
]

export const PUBLISHING_DEFAULTS: ChapterData = {
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

export const PUBLISHING_TEMPLATES: ChapterTemplate[] = [
  {
    name: '发行计划（示例）',
    description: '软启动 → 全量发行，含渠道策略、合规与上线检查单',
    tags: ['发行', '上线', '示例'],
    data: {
      publish_plan: '发行节奏：先东南亚华语区软启动验证付费与留存，再中国大陆全量（需版号），之后港澳台 / 日韩。阶段里程碑见要点。',
      publish_plan_points: [
        '软启动：T+0 东南亚华语区，达标线 D7 留存 ≥ 20%',
        '全量（大陆）：T+3M 持版号上线，达标线 首月付费率 ≥ 6%',
        '港澳台：T+4M，达标线 双端畅销榜 Top50',
        '日韩：T+6M，达标线 D30 留存 ≥ 15%'
      ],
      publish_plan_notes: '大陆上线强依赖版号批复，时间表随版号节奏浮动。',
      channel_strategy: [
        { channel: 'App Store', asset_req: '竖图 / 视频 / 隐私标签', revenue_share: '30%', expected_scale: 'iOS 30% 量' },
        { channel: 'Google Play', asset_req: 'AAB / 分级', revenue_share: '30%', expected_scale: '海外安卓主渠道' },
        { channel: 'TapTap', asset_req: '开发者站 / 评测', revenue_share: '0%（抽成豁免）', expected_scale: '核心安卓用户' },
        { channel: '应用宝', asset_req: '版号 / 软著', revenue_share: '待确认', expected_scale: '大陆安卓' }
      ],
      compliance: '合规：大陆需版号 + 游戏版号备案 + 防沉迷实名；港澳台分级（IOS 分级）；隐私政策含儿童数据条款；责任人与时间节点待法务确认。',
      marketing_rhythm: '预热：上线前 4 周，发 PV 与角色曝光。首发：上线周，KOL 试玩 + 买量。长线：版本节点，剧情 PV + 节气活动联动。',
      soft_launch: '软启动思路：选东南亚华语区（文化近、买量便宜）验证核心指标，放量标准见要点。',
      soft_launch_points: [
        '地区：马来西亚 / 新加坡华语区，观察指标 D7 留存',
        '地区：港澳台（并行小量），观察指标 付费率',
        '放量标准：D7 留存 ≥ 20% 且 付费率 ≥ 5% 进入全量'
      ],
      soft_launch_notes: '软启动风险预案：付费异常回滚、localization 漏译热更。',
      launch_checklist: [
        '提包：双端商店包体 + 热更通道可用',
        '合规：版号 / 分级 / 隐私政策就位',
        '支付：双渠道支付联调通过',
        '客服：FAQ + 工单通道就位',
        '监控：崩溃 / 付费告警接入'
      ]
    }
  }
]

export const PUBLISHING_SCHEMA: ChapterSchema = {
  fields: PUBLISHING_FIELDS,
  splits: [
  'marketing_rhythm'
],
  splitHints: undefined,
  defaults: PUBLISHING_DEFAULTS,
  templates: PUBLISHING_TEMPLATES
}
