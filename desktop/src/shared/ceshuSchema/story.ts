/**
 * 章节 `story` 的按章 schema（档 4 合并，2026-10-24）。
 *
 * 字段定义 / 契约（aiHint/reviewHint/aiDraftable 已内联）/ 三件套拆分清单
 * 全部收进单文件；旧 ceshuFieldHints/ceshuFieldSplits 仅做 re-export 兜底。
 * 改一个字段只碰这一处。
 */
import type { ChapterSchema } from './types'
import type { CeshuFieldDef } from '../ceshuConstants'

export const STORY_FIELDS: CeshuFieldDef[] = [
  {
    key: 'architecture',
    label: '世界观架构',
    kind: 'textarea',
    aiHint: '一句话世界观 + 3-5 条设定要点（每条一句）',
    reviewHint: '设定之间是否自洽、有无互相矛盾'
  },
  {
    key: 'architecture_points',
    label: '世界观架构·要点',
    kind: 'stringList',
    placeholder: '每行一条设定要点',
    aiHint: '3-5 条设定要点，每条一句，便于逐条审阅'
  },
  {
    key: 'architecture_notes',
    label: '世界观架构·补充',
    kind: 'textarea',
    aiHint: '要点之外的补充说明，可留空'
  },
  {
    key: 'geography',
    label: '地理设定',
    kind: 'textarea',
    aiHint: '一段概述：世界地理的整体格局；具体地点条目走「要点」，各说清在哪、有什么用',
    reviewHint: '概述是否说清整体格局；地点是否覆盖关键场景；与剧情发生地是否一致'
  },
  {
    key: 'main_plot',
    label: '主线剧情',
    kind: 'textarea',
    aiHint: '主线分 3 幕，每幕一句：起因 / 转折 / 结局'
  },
  {
    key: 'main_plot_points',
    label: '主线剧情·节拍',
    kind: 'stringList',
    placeholder: '每行一个情节点',
    aiHint: '3-5 个情节点，每行一个，按顺序'
  },
  {
    key: 'main_plot_notes',
    label: '主线剧情·补充',
    kind: 'textarea',
    aiHint: '节拍之外的补充说明，可留空'
  },
  {
    key: 'protagonist',
    label: '主角设定',
    kind: 'textarea',
    aiHint: '身份 / 目标 / 缺陷，各一句'
  },
  {
    key: 'main_npc_count',
    label: '主要 NPC 数量',
    kind: 'number',
    from: 0,
    to: 9999,
    aiDraftable: false
  },
  {
    key: 'npc_list',
    label: 'NPC 列表',
    kind: 'pipeList',
    columns: [
      {
        key: 'name',
        label: '名称'
      },
      {
        key: 'role',
        label: '角色'
      },
      {
        key: 'location',
        label: '位置'
      },
      {
        key: 'personality',
        label: '性格'
      },
      {
        key: 'quest_hook',
        label: '任务钩子'
      }
    ],
    aiHint: '每个 NPC 一行：名称/角色/位置/性格/任务钩子'
  },
  {
    key: 'antagonists',
    label: '反派设计',
    kind: 'stringList',
    placeholder: '每行一个',
    aiHint: '2-3 个反派，每个一行：名称/动机/与主角的冲突点；动机必须能解释「为什么非对立不可」',
    reviewHint: '动机是否成立；与世界观设定有无矛盾'
  },
  {
    key: 'boss_design',
    label: 'Boss 设计',
    kind: 'pipeList',
    columns: [
      {
        key: 'name',
        label: '名称'
      },
      {
        key: 'mechanics',
        label: '机制'
      },
      {
        key: 'phases',
        label: '阶段'
      },
      {
        key: 'rewards',
        label: '奖励'
      }
    ],
    aiHint: '每个 Boss 一行：名称/阶段数/每阶段核心机制/弱点；机制必须能对应到已填的战斗系统',
    reviewHint: '机制能否用现有战斗规则实现；阶段间是否有节奏变化'
  },
  {
    key: 'companion_system',
    label: '同伴系统',
    kind: 'textarea',
    aiHint: '一段概述：同伴系统的整体设计思路；加入/培养/协作的具体规则走「要点」逐条列',
    reviewHint: '是否与角色成长弧线、NPC 列表自洽'
  },
  {
    key: 'character_arcs',
    label: '角色成长弧线',
    kind: 'stringList',
    placeholder: '每行一个',
    aiHint: '主要角色各一条弧线：起点状态→转折事件→终点状态；只写已出场角色',
    reviewHint: '转折是否有剧情支撑；与主线剧情节拍能否对上'
  },
  {
    key: 'history_eras',
    label: '历史纪元',
    kind: 'pipeList',
    placeholder: '纪元|事件'
  },
  {
    key: 'factions',
    label: '阵营',
    kind: 'pipeList',
    placeholder: '名称|立场|现状'
  },
  {
    key: 'branch_endings',
    label: '分支结局',
    kind: 'pipeList',
    placeholder: '结局名|达成条件'
  },
  {
    key: 'character_network',
    label: '角色关系网',
    kind: 'pipeList',
    placeholder: '角色A-角色B|关系|张力'
  },
  {
    key: 'enemy_types',
    label: '敌人类型',
    kind: 'pipeList',
    placeholder: '类型|等级|行为|作用'
  },
  {
    key: 'voice_cast',
    label: '配音阵容',
    kind: 'pipeList',
    placeholder: '角色|语言|声线|范围'
  },
  {
    key: 'character_relationships',
    label: '角色关系',
    kind: 'stringList'
  }
]

export const STORY_SPLIT_HINTS: ChapterSchema['splitHints'] = {
  geography: {
    points: {
      aiHint: '3-6 条：每条一个关键地点 + 位置特征 + 在剧情/玩法中的作用',
      reviewHint: '每条是否说清在哪、有什么用；地点间是否有关联；与 NPC 列表位置是否一致'
    },
    notes: {
      aiHint: '要点之外的补充说明：地理成因、未开放区域或地图规模，可留空',
      reviewHint: '补充是否与要点重复；未开放区域是否注明'
    }
  },
  companion_system: {
    points: {
      aiHint: '3-6 条：每条一个同伴规则（加入条件/培养方式/协作机制），须具体可执行',
      reviewHint: '每条规则是否可执行；是否与角色成长弧线、NPC 列表自洽'
    },
    notes: {
      aiHint: '要点之外的补充说明：暂不加入的同伴构思或与主角的关系设定，可留空',
      reviewHint: '补充是否与要点重复；构思是否标注为暂缓'
    }
  }
}

export const STORY_SCHEMA: ChapterSchema = {
  fields: STORY_FIELDS,
  splits: [
  'geography',
  'companion_system'
],
  splitHints: STORY_SPLIT_HINTS
}
