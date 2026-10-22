import type { ChapterFieldHints } from './types'

/**
 * 第二章·世界观与角色 的字段契约（P0 补契约，2026-10-23）。
 *
 * 本章要点：本章字段最多（14 个）且强依赖作者审美——AI 能填「结构」，
 * 填不了「哪种反派有意思」。故 antagonists / character_arcs 一类只要求给出
 * 结构化骨架与自洽约束，把创作判断留给人。
 */
export const STORY_FIELD_HINTS: ChapterFieldHints = {
  antagonists: {
    aiHint: '2-3 个反派，每个一行：名称/动机/与主角的冲突点；动机必须能解释「为什么非对立不可」',
    reviewHint: '动机是否成立；与世界观设定有无矛盾'
  },
  boss_design: {
    aiHint: '每个 Boss 一行：名称/阶段数/每阶段核心机制/弱点；机制必须能对应到已填的战斗系统',
    reviewHint: '机制能否用现有战斗规则实现；阶段间是否有节奏变化'
  },
  companion_system: {
    aiHint: '同伴如何加入/培养/协作：各一句；说明与主角成长的关系',
    reviewHint: '是否与角色成长弧线、NPC 列表自洽'
  },
  character_arcs: {
    aiHint: '主要角色各一条弧线：起点状态→转折事件→终点状态；只写已出场角色',
    reviewHint: '转折是否有剧情支撑；与主线剧情节拍能否对上'
  }
}
