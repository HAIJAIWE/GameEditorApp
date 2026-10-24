/**
 * 章节 `level_design` 的按章 schema（档 4 合并，2026-10-24）。
 *
 * 字段定义 / 契约（aiHint/reviewHint/aiDraftable 已内联）/ 三件套拆分清单
 * 全部收进单文件（字段 / 契约 / 拆分 / 默认 / 模板），改一个字段只碰这一处。
 */
import type { ChapterTemplate } from '../ceshuTemplates'
import type { ChapterSchema } from './types'
import type { CeshuFieldDef, ChapterData } from '../ceshuConstants'

export const LEVEL_DESIGN_FIELDS: CeshuFieldDef[] = [
  {
    key: 'level_principles',
    label: '关卡设计原则',
    kind: 'textarea',
    aiHint: '一段概述：关卡设计的总体原则与内容取向；可逐条核对的规则走结构化字段，本体勿罗列',
    reviewHint: '本体是否只讲原则；是否与难度曲线、关卡模板自洽'
  },
  {
    key: 'difficulty_curve',
    label: '难度曲线',
    kind: 'textarea',
    aiHint: '一段概述：难度起伏的总体形状与设计意图；按阶段的具体曲线点走「要点」字段',
    reviewHint: '本体是否只讲形状与意图；要点是否按阶段递进；是否有峰值与喘息段'
  },
  {
    key: 'difficulty_curve_points',
    label: '难度曲线·要点',
    kind: 'stringList',
    aiHint: '按阶段每行一条：阶段/关卡区间+难度等级+考验能力；难度须整体递增',
    reviewHint: '阶段是否递进；每行是否有难度与考验能力；新高峰前是否有缓冲关'
  },
  {
    key: 'difficulty_curve_notes',
    label: '难度曲线·补充',
    kind: 'textarea',
    aiHint: '曲线依据（玩家成长、数值章能力线）的补充说明，可留空',
    reviewHint: '依据是否与数值章成长线一致；是否与要点重复'
  },
  {
    key: 'level_templates',
    label: '关卡模板',
    kind: 'stringList',
    aiHint: '每行一个模板：模板名+结构+适用阶段；参考某游戏关卡时案例必须真实存在，不确定标「待确认」',
    reviewHint: '每行是否三要素齐全；参考案例是否真实可查；模板是否覆盖各阶段'
  },
  {
    key: 'first_levels',
    label: '首关体验',
    kind: 'stringList',
    aiHint: '每行一关：关卡名+教学点+引入机制；前三关按教学顺序排；参考案例必须真实存在，不确定标「待确认」',
    reviewHint: '前三关是否齐全；每关是否只有一个教学重点；是否与核心玩法一致'
  },
  {
    key: 'content_estimate',
    label: '内容量估算',
    kind: 'pipeList',
    columns: [
      {
        key: 'stage',
        label: '阶段'
      },
      {
        key: 'count',
        label: '关卡数量'
      },
      {
        key: 'minutes',
        label: '单关时长(分钟)'
      },
      {
        key: 'basis',
        label: '测算依据'
      }
    ],
    aiHint: '每行一阶段：阶段|关卡数量|单关时长(分钟)|测算依据；数量与时长须有依据，禁拍脑袋',
    reviewHint: '每行是否四列齐全；总量是否与 MVP 范围匹配；时长是否有依据'
  },
  {
    key: 'editor_needs',
    label: '编辑器需求',
    kind: 'stringList',
    aiHint: '每行一个编辑器能力需求：能力名称+支撑的关卡配置场景',
    reviewHint: '每条是否对应具体配置场景；是否与关卡模板、首关体验配套'
  }
]

export const LEVEL_DESIGN_DEFAULTS: ChapterData = {
  level_principles: '',
  difficulty_curve: '',
  difficulty_curve_points: [],
  difficulty_curve_notes: '',
  level_templates: [],
  first_levels: [],
  content_estimate: [],
  editor_needs: []
}

export const LEVEL_DESIGN_TEMPLATES: ChapterTemplate[] = []

export const LEVEL_DESIGN_SCHEMA: ChapterSchema = {
  fields: LEVEL_DESIGN_FIELDS,
  splits: [
  'level_principles'
],
  splitHints: undefined,
  defaults: LEVEL_DESIGN_DEFAULTS,
  templates: LEVEL_DESIGN_TEMPLATES
}
