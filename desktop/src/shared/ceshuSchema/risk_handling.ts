/**
 * 章节 `risk_handling` 的按章 schema（档 4 合并，2026-10-24）。
 *
 * 字段定义 / 契约（aiHint/reviewHint/aiDraftable 已内联）/ 三件套拆分清单
 * 全部收进单文件；旧 ceshuFieldHints/ceshuFieldSplits 仅做 re-export 兜底。
 * 改一个字段只碰这一处。
 */
import type { ChapterSchema } from './types'
import type { CeshuFieldDef } from '../ceshuConstants'

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
    placeholder: '层级|决策人|时限'
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

export const RISK_HANDLING_SCHEMA: ChapterSchema = {
  fields: RISK_HANDLING_FIELDS,
  splits: [
  'risk_monitoring',
  'crisis_management'
],
  splitHints: RISK_HANDLING_SPLIT_HINTS
}
