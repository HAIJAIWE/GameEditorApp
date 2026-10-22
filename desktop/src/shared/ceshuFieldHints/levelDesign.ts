import type { ChapterFieldHints } from './types'

/**
 * 第十八章·关卡与内容设计的字段契约（P2，2026-10-23）。
 *
 * 本章要点：关卡设计是 AI「编造」重灾区——模板像真的、参考案例像存在的、
 * 时长像拍脑袋得很有依据。契约的防御分两层：
 * - 禁编造：凡涉及「参考某游戏关卡」的字段（level_templates / first_levels），
 *   aiHint 强制「案例必须真实存在，不确定标『待确认』」；
 * - 反虚填：内容量估算四列齐全、测算依据单独成列；难度曲线三件套把
 *   「按阶段递进」写进可核对的要点清单。
 *
 * `difficulty_curve_points` / `difficulty_curve_notes` 的契约随本体一并给出，
 * 与字段定义中的手工三件套对应，无需拆分配置自动生成。
 */
export const LEVEL_DESIGN_FIELD_HINTS: ChapterFieldHints = {
  level_principles: {
    aiHint: '一段概述：关卡设计的总体原则与内容取向；可逐条核对的规则走结构化字段，本体勿罗列',
    reviewHint: '本体是否只讲原则；是否与难度曲线、关卡模板自洽'
  },
  difficulty_curve: {
    aiHint: '一段概述：难度起伏的总体形状与设计意图；按阶段的具体曲线点走「要点」字段',
    reviewHint: '本体是否只讲形状与意图；要点是否按阶段递进；是否有峰值与喘息段'
  },
  difficulty_curve_points: {
    aiHint: '按阶段每行一条：阶段/关卡区间+难度等级+考验能力；难度须整体递增',
    reviewHint: '阶段是否递进；每行是否有难度与考验能力；新高峰前是否有缓冲关'
  },
  difficulty_curve_notes: {
    aiHint: '曲线依据（玩家成长、数值章能力线）的补充说明，可留空',
    reviewHint: '依据是否与数值章成长线一致；是否与要点重复'
  },
  level_templates: {
    aiHint: '每行一个模板：模板名+结构+适用阶段；参考某游戏关卡时案例必须真实存在，不确定标「待确认」',
    reviewHint: '每行是否三要素齐全；参考案例是否真实可查；模板是否覆盖各阶段'
  },
  first_levels: {
    aiHint: '每行一关：关卡名+教学点+引入机制；前三关按教学顺序排；参考案例必须真实存在，不确定标「待确认」',
    reviewHint: '前三关是否齐全；每关是否只有一个教学重点；是否与核心玩法一致'
  },
  content_estimate: {
    aiHint: '每行一阶段：阶段|关卡数量|单关时长(分钟)|测算依据；数量与时长须有依据，禁拍脑袋',
    reviewHint: '每行是否四列齐全；总量是否与 MVP 范围匹配；时长是否有依据'
  },
  editor_needs: {
    aiHint: '每行一个编辑器能力需求：能力名称+支撑的关卡配置场景',
    reviewHint: '每条是否对应具体配置场景；是否与关卡模板、首关体验配套'
  }
}
