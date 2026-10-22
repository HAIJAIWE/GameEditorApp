import type { ChapterFieldHints } from './types'

/**
 * 第十三章·风险控制的字段契约（P0 补契约，2026-10-23）。
 *
 * 本章要点：AI 起草风险易堆「沟通不畅」「进度延误」这类不可应对的套话，
 * 契约强制每条风险落到具体场景、可判定的概率影响、有责任人的应对，防止假大空。
 *
 * P1 结构拆分：risk_monitoring / crisis_management 拆为「本体 + 要点 + 补充」
 * 三件套——本体留总体机制，可执行规则与具体安排进要点字段逐条核对。
 */
export const RISK_HANDLING_FIELD_HINTS: ChapterFieldHints = {
  risk_matrix: {
    aiHint: '每行一条风险，按风险/概率/影响/应对/负责人五列填写；概率与影响用高中低或具体描述，不用纯形容词',
    reviewHint: '每条风险是否有具体场景；概率影响是否可判定；应对是否落到负责人'
  },
  contingency_plan: {
    aiHint: '列出前三大风险的触发条件、降级方案与止损线；写清谁有权启动预案及启动时点',
    reviewHint: '触发条件是否可观测；预案是否有明确止损线；启动人是否明确'
  },
  technical_risks: {
    aiHint: '每行一个技术风险，格式「风险—后果—缓解」；只列本项目技术栈相关的具体风险',
    reviewHint: '是否与项目技术栈匹配；每条是否有缓解措施；是否与矩阵重复'
  },
  market_risks: {
    aiHint: '每行一个市场风险，格式「风险—后果—缓解」；结合本作品类与竞品现状，不写行业空话',
    reviewHint: '是否结合本作品类；是否与市场分析章结论一致；缓解是否可执行'
  },
  team_risks: {
    aiHint: '每行一个团队风险，格式「风险—后果—缓解」；聚焦人员流动、技能缺口、协作成本',
    reviewHint: '是否具体到岗位或角色；缓解措施是否可操作'
  },
  legal_risks: {
    aiHint: '每行一个法律风险，格式「风险—后果—缓解」；覆盖版号、隐私、版权、付费合规等具体场景',
    reviewHint: '是否给出具体法规或合规场景；是否覆盖版号与隐私；缓解是否可落地'
  },
  schedule_risks: {
    aiHint: '每行一个进度风险，格式「风险—后果—缓解」；关联里程碑，指出会延期哪一阶段',
    reviewHint: '是否关联到具体里程碑；延期影响是否可量化'
  },
  risk_monitoring: {
    aiHint: '一段概述：风险监控的总体机制；频率/阈值/台账等具体规则走「要点」逐条列',
    reviewHint: '复审频率是否明确；升级阈值是否可判定；是否有责任角色'
  },
  risk_monitoring_points: {
    aiHint: '3-6 条：每条一个可执行规则（复审频率/责任角色/升级阈值/台账更新）',
    reviewHint: '每条是否有责任角色与时限；升级阈值是否可判定；规则能否直接执行'
  },
  risk_monitoring_notes: {
    aiHint: '要点之外的补充说明：历史风险案例或监控工具选型，可留空',
    reviewHint: '补充是否与要点重复；案例是否注明来源'
  },
  crisis_management: {
    aiHint: '一段概述：危机管理的总体原则；分级/流程/口径等具体安排走「要点」逐条列',
    reviewHint: '事故分级是否可判定；响应流程是否有决策链；是否含回滚与复盘'
  },
  crisis_management_points: {
    aiHint: '3-6 条：每条一个具体安排（事故分级/响应步骤/决策人/对外口径）',
    reviewHint: '每条是否可判定可执行；分级标准是否明确；是否含决策链与回滚'
  },
  crisis_management_notes: {
    aiHint: '要点之外的补充说明：历史事故复盘结论或公关资源储备，可留空',
    reviewHint: '补充是否与要点重复；复盘结论是否写清'
  }
}
