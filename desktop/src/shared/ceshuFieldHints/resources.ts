import type { ChapterFieldHints } from './types'

/**
 * 第十一章·资源规划的字段契约（P0 补契约，2026-10-23）。
 *
 * 本章要点：资源章是钱与权——AI 编预算数字、下版权结论的风险最高；
 * 除风险矩阵可起草外全部人定，契约只保留可核对的人审检查点，不写 aiHint。
 */
export const RESOURCES_FIELD_HINTS: ChapterFieldHints = {
  'budget.summary': {
    reviewHint: '概算是否含总额与分项（人力/外包/软件/市场）；数字是否与 team_structure 规模自洽；是否注明币种与估算口径',
    aiDraftable: false
  },
  risk_matrix: {
    aiHint: '产出风险清单，每行一条：风险描述 + 概率/影响 + 应对措施；聚焦技术、进度、团队、市场四类，每类至少 1 条',
    reviewHint: '每行是否「风险+概率影响+应对」三要素齐全；是否覆盖技术/进度/团队/市场；应对是否可执行'
  },
  ip: {
    reviewHint: '是否区分自研/授权/第三方资产；授权项是否注明授权范围与期限；是否有侵权风险项未处置',
    aiDraftable: false
  }
}
