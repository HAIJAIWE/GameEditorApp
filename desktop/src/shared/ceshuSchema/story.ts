/**
 * 章节 `story` 的按章 schema（档 4 合并，2026-10-24）。
 *
 * 字段定义 / 契约（aiHint/reviewHint/aiDraftable 已内联）/ 三件套拆分清单
 * 全部收进单文件（字段 / 契约 / 拆分 / 默认 / 模板），改一个字段只碰这一处。
 */
import type { ChapterTemplate } from '../ceshuTemplates'
import type { ChapterSchema } from './types'
import type { CeshuFieldDef, ChapterData } from '../ceshuConstants'

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
    aiHint: '3-5 条设定要点，每条一句，便于逐条审阅',
    reviewHint: '每条是否只讲一个设定；要点是否覆盖本体提到但未展开的部分'
  },
  {
    key: 'architecture_notes',
    label: '世界观架构·补充',
    kind: 'textarea',
    aiHint: '要点之外的补充说明，可留空',
    reviewHint: '是否只放补充信息、没有把要点又抄一遍；该留空时是否确实留空'
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
    aiHint: '主线分 3 幕，每幕一句：起因 / 转折 / 结局',
    reviewHint: '三幕是否各有明确事件；主角目标是否随幕推进；与分支结局是否对得上'
  },
  {
    key: 'main_plot_points',
    label: '主线剧情·节拍',
    kind: 'stringList',
    placeholder: '每行一个情节点',
    aiHint: '3-5 个情节点，每行一个，按顺序',
    reviewHint: '情节点是否按时间递增；每个点是否改变了局势；是否与三幕概述重复'
  },
  {
    key: 'main_plot_notes',
    label: '主线剧情·补充',
    kind: 'textarea',
    aiHint: '节拍之外的补充说明，可留空',
    reviewHint: '是否只放补充信息、没有把要点又抄一遍；该留空时是否确实留空'
  },
  {
    key: 'protagonist',
    label: '主角设定',
    kind: 'textarea',
    aiHint: '身份 / 目标 / 缺陷，各一句',
    reviewHint: '缺陷是否真的会制造障碍（不是装饰）；目标是否与主线一致；是否与角色关系网对得上'
  },
  {
    key: 'main_npc_count',
    label: '主要 NPC 数量',
    kind: 'number',
    from: 0,
    to: 9999,
    aiDraftable: false,
    reviewHint: '数量是否与 NPC 列表实际条数一致；是否与资源产能匹配（多了做不完）'
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
    aiHint: '每个 NPC 一行：名称/角色/位置/性格/任务钩子',
    reviewHint: '每个 NPC 是否有明确的剧情或功能作用（无用的删掉）；位置是否与地理设定一致；数量是否与「主要 NPC 数量」对得上'
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
    placeholder: '纪元|事件',
    aiHint: '3-5 个纪元，每行「纪元名|该纪元发生的核心事件与它如何塑造当下世界」；事件要能解释当前冲突的由来',
    reviewHint: '纪元顺序是否与主线时间线自洽；每个纪元是否都有「改变世界格局」的事件；有没有只为凑数的纪元'
  },
  {
    key: 'factions',
    label: '阵营',
    kind: 'pipeList',
    placeholder: '名称|立场|现状',
    aiHint: '3-5 个主要阵营，每行「名称|立场（与主角/彼此的关系）|当前势力现状」；至少一方与玩家目标正面冲突',
    reviewHint: '立场是否互斥形成张力；现状是否可被玩家行为改变；是否与角色关系网、敌人类型对得上'
  },
  {
    key: 'branch_endings',
    label: '分支结局',
    kind: 'pipeList',
    placeholder: '结局名|达成条件',
    aiHint: '2-4 个结局，每行「结局名|可机器判定的达成条件」（如「集齐 3 枚印记且未杀死 X」）；条件必须落在游戏内可观测的变量上',
    reviewHint: '达成条件是否可判定（不能是「玩家做出选择」这类模糊说法）；是否覆盖好/坏/隐藏结局；是否与胜负条件冲突'
  },
  {
    key: 'character_network',
    label: '角色关系网',
    kind: 'pipeList',
    placeholder: '角色A-角色B|关系|张力',
    aiHint: '4-6 条关键人物关系，每行「角色A-角色B|关系（血缘/契约/敌对/师徒）|张力（当前冲突或未说破的秘密）」；只写推动剧情的关系',
    reviewHint: '是否只列关系不写张力；是否与阵营、角色设定矛盾；是否存在没人推动的孤立角色'
  },
  {
    key: 'enemy_types',
    label: '敌人类型',
    kind: 'pipeList',
    placeholder: '类型|等级|行为|作用',
    aiHint: '4-6 类敌人，每行「类型|等级区间|行为模式（追击/伏击/远程）|在关卡中的作用（消耗/教学/压迫）」；数值细节留给第八章',
    reviewHint: '行为模式是否在战斗系统能力范围内；每类是否有明确作用（不只是换皮）；等级区间是否覆盖前期到后期'
  },
  {
    key: 'voice_cast',
    label: '配音阵容',
    kind: 'pipeList',
    placeholder: '角色|语言|声线|范围',
    aiHint: '需要配音的角色，每行「角色|语言|声线特征|配音范围（全剧情/关键台词/战斗喊声）」；无配音计划就写「暂不配音，仅音效」',
    reviewHint: '范围是否与预算工期匹配；主角与关键 NPC 是否被漏掉；多语言是否与第十六章语言列表一致'
  },
  {
    key: 'character_relationships',
    label: '角色关系',
    kind: 'stringList',
    aiHint: '2-4 条主角视角的关系描述（与谁、什么关系、随剧情如何变化）；结构化关系网在「角色关系网」字段，此处只写会演变的关系',
    reviewHint: '是否与关系网重复；是否写出「初始 → 结局」的变化；是否服务于主角动机'
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

export const STORY_DEFAULTS: ChapterData = {
  architecture: '',
  history_eras: [],
  factions: [],
  geography: '',
  main_plot: '',
  branch_endings: [],
  character_network: [],
  protagonist: '',
  main_npc_count: 0,
  npc_list: [],
  antagonists: [],
  boss_design: [],
  enemy_types: [],
  companion_system: '',
  character_arcs: [],
  voice_cast: [],
  character_relationships: []
}

export const STORY_TEMPLATES: ChapterTemplate[] = [
  {
    name: '九重天世界观',
    description: '经典仙侠九重天架构，含势力划分与主线',
    tags: [
      '仙侠',
      '九重天',
      '势力'
    ],
    data: {
      architecture: '九重天架构：凡界、修真界、灵界、仙界、神界，每界有独立法则与生态。界与界之间以\'界门\'相通，受天道法则约束。',
      history_eras: [
        {
          name: '太古纪元',
          desc: '神魔大战，天道初立'
        },
        {
          name: '上古纪元',
          desc: '人族崛起，修真界成形'
        },
        {
          name: '近世纪元',
          desc: '界门封印渐松，主角登场'
        }
      ],
      factions: [
        {
          name: '剑阁',
          type: '正道',
          goal: '守护界门'
        },
        {
          name: '幽冥宗',
          type: '魔道',
          goal: '打破封印'
        },
        {
          name: '云游散修',
          type: '中立',
          goal: '各自修行'
        }
      ],
      geography: '凡界：九州大陆；修真界：五大仙山；灵界：灵脉汇聚之地；仙界：仙宫与仙山',
      main_plot: '主角意外觉醒\'剑心\'，被卷入界门封印之争，在双主角视角下逐步揭开天道真相，最终抉择：维护旧序 / 重立新规。',
      branch_endings: [
        '正道结局：剑斩天道',
        '魔道结局：以魔证道',
        '隐世结局：归隐云海'
      ],
      character_network: [
        {
          name: '主角',
          camp: '可选',
          relation: '玩家'
        },
        {
          name: '苏婉清',
          camp: '剑阁',
          relation: '青梅竹马'
        },
        {
          name: '魔尊',
          camp: '幽冥宗',
          relation: '宿敌 / 父亲'
        }
      ]
    }
  },
  {
    name: '近未来赛博世界观',
    description: '近未来都市赛博朋克世界观',
    tags: [
      '科幻',
      '赛博',
      '都市'
    ],
    data: {
      architecture: '三层都市结构：上层穹顶区（权贵）、中层都市带（平民）、下层废弃区（流民与黑帮）。',
      history_eras: [
        {
          name: '黄金时代',
          desc: 'AI 与人类共荣'
        },
        {
          name: '大崩溃',
          desc: 'AI 觉醒事件，技术断层'
        },
        {
          name: '新秩序',
          desc: '巨型企业接管，主角时代'
        }
      ],
      factions: [
        {
          name: '穹顶议会',
          type: '统治',
          goal: '维持秩序'
        },
        {
          name: '夜行者',
          type: '反抗',
          goal: '推翻议会'
        },
        {
          name: '黑市同盟',
          type: '中立',
          goal: '利益至上'
        }
      ],
      geography: '新东京都：穹顶区 + 都市带 + 废弃区 + 周边荒野',
      main_plot: '主角作为\'记忆猎人\'调查一起涉及穹顶议会的阴谋，逐步揭开自己被植入的虚假记忆，最终抉择真相与秩序。',
      branch_endings: [
        '真相结局：揭露阴谋',
        '秩序结局：维护现状',
        '复仇结局：焚毁穹顶'
      ],
      character_network: [
        {
          name: '主角 K',
          camp: '夜行者',
          relation: '玩家'
        },
        {
          name: '艾娃',
          camp: '黑市',
          relation: '搭档'
        },
        {
          name: '议会议长',
          camp: '穹顶',
          relation: '最终 BOSS'
        }
      ]
    }
  },
  {
    name: '架空中世纪世界观',
    description: '架空中世纪奇幻世界观，含王国纷争',
    tags: [
      '奇幻',
      '中世纪',
      '王国'
    ],
    data: {
      architecture: '三大陆架结构：北境王国、中央帝国、南域联邦，由龙脊山脉分隔。',
      history_eras: [
        {
          name: '神话时代',
          desc: '巨龙与神祇共治'
        },
        {
          name: '建国时代',
          desc: '人类王国并立'
        },
        {
          name: '战乱时代',
          desc: '王权更迭，主角时代'
        }
      ],
      factions: [
        {
          name: '银盾王国',
          type: '正面',
          goal: '恢复统一'
        },
        {
          name: '黑鹰帝国',
          type: '反派',
          goal: '征服大陆'
        },
        {
          name: '法师议会',
          type: '中立',
          goal: '守护魔法'
        }
      ],
      geography: '北境冰原、中央平原、南域森林与群岛、龙脊山脉',
      main_plot: '主角作为银盾王国遗孤，召集同伴对抗黑鹰帝国，途中揭开自己身世与古代龙之契约的真相。',
      branch_endings: [
        '王者结局：复国称王',
        '龙裔结局：契约觉醒',
        '游侠结局：归隐山林'
      ],
      character_network: [
        {
          name: '主角',
          camp: '银盾',
          relation: '玩家'
        },
        {
          name: '法师艾琳',
          camp: '议会',
          relation: '导师'
        },
        {
          name: '黑鹰王',
          camp: '黑鹰',
          relation: '宿敌'
        }
      ]
    }
  },
  {
    name: '仙侠角色设计',
    description: '仙侠题材主角 + NPC + 反派角色设计',
    tags: [
      '仙侠',
      '角色',
      '反派'
    ],
    data: {
      protagonist: '主角：青年剑修，剑眉星目，觉醒\'剑心\'。背景：剑阁弃徒之子，性格坚韧但内心柔软，配音采用青年男声/女声双版本。',
      main_npc_count: 8,
      npc_list: [
        {
          name: '苏婉清',
          role: '青梅竹马',
          location: '剑阁',
          personality: '温柔坚定',
          quest_hook: '剑阁内乱'
        },
        {
          name: '玄机子',
          role: '导师',
          location: '云游',
          personality: '玩世不恭',
          quest_hook: '上古秘辛'
        }
      ],
      antagonists: [
        {
          name: '魔尊',
          motivation: '打破界门封印',
          relation: '主角生父'
        }
      ],
      boss_design: [
        {
          name: '剑魔',
          mechanics: '三阶段剑意',
          phases: 3,
          rewards: '剑心觉醒'
        },
        {
          name: '天劫',
          mechanics: '雷劫 QTE',
          phases: 1,
          rewards: '突破境界'
        }
      ],
      enemy_types: [
        '魔修',
        '妖兽',
        '傀儡',
        '心魔'
      ],
      companion_system: '可招募 2 名队友，提供不同战斗风格与剧情支线',
      character_arcs: [
        {
          name: '主角',
          arc: '弃徒 → 剑修 → 觉醒 → 抉择'
        },
        {
          name: '苏婉清',
          arc: '剑阁弟子 → 内乱 → 觉醒 / 堕落'
        }
      ],
      voice_cast: [
        {
          role: '主角',
          actor: '待定'
        },
        {
          role: '苏婉清',
          actor: '待定'
        }
      ],
      character_relationships: [
        {
          from: '主角',
          to: '魔尊',
          type: '父子 / 仇敌'
        },
        {
          from: '主角',
          to: '苏婉清',
          type: '青梅'
        }
      ]
    }
  }
]

export const STORY_SCHEMA: ChapterSchema = {
  fields: STORY_FIELDS,
  splits: [
  'geography',
  'companion_system'
],
  splitHints: STORY_SPLIT_HINTS,
  defaults: STORY_DEFAULTS,
  templates: STORY_TEMPLATES
}
