/**
 * 章节 `mvp` 的按章 schema（档 4 合并，2026-10-24）。
 *
 * 字段定义 / 契约（aiHint/reviewHint/aiDraftable 已内联）/ 三件套拆分清单
 * 全部收进单文件（字段 / 契约 / 拆分 / 默认 / 模板），改一个字段只碰这一处。
 */
import type { ChapterTemplate } from '../ceshuTemplates'
import type { ChapterSchema } from './types'
import type { CeshuFieldDef, ChapterData } from '../ceshuConstants'

export const MVP_FIELDS: CeshuFieldDef[] = [
  {
    key: 'mvp_scope',
    label: 'MVP 范围',
    kind: 'textarea',
    aiHint: '列出 MVP 必含的最小玩法闭环与明确不做的事；每项说明为什么最小必要',
    reviewHint: '是否形成可玩闭环；不做什么是否写明；是否与核心特性一致'
  },
  {
    key: 'mvp_timeline',
    label: 'MVP 时间线',
    kind: 'textarea',
    aiHint: '给出各阶段起止时间与产出；阶段按玩法原型→垂直切片→内容填充排序',
    reviewHint: '阶段顺序是否合理；起止时间是否覆盖到上线；是否与里程碑一致'
  },
  {
    key: 'core_features',
    label: '核心特性',
    kind: 'stringList',
    placeholder: '每行一个',
    aiHint: '每行一个 MVP 核心特性，注明验证目标；只列验证核心假设的必需项',
    reviewHint: '每条是否服务核心假设；是否与范围一致；有无混入暂缓项'
  },
  {
    key: 'cut_features',
    label: '暂缓特性',
    kind: 'stringList',
    placeholder: '每行一个',
    aiHint: '每行一个暂缓特性，注明暂缓原因与预计回归版本；不与核心特性重复',
    reviewHint: '暂缓原因是否成立；是否与核心特性重复；是否注明回归版本'
  },
  {
    key: 'milestones',
    label: '里程碑',
    kind: 'pipeList',
    columns: [
      {
        key: 'name',
        label: '名称'
      },
      {
        key: 'date',
        label: '日期'
      },
      {
        key: 'deliverables',
        label: '交付物'
      },
      {
        key: 'acceptance',
        label: '验收标准'
      }
    ],
    aiHint: '每行一个里程碑，按名称/日期/交付物/验收标准四列填写；验收标准要可判定',
    reviewHint: '日期是否递进；交付物是否可交付；验收标准是否可判定'
  },
  {
    key: 'success_criteria',
    label: '成功标准',
    kind: 'textarea',
    aiHint: '一段概述：MVP 成功的定义与判定逻辑；具体指标条目走「要点」字段',
    reviewHint: '指标是否可采集；每条是否有目标值；是否剔除不可测表述'
  },
  {
    key: 'team_size',
    label: '团队规模',
    kind: 'number',
    from: 0,
    to: 999,
    aiDraftable: false,
    reviewHint: '人数是否与实际编制一致；角色是否覆盖 MVP 范围所需'
  },
  {
    key: 'budget_estimate',
    label: '预算估算',
    kind: 'textarea',
    aiDraftable: false,
    reviewHint: '是否按阶段或科目拆分；是否与商业化目标匹配；是否留有缓冲'
  },
  {
    key: 'playtest_plan',
    label: '试玩测试',
    kind: 'textarea',
    aiHint: '一段概述：试玩的整体安排与目标；每轮的对象/样本量/问题走「要点」逐条列',
    reviewHint: '每轮是否有明确验证问题；样本量是否足够；指标是否与成功标准一致'
  },
  {
    key: 'prototype_features',
    label: '原型特性',
    kind: 'pipeList',
    placeholder: '特性|周期',
    aiHint: '3-5 个原型必做特性，每行「特性|周期（人日或周）」；只保留验证核心循环所需的最小集',
    reviewHint: '是否混入了完整版特性；周期加总是否落在原型总周期内；每个特性是否对应一个要验证的假设'
  },
  {
    key: 'risk_assessment',
    label: '风险评估',
    kind: 'stringList',
    aiHint: '3-5 条 MVP 特有风险（范围膨胀/技术验证失败/周期不足），每条写「风险 + 早期信号 + 应对」',
    reviewHint: '是否与第十三章风险矩阵重复；是否有可观测的早期信号；是否给出砍范围的具体顺序'
  },
  {
    key: 'prototype_plan',
    label: '原型计划',
    kind: 'textarea',
    aiHint: '原型计划：验证哪些假设、用什么最小实现、谁来做、几周完成、成功与失败判据；判据必须可观测',
    reviewHint: '是否有明确判据（不是「感觉可行」）；是否安排了对真实玩家的可玩验证；失败后的决策是否写明'
  }
]

