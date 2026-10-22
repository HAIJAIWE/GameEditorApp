import type { ChapterDefinition } from './types'

/**
 * 第十七章·UI/UX 交互设计的字段与默认数据（P2，2026-10-23）。
 *
 * 本章要点：AI 起草 UI/UX 章的最大风险是「原则空泛、界面与流程两张皮」——
 * 设计原则写成「简洁易用」这类不可核对的话；关键界面说明里出现的界面又不在
 * 信息架构的导航里，互相矛盾也没人发现。字段设计的防御：
 * - 设计原则拆三件套：每条原则必须落到「界面上的具体体现」，逐条可核对；
 * - 流程/界面/反馈全部结构化（pipeList/stringList），用列约束逼出
 *   「名称+要素」的最小信息单元，杜绝大段不可核对的散文；
 * - 可用性标准只收可量化验收线，从源头掐掉「体验流畅」这类虚词。
 */
export const UIUX_CHAPTER: ChapterDefinition = {
  fields: [
    { key: 'design_principles', label: '设计原则', kind: 'textarea' },
    { key: 'design_principles_points', label: '设计原则·要点', kind: 'stringList' },
    { key: 'design_principles_notes', label: '设计原则·补充', kind: 'textarea' },
    { key: 'information_architecture', label: '信息架构', kind: 'textarea' },
    {
      key: 'core_flows',
      label: '核心界面流程',
      kind: 'pipeList',
      columns: [
        { key: 'name', label: '流程名称' },
        { key: 'steps', label: '步骤' },
        { key: 'exit', label: '出口' }
      ]
    },
    { key: 'key_screens', label: '关键界面说明', kind: 'stringList' },
    {
      key: 'feedback_rules',
      label: '交互反馈规范',
      kind: 'pipeList',
      columns: [
        { key: 'trigger', label: '触发操作' },
        { key: 'feedback', label: '反馈形式' },
        { key: 'timing', label: '时机' }
      ]
    },
    { key: 'usability_standards', label: '可用性标准', kind: 'stringList' }
  ],
  defaults: {
    design_principles: '',
    design_principles_points: [],
    design_principles_notes: '',
    information_architecture: '',
    core_flows: [],
    key_screens: [],
    feedback_rules: [],
    usability_standards: []
  }
}
