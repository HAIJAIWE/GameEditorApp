import type { ChapterFieldHints } from './types'

/**
 * 第十二章·市场分析的字段契约（P0 补契约，2026-10-23）。
 *
 * 本章要点：市场数据是 AI 编造高发区（假竞品、假销量、假规模），
 * 契约强制要求竞品真实存在、所有数字给出处或标『待确认』，不得编造。
 */
export const MARKET_ANALYSIS_FIELD_HINTS: ChapterFieldHints = {
  target_market: {
    aiHint: '给出目标市场的地域/平台/品类三层定位；引用数字须标来源，无来源标『待确认』',
    reviewHint: '地域平台品类是否明确；数字是否有出处或待确认标记'
  },
  market_size: {
    aiHint: '给出市场规模估算（用户数或金额）及年份；数字必须给出处或标『待确认』，不得编造',
    reviewHint: '数字是否有出处或待确认；是否注明年份与统计口径；是否与目标市场一致'
  },
  user_demographics: {
    aiHint: '描述核心用户画像：年龄/性别/设备/付费意愿等；引用外部报告须标注来源',
    reviewHint: '画像维度是否至少 3 项；是否与目标市场匹配；外部数据是否标来源'
  },
  competitors: {
    aiHint: '每行一个真实存在的竞品，按名称/类型/优势/劣势/市场份额五列填写；不确定的销量/排名/收入标『待确认』，不得编造',
    reviewHint: '竞品名是否真实存在；五列是否齐全；无来源的份额数据是否标待确认'
  },
  market_positioning: {
    aiHint: '用一句话说明与竞品的差异点；列出 2-3 个可验证的差异化优势',
    reviewHint: '差异点是否一句话说清；是否与竞品分析对应；优势是否可验证'
  },
  entry_barriers: {
    aiHint: '列出 2-3 条主要壁垒（技术/资金/IP/渠道）及对应我们的应对思路',
    reviewHint: '壁垒是否具体可执行；是否有应对思路；是否结合竞品劣势'
  },
  market_trends: {
    aiHint: '每行一个趋势并注明驱动因素；引用报告须标来源与年份',
    reviewHint: '是否注明来源或驱动因素；是否与定位一致；引用年份是否过期'
  }
}
