import type { ChapterFieldHints } from './types'

/**
 * 第九章·音频设计的字段契约（P0 补契约，2026-10-23）。
 *
 * 本章要点：音频章最大风险是「数量拍脑袋、清单列三项」——sfx_count 与 sfx_list 脱节；
 * 契约强制两者数量级一致，并锁死预算、引擎选型为人定，AI 只做设计与估算。
 */
export const AUDIO_FIELD_HINTS: ChapterFieldHints = {
  music_style: {
    aiHint: '产出音乐风格定位：主风格 + 乐器/编曲特征 + 情绪基调；须与 art_style 视觉风格协调',
    reviewHint: '是否有明确风格与乐器描述；与 art_style 是否协调（如像素风配交响乐需说明理由）'
  },
  sfx_count: {
    aiHint: '给出音效总量估算：按 sfx_list 各类别数量求和，取整数，可附估算依据（场景数×每场景音效数）',
    reviewHint: '是否为整数；是否与 sfx_list 数量级一致；偏差大时是否附估算依据'
  },
  soundtrack_list: {
    aiHint: '产出配乐清单，每行四列：场景 + 时长（区间）+ 情绪 + 作曲者；覆盖主要游戏场景，不少于 3 行',
    reviewHint: '每行四列是否齐全；场景是否覆盖主线关键节点；时长是否为区间；行数是否≥3'
  },
  sfx_list: {
    aiHint: '产出音效清单，每行三列：类别 + 数量 + 描述；类别覆盖 UI/战斗/环境等，总数与 sfx_count 匹配',
    reviewHint: '三列是否齐全；类别划分是否覆盖主要玩法；各行数量之和与 sfx_count 是否量级一致'
  },
  voice_acting: {
    aiHint: '产出配音设计方案：配音范围（哪些内容配音）+ 角色声线定位 + 语言/录制方式；无配音则写「无配音」并说明',
    reviewHint: '是否明确配音范围；角色声线是否有区分度；是否说明语言或明确「无配音」'
  },
  audio_engine: {
    aiHint: '从给定引擎选项中选一个并说明适配理由；须考虑项目技术栈与动态音频需求',
    reviewHint: '所选引擎是否在选项内；理由是否结合 tech.engine 与 dynamic_audio 需求'
  },
  dynamic_audio: {
    aiHint: '产出动态音频设计：分层/交互音乐机制（如状态切换、混音曲线）+ 触发条件 + 与 audio_engine 能力的匹配',
    reviewHint: '是否描述具体机制而非罗列名词；触发条件是否明确；是否与 audio_engine 能力匹配'
  },
  audio_localization: {
    aiHint: '产出音频本地化方案：需本地化的音频类型（配音/字幕/UI音）+ 各语言配音策略 + 与开发里程碑的排期',
    reviewHint: '是否区分配音与文本本地化；多语言策略是否给出；是否考虑排期与预算约束'
  },
  audio_budget: {
    reviewHint: '金额是否给出构成（作曲/音效/配音/授权费）；是否与 audio_localization 范围匹配；是否注明报价来源或待定',
    aiDraftable: false
  }
}
