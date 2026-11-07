/**
 * 章节 `tech` 的按章 schema（档 4 合并，2026-10-24）。
 *
 * 字段定义 / 契约（aiHint/reviewHint/aiDraftable 已内联）/ 三件套拆分清单
 * 全部收进单文件（字段 / 契约 / 拆分 / 默认 / 模板），改一个字段只碰这一处。
 */
import type { ChapterTemplate } from '../../ceshu/reference'
import type { ChapterSchema } from '../core'
import type { CeshuFieldDef, ChapterData } from '../../ceshu/reference'

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
    /*
     * 2026-10-26 去掉只声明了 `phase` 一列的 columns：契约要求「阶段 + 可验证交付物 +
     * 时间区间」三件事，单列定义既表达不全，又会让老数据（name/date/deliverables 形态）
     * 在保存时被重新解释成错位的列。改回与同章其它 pipeList 一致的「占位符描述列」形态，
     * 存储即字符串行（与 ceshuPipeRows 的读取口径一致）。
     */
    placeholder: '阶段|交付物|时间区间',
    aiHint: '产出开发里程碑清单，每行一阶段：阶段名 + 可验证交付物 + 时间区间；交付物须可验证，时间给区间不给精确到日的承诺。与「MVP 规划」章的里程碑分工：此处是**工程/量产排期**（原型→垂直切片→量产→上线），MVP 章只写首个可玩版本的验收节点；不要两处重复同一份清单',
    reviewHint: '每行是否有可验证交付物；时间是否为区间而非精确日期；阶段是否覆盖原型→垂直切片→量产→上线；是否与「MVP 规划」章的里程碑重复'
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
   * 「本设计需要哪些数据表」。早期产品定位偏向「数据编辑器」，后调整为
   * 「生成完整设计文档 + 游戏数据（可能带试玩版）」——定位虽变，需求不变：
   * 策划书写完后必须明确「这份设计要哪些数据表、字段叫什么」，否则数据侧
   * （schema / 游戏数据）无法从设计派生结构，等于断在最后一公里。
   */
  {
    key: 'data_tables',
    label: '所需数据表',
    kind: 'pipeList',
    placeholder: '表名|用途|关键字段（逗号分隔）|期望条数',
    aiHint:
      '本设计需要编辑器提供哪些数据表：每行「表名|用途|关键字段（逗号分隔）|期望条数」；表名尽量写数据编辑器里已有的类型名（装备/道具/技能/怪物…），要新建就写明；期望条数写数字或下限（如 200 或 ≥50，估不准可留空）；只列这份策划真正会用到的表，3-6 行',
    reviewHint:
      '表名是否与编辑器现有类型对得上（对不上要说明新建）；关键字段是否够支撑核心玩法；期望条数与正文规模描述是否一致；有没有建了却没人用的表'
  },
  /*
   * 2026-10-27 交接包「条件文档」的判据：文档里没有任何地方说「这游戏联不联机」，
   * 而它决定要不要服务端、要不要反作弊、存档放哪。没有它，「服务端接口」这份文档
   * 只能靠猜是否出现（猜错就是单机项目被迫读联机规格）。
   */
  {
    key: 'online_mode',
    label: '联机形态',
    kind: 'combo',
    values: ['none', 'leaderboard', 'co_op', 'mmo'],
    optionLabels: {
      none: '纯单机',
      leaderboard: '单机 + 排行榜',
      co_op: '小规模联机（房间级）',
      mmo: '大规模在线'
    },
    aiDraftable: false,
    reviewHint: '是否与平台、商业化、团队规模匹配；纯单机却写了联机系统，或要联机却没有服务端规划'
  },
  /*
   * 2026-10-27 角色评审补的字段：联机形态只说「要不要联机」，不说「联什么」。
   * 没有协议表，服务端与客户端只能各自设计消息 —— 对接时才发现字段对不上。
   */
  {
    key: 'net_protocol',
    label: '网络协议表',
    kind: 'pipeList',
    columns: [
      { key: 'message', label: '消息' },
      { key: 'direction', label: '方向' },
      { key: 'frequency', label: '频率' },
      { key: 'authority', label: '权威端' }
    ],
    aiHint:
      '每行一条关键消息（5–10 行，不要抄整张协议）：消息名|方向（C→S / S→C / 双向）|频率（每次操作 / 每秒 / 事件触发）|权威端（服务端 / 客户端）；关键判定类消息的权威端必须是服务端',
    reviewHint:
      '关键操作是否都有对应消息；权威端有没有出现「客户端说了算」（可作弊）；频率是否会导致刷包（如每帧上报）；纯单机项目不该有这张表'
  },
  /*
   * 2026-10-28 补：协议表说「发什么消息」，不说「怎么保证一致」。
   * 同步模型（状态同步 / 帧同步）决定整个网络架构，定晚了全返工；
   * 但它是**设计侧的取舍**（一致性 vs 带宽 vs 可回滚），不是同步算法的实现方案。
   */
  {
    key: 'sync_model',
    label: '同步模型',
    kind: 'pipeList',
    columns: [
      { key: 'dimension', label: '维度' },
      { key: 'choice', label: '方案' },
      { key: 'constraint', label: '约束/代价' }
    ],
    aiHint:
      '3–5 行覆盖四个维度：同步模型（状态同步/帧同步/无）|权威端（服务端/客户端）|回滚（需要/不需要）|断线恢复（重连续局/回到大厅）；每行写清选择与代价；纯单机项目留空',
    reviewHint:
      '同步模型与联机形态是否匹配（大规模在线却用帧同步要说明理由）；权威端是否与服务端方案一致；断线恢复是否可验收；纯单机项目不该有内容'
  },
  /*
   * 2026-10-27 交接审计补的字段：编码智能体要写「存档」，文档里却没有任何
   * 「存什么、什么类型、什么时候写、旧存档怎么办」的信息 —— 只能自己编一套，
   * 玩家升级后旧档就读不出来了。存档格式属于**施工级**信息，不能留给实现方猜。
   */
  {
    key: 'save_format',
    label: '存档格式',
    kind: 'pipeList',
    columns: [
      { key: 'field', label: '存档项' },
      { key: 'type', label: '类型' },
      { key: 'when', label: '写入时机' },
      { key: 'migrate', label: '迁移/兼容策略' }
    ],
    aiHint:
      '每行一个必须持久化的数据项：存档项|类型（int/float/string/bool/数组/对象）|写入时机（通关/购买/退出/每次变更）|迁移策略（缺失时的默认值或版本升级处理）；至少覆盖「进度、资源、解锁、设置」四类，字段名用代码里能直接用的英文 key',
    reviewHint:
      '是否覆盖进度/资源/解锁/设置四类；类型能否直接映射到代码；旧版本缺字段是否有默认值；有没有把可从数据表推导的东西也存进存档（冗余）'
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
  data_tables: [],
  save_format: [],
  online_mode: '',
  net_protocol: [],
  sync_model: []
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
        '原型 Demo|核心战斗 + 1 关卡|T+3M',
        'Alpha|全部系统 + 5 关卡|T+9M',
        'Beta|全部内容 + 联机|T+15M',
        '正式上线|全平台发布|T+18M'
      ],
      team_structure: '程序 15 / 美术 25 / 策划 10 / QA 5 / 运营 3，总 58 人',
      qa_plan: '单元测试（核心系统）+ 自动化冒烟测试 + 每日构建 + 性能基线监控',
      net_protocol: [
        { message: 'player_move', direction: 'C→S', frequency: '每秒 10 次', authority: '服务端' },
        { message: 'combat_damage', direction: 'C→S', frequency: '每次攻击', authority: '服务端' },
        { message: 'world_snapshot', direction: 'S→C', frequency: '每秒 5 次', authority: '服务端' }
      ],
      save_format: [
        { field: 'chapter_progress', type: 'int', when: '每章通关时', migrate: '缺失视为 0' },
        { field: 'player_stats', type: 'object', when: '升级/装备变更', migrate: '新增属性给默认值' },
        { field: 'unlocked_levels', type: 'int[]', when: '首次解锁', migrate: '缺失视为空数组' },
        { field: 'settings', type: 'object', when: '设置项变更', migrate: '键位/音量缺失回默认' }
      ]
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
        '原型|核心循环 Demo|T+2M',
        'Alpha|全部系统 + 10 关卡|T+6M',
        'Beta|全内容 + 软启动|T+10M',
        '上线|全平台发布|T+12M'
      ],
      team_structure: '程序 8 / 美术 12 / 策划 6 / QA 3，总 29 人',
      qa_plan: '自动化 UI 测试 + 真机云测（50+ 机型）+ 性能分析报告',
      net_protocol: [
        { message: 'room_join', direction: 'C→S', frequency: '进入房间时', authority: '服务端' },
        { message: 'player_state', direction: 'C→S', frequency: '每秒 15 次', authority: '服务端' },
        { message: 'match_result', direction: 'S→C', frequency: '结算时', authority: '服务端' }
      ],
      save_format: [
        { field: 'level_progress', type: 'int', when: '关卡结算时', migrate: '缺失视为 1' },
        { field: 'resources', type: 'object', when: '每次变更（防丢档）', migrate: '新增货币给 0' },
        { field: 'unlocked_items', type: 'string[]', when: '获得/购买时', migrate: '缺失视为空数组' },
        { field: 'settings', type: 'object', when: '设置项变更', migrate: '键位/音量缺失回默认' }
      ]
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
