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
    // 与第十三章 risk_handling.risk_matrix 的分工：此处只做**资源视角的 TOP 概要**
    // （钱与权最敏感的几个风险），完整矩阵（风险/概率/影响/应对/负责人五列）归第十三章。
    // 两边都写全矩阵就是体检发现的「同一件事写两遍」。
    aiHint:
      '资源视角的 TOP 3-5 条风险概要，每行：风险 + 概率/影响 + 应对方向；完整矩阵与负责人分派在第十三章，此处勿展开',
    reviewHint: '是否只列 TOP 几条而未展开完整矩阵；每条是否三要素齐全；与第十三章矩阵是否自洽不矛盾'
  },
  ip: {
    reviewHint: '是否区分自研/授权/第三方资产；授权项是否注明授权范围与期限；是否有侵权风险项未处置',
    aiDraftable: false
  }
}
