/**
 * 章节 `publishing` 的按章 schema（档 4 合并，2026-10-24）。
 *
 * 字段定义 / 契约（aiHint/reviewHint/aiDraftable 已内联）/ 三件套拆分清单
 * 全部收进单文件；旧 ceshuFieldHints/ceshuFieldSplits 仅做 re-export 兜底。
 * 改一个字段只碰这一处。
 */
import type { ChapterSchema } from './types'
import type { CeshuFieldDef } from '../ceshuConstants'

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

export const PUBLISHING_SCHEMA: ChapterSchema = {
  fields: PUBLISHING_FIELDS,
  splits: [
  'marketing_rhythm'
],
  splitHints: undefined
}
