/**
 * 章节 `audio` 的按章 schema（档 4 合并，2026-10-24）。
 *
 * 字段定义 / 契约（aiHint/reviewHint/aiDraftable 已内联）/ 三件套拆分清单
 * 全部收进单文件（字段 / 契约 / 拆分 / 默认 / 模板），改一个字段只碰这一处。
 */
import type { ChapterTemplate } from '../ceshuTemplates'
import type { ChapterSchema } from './types'
import type { CeshuFieldDef, ChapterData } from '../ceshuConstants'

export const AUDIO_FIELDS: CeshuFieldDef[] = [
  {
    key: 'music_style',
    label: '音乐风格',
    kind: 'textarea',
    aiHint: '产出音乐风格定位：主风格 + 乐器/编曲特征 + 情绪基调；须与 art_style 视觉风格协调',
    reviewHint: '是否有明确风格与乐器描述；与 art_style 是否协调（如像素风配交响乐需说明理由）'
  },
  {
    key: 'sfx_count',
    label: '音效数量估算',
    kind: 'number',
    from: 0,
    to: 99999,
    aiHint: '给出音效总量估算：按 sfx_list 各类别数量求和，取整数，可附估算依据（场景数×每场景音效数）',
    reviewHint: '是否为整数；是否与 sfx_list 数量级一致；偏差大时是否附估算依据'
  },
  {
    key: 'soundtrack_list',
    label: '配乐清单',
    kind: 'pipeList',
    columns: [
      {
        key: 'scene',
        label: '场景'
      },
      {
        key: 'duration',
        label: '时长'
      },
      {
        key: 'mood',
        label: '情绪'
      },
      {
        key: 'composer',
        label: '作曲者'
      }
    ],
    aiHint: '产出配乐清单，每行四列：场景 + 时长（区间）+ 情绪 + 作曲者；覆盖主要游戏场景，不少于 3 行',
    reviewHint: '每行四列是否齐全；场景是否覆盖主线关键节点；时长是否为区间；行数是否≥3'
  },
  {
    key: 'sfx_list',
    label: '音效清单',
    kind: 'pipeList',
    columns: [
      {
        key: 'category',
        label: '类别'
      },
      {
        key: 'count',
        label: '数量'
      },
      {
        key: 'description',
        label: '描述'
      }
    ],
    aiHint: '产出音效清单，每行三列：类别 + 数量 + 描述；类别覆盖 UI/战斗/环境等，总数与 sfx_count 匹配',
    reviewHint: '三列是否齐全；类别划分是否覆盖主要玩法；各行数量之和与 sfx_count 是否量级一致'
  },
  {
    key: 'voice_acting',
    label: '配音设计',
    kind: 'textarea',
    aiHint: '一段概述：配音设计的总体方案与取舍；配音范围、声线定位、语言录制方式走「要点」字段',
    reviewHint: '是否明确配音范围；角色声线是否有区分度；是否说明语言或明确「无配音」'
  },
  {
    key: 'audio_engine',
    label: '音频引擎',
    kind: 'combo',
    values: [
      'FMOD',
      'Wwise',
      'CRI ADX',
      'Unity Audio',
      'Unreal Audio',
      '自研'
    ],
    optionLabels: {
      FMOD: 'FMOD',
      Wwise: 'Wwise',
      'CRI ADX': 'CRI ADX',
      'Unity Audio': 'Unity Audio',
      'Unreal Audio': 'Unreal Audio',
      自研: '自研'
    },
    aiHint: '从给定引擎选项中选一个并说明适配理由；须考虑项目技术栈与动态音频需求',
    reviewHint: '所选引擎是否在选项内；理由是否结合 tech.engine 与 dynamic_audio 需求'
  },
  {
    key: 'dynamic_audio',
    label: '动态音频',
    kind: 'textarea',
    aiHint: '一段概述：动态音频的设计目标；分层机制、触发条件与引擎匹配走「要点」字段',
    reviewHint: '是否描述具体机制而非罗列名词；触发条件是否明确；是否与 audio_engine 能力匹配'
  },
  {
    key: 'audio_localization',
    label: '音频本地化',
    kind: 'textarea',
    aiHint: '一段概述：音频本地化的总体策略；本地化音频类型、各语言策略与排期走「要点」字段',
    reviewHint: '是否区分配音与文本本地化；多语言策略是否给出；是否考虑排期与预算约束'
  },
  {
    key: 'audio_budget',
    label: '音频预算',
    kind: 'textarea',
    reviewHint: '金额是否给出构成（作曲/音效/配音/授权费）；是否与 audio_localization 范围匹配；是否注明报价来源或待定',
    aiDraftable: false
  },
  {
    key: 'audio_milestones',
    label: '音频里程碑',
    kind: 'pipeList',
    placeholder: '时间|交付物'
  }
]

