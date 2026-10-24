/**
 * 章节 `qa` 的按章 schema（档 4 合并，2026-10-24）。
 *
 * 字段定义 / 契约（aiHint/reviewHint/aiDraftable 已内联）/ 三件套拆分清单
 * 全部收进单文件（字段 / 契约 / 拆分 / 默认 / 模板），改一个字段只碰这一处。
 */
import type { ChapterTemplate } from '../ceshuTemplates'
import type { ChapterSchema } from './types'
import type { CeshuFieldDef, ChapterData } from '../ceshuConstants'

export const QA_FIELDS: CeshuFieldDef[] = [
  {
    key: 'test_strategy',
    label: '测试策略',
    kind: 'textarea',
    placeholder: '一段概述：分层测试策略与自动化边界',
    aiHint: '一段概述：功能/兼容/性能/体验分层测试策略与自动化边界；各层重点走「要点」字段',
    reviewHint: '本体是否只讲策略与自动化边界；要点是否覆盖四层且给出各层重点'
  },
  {
    key: 'test_strategy_points',
    label: '测试策略·要点',
    kind: 'stringList',
    placeholder: '每行一层',
    aiHint: '4 层：功能、兼容、性能、体验，每行一层，含测试重点与自动化比例',
    reviewHint: '条目是否可逐条核对；四层是否齐全；自动化比例是否合理可行'
  },
  {
    key: 'test_strategy_notes',
    label: '测试策略·补充',
    kind: 'textarea',
    placeholder: '自动化工具链等补充说明，可留空',
    aiHint: '自动化工具链、测试左移与准入准出规则等补充说明，可留空',
    reviewHint: '是否只放补充信息，没有把要点又抄一遍'
  },
  {
    key: 'test_cases',
    label: '用例范围',
    kind: 'pipeList',
    columns: [
      {
        key: 'module',
        label: '模块'
      },
      {
        key: 'count',
        label: '用例数'
      },
      {
        key: 'priority',
        label: '优先级'
      }
    ],
    aiHint: '每行一个模块，按模块/用例数/优先级三列填写；覆盖核心玩法、战斗、经济、UI 等模块',
    reviewHint: '模块是否覆盖主要系统；用例数是否与优先级匹配、量级是否合理'
  },
  {
    key: 'acceptance_criteria',
    label: '体验验收标准',
    kind: 'stringList',
    placeholder: '每行一条可判定条款',
    aiHint: '3-6 条可判定条款，每行一条，必须含数值阈值或明确通过条件，如「新手引导完成率 ≥ 80%」',
    reviewHint: '每条是否可判定；是否含数值阈值；是否与数据分析章指标体系对得上'
  },
  {
    key: 'defect_management',
    label: '缺陷管理',
    kind: 'pipeList',
    columns: [
      {
        key: 'level',
        label: '缺陷级别'
      },
      {
        key: 'definition',
        label: '定义'
      },
      {
        key: 'response_sla',
        label: '响应 SLA'
      },
      {
        key: 'fix_sla',
        label: '修复时限'
      }
    ],
    aiHint: '每行一个缺陷级别，按级别/定义/响应 SLA/修复时限四列填写；一般 3-4 级',
    reviewHint: '分级定义是否互不重叠；SLA 是否明确到小时/天；是否含回归验证要求'
  },
  {
    key: 'test_env',
    label: '测试环境',
    kind: 'textarea',
    placeholder: '机型/系统/网络环境与设备采购预算',
    reviewHint: '机型与系统覆盖是否匹配目标平台；设备采购预算是否人核；网络环境是否含弱网',
    aiDraftable: false
  },
  {
    key: 'prototype_acceptance',
    label: '原型验收记录',
    kind: 'pipeList',
    columns: [
      {
        key: 'check',
        label: '检查项'
      },
      {
        key: 'result',
        label: '结果'
      },
      {
        key: 'evidence',
        label: '证据'
      }
    ],
    aiHint: '每行一条验收记录：检查项|结果|证据。结果列只填「通过 / 未通过 / 部分通过」三选一；证据写可复核的数值或现象（如「平均 28 秒完成首单」）',
    reviewHint: '结果列是否为三选一受控值（其他写法会被校验判为无法识别）；未通过/部分通过是否有证据与跟进计划'
  },
  {
    key: 'test_case_list',
    label: '用例清单（可执行）',
    kind: 'pipeList',
    columns: [
      {
        key: 'case',
        label: '用例'
      },
      {
        key: 'type',
        label: '类型'
      },
      {
        key: 'precondition',
        label: '前置'
      },
      {
        key: 'action',
        label: '操作'
      },
      {
        key: 'expected',
        label: '期望'
      },
      {
        key: 'status',
        label: '状态'
      }
    ]
  },
  {
    key: 'acceptance_journeys',
    label: '验收旅程',
    kind: 'pipeList',
    columns: [
      {
        key: 'journey',
        label: '旅程'
      },
      {
        key: 'steps',
        label: '步骤'
      },
      {
        key: 'expected',
        label: '期望'
      }
    ]
  }
]

export const QA_DEFAULTS: ChapterData = {
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

export const QA_TEMPLATES: ChapterTemplate[] = []

export const QA_SCHEMA: ChapterSchema = {
  fields: QA_FIELDS,
  splits: [],
  splitHints: undefined,
  defaults: QA_DEFAULTS,
  templates: QA_TEMPLATES
}
