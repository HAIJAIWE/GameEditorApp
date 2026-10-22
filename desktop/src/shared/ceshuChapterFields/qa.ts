import type { ChapterDefinition } from './types'

/**
 * 第二十一章·测试与质量保障的字段与默认数据（P2，2026-10-23）。
 *
 * 本章要点：AI 起草的最大风险是「写口号」——「全面测试保证质量」式空话，
 * 用例数拍脑袋不给模块拆分，验收标准不可判定（「体验流畅」），缺陷 SLA 形同虚设。
 * 字段设计怎么防：测试策略按 P1 三件套思路直接拆出「要点」，功能/兼容/性能/体验
 * 分层逐条核对，自动化范围与工具链并入口径；用例范围与缺陷管理用 pipeList
 * 钉死列结构；体验验收标准只收可判定条款；测试环境涉及设备采购预算，标为人定。
 */
export const QA_CHAPTER: ChapterDefinition = {
  fields: [
    { key: 'test_strategy', label: '测试策略', kind: 'textarea', placeholder: '一段概述：分层测试策略与自动化边界' },
    { key: 'test_strategy_points', label: '测试策略·要点', kind: 'stringList', placeholder: '每行一层' },
    { key: 'test_strategy_notes', label: '测试策略·补充', kind: 'textarea', placeholder: '自动化工具链等补充说明，可留空' },
    {
      key: 'test_cases',
      label: '用例范围',
      kind: 'pipeList',
      columns: [
        { key: 'module', label: '模块' },
        { key: 'count', label: '用例数' },
        { key: 'priority', label: '优先级' }
      ]
    },
    { key: 'acceptance_criteria', label: '体验验收标准', kind: 'stringList', placeholder: '每行一条可判定条款' },
    {
      key: 'defect_management',
      label: '缺陷管理',
      kind: 'pipeList',
      columns: [
        { key: 'level', label: '缺陷级别' },
        { key: 'definition', label: '定义' },
        { key: 'response_sla', label: '响应 SLA' },
        { key: 'fix_sla', label: '修复时限' }
      ]
    },
    { key: 'test_env', label: '测试环境', kind: 'textarea', placeholder: '机型/系统/网络环境与设备采购预算' }
  ],
  defaults: {
    test_strategy: '',
    test_strategy_points: [],
    test_strategy_notes: '',
    test_cases: [],
    acceptance_criteria: [],
    defect_management: [],
    test_env: ''
  }
}
