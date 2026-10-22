import type { ChapterFieldHints } from './types'

/**
 * 第二十二章·上线与发行的字段契约（P2，2026-10-23）。
 *
 * 本章要点：AI 起草的最大风险是「把发行写成宣传稿」——阶段没有判定标准、
 * 渠道名与分成张口就来。契约的防线：渠道名必须真实存在、无依据的数字标
 * 『待确认』；合规要求涉法务结论，标人定不交 AI；里程碑与软启动放量标准
 * 必须可验证。
 */
export const PUBLISHING_FIELD_HINTS: ChapterFieldHints = {
  publish_plan: {
    aiHint: '一段概述：发行节奏与阶段目标；里程碑条目走「要点」字段',
    reviewHint: '阶段是否可验证；软启动与全量发行的判定标准是否明确'
  },
  publish_plan_points: {
    aiHint: '3-6 条：每条一个发行阶段 + 时间点 + 进入下一阶段的达标线',
    reviewHint: '每条是否有时间与可验证达标线；阶段顺序是否合理'
  },
  publish_plan_notes: {
    aiHint: '里程碑之外的补充说明，可留空',
    reviewHint: '是否只放补充信息，没有把要点又抄一遍'
  },
  channel_strategy: {
    aiHint:
      '每行一个真实存在的渠道，按渠道|素材要求|分成|预期量级四列填写；渠道名须真实存在，无依据的分成或量级标『待确认』',
    reviewHint: '渠道名是否真实存在；四列是否齐全；数字是否有依据或待确认'
  },
  compliance: {
    // 版号/分级/隐私政策均涉法务结论，AI 只能整理公开流程要点，判断与办理结果由人定
    aiDraftable: false,
    reviewHint: '版号/分级/隐私政策要点是否齐全；责任人与时间节点是否明确；结论是否经法务确认'
  },
  marketing_rhythm: {
    aiHint: '按预热/首发/长线三阶段写宣传节奏：各阶段目标、动作、素材与投放渠道',
    reviewHint: '三阶段是否齐全；动作是否有时间点；素材是否与渠道策略对应'
  },
  soft_launch: {
    aiHint: '一段概述：软启动的地区选择思路与核心观察指标；地区条目与放量标准走「要点」字段',
    reviewHint: '本体是否只讲思路；要点是否给出地区、指标与放量标准'
  },
  soft_launch_points: {
    aiHint: '3-6 条：每条一个软启动地区 + 观察指标 + 放量（进入全量）标准',
    reviewHint: '每条是否有可判定的放量标准；地区选择是否与目标市场一致'
  },
  soft_launch_notes: {
    aiHint: '软启动风险预案的补充说明，可留空',
    reviewHint: '是否只放补充信息，没有把要点又抄一遍'
  },
  launch_checklist: {
    aiHint: '逐行列出发布前必检项：提包、合规、支付、客服、监控各至少 1 条',
    reviewHint: '是否覆盖提包/合规/支付/客服/监控；每条是否可勾选验证'
  }
}