export const MVP_SPLIT_HINTS: ChapterSchema['splitHints'] = {
  success_criteria: {
    points: {
      aiHint: '3-6 条：每条一个可采集指标 + 目标值（如次留 40%）',
      reviewHint: '指标是否可采集可验证；有没有「用户体验良好」这类不可测表述'
    },
    notes: {
      aiHint: '要点之外的补充说明：指标的采集方式或判定口径，可留空',
      reviewHint: '补充是否与要点重复；采集方式是否可落地'
    }
  },
  playtest_plan: {
    points: {
      aiHint: '3-6 条：每轮一条，含对象/样本量/要验证的问题/采集指标',
      reviewHint: '每轮是否有验证问题与采集指标；样本量是否写明；指标是否与成功标准一致'
    },
    notes: {
      aiHint: '要点之外的补充说明：招募渠道、场地或伦理合规事项，可留空',
      reviewHint: '补充是否与要点重复；合规事项是否写清'
    }
  }
}

export const MVP_DEFAULTS: ChapterData = {
  mvp_scope: '',
  mvp_timeline: '',
  core_features: [],
  cut_features: [],
  prototype_features: [],
  milestones: [],
  success_criteria: '',
  team_size: 0,
  budget_estimate: '',
  risk_assessment: '',
  prototype_plan: '',
  playtest_plan: ''
}

export const MVP_TEMPLATES: ChapterTemplate[] = [
  {
    name: 'RPG MVP 三月规划',
    description: '3 个月 RPG MVP 原型规划',
    tags: [
      'MVP',
      'RPG',
      '原型'
    ],
    data: {
      mvp_scope: '核心战斗系统 + 1 个完整关卡 + 角色养成基础 + 主线第一章',
      mvp_timeline: 'T+0 至 T+3M：原型 Demo；T+3M 完成可玩 Demo 内部测试',
      core_features: [
        '核心战斗循环',
        '角色升级',
        '1 个完整关卡',
        '基础 UI',
        '存档系统'
      ],
      cut_features: [
        '多人联机',
        'PVP',
        '外观系统',
        '成就系统',
        '多语言'
      ],
      prototype_features: [
        '战斗手感',
        '关卡流程',
        '数值平衡'
      ],
      milestones: [
        {
          name: 'M1 战斗原型',
          date: 'T+1M',
          deliverables: '可玩战斗 Demo',
          acceptance: '手感达标'
        },
        {
          name: 'M2 关卡原型',
          date: 'T+2M',
          deliverables: '1 关卡完整',
          acceptance: '流程顺畅'
        },
        {
          name: 'M3 MVP 完成',
          date: 'T+3M',
          deliverables: '可玩 Demo',
          acceptance: '通过试玩评审'
        }
      ],
      success_criteria: '1) 战斗手感评分 ≥ 4/5\n2) 关卡流程 ≤ 30min\n3) 试玩留存意愿 ≥ 60%',
      team_size: 8,
      budget_estimate: '150万（3 个月）',
      risk_assessment: '中风险：核心战斗手感是关键，需多次迭代',
      prototype_plan: '白盒关卡 + 占位美术，重点验证战斗与流程',
      playtest_plan: '每周内部试玩 + T+3M 外部小范围测试（50 人）'
    }
  }
]

export const MVP_SCHEMA: ChapterSchema = {
  fields: MVP_FIELDS,
  splits: [
  'success_criteria',
  'playtest_plan',
  'prototype_plan'
],
  splitHints: MVP_SPLIT_HINTS,
  defaults: MVP_DEFAULTS,
  templates: MVP_TEMPLATES
}
