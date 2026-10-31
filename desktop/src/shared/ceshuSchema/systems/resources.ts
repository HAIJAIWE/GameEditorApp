/**
 * 章节 `resources` 的按章 schema（档 4 合并，2026-10-24）。
 *
 * 字段定义 / 契约（aiHint/reviewHint/aiDraftable 已内联）/ 三件套拆分清单
 * 全部收进单文件（字段 / 契约 / 拆分 / 默认 / 模板），改一个字段只碰这一处。
 */
import type { ChapterTemplate } from '../../ceshu/reference'
import type { ChapterSchema } from '../core'
import type { CeshuFieldDef, ChapterData } from '../../ceshu/reference'

export const RESOURCES_FIELDS: CeshuFieldDef[] = [
  {
    key: 'budget.summary',
    label: '预算概算',
    kind: 'text',
    reviewHint: '概算是否含总额与分项（人力/外包/软件/市场）；数字是否与 team_structure 规模自洽；是否注明币种与估算口径',
    aiDraftable: false
  },
  {
    key: 'risk_matrix',
    label: '资源风险（TOP 摘要）',
    kind: 'stringList',
    placeholder: '每行一条风险',
    aiHint: '资源视角的 TOP 3-5 条风险概要，每行：风险 + 概率/影响 + 应对方向；完整矩阵与负责人分派在第十三章，此处勿展开',
    reviewHint: '是否只列 TOP 几条而未展开完整矩阵；每条是否三要素齐全；与第十三章矩阵是否自洽不矛盾'
  },
  {
    key: 'ip',
    label: '知识产权',
    kind: 'text',
    reviewHint: '是否区分自研/授权/第三方资产；授权项是否注明授权范围与期限；是否有侵权风险项未处置',
    aiDraftable: false
  },
  {
    key: 'art_assets',
    label: '美术资源清单',
    kind: 'pipeList',
    placeholder: '类别|数量|规格',
    aiHint: '4-6 行美术资源估算，每行「类别（角色/场景/UI/特效）|数量|规格（分辨率/面数/是否含动画）」；数量要与内容量对得上',
    reviewHint: '数量能否被内容量支撑（不多不少）；规格是否统一；是否标了外包/自制的分配'
  },
  {
    key: 'audio_assets',
    label: '音频资源清单',
    kind: 'pipeList',
    placeholder: '类别|数量|说明',
    aiHint: '4-6 行音频资源估算，每行「类别（BGM/音效/配音/环境音）|数量|说明（时长或触发场景）」',
    reviewHint: '数量是否与音频设计章一致；是否写了版权音乐的处理方式；是否估算到混音工时'
  },
  {
    key: 'localization',
    label: '本地化资源',
    kind: 'pipeList',
    placeholder: '语言|阶段|文本量',
    aiHint: '首发与后续语言，每行「语言|本地化阶段（首发/上线后 3 个月）|文本量（约多少字或占比）」；首发语言要收敛',
    reviewHint: '是否与第十六章语言列表一致；文本量是否含 UI 与剧情两部分；是否算了字体与排版成本'
  },
  {
    key: 'outsourcing',
    label: '外包计划',
    kind: 'pipeList',
    placeholder: '事项|方式|预算',
    aiHint: '3-5 项外包，每行「事项（美术/音频/本地化/QA）|方式（整包/按件/驻场）|预算区间」；预算给区间，不给假精确数字',
    reviewHint: '预算区间是否与总预算自洽；是否写清验收标准与交付节奏；核心玩法是否被外包（风险）'
  },
  {
    key: 'contingency_plan',
    label: '资源应急预案',
    kind: 'textarea',
    aiHint: '资源侧应急预案：关键人员流失、外包延期、预算超支三种情形，各写触发条件与替代方案；风险矩阵与止损线在第十三章，此处不重复',
    reviewHint: '是否针对资源而非玩法风险；每条是否有可执行的替代方案；是否与第十三章预案冲突'
  },
  {
    key: 'appendix',
    label: '附录',
    kind: 'textarea',
    aiHint: '附录放什么：术语表、参考作品与出处、版本变更记录、待确认清单；只列结构与要点，不复制正文',
    reviewHint: '是否与正文重复；待确认项是否汇总了全文的「待确认」；是否有版本与日期'
  }
]

export const RESOURCES_DEFAULTS: ChapterData = {
  art_assets: [],
  audio_assets: [],
  localization: [],
  outsourcing: [],
  budget: {},
  risk_matrix: [],
  contingency_plan: '',
  ip: '',
  appendix: ''
}

export const RESOURCES_TEMPLATES: ChapterTemplate[] = [
  {
    name: '中型项目资源规划',
    description: '中型 RPG 项目的资源、预算与风险规划',
    tags: [
      '资源',
      '预算',
      '风险'
    ],
    data: {
      art_assets: [
        {
          type: '角色',
          count: 50,
          outsource: '30%'
        },
        {
          type: '场景',
          count: 20,
          outsource: '20%'
        },
        {
          type: '道具',
          count: 500,
          outsource: '50%'
        },
        {
          type: '特效',
          count: 200,
          outsource: '40%'
        }
      ],
      audio_assets: [
        {
          type: 'BGM',
          count: 30,
          duration_min: 90
        },
        {
          type: 'SFX',
          count: 500,
          duration_min: 30
        },
        {
          type: '配音',
          count: 1000,
          duration_min: 300
        }
      ],
      localization: [
        'zh-CN',
        'zh-TW',
        'en',
        'ja',
        'ko'
      ],
      outsourcing: [
        {
          item: '场景美术',
          vendor: '待定',
          budget: '50万'
        },
        {
          item: '动作捕捉',
          vendor: '待定',
          budget: '20万'
        }
      ],
      'budget.summary':
        '人力 1500 万 + 美术外包 300 万 + 音频 100 万 + 服务器 50 万 + 营销 200 万 = 总计 2150 万（18 个月，人民币）',
      risk_matrix: [
        {
          risk: '核心人员流失',
          probability: '中',
          impact: '高',
          mitigation: '股权激励 + 知识沉淀'
        },
        {
          risk: '美术外包延期',
          probability: '高',
          impact: '中',
          mitigation: '多供应商 + 提前启动'
        },
        {
          risk: '性能不达标',
          probability: '中',
          impact: '高',
          mitigation: '早期性能基线'
        }
      ],
      contingency_plan: '若 T+12M 未达 Beta：1) 削减支线内容 30%；2) 推迟上线 3 个月；3) 增派 QA 资源',
      ip: '全部资产自有 IP，外包合同明确转让条款',
      appendix: '供应商清单、合同模板、资产清单详见附件'
    }
  }
]

export const RESOURCES_SCHEMA: ChapterSchema = {
  fields: RESOURCES_FIELDS,
  splits: [
  'contingency_plan',
  'appendix'
],
  splitHints: undefined,
  defaults: RESOURCES_DEFAULTS,
  templates: RESOURCES_TEMPLATES
}