export const AUDIO_SPLIT_HINTS: ChapterSchema['splitHints'] = {
  voice_acting: {
    points: {
      aiHint: '3-6 条：配音范围、角色声线定位、语言与录制方式；无配音则写「无配音」并说明',
      reviewHint: '是否明确配音范围；声线是否有区分度；是否说明语言或明确「无配音」'
    },
    notes: {
      aiHint: '配音预算档位与选角标准等要点之外的补充说明，可留空',
      reviewHint: '补充是否与要点重复；是否给出可执行标准'
    }
  },
  dynamic_audio: {
    points: {
      aiHint: '3-6 条：分层/交互音乐机制、触发条件、混音曲线与 audio_engine 能力匹配',
      reviewHint: '是否描述具体机制而非罗列名词；触发条件是否明确；是否与 audio_engine 匹配'
    },
    notes: {
      aiHint: '动态音频的测试场景与调试工具等要点之外的补充说明，可留空',
      reviewHint: '补充是否可落地；是否与要点重复'
    }
  },
  audio_localization: {
    points: {
      aiHint: '3-6 条：需本地化的音频类型、各语言配音策略、与开发里程碑的排期',
      reviewHint: '是否区分配音与文本本地化；多语言策略是否给出；是否考虑排期与预算'
    },
    notes: {
      aiHint: '本地化质检流程与字幕音频同步等要点之外的补充说明，可留空',
      reviewHint: '补充是否具体；是否与 audio_budget 约束匹配'
    }
  }
}

export const AUDIO_DEFAULTS: ChapterData = {
  music_style: '',
  sfx_count: 0,
  soundtrack_list: [],
  sfx_list: [],
  voice_acting: '',
  audio_engine: '',
  dynamic_audio: '',
  audio_localization: '',
  audio_budget: '',
  audio_milestones: []
}

export const AUDIO_TEMPLATES: ChapterTemplate[] = [
  {
    name: '国风音乐设计',
    description: '国风乐器 + 现代编曲的音频设计',
    tags: [
      '国风',
      '音乐',
      '音效'
    ],
    data: {
      music_style: '国风 + 现代管弦编曲；古琴、箫、二胡为主，配合弦乐与合成器',
      sfx_count: 500,
      music_tracks: [
        {
          scene: '主菜单',
          style: '古琴独奏',
          duration: '3min'
        },
        {
          scene: '战斗',
          style: '快速鼓点 + 琵琶',
          duration: '2min'
        },
        {
          scene: '剧情',
          style: '箫 + 弦乐',
          duration: '5min'
        }
      ],
      voice_count: 1000,
      audio_engine: 'Wwise',
      adaptive_music: '战斗音乐根据战斗强度动态切换层（探索/接触/激战）',
      sfx_design: '剑招音效参考真实剑鸣；法术音效结合自然元素（雷、火、水）',
      localization_audio: [
        'zh-CN 配音',
        'ja 配音',
        'en 字幕'
      ]
    }
  },
  {
    name: '电子音乐设计',
    description: '电子 + 合成器的赛博朋克音频设计',
    tags: [
      '电子',
      '赛博',
      '音效'
    ],
    data: {
      music_style: '合成器电子 + 工业噪音；营造赛博朋克冷峻氛围',
      sfx_count: 800,
      music_tracks: [
        {
          scene: '都市',
          style: 'Synthwave',
          duration: '4min'
        },
        {
          scene: '战斗',
          style: 'Industrial',
          duration: '3min'
        }
      ],
      voice_count: 1500,
      audio_engine: 'Wwise',
      adaptive_music: '根据地区切换音轨层（穹顶/都市/废弃区）',
      sfx_design: '枪械音效参考真实武器；UI 音效采用故障音 + 数字音',
      localization_audio: [
        'en 配音',
        'ja 配音',
        'zh-CN 配音'
      ]
    }
  }
]

export const AUDIO_SCHEMA: ChapterSchema = {
  fields: AUDIO_FIELDS,
  splits: [
  'voice_acting',
  'dynamic_audio',
  'audio_localization'
],
  splitHints: AUDIO_SPLIT_HINTS,
  defaults: AUDIO_DEFAULTS,
  templates: AUDIO_TEMPLATES
}
