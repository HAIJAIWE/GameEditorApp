/**
 * 章节 `tech` 的按章 schema（档 4 合并，2026-10-24）。
 *
 * 字段定义 / 契约（aiHint/reviewHint/aiDraftable 已内联）/ 三件套拆分清单
 * 全部收进单文件；旧 ceshuFieldHints/ceshuFieldSplits 仅做 re-export 兜底。
 * 改一个字段只碰这一处。
 */
import type { ChapterSchema } from './types'
import type { CeshuFieldDef } from '../ceshuConstants'

export const TECH_FIELDS: CeshuFieldDef[] = [
  {
    key: 'engine',
    label: '引擎/框架',
    kind: 'combo',
    values: [
      'Unity',
      'Unreal Engine',
      'Godot',
      'Cocos2d',
      'PyGame',
      '自定义引擎',
      '其他'
    ],
    optionLabels: {
      Unity: 'Unity',
      'Unreal Engine': 'Unreal Engine',
      Godot: 'Godot',
      Cocos2d: 'Cocos2d',
      PyGame: 'PyGame',
      自定义引擎: '自定义引擎',
      其他: '其他'
    },
    reviewHint: '引擎是否在选项内；选型理由是否匹配团队经验与项目类型；是否注明版本',
    aiDraftable: false
  },
  {
    key: 'core_architecture',
    label: '核心架构',
    kind: 'textarea',
    aiHint: '一段概述：客户端/服务端划分与架构总体形态；关键模块与通信方式走「要点」逐条列；禁堆砌技术名词',
    reviewHint: '是否说清端侧划分与关键模块；模块通信是否有具体方案；是否有与项目规模不匹配的过度设计'
  },
  {
    key: 'milestones',
    label: '开发里程碑',
    kind: 'pipeList',
    columns: [
      {
        key: 'phase',
        label: '阶段'
      }
    ],
    aiHint: '产出开发里程碑清单，每行一阶段：阶段名 + 可验证交付物 + 时间区间；交付物须可验证，时间给区间不给精确到日的承诺',
    reviewHint: '每行是否有可验证交付物；时间是否为区间而非精确日期；阶段是否覆盖原型→垂直切片→量产→上线'
  },
  {
    key: 'team_structure',
    label: '团队分工',
    kind: 'textarea',
    reviewHint: '岗位是否覆盖 core_architecture 所列模块；人数是否与 milestones 周期匹配；是否注明外包/兼职',
    aiDraftable: false
  },
  {
    key: 'third_party_deps',
    label: '第三方依赖',
    kind: 'pipeList',
    placeholder: '名称|用途|授权'
  },
  {
    key: 'performance_targets',
    label: '性能目标',
    kind: 'textarea'
  },
  {
    key: 'production_risks',
    label: '生产风险（检测与兜底）',
    kind: 'pipeList',
    placeholder: '风险|触发条件|检测方法|兜底方案|负责人',
    aiHint: '工程/生产视角的风险（性能、存档、数据一致性、依赖、外包），每条给「怎么发现」与「发现后怎么办」；概率与影响在风险控制章的矩阵里写，此处不重复；3-5 条',
    reviewHint: '检测方法是否可执行（有指标/工具）；兜底方案是否真的能降级而不是「加强监控」'
  },
  {
    key: 'qa_plan',
    label: 'QA 计划',
    kind: 'textarea'
  }
]

export const TECH_SPLIT_HINTS: ChapterSchema['splitHints'] = {
  core_architecture: {
    points: {
      aiHint: '3-6 条：每条一个关键模块（玩法/网络/存档）+ 职责 + 通信方式',
      reviewHint: '模块是否覆盖核心玩法；通信是否有具体方案；有无过度设计的技术名词'
    },
    notes: {
      aiHint: '要点之外的补充说明：选型备选方案或已知技术债，可留空',
      reviewHint: '补充是否与要点重复；备选方案是否写了放弃理由'
    }
  }
}

export const TECH_SCHEMA: ChapterSchema = {
  fields: TECH_FIELDS,
  splits: [
  'core_architecture',
  'performance_targets',
  'qa_plan'
],
  splitHints: TECH_SPLIT_HINTS
}
