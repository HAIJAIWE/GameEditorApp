import type { ChapterFieldHints } from './types'

/**
 * 第二章·世界观与角色 的字段契约（P0 补契约，2026-10-23）。
 *
 * 本章要点：本章字段最多（14 个）且强依赖作者审美——AI 能填「结构」，
 * 填不了「哪种反派有意思」。故 antagonists / character_arcs 一类只要求给出
 * 结构化骨架与自洽约束，把创作判断留给人。
 *
 * P1 结构拆分：geography / companion_system 拆为「本体 + 要点 + 补充」三件套，
 * 本体留概述，可逐条核对的地点与规则进要点字段；architecture / main_plot
 * 已在字段定义中手工拆过，其 _points 装设定要点/情节点，不重复处理。
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
    aiHint: '一段概述：同伴系统的整体设计思路；加入/培养/协作的具体规则走「要点」逐条列',
    reviewHint: '是否与角色成长弧线、NPC 列表自洽'
  },
  companion_system_points: {
    aiHint: '3-6 条：每条一个同伴规则（加入条件/培养方式/协作机制），须具体可执行',
    reviewHint: '每条规则是否可执行；是否与角色成长弧线、NPC 列表自洽'
  },
  companion_system_notes: {
    aiHint: '要点之外的补充说明：暂不加入的同伴构思或与主角的关系设定，可留空',
    reviewHint: '补充是否与要点重复；构思是否标注为暂缓'
  },
  character_arcs: {
    aiHint: '主要角色各一条弧线：起点状态→转折事件→终点状态；只写已出场角色',
    reviewHint: '转折是否有剧情支撑；与主线剧情节拍能否对上'
  },
  geography: {
    aiHint: '一段概述：世界地理的整体格局；具体地点条目走「要点」，各说清在哪、有什么用',
    reviewHint: '概述是否说清整体格局；地点是否覆盖关键场景；与剧情发生地是否一致'
  },
  geography_points: {
    aiHint: '3-6 条：每条一个关键地点 + 位置特征 + 在剧情/玩法中的作用',
    reviewHint: '每条是否说清在哪、有什么用；地点间是否有关联；与 NPC 列表位置是否一致'
  },
  geography_notes: {
    aiHint: '要点之外的补充说明：地理成因、未开放区域或地图规模，可留空',
    reviewHint: '补充是否与要点重复；未开放区域是否注明'
  }
}
