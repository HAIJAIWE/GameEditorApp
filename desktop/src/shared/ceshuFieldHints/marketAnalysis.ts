import type { ChapterFieldHints } from './types'

/**
 * 第十二章·市场分析的字段契约（P0 补契约，2026-10-23）。
 *
 * 本章要点：市场数据是 AI 编造高发区（假竞品、假销量、假规模），
 * 契约强制要求竞品真实存在、所有数字给出处或标『待确认』，不得编造。
 *
 * P1 结构拆分：market_size / user_demographics / market_positioning /
 * entry_barriers 拆为「本体 + 要点 + 补充」三件套——本体只留概述，
 * 可逐条核对的数据、画像维度、优势、壁垒进要点字段。
 */
export const MARKET_ANALYSIS_FIELD_HINTS: ChapterFieldHints = {
  target_market: {
    aiHint: '给出目标市场的地域/平台/品类三层定位；引用数字须标来源，无来源标『待确认』',
    reviewHint: '地域平台品类是否明确；数字是否有出处或待确认标记'
  },
  market_size: {
    aiHint:
      '一段概述：市场规模的整体估算与统计口径；数字须给出处或标『待确认』，不得编造；具体数据条目走「要点」',
    reviewHint: '数字是否有出处或待确认；是否注明年份与统计口径；是否与目标市场一致'
  },
  market_size_points: {
    aiHint: '3-6 条：每条一个可采集的数据项 + 数值 + 年份 + 来源，无来源标『待确认』',
    reviewHint: '每条是否有数值与来源或待确认；口径是否与本体一致；有无无出处数字'
  },
  market_size_notes: {
    aiHint: '要点之外的补充说明：估算方法、口径差异或存疑数据，可留空',
    reviewHint: '补充是否与要点重复；存疑数据是否写清原因'
  },
  user_demographics: {
    aiHint: '一段概述：核心用户是谁、为什么是目标；各维度数据走「要点」逐条列；引用外部报告须标来源',
    reviewHint: '画像维度是否至少 3 项；是否与目标市场匹配；外部数据是否标来源'
  },
  user_demographics_points: {
    aiHint: '3-6 条：每条一个画像维度 + 具体数据（如 18-25 岁占比 60%）并注明来源',
    reviewHint: '每条是否一个维度带数据；维度是否至少 3 项；外部数据是否标来源'
  },
  user_demographics_notes: {
    aiHint: '要点之外的补充说明：调研方法、样本说明或待验证假设，可留空',
    reviewHint: '补充是否与要点重复；假设是否标注待验证'
  },
  competitors: {
    aiHint: '每行一个真实存在的竞品，按名称/类型/优势/劣势/市场份额五列填写；不确定的销量/排名/收入标『待确认』，不得编造',
    reviewHint: '竞品名是否真实存在；五列是否齐全；无来源的份额数据是否标待确认'
  },
  market_positioning: {
    aiHint: '一段概述：一句话说清与竞品的差异点；具体优势条目走「要点」，须可验证',
    reviewHint: '差异点是否一句话说清；是否与竞品分析对应；优势是否可验证'
  },
  market_positioning_points: {
    aiHint: '2-4 条：每条一个差异化优势 + 对应竞品的短板，须可验证',
    reviewHint: '每条是否对应具体竞品；优势是否可验证；有无「体验更好」这类空话'
  },
  market_positioning_notes: {
    aiHint: '要点之外的补充说明：定位推理过程或暂不采用的定位方向，可留空',
    reviewHint: '补充是否与要点重复；放弃的方向是否写了原因'
  },
  entry_barriers: {
    aiHint: '一段概述：进入该市场的核心壁垒判断；具体壁垒与应对走「要点」逐条列',
    reviewHint: '壁垒是否具体可执行；是否有应对思路；是否结合竞品劣势'
  },
  entry_barriers_points: {
    aiHint: '2-4 条：每条一类壁垒（技术/资金/IP/渠道）+ 具体表现 + 我们的应对',
    reviewHint: '每条壁垒是否具体到场景；应对是否可执行；是否结合竞品劣势'
  },
  entry_barriers_notes: {
    aiHint: '要点之外的补充说明：壁垒变化趋势或资源缺口，可留空',
    reviewHint: '补充是否与要点重复；资源缺口是否写清'
  },
  market_trends: {
    aiHint: '每行一个趋势并注明驱动因素；引用报告须标来源与年份',
    reviewHint: '是否注明来源或驱动因素；是否与定位一致；引用年份是否过期'
  }
}
