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
    { key: 'test_env', label: '测试环境', kind: 'textarea', placeholder: '机型/系统/网络环境与设备采购预算' },
    /*
     * 原型验收（对标豆包 design-contract 的 `prototype` 键，2026-10-24 新增）。
     *
     * 为什么单独一列：测试策略与用例范围是「打算怎么测」，原型验收是「已经测过
     * 什么、证据在哪」——两者语义不同，混在一起会让「验收结论」被计划淹没。
     * 数值章「设计主张」里强度=实测的条目，证据必须能对上本表**通过**的检查项
     * （checkDesignClaims 会核对），这样「实测」两个字才不是空口。
     */
    {
      key: 'prototype_acceptance',
      label: '原型验收记录',
      kind: 'pipeList',
      columns: [
        { key: 'check', label: '检查项' },
        { key: 'result', label: '结果' },
        { key: 'evidence', label: '证据' }
      ]
    },
    /*
     * 用例清单（对标豆包 design-contract 的 `tests` 键，2026-10-24）。
     *
     * 与 `test_cases`（模块|用例数|优先级）的分工：那是**工作量估算**，本字段是
     * **可执行用例**——每条有前置、操作、期望与状态。类型限定为
     * 正常/边界/恢复/滥用 四类（对应豆包的 normal/boundary/recovery/abuse），
     * 校验会检查类型与状态是否合法、失败用例是否被无视。
     */
    {
      key: 'test_case_list',
      label: '用例清单（可执行）',
      kind: 'pipeList',
      columns: [
        { key: 'case', label: '用例' },
        { key: 'type', label: '类型' },
        { key: 'precondition', label: '前置' },
        { key: 'action', label: '操作' },
        { key: 'expected', label: '期望' },
        { key: 'status', label: '状态' }
      ]
    },
    /*
     * 验收旅程（对标豆包的 prototype.journeys）：标准/恢复/滥用三条路径，
     * 每条给步骤与期望——人按它走一遍，或由验收器按它跑一遍。
     */
    {
      key: 'acceptance_journeys',
      label: '验收旅程',
      kind: 'pipeList',
      columns: [
        { key: 'journey', label: '旅程' },
        { key: 'steps', label: '步骤' },
        { key: 'expected', label: '期望' }
      ]
    }
  ],
  defaults: {
    test_strategy: '',
    test_strategy_points: [],
    test_strategy_notes: '',
    test_cases: [],
    acceptance_criteria: [],
    defect_management: [],
    test_env: '',
    prototype_acceptance: [],
    test_case_list: [],
    acceptance_journeys: []
  }
}
