/**
 * 章节 `tech` 的按章 schema（档 4 合并，2026-10-24）。
 *
 * 字段定义 / 契约（aiHint/reviewHint/aiDraftable 已内联）/ 三件套拆分清单
 * 全部收进单文件（字段 / 契约 / 拆分 / 默认 / 模板），改一个字段只碰这一处。
 */
import type { ChapterTemplate } from '../ceshuTemplates'
import type { ChapterSchema } from './types'
import type { CeshuFieldDef, ChapterData } from '../ceshuConstants'

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
    placeholder: '名称|用途|授权',
    aiHint: '实际要引入的第三方库/SDK/中间件，每行「名称|用途|授权（MIT/商业/需署名）」；不确定的写「待确认」，不要编造版本号',
    reviewHint: '授权是否兼容商业发行（GPL 类要标注）；是否与引擎自带能力重复；名称是否真实存在'
  },
  {
    key: 'performance_targets',
    label: '性能目标',
    kind: 'textarea',
    aiHint: '分平台的性能目标：帧率、加载时长、内存/包体上限、发热与耗电约束；低端/中端/高端三档都给具体数字',
    reviewHint: '数字是否可测（有口径）；是否与性能预算章（第二十四章）重复或冲突；低端档是否现实'
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
    kind: 'textarea',
    aiHint: '技术侧 QA 计划：测什么（功能/性能/兼容/崩溃）、怎么测（自动化/手工/灰度）、何时测（里程碑节点）、谁负责',
    reviewHint: '是否与第二十一章测试章分工清楚（此处偏技术验证，不重复用例清单）；是否有回归策略与上线前冒烟清单'
  },
  /*
   * 2026-10-26 反向验证补的字段：真实 5 页 GDD 的最后一节是「数据编辑对接」——
   * 「本设计需要哪些数据表」。我们原来没有对应字段，而这个产品的本体就是数据编辑器，
   * 策划书写完却无法告诉编辑器要建哪些表，等于断在最后一公里。
   */
  {
    key: 'data_tables',
    label: '所需数据表',
    kind: 'pipeList',
    placeholder: '表名|用途|关键字段',
    aiHint: '本设计需要编辑器提供哪些数据表：每行「表名|用途|关键字段（逗号分隔）」；只列这份策划真正会用到的表，3-6 行',
    reviewHint: '表名是否与编辑器现有类型对得上（对不上要说明新建）；关键字段是否够支撑核心玩法；有没有建了却没人用的表'
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

export const TECH_DEFAULTS: ChapterData = {
  engine: '',
  core_architecture: '',
  third_party_deps: [],
  performance_targets: '',
  milestones: [],
  team_structure: '',
  qa_plan: '',
  data_tables: []
}

export const TECH_TEMPLATES: ChapterTemplate[] = [
  {
    name: 'UE5 大型项目技术栈',
    description: '虚幻引擎 5 的大型 RPG 项目技术规格',
    tags: [
      'UE5',
      'RPG',
      '大型'
    ],
    data: {
      engine: 'Unreal Engine 5.3',
      core_architecture: 'Gameplay Ability System + Lyra 项目结构 + 数据驱动配置（DataTable）',
      third_party_deps: [
        'Wwise（音频）',
        'Apollo（热更新）',
        'Sentinel（监控）',
        'Protobuf（网络协议）'
      ],
      performance_targets: 'PC：2K 60fps；主机：4K 30fps / 1440p 60fps；移动端：1080p 30fps',
      milestones: [
        {
          name: '原型 Demo',
          date: 'T+3M',
          deliverables: '核心战斗 + 1 关卡'
        },
        {
          name: 'Alpha',
          date: 'T+9M',
          deliverables: '全部系统 + 5 关卡'
        },
        {
          name: 'Beta',
          date: 'T+15M',
          deliverables: '全部内容 + 联机'
        },
        {
          name: '正式上线',
          date: 'T+18M',
          deliverables: '全平台发布'
        }
      ],
      team_structure: '程序 15 / 美术 25 / 策划 10 / QA 5 / 运营 3，总 58 人',
      qa_plan: '单元测试（核心系统）+ 自动化冒烟测试 + 每日构建 + 性能基线监控'
    }
  },
  {
    name: 'Unity 手游技术栈',
    description: 'Unity 引擎的手游项目技术规格',
    tags: [
      'Unity',
      '手游',
      '中型'
    ],
    data: {
      engine: 'Unity 2022 LTS',
      core_architecture: 'ECS + DOTS（核心战斗）+ Mono（UI/逻辑）+ YooAsset（热更新）',
      third_party_deps: [
        'HybridCLR（热更）',
        'YooAsset（资源）',
        'Photon（联机）',
        'Bugly（崩溃）'
      ],
      performance_targets: '中端机型：720p 30fps；高端机型：1080p 60fps；包体 < 500MB',
      milestones: [
        {
          name: '原型',
          date: 'T+2M',
          deliverables: '核心循环 Demo'
        },
        {
          name: 'Alpha',
          date: 'T+6M',
          deliverables: '全部系统 + 10 关卡'
        },
        {
          name: 'Beta',
          date: 'T+10M',
          deliverables: '全内容 + 软启动'
        },
        {
          name: '上线',
          date: 'T+12M',
          deliverables: '全平台发布'
        }
      ],
      team_structure: '程序 8 / 美术 12 / 策划 6 / QA 3，总 29 人',
      qa_plan: '自动化 UI 测试 + 真机云测（50+ 机型）+ 性能分析报告'
    }
  }
]

export const TECH_SCHEMA: ChapterSchema = {
  fields: TECH_FIELDS,
  splits: [
  'core_architecture',
  'performance_targets',
  'qa_plan'
],
  splitHints: TECH_SPLIT_HINTS,
  defaults: TECH_DEFAULTS,
  templates: TECH_TEMPLATES
}
