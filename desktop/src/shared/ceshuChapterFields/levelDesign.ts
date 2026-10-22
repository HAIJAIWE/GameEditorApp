import type { ChapterDefinition } from './types'

/**
 * 第十八章·关卡与内容设计的字段与默认数据（P2，2026-10-23）。
 *
 * 本章要点：AI 起草本章的最大风险是「编」——编不存在的关卡模板、参考子虚乌有的
 * 「某游戏某关」，再附一拍脑袋的关卡数与单关时长，看起来很完整但全线不可执行。
 * 字段设计的防御：
 * - 凡引用外部关卡案例的字段（关卡模板/首关体验），契约强制要求
 *   「案例必须真实存在，不确定标『待确认』」（见 ceshuFieldHints/levelDesign.ts）；
 * - 内容量估算用 pipeList 把「数量×时长」拆成可逐行核对的列，测算依据单独
 *   成列——没有依据的行过不了人审；
 * - 难度曲线拆三件套：本体只讲形状与设计意图，按阶段的曲线点进要点逐条核对。
 */
export const LEVEL_DESIGN_CHAPTER: ChapterDefinition = {
  fields: [
    { key: 'level_principles', label: '关卡设计原则', kind: 'textarea' },
    { key: 'difficulty_curve', label: '难度曲线', kind: 'textarea' },
    { key: 'difficulty_curve_points', label: '难度曲线·要点', kind: 'stringList' },
    { key: 'difficulty_curve_notes', label: '难度曲线·补充', kind: 'textarea' },
    { key: 'level_templates', label: '关卡模板', kind: 'stringList' },
    { key: 'first_levels', label: '首关体验', kind: 'stringList' },
    {
      key: 'content_estimate',
      label: '内容量估算',
      kind: 'pipeList',
      columns: [
        { key: 'stage', label: '阶段' },
        { key: 'count', label: '关卡数量' },
        { key: 'minutes', label: '单关时长(分钟)' },
        { key: 'basis', label: '测算依据' }
      ]
    },
    { key: 'editor_needs', label: '编辑器需求', kind: 'stringList' }
  ],
  defaults: {
    level_principles: '',
    difficulty_curve: '',
    difficulty_curve_points: [],
    difficulty_curve_notes: '',
    level_templates: [],
    first_levels: [],
    content_estimate: [],
    editor_needs: []
  }
}
