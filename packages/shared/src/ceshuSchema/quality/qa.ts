/**
 * 章节 `qa` 的按章 schema（档 4 合并，2026-10-24）。
 *
 * 字段定义 / 契约（aiHint/reviewHint/aiDraftable 已内联）/ 三件套拆分清单
 * 全部收进单文件（字段 / 契约 / 拆分 / 默认 / 模板），改一个字段只碰这一处。
 */
import type { ChapterTemplate } from '../../ceshu/reference'
import type { ChapterSchema } from '../core'
import type { CeshuFieldDef, ChapterData } from '../../ceshu/reference'

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
    ],
    aiHint:
      '5-8 条可执行用例，每行「用例|类型（正常/边界/恢复/滥用）|前置|操作|期望|状态（待执行）」；期望必须可判定，状态只填待执行/通过/失败',
    reviewHint: '期望是否可判定（不能写「正常」）；是否覆盖边界与异常；是否与验收旅程对得上'
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
    ],
    aiHint:
      '3-5 条验收旅程，每行「旅程名|步骤（用 > 串联关键节点）|期望结果」；至少覆盖首次进入、核心循环、失败路径各一条',
    reviewHint: '步骤是否可复现；是否覆盖首次体验与失败路径；期望是否与产品目标一致'
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

export const QA_TEMPLATES: ChapterTemplate[] = [
  {
    name: '测试策略（示例）',
    description: '功能 / 兼容 / 性能 / 体验分层，含用例范围、验收标准与验收旅程',
    tags: ['测试', 'QA', '示例'],
    data: {
      test_strategy: '分层测试：功能（战斗 / 经济 / 剧情主链路）+ 兼容（机型档位 × OS）+ 性能（帧率 / 内存 / 加载）+ 体验（新手引导 / 操作手感）。自动化覆盖回归与主链路，体验类手工验收。',
      test_strategy_points: [
        '功能层：战斗结算 / 抽卡保底 / 经济产消，自动化 70%',
        '兼容层：高 / 中 / 低三档 × Android / iOS 主流版本，自动化 40%',
        '性能层：副本峰值 / 大世界同屏，自动化 60%',
        '体验层：新手引导完成率 / 操作误触，手工 100%'
      ],
      test_strategy_notes: '测试左移：策划案评审即列验收点；准入=主线通关率 ≥ 70%，准出=无 P0 / P1。',
      test_cases: [
        { module: '战斗', count: '120', priority: 'P0' },
        { module: '抽卡 / 经济', count: '80', priority: 'P0' },
        { module: '剧情', count: '60', priority: 'P1' },
        { module: 'UI / 交互', count: '90', priority: 'P1' },
        { module: '联机 / 排行榜', count: '50', priority: 'P1' }
      ],
      acceptance_criteria: [
        '新手引导完成率 ≥ 80%',
        '主线第一章通关率 ≥ 70%',
        'P0 缺陷数 = 0 方可发版',
        '中档机 30 分钟平均帧率 ≥ 45fps'
      ],
      defect_management: [
        { level: 'P0 致命', definition: '崩溃 / 无法推进主线 / 支付异常', response_sla: '10 min', fix_sla: '当日' },
        { level: 'P1 严重', definition: '核心玩法异常 / 数据错误', response_sla: '1 h', fix_sla: '3 日' },
        { level: 'P2 一般', definition: '体验问题 / 显示异常', response_sla: '1 日', fix_sla: '7 日' },
        { level: 'P3 建议', definition: '优化建议', response_sla: '评审', fix_sla: '排期' }
      ],
      test_env: '测试机型：高（骁龙 8 Gen3 / A17）、中（天玑 8200 / A14）、低（骁龙 6 Gen1 / A12）；含 Android 12–15 与 iOS 16–18；弱网用 100ms / 丢包 5% 模拟。设备采购预算需人核。',
      prototype_acceptance: [
        { check: '首单战斗可完成', result: '通过', evidence: '平均 28 秒通关教学战' },
        { check: '首次抽卡保底生效', result: '通过', evidence: '第 50 抽必出 UP' },
        { check: '经济无通胀', result: '部分通过', evidence: '需上线后 2 周观测，见跟进' }
      ],
      test_case_list: [
        { case: '战斗结算数值正确', type: '正常', precondition: '进入战斗', action: '释放技能至敌死', expected: '血量 / 伤害与数值表一致', status: '待执行' },
        { case: '抽卡保底边界', type: '边界', precondition: '已抽 49 次', action: '第 50 抽', expected: '必出 UP 角色', status: '待执行' },
        { case: '断线重连', type: '恢复', precondition: '对局中', action: '断网 5s 重连', expected: '状态恢复无丢战', status: '待执行' },
        { case: '重复点击抽卡', type: '滥用', precondition: '抽卡界面', action: '1 秒内连点 10 次', expected: '仅发起 1 次请求，不重复扣费', status: '待执行' }
      ],
      acceptance_journeys: [
        { journey: '首次进入', steps: '注册 > 引导 > 首战 > 首抽', expected: '30 min 内到首抽无卡点' },
        { journey: '核心循环', steps: '日常 > 秘境 > 论剑', expected: '每日 20 min 形成习惯' },
        { journey: '失败路径', steps: '支付失败 > 重试', expected: '提示清晰可恢复' }
      ]
    }
  }
]

export const QA_SCHEMA: ChapterSchema = {
  fields: QA_FIELDS,
  splits: [],
  splitHints: undefined,
  defaults: QA_DEFAULTS,
  templates: QA_TEMPLATES
}
