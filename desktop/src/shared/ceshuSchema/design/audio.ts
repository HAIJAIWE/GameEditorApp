/**
 * 章节 `audio` 的按章 schema（档 4 合并，2026-10-24）。
 *
 * 字段定义 / 契约（aiHint/reviewHint/aiDraftable 已内联）/ 三件套拆分清单
 * 全部收进单文件（字段 / 契约 / 拆分 / 默认 / 模板），改一个字段只碰这一处。
 */
import type { ChapterTemplate } from '../../ceshu/reference'
import type { ChapterSchema } from '../core'
import type { CeshuFieldDef, ChapterData } from '../../ceshu/reference'

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
  /*
   * 2026-10-27 角色评审补的字段：音频清单只回答「有哪些音效」，不回答「哪个交互播哪个」。
   * 没有这张表，程序只能自己在界面里散写播放调用 —— 换音效要改代码，并发也控不住。
   */
  {
    key: 'sfx_events',
    label: '音效事件映射',
    kind: 'pipeList',
    columns: [
      { key: 'event', label: '事件' },
      { key: 'sfx', label: '音效 id' },
      { key: 'volume', label: '音量' },
      { key: 'concurrency', label: '并发上限' }
    ],
    aiHint:
      '每行一个交互事件：事件名|音效 id|音量（0–1 相对值）|并发上限（数字，如 3）；事件名要与程序侧事件表一致（如 ui.click / combat.hit / pickup.coin）；至少覆盖 UI 点击/确认/报错、战斗命中/暴击、拾取/升级、切场景',
    reviewHint:
      '事件名是否与程序事件表一致（不能各叫一套）；关键交互是否都有音效；并发上限是否合理（避免爆音）；音量是相对值还是绝对值（绝对值要写单位）'
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
    placeholder: '时间|交付物',
    aiHint: '3-5 个音频交付节点，每行「时间（相对里程碑，如 Alpha 前 2 周）|交付物（BGM 套数/音效数量/配音批次）」',
    reviewHint: '时间是否与 MVP 里程碑对齐；交付物是否可验收（数量/时长）；是否给混音与迭代留了时间'
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
  sfx_events: [],
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
      soundtrack_list: [
        { scene: '主菜单', duration: '3 min', mood: '古琴独奏，克制', composer: '待确认' },
        { scene: '战斗', duration: '2 min', mood: '快速鼓点 + 琵琶', composer: '待确认' },
        { scene: '剧情', duration: '5 min', mood: '箫 + 弦乐，留白', composer: '待确认' }
      ],
      sfx_list: [
        { category: 'UI', count: 80, description: '点击/确认/报错，统一短促木质音色' },
        { category: '战斗', count: 220, description: '剑招参考真实剑鸣；法术结合自然元素（雷、火、水）' },
        { category: '环境', count: 120, description: '山林风声、水流、鸟鸣，按场景循环' },
        { category: '剧情提示', count: 80, description: '任务完成/获得道具/危险预警' }
      ],
      sfx_events: [
        { event: 'ui.click', sfx: 'sfx_ui_wood_01', volume: '0.7', concurrency: '1' },
        { event: 'combat.hit', sfx: 'sfx_sword_hit_03', volume: '0.9', concurrency: '4' },
        { event: 'combat.crit', sfx: 'sfx_crit_bell', volume: '1.0', concurrency: '2' },
        { event: 'pickup.coin', sfx: 'sfx_coin_02', volume: '0.6', concurrency: '3' }
      ],
      voice_acting: '配音总量约 1000 句：主角全剧情配音，主要 NPC 关键台词，其余用文字气泡。',
      audio_engine: 'Wwise',
      dynamic_audio: '战斗音乐根据战斗强度动态切换层（探索/接触/激战）。',
      audio_localization: '首发 zh-CN 配音；ja 配音二期；en 仅字幕。'
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
      soundtrack_list: [
        { scene: '都市', duration: '4 min', mood: 'Synthwave，冷峻', composer: '待确认' },
        { scene: '战斗', duration: '3 min', mood: 'Industrial，压迫', composer: '待确认' }
      ],
      sfx_list: [
        { category: '枪械', count: 260, description: '参考真实武器录音，按口径分层' },
        { category: 'UI', count: 120, description: '故障音 + 数字音，强化赛博质感' },
        { category: '环境', count: 220, description: '都市底噪、通风管、雨声，分区循环' },
        { category: '技能与特效', count: 200, description: '电子充能、过载、故障干扰' }
      ],
      sfx_events: [
        { event: 'ui.click', sfx: 'sfx_ui_digital_01', volume: '0.6', concurrency: '1' },
        { event: 'weapon.fire', sfx: 'sfx_rifle_fire_05', volume: '0.9', concurrency: '6' },
        { event: 'skill.overload', sfx: 'sfx_overload_burst', volume: '1.0', concurrency: '2' },
        { event: 'ui.error', sfx: 'sfx_glitch_deny', volume: '0.8', concurrency: '1' }
      ],
      voice_acting: '配音总量约 1500 句：三名主角全剧情配音，反派关键场次，其余文字。',
      audio_engine: 'Wwise',
      dynamic_audio: '根据地区切换音轨层（穹顶/都市/废弃区），进入战斗时叠加打击层。',
      audio_localization: '首发 en 配音；ja 配音同步；zh-CN 配音二期。'
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
