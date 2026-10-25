/**
 * 章节 `risk_handling` 的按章 schema（档 4 合并，2026-10-24）。
 *
 * 字段定义 / 契约（aiHint/reviewHint/aiDraftable 已内联）/ 三件套拆分清单
 * 全部收进单文件（字段 / 契约 / 拆分 / 默认 / 模板），改一个字段只碰这一处。
 */
import type { ChapterTemplate } from '../ceshuTemplates'
import type { ChapterSchema } from './types'
import type { CeshuFieldDef, ChapterData } from '../ceshuConstants'

export const RISK_HANDLING_FIELDS: CeshuFieldDef[] = [
  {
    key: 'risk_matrix',
    label: '风险矩阵',
    kind: 'pipeList',
    columns: [
      {
        key: 'risk',
        label: '风险'
      },
      {
        key: 'probability',
        label: '概率'
      },
      {
        key: 'impact',
        label: '影响'
      },
      {
        key: 'mitigation',
        label: '应对'
      },
      {
        key: 'owner',
        label: '负责人'
      }
    ],
    aiHint: '每行一条风险，按风险/概率/影响/应对/负责人五列填写；概率与影响用高中低或具体描述，不用纯形容词',
    reviewHint: '每条风险是否有具体场景；概率影响是否可判定；应对是否落到负责人'
  },
  {
    key: 'contingency_plan',
    label: '应急预案',
    kind: 'textarea',
    aiHint: '列出前三大风险的触发条件、降级方案与止损线；写清谁有权启动预案及启动时点',
    reviewHint: '触发条件是否可观测；预案是否有明确止损线；启动人是否明确'
  },
  {
    key: 'technical_risks',
    label: '技术风险',
    kind: 'stringList',
    placeholder: '每行一个',
    aiHint: '每行一个技术风险，格式「风险—后果—缓解」；只列本项目技术栈相关的具体风险',
    reviewHint: '是否与项目技术栈匹配；每条是否有缓解措施；是否与矩阵重复'
  },
  {
    key: 'market_risks',
    label: '市场风险',
    kind: 'stringList',
    placeholder: '每行一个',
    aiHint: '每行一个市场风险，格式「风险—后果—缓解」；结合本作品类与竞品现状，不写行业空话',
    reviewHint: '是否结合本作品类；是否与市场分析章结论一致；缓解是否可执行'
  },
  {
    key: 'team_risks',
    label: '团队风险',
    kind: 'stringList',
    placeholder: '每行一个',
    aiHint: '每行一个团队风险，格式「风险—后果—缓解」；聚焦人员流动、技能缺口、协作成本',
    reviewHint: '是否具体到岗位或角色；缓解措施是否可操作'
  },
  {
    key: 'legal_risks',
    label: '法律风险',
    kind: 'stringList',
    placeholder: '每行一个',
    aiHint: '每行一个法律风险，格式「风险—后果—缓解」；覆盖版号、隐私、版权、付费合规等具体场景',
    reviewHint: '是否给出具体法规或合规场景；是否覆盖版号与隐私；缓解是否可落地'
  },
  {
    key: 'schedule_risks',
    label: '进度风险',
    kind: 'stringList',
    placeholder: '每行一个',
    aiHint: '每行一个进度风险，格式「风险—后果—缓解」；关联里程碑，指出会延期哪一阶段',
    reviewHint: '是否关联到具体里程碑；延期影响是否可量化'
  },
  {
    key: 'risk_monitoring',
    label: '风险监控',
    kind: 'textarea',
    aiHint: '一段概述：风险监控的总体机制；频率/阈值/台账等具体规则走「要点」逐条列',
    reviewHint: '复审频率是否明确；升级阈值是否可判定；是否有责任角色'
  },
  {
    key: 'crisis_management',
    label: '危机管理',
    kind: 'textarea',
    aiHint: '一段概述：危机管理的总体原则；分级/流程/口径等具体安排走「要点」逐条列',
    reviewHint: '事故分级是否可判定；响应流程是否有决策链；是否含回滚与复盘'
  },
  {
    key: 'escalation_path',
    label: '升级路径',
    kind: 'pipeList',
    placeholder: '层级|决策人|时限',
    aiHint: '3-4 级升级路径，每行「层级（一线/主策/制作人/发行）|决策人角色|时限（多少小时内响应）」；最高层要能拍板砍范围',
    reviewHint: '时限是否可执行；决策人是否写到角色而非具体姓名；最高层是否有权变更范围与排期'
  }
]

