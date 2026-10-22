import type { ChapterFieldHints } from './types'

/**
 * 第十章·技术规格的字段契约（P0 补契约，2026-10-23）。
 *
 * 本章要点：技术章 AI 爱编造不存在的引擎版本和「精确到日的排期」；
 * 契约要求里程碑交付物可验证、时间只给区间；引擎与团队分工是人定内容，只留人审检查点。
 *
 * P1 结构拆分：core_architecture 拆为「本体 + 要点 + 补充」三件套——
 * 本体留端侧划分与总体形态，关键模块与通信方式进要点字段逐条列。
 */
export const TECH_FIELD_HINTS: ChapterFieldHints = {
  engine: {
    reviewHint: '引擎是否在选项内；选型理由是否匹配团队经验与项目类型；是否注明版本',
    aiDraftable: false
  },
  core_architecture: {
    aiHint:
      '一段概述：客户端/服务端划分与架构总体形态；关键模块与通信方式走「要点」逐条列；禁堆砌技术名词',
    reviewHint: '是否说清端侧划分与关键模块；模块通信是否有具体方案；是否有与项目规模不匹配的过度设计'
  },
  core_architecture_points: {
    aiHint: '3-6 条：每条一个关键模块（玩法/网络/存档）+ 职责 + 通信方式',
    reviewHint: '模块是否覆盖核心玩法；通信是否有具体方案；有无过度设计的技术名词'
  },
  core_architecture_notes: {
    aiHint: '要点之外的补充说明：选型备选方案或已知技术债，可留空',
    reviewHint: '补充是否与要点重复；备选方案是否写了放弃理由'
  },
  milestones: {
    aiHint: '产出开发里程碑清单，每行一阶段：阶段名 + 可验证交付物 + 时间区间；交付物须可验证，时间给区间不给精确到日的承诺',
    reviewHint: '每行是否有可验证交付物；时间是否为区间而非精确日期；阶段是否覆盖原型→垂直切片→量产→上线'
  },
  team_structure: {
    reviewHint: '岗位是否覆盖 core_architecture 所列模块；人数是否与 milestones 周期匹配；是否注明外包/兼职',
    aiDraftable: false
  }
}
