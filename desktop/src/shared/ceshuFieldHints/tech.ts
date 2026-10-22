import type { ChapterFieldHints } from './types'

/**
 * 第十章·技术规格的字段契约（P0 补契约，2026-10-23）。
 *
 * 本章要点：技术章 AI 爱编造不存在的引擎版本和「精确到日的排期」；
 * 契约要求里程碑交付物可验证、时间只给区间；引擎与团队分工是人定内容，只留人审检查点。
 */
export const TECH_FIELD_HINTS: ChapterFieldHints = {
  engine: {
    reviewHint: '引擎是否在选项内；选型理由是否匹配团队经验与项目类型；是否注明版本',
    aiDraftable: false
  },
  core_architecture: {
    aiHint: '产出核心架构描述：客户端/服务端划分 + 关键模块（玩法/网络/存档）+ 模块间通信方式；禁堆砌技术名词',
    reviewHint: '是否说清端侧划分与关键模块；模块通信是否有具体方案；是否有与项目规模不匹配的过度设计'
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