export const RISK_HANDLING_SPLIT_HINTS: ChapterSchema['splitHints'] = {
  risk_monitoring: {
    points: {
      aiHint: '3-6 条：每条一个可执行规则（复审频率/责任角色/升级阈值/台账更新）',
      reviewHint: '每条是否有责任角色与时限；升级阈值是否可判定；规则能否直接执行'
    },
    notes: {
      aiHint: '要点之外的补充说明：历史风险案例或监控工具选型，可留空',
      reviewHint: '补充是否与要点重复；案例是否注明来源'
    }
  },
  crisis_management: {
    points: {
      aiHint: '3-6 条：每条一个具体安排（事故分级/响应步骤/决策人/对外口径）',
      reviewHint: '每条是否可判定可执行；分级标准是否明确；是否含决策链与回滚'
    },
    notes: {
      aiHint: '要点之外的补充说明：历史事故复盘结论或公关资源储备，可留空',
      reviewHint: '补充是否与要点重复；复盘结论是否写清'
    }
  }
}

export const RISK_HANDLING_DEFAULTS: ChapterData = {
  risk_matrix: [],
  contingency_plan: '',
  technical_risks: [],
  market_risks: [],
  team_risks: [],
  legal_risks: [],
  schedule_risks: [],
  risk_monitoring: '',
  escalation_path: '',
  crisis_management: ''
}

export const RISK_HANDLING_TEMPLATES: ChapterTemplate[] = [
  {
    name: '全维度风险矩阵',
    description: '技术/市场/团队/法律全维度风险矩阵',
    tags: [
      '风险',
      '矩阵',
      '全维度'
    ],
    data: {
      risk_matrix: [
        {
          risk: '核心人员流失',
          probability: '中',
          impact: '高',
          mitigation: '股权激励 + 知识沉淀 + 双备份',
          owner: '制作人'
        },
        {
          risk: '美术外包延期',
          probability: '高',
          impact: '中',
          mitigation: '多供应商 + 提前 2 个月启动',
          owner: '美术总监'
        },
        {
          risk: '性能不达标',
          probability: '中',
          impact: '高',
          mitigation: '早期性能基线 + 持续监控',
          owner: '技术总监'
        },
        {
          risk: '市场风向变化',
          probability: '中',
          impact: '中',
          mitigation: '敏捷调整 + 多版本预案',
          owner: '制作人'
        },
        {
          risk: '审核风险',
          probability: '低',
          impact: '高',
          mitigation: '提前送审 + 内容合规',
          owner: '运营'
        }
      ],
      contingency_plan: '若 T+12M 未达 Beta：1) 削减支线 30%；2) 推迟上线 3 个月；3) 增派 QA',
      technical_risks: [
        {
          risk: '引擎性能瓶颈',
          mitigation: '早期原型 + 性能基线'
        },
        {
          risk: '联机架构不稳',
          mitigation: '压力测试 + 弹性扩容'
        }
      ],
      market_risks: [
        {
          risk: '竞品提前上线',
          mitigation: '差异化定位 + 快速迭代'
        },
        {
          risk: '玩家偏好变化',
          mitigation: '持续用户调研'
        }
      ],
      team_risks: [
        {
          risk: '核心人员流失',
          mitigation: '股权 + 双备份'
        },
        {
          risk: '团队扩张过快',
          mitigation: '渐进式招聘 + 培训'
        }
      ],
      legal_risks: [
        {
          risk: '版权争议',
          mitigation: '法务审查 + 自有 IP'
        },
        {
          risk: '审核不通过',
          mitigation: '内容合规 + 预审'
        }
      ],
      monitoring: '1) 每周风险评审会\n2) 关键指标看板\n3) 月度风险报告'
    }
  }
]

export const RISK_HANDLING_SCHEMA: ChapterSchema = {
  fields: RISK_HANDLING_FIELDS,
  splits: [
  'risk_monitoring',
  'crisis_management'
],
  splitHints: RISK_HANDLING_SPLIT_HINTS,
  defaults: RISK_HANDLING_DEFAULTS,
  templates: RISK_HANDLING_TEMPLATES
}
