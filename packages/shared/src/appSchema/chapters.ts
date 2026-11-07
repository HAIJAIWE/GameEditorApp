/**
 * 应用 SDD 16 章 + 文档信息段的字段 schema（2026-11-06）。
 *
 * 这是**应用章节字段的唯一事实源**：字段定义、人机协作契约（aiHint / reviewHint /
 * aiDraftable）、必填标记都在这里；`documentSpec/appSpec.ts` 的 `requiredFields`
 * 由本表派生，不再手写第二份。
 *
 * 与 `ceshuSchema/` 完全并列、互不引用：应用章 key 是独立命名空间（已由
 * `documentSpec.test.ts` 的零重叠守卫锁定），字段语义也不带游戏概念。
 *
 * 起步阶段刻意集中在一个文件（游戏侧是按章拆 31 个文件，那是 24 章成熟后的结果）；
 * 章表稳定后再按分区拆分，避免现在就制造 16 个空壳文件。
 */
import type { CeshuFieldDef, ChapterData } from '../ceshu/reference'
import type { ChapterSchema } from '../ceshuSchema/core'

/** 必填字段：`required: true` 是必填信息的唯一标记，供规格派生 */
type AppField = CeshuFieldDef & { required?: boolean }

/** 文档信息段（不占章号） */
export const APP_META_FIELDS: AppField[] = [
  { key: 'project_name', label: '项目名称', kind: 'text', required: true, aiDraftable: false, reviewHint: '名称是否最终确定' },
  {
    key: 'platform', label: '目标平台', kind: 'multiCombo', required: true, aiDraftable: false,
    values: ['desktop', 'mobile', 'web'],
    optionLabels: { desktop: '电脑软件（桌面）', mobile: '手机软件（移动）', web: 'Web' },
    reviewHint: '是否与实际交付形态一致；多平台是否真的都能兼顾'
  },
  { key: 'doc_kind', label: '文档类型', kind: 'combo', aiDraftable: false, values: ['game', 'application'], optionLabels: { game: '游戏', application: '应用' }, reviewHint: '与应用 SDD 一致' },
  { key: 'optional_modules', label: '可选模块', kind: 'multiCombo', aiDraftable: false, values: ['ai_layer'], optionLabels: { ai_layer: 'AI 模型层' }, reviewHint: '按需开启；开启后对应章节（如模型卡 / 数据表 / 系统卡 / 评测与红队）才会出现在文档里' },
  { key: 'positioning', label: '一句话定位', kind: 'text', placeholder: '一句话说清给谁用、解决什么', aiHint: '一句话说清「给谁、解决什么、和谁不一样」', reviewHint: '是否一句话能讲清，且不与竞品同质' },
  { key: 'status', label: '文档状态', kind: 'combo', aiDraftable: false, values: ['draft', 'in_progress', 'review', 'final'], optionLabels: { draft: '草稿', in_progress: '进行中', review: '评审中', final: '定稿' }, reviewHint: '是否与实际进度相符' },
  { key: 'confidentiality', label: '保密级别', kind: 'combo', aiDraftable: false, values: ['internal', 'confidential', 'public'], optionLabels: { internal: '内部', confidential: '保密', public: '公开' }, reviewHint: '是否与分享对象匹配' },
  { key: 'version', label: '版本号', kind: 'text', aiDraftable: false },
  { key: 'date', label: '日期', kind: 'text', aiDraftable: false }
]

const OVERVIEW_FIELDS: AppField[] = [
  { key: 'problem', label: '要解决的问题', kind: 'textarea', required: true, aiHint: '写清谁在什么场景下遇到什么障碍，不要写成功能描述', reviewHint: '是否是问题而不是解决方案；有无具体场景' },
  { key: 'value_proposition', label: '价值主张', kind: 'textarea', required: true, aiHint: '一句话产品价值 + 两条支撑理由，不要复述问题', reviewHint: '是否说得出「为什么用你」；与问题陈述不重复' },
  { key: 'success_metrics', label: '成功指标', kind: 'stringList', required: true, aiHint: '2-3 条可测量指标，带口径与目标值', reviewHint: '指标是否可测量、有目标值；是否与问题对应' }
]

const USERS_FIELDS: AppField[] = [
  {
    key: 'personas', label: '用户画像', kind: 'pipeList', required: true,
    columns: [{ key: 'name', label: '角色' }, { key: 'context', label: '使用场景' }, { key: 'pain', label: '核心痛点' }, { key: 'goal', label: '完成标准' }],
    placeholder: '角色|场景|痛点|完成标准',
    aiHint: '2-4 类用户，每类写清场景与可判断的完成标准',
    reviewHint: '痛点是否具体到场景；完成标准是否可判断'
  },
  {
    key: 'scenarios', label: '核心场景', kind: 'pipeList', required: true,
    columns: [{ key: 'trigger', label: '触发时机' }, { key: 'steps', label: '关键步骤' }, { key: 'result', label: '产出' }],
    placeholder: '触发时机|关键步骤|产出',
    aiHint: '按触发时机写 3-5 条主场景，步骤不超过 5 步',
    reviewHint: '是否有明确触发条件；与用户画像能否对上'
  }
]

const SCOPE_FIELDS: AppField[] = [
  { key: 'in_scope', label: '本期范围', kind: 'stringList', required: true, aiHint: '3-6 条本期要交付的成果，每条可验收', reviewHint: '是否可验收；与功能规格是否一致' },
  { key: 'non_goals', label: '明确不做', kind: 'stringList', required: true, aiHint: '3-5 条明确不做的范围，每条给出边界；禁止「暂不做」这类无边界表述', reviewHint: '是否真的砍掉了边界；有无「什么都做」式伪非目标' },
  { key: 'assumptions', label: '关键假设', kind: 'stringList', aiHint: '2-4 条尚未验证但影响方案的假设', reviewHint: '假设是否可被验证；是否影响架构取舍' }
]

const FEATURES_FIELDS: AppField[] = [
  {
    key: 'feature_list', label: '功能清单', kind: 'pipeList', required: true,
    columns: [{ key: 'module', label: '模块' }, { key: 'feature', label: '功能点' }, { key: 'acceptance', label: '验收条件' }],
    placeholder: '模块|功能点|验收条件',
    aiHint: '按模块列功能点与可判定验收条件，不要写实现方案',
    reviewHint: '每条是否可判定；是否有与「明确不做」冲突的项'
  },
  { key: 'priorities', label: '优先级', kind: 'stringList', required: true, aiHint: '按 P0/P1/P2 标注功能点并说明排序依据', reviewHint: '是否有明确依据；P0 是否真能支撑首个交付' },
  { key: 'dependencies', label: '功能依赖', kind: 'stringList', aiHint: '列出功能之间的前置关系', reviewHint: '依赖是否成环；是否与里程碑一致' }
]

const FLOWS_FIELDS: AppField[] = [
  { key: 'main_flow', label: '主流程', kind: 'textarea', required: true, aiHint: '逐步写主流程，标注每步的输入与产出', reviewHint: '步骤是否闭合；与核心场景是否对得上' },
  {
    key: 'state_machine', label: '关键状态机', kind: 'pipeList', required: true,
    columns: [{ key: 'entity', label: '对象' }, { key: 'state', label: '状态' }, { key: 'transition', label: '迁移条件' }, { key: 'action', label: '动作' }],
    placeholder: '对象|状态|迁移条件|动作',
    aiHint: '列出关键对象的状态与迁移条件，覆盖失败与回退',
    reviewHint: '是否有不可达状态；失败分支是否可回退'
  },
  { key: 'error_paths', label: '异常与回退', kind: 'stringList', aiHint: '3-5 条异常场景及用户可见的处理', reviewHint: '是否覆盖网络失败/权限不足/数据冲突' }
]

const INTERACTION_FIELDS: AppField[] = [
  { key: 'information_architecture', label: '信息架构', kind: 'textarea', required: true, aiHint: '描述页面层级、导航结构与模块归属', reviewHint: '层级是否过深；与功能清单是否对应' },
  {
    key: 'screens', label: '页面清单', kind: 'pipeList', required: true,
    columns: [{ key: 'screen', label: '页面' }, { key: 'purpose', label: '目的' }, { key: 'entry', label: '入口' }],
    placeholder: '页面|目的|入口',
    aiHint: '列主要页面与入口，不写视觉细节',
    reviewHint: '是否有孤立页面；入口是否都在导航里'
  },
  {
    key: 'states', label: '显示状态', kind: 'pipeList', required: true,
    columns: [{ key: 'screen', label: '页面' }, { key: 'loading', label: '加载态' }, { key: 'empty', label: '空态' }, { key: 'error', label: '错误态' }],
    placeholder: '页面|加载态|空态|错误态',
    aiHint: '逐页写清加载/空/错三态的用户可见表现与下一步动作',
    reviewHint: '是否把「读失败」显示成「没有数据」；空态是否有下一步动作'
  },
  { key: 'responsive', label: '窄窗与适配', kind: 'textarea', aiHint: '说明桌面/移动的布局差异与折叠策略', reviewHint: '是否与目标平台一致' }
]

const ARCHITECTURE_FIELDS: AppField[] = [
  {
    key: 'modules', label: '模块划分', kind: 'pipeList', required: true,
    columns: [{ key: 'module', label: '模块' }, { key: 'responsibility', label: '职责' }, { key: 'depends_on', label: '依赖' }],
    placeholder: '模块|职责|依赖',
    aiHint: '按职责划模块并写明依赖方向，避免循环依赖',
    reviewHint: '职责是否单一；依赖方向有无倒置或成环'
  },
  {
    key: 'tech_choices', label: '技术选型', kind: 'pipeList', required: true,
    columns: [{ key: 'area', label: '领域' }, { key: 'choice', label: '选择' }, { key: 'reason', label: '理由' }],
    placeholder: '领域|选择|理由',
    aiHint: '每个选型给出理由与约束，不要只罗列技术栈名称',
    reviewHint: '理由是否具体到约束；有无无依据的追新'
  },
  {
    key: 'alternatives', label: '被否决方案', kind: 'pipeList', required: true,
    columns: [{ key: 'decision', label: '决策' }, { key: 'option', label: '候选方案' }, { key: 'rejected', label: '否决理由' }, { key: 'conclusion', label: '结论' }],
    placeholder: '决策|候选方案|否决理由|结论',
    aiHint: '3-6 条关键决策的取舍，写清被放弃方案的具体代价',
    reviewHint: '是否覆盖会引发返工的决策；否决理由是否具体'
  },
  /*
   * 下面两个字段补的是 C4 缺失的两层（2026-11-07 复核 c4model.com，见
   * `docs/template-corpus-verification.md`）：
   * `modules` 只相当于 component 层，系统边界与运行单元无处落笔，
   * 而这两层恰恰是评审最先问的。
   * **先按可选字段加**：老文档不该因为模板补字段而凭空多出未填项、拉低完成度。
   */
  {
    key: 'system_context', label: '系统上下文', kind: 'textarea',
    aiHint: '写清系统边界外的参与者与外部系统，以及调用方向（C4 的 system context 层）',
    reviewHint: '外部依赖是否列全；谁调用我们、我们调用谁是否分清'
  },
  {
    key: 'runtime_units', label: '运行单元', kind: 'pipeList',
    columns: [{ key: 'unit', label: '单元' }, { key: 'kind', label: '形态' }, { key: 'scale', label: '伸缩/部署' }],
    placeholder: '单元|形态|伸缩',
    aiHint: '按进程/容器/函数划分运行单元，标注部署形态与伸缩方式（C4 的 container 层）',
    reviewHint: '是否与模块划分对得上；有无被忽略的常驻进程或定时任务'
  }
]

/**
 * 数据与接口（合并原 数据模型 / 接口契约 / 第三方与集成 三章）。
 * 字段 key 在三章间无冲突，直接合流；老文档由 `normalizeCeshu` 读盘时合并且删旧 key。
 */
const DATA_INTERFACE_FIELDS: AppField[] = [
  {
    key: 'entities', label: '实体与字段', kind: 'pipeList', required: true,
    columns: [{ key: 'entity', label: '实体' }, { key: 'fields', label: '关键字段' }, { key: 'relation', label: '关系' }],
    placeholder: '实体|关键字段|关系',
    aiHint: '列核心实体、关键字段与关系，标注唯一约束',
    reviewHint: '是否有缺失的关联；字段类型是否明确'
  },
  { key: 'storage', label: '存储与一致性', kind: 'textarea', required: true, aiHint: '说明存储形态、事务边界与一致性策略', reviewHint: '是否写清并发与失败时的一致性' },
  { key: 'migration', label: '迁移与演进', kind: 'textarea', required: true, aiHint: '说明 schema 变更的迁移路径与兼容策略', reviewHint: '是否有回滚路径；老数据如何处理' },
  {
    key: 'endpoints', label: '接口清单', kind: 'pipeList', required: true,
    columns: [{ key: 'name', label: '接口' }, { key: 'method', label: '方法/通道' }, { key: 'input', label: '入参' }, { key: 'output', label: '出参' }, { key: 'idempotent', label: '幂等' }],
    placeholder: '接口|方法|入参|出参|幂等',
    aiHint: '列对外与关键内部接口，写清入出参与幂等性',
    reviewHint: '入出参是否具体；写操作是否标注幂等'
  },
  {
    key: 'error_codes', label: '错误码', kind: 'pipeList', required: true,
    columns: [{ key: 'code', label: '错误码' }, { key: 'meaning', label: '含义' }, { key: 'user_action', label: '用户动作' }],
    placeholder: '错误码|含义|用户动作',
    aiHint: '列错误码与用户可执行的处理，不要只写「失败」',
    reviewHint: '是否有用户不可理解的码；动作是否可执行'
  },
  {
    key: 'dependencies', label: '外部依赖', kind: 'pipeList', required: true,
    columns: [{ key: 'service', label: '服务' }, { key: 'purpose', label: '用途' }, { key: 'auth', label: '认证方式' }, { key: 'quota', label: '配额' }],
    placeholder: '服务|用途|认证方式|配额',
    aiHint: '列第三方服务、用途、认证与配额',
    reviewHint: '是否漏掉认证与配额；密钥如何保管'
  },
  { key: 'fallbacks', label: '降级与单点', kind: 'stringList', required: true, aiHint: '逐依赖写不可用时的降级路径，并点名单点故障', reviewHint: '降级是否可执行；单点故障是否被识别' }
]

const NONFUNCTIONAL_FIELDS: AppField[] = [
  {
    key: 'performance_budget', label: '性能预算', kind: 'pipeList', required: true,
    columns: [{ key: 'scene', label: '场景' }, { key: 'metric', label: '指标' }, { key: 'target', label: '目标值' }],
    placeholder: '场景|指标|目标值',
    aiHint: '按场景给可测的性能指标与目标值',
    reviewHint: '指标是否可测；目标值是否具体到数值'
  },
  {
    key: 'compatibility', label: '兼容矩阵', kind: 'multiCombo', required: true,
    values: ['windows', 'macos', 'linux', 'ios', 'android', 'web'],
    optionLabels: { windows: 'Windows', macos: 'macOS', linux: 'Linux', ios: 'iOS', android: 'Android', web: 'Web' },
    aiHint: '按「目标平台」勾选需要支持的端，不要全部勾选；每个勾选的端都要在性能/可访问性里有对应要求',
    reviewHint: '是否与目标平台一致；多端是否真的都能兼顾'
  },
  { key: 'accessibility', label: '可访问性', kind: 'stringList', required: true, aiHint: '列键盘可达、焦点、对比度、读屏等具体要求', reviewHint: '是否具体到可验收；有无遗漏键盘与焦点' },
  { key: 'availability', label: '可用性目标', kind: 'text', aiHint: '给出可用性目标与统计口径', reviewHint: '口径是否明确' }
]

const SECURITY_FIELDS: AppField[] = [
  { key: 'auth_model', label: '认证授权模型', kind: 'textarea', required: true, aiHint: '写清身份、会话、权限判定与越权防护', reviewHint: '是否覆盖越权；会话失效如何处理' },
  {
    key: 'data_classification', label: '数据分级', kind: 'pipeList', required: true,
    columns: [{ key: 'data', label: '数据' }, { key: 'level', label: '级别' }, { key: 'handling', label: '处理要求' }],
    placeholder: '数据|级别|处理要求',
    aiHint: '按敏感级别分类并写明存储/传输/留存要求',
    reviewHint: '是否覆盖个人信息；留存与删除是否有要求'
  },
  {
    key: 'threats', label: '威胁与对策', kind: 'pipeList', required: true,
    columns: [{ key: 'threat', label: '威胁' }, { key: 'impact', label: '影响' }, { key: 'mitigation', label: '对策' }],
    placeholder: '威胁|影响|对策',
    aiHint: '按威胁模型列风险与具体对策，不写泛泛的「注意安全」',
    reviewHint: '对策是否具体；是否覆盖注入/越权/泄露'
  }
]

const TESTING_FIELDS: AppField[] = [
  { key: 'test_strategy', label: '测试策略', kind: 'textarea', required: true, aiHint: '分层测试策略与各层职责', reviewHint: '是否覆盖单元/集成/端到端；职责是否清晰' },
  {
    key: 'acceptance', label: '关键用例', kind: 'pipeList', required: true,
    columns: [{ key: 'case', label: '用例' }, { key: 'precondition', label: '前置' }, { key: 'expected', label: '预期' }],
    placeholder: '用例|前置|预期',
    aiHint: '列关键用例与可判定预期，覆盖边界与异常',
    reviewHint: '预期是否可判定；是否覆盖边界'
  },
  { key: 'release_gate', label: '上线门禁', kind: 'stringList', required: true, aiHint: '列可卡住发布的条件', reviewHint: '是否可自动判定；与安全/性能预算是否挂钩' }
]

const RELEASE_FIELDS: AppField[] = [
  { key: 'deployment', label: '部署形态', kind: 'textarea', required: true, aiHint: '说明部署形态、环境与配置管理', reviewHint: '是否写清环境差异；配置是否外置' },
  { key: 'rollout', label: '灰度策略', kind: 'textarea', required: true, aiHint: '写清灰度维度、比例与观察窗口', reviewHint: '是否有明确触发条件与观察指标' },
  {
    key: 'monitoring', label: '监控与告警', kind: 'pipeList', required: true,
    columns: [{ key: 'metric', label: '指标' }, { key: 'threshold', label: '阈值' }, { key: 'action', label: '动作' }],
    placeholder: '指标|阈值|动作',
    aiHint: '列监控指标、告警阈值与响应动作',
    reviewHint: '阈值是否具体；动作是否可执行'
  },
  { key: 'rollback', label: '回滚路径', kind: 'textarea', required: true, aiHint: '写清回滚触发条件、步骤与数据兼容', reviewHint: '是否可在有限时间内完成；数据是否兼容' },
  /*
   * PEP 1 把「不兼容影响」单列并要求写不清可被直接拒稿（2026-11-07 复核
   * https://peps.python.org/pep-0001/）。我们此前把它隐含在灰度与回滚里，
   * 评审时容易漏掉「谁会被打破」。同样先按可选字段加。
   */
  { key: 'compatibility_impact', label: '不兼容与迁移影响', kind: 'textarea', aiHint: '写清本次发布对老版本、老数据、老接口的破坏性影响与迁移路径', reviewHint: '受影响方是否列全；不兼容是否有迁移方案或兼容期' }
]

const MILESTONES_FIELDS: AppField[] = [
  {
    key: 'milestones', label: '里程碑', kind: 'pipeList', required: true,
    columns: [{ key: 'name', label: '里程碑' }, { key: 'deliverable', label: '可交付成果' }, { key: 'depends', label: '依赖' }],
    placeholder: '里程碑|可交付成果|依赖',
    aiHint: '按可交付成果拆里程碑，标注依赖',
    reviewHint: '成果是否可验收；依赖是否成环'
  },
  { key: 'resources', label: '资源与人力', kind: 'stringList', required: true, aiHint: '列角色、投入与关键假设', reviewHint: '是否与里程碑匹配；关键假设是否点明' }
]

const RISKS_FIELDS: AppField[] = [
  {
    key: 'risk_register', label: '风险登记', kind: 'pipeList', required: true,
    columns: [{ key: 'risk', label: '风险' }, { key: 'impact', label: '影响' }, { key: 'mitigation', label: '应对' }, { key: 'owner', label: '负责人' }],
    placeholder: '风险|影响|应对|负责人',
    aiHint: '列风险、影响、应对与负责人',
    reviewHint: '应对是否具体；是否有无主风险'
  },
  {
    key: 'decisions', label: '关键决策', kind: 'pipeList', required: true,
    columns: [{ key: 'decision', label: '决策' }, { key: 'chosen', label: '结论' }, { key: 'revisit', label: '何时重议' }],
    placeholder: '决策|结论|何时重议',
    aiHint: '记录已定决策与重议触发条件，避免后来者反复翻案',
    reviewHint: '结论是否与前面各章一致；重议条件是否具体'
  }
]

// ── AI 模型层四章字段（并入应用，可选；勾选「含 AI 模型层」才出现在导航/导出）──

const AI_MODEL_CARD_FIELDS: AppField[] = [
  { key: 'base_model', label: '底座模型 / 服务', kind: 'textarea', required: true, aiHint: '写清使用的模型、服务或自研底座，以及版本/快照与调用方式', reviewHint: '是否具体到版本；微调与基座是否分清' },
  { key: 'capabilities', label: '能力边界', kind: 'stringList', required: true, aiHint: '列模型能稳定做到什么、以及明确做不到什么', reviewHint: '是否既写能力也写边界；有无夸大' },
  { key: 'limitations', label: '已知局限', kind: 'stringList', required: true, aiHint: '列已知的失效场景、幻觉倾向、长上下文衰减等', reviewHint: '是否覆盖用户会踩的坑' },
  { key: 'model_version', label: '版本 / 快照', kind: 'text', aiHint: '记录模型版本、权重快照或知识截止日期', reviewHint: '是否可复现；知识截止是否注明' },
  { key: 'inference_cost', label: '推理成本与配额', kind: 'text', aiHint: '说明单次调用成本、QPS 配额与超限降级', reviewHint: '是否与发布规模匹配' }
]

const AI_DATA_SHEET_FIELDS: AppField[] = [
  { key: 'training_data', label: '训练 / 微调数据来源', kind: 'textarea', required: true, aiHint: '说明训练、SFT、RAG 语料的数据来源与规模', reviewHint: '来源是否可追溯；有无授权问题' },
  { key: 'data_license', label: '数据许可与合规', kind: 'text', required: true, aiHint: '写清数据许可、授权范围与跨境/合规约束', reviewHint: '是否覆盖授权与合规；有无缺失许可' },
  { key: 'pii_handling', label: '个人信息处理', kind: 'stringList', aiHint: '列涉及的个人信息、脱敏与留存策略', reviewHint: '是否最小化；留存与删除是否明确' },
  { key: 'bias_audit', label: '偏差审计', kind: 'textarea', aiHint: '说明做了哪些偏差/公平性审计与结论', reviewHint: '是否有可验证的审计而非口头声明' },
  /*
   * 下面四个字段补的是 Datasheet for Datasets 的 4 个缺组（2026-11-07 复核
   * arXiv 1803.09010，见 `docs/template-corpus-verification.md`）：
   * 采集过程 / 预处理与标注 / 用途限制 / 维护与版本——恰好是「出了事能查、越界能拦」的那部分。
   * 论文自己写明问题不具强制性、不适用可跳过，故一律按可选字段加：
   * 既不拉低老文档完成度，也不逼小项目写不存在的采集流程。
   */
  { key: 'collection_process', label: '采集过程', kind: 'textarea', aiHint: '说明数据如何获取（直接观察/自报/推断）、采集机制与时段，标注是否经伦理审查', reviewHint: '来源是否可追溯；推断得来的标注是否验证过' },
  { key: 'preprocessing', label: '预处理与标注', kind: 'textarea', aiHint: '写清洗、去重、标注规则，以及是否保留原始数据', reviewHint: '规则是否可复现；原始数据是否留存' },
  { key: 'usage_limits', label: '推荐用途与禁用用途', kind: 'stringList', aiHint: '分别列「可以用于」与「明确不可用于」的场景，禁用的要写理由', reviewHint: '高风险场景有没有明确排除，而不是含糊带过' },
  { key: 'maintenance', label: '维护与版本', kind: 'textarea', aiHint: '写谁维护、更新频率、勘误渠道，以及旧版本如何告知消费者', reviewHint: '是否有负责人与勘误渠道' }
]

const AI_SYSTEM_CARD_FIELDS: AppField[] = [
  { key: 'behavior', label: '预期行为与边界', kind: 'textarea', required: true, aiHint: '描述模型在正常与边缘输入下的预期行为边界', reviewHint: '边界是否清晰；有无不可预期行为敞口' },
  { key: 'safety', label: '安全措施', kind: 'stringList', required: true, aiHint: '列内容安全、拒答、越权防护等机制', reviewHint: '是否具体可执行；与威胁模型是否对应' },
  { key: 'alignment', label: '对齐与价值观约束', kind: 'textarea', aiHint: '写清对齐约束、不可逾越的红线与处理方式', reviewHint: '红线是否明确；越线如何处置' },
  { key: 'degradation', label: '失效降级策略', kind: 'textarea', required: true, aiHint: '说明模型超时/限流/异常时的降级与兜底', reviewHint: '降级是否可执行；用户是否感知' }
]

const AI_EVAL_REDTEAM_FIELDS: AppField[] = [
  {
    key: 'eval_metrics', label: '评测指标', kind: 'pipeList', required: true,
    columns: [{ key: 'metric', label: '指标' }, { key: 'target', label: '目标值' }, { key: 'method', label: '评测方法' }],
    placeholder: '指标|目标值|评测方法',
    aiHint: '列准确性/相关性/安全率等可量化指标与评测方法',
    reviewHint: '指标是否可测；方法是否可复现'
  },
  { key: 'redteam', label: '红队测试场景', kind: 'stringList', required: true, aiHint: '列越狱、提示注入、数据泄露等红队场景与结论', reviewHint: '是否覆盖已知攻击面' },
  { key: 'jailbreak', label: '越狱 / 对抗防护', kind: 'stringList', aiHint: '列对抗用例与防护手段', reviewHint: '防护是否针对具体用例' },
  { key: 'monitoring', label: '线上行为监控', kind: 'textarea', aiHint: '说明上线后如何监控输出质量与安全', reviewHint: '监控是否可触发告警与回滚' }
]

// ── 决策与附录（对齐 Google design doc / arc42 的「替代方案」「术语表」）──

const ALTERNATIVES_FIELDS: AppField[] = [
  {
    key: 'options', label: '候选方案与被否理由', kind: 'pipeList', required: true,
    columns: [
      { key: 'option', label: '方案' },
      { key: 'strength', label: '优点' },
      { key: 'weakness', label: '缺点' },
      { key: 'rejected', label: '为何不选' }
    ],
    placeholder: '方案|优点|缺点|为何不选',
    aiHint: '列 2-3 个真实可选方案，逐个写优点、缺点与未选原因；不要写"为了对比而设"的稻草人',
    reviewHint: '是否列出真实替代方案；未选原因是否具体；有无只列一个方案走过场'
  },
  {
    key: 'decision_basis', label: '选定依据', kind: 'textarea', required: true,
    aiHint: '说明最终方案为何在目标与约束下最优，点出关键权衡',
    reviewHint: '是否回到目标/非目标；权衡是否说清'
  }
]

const GLOSSARY_FIELDS: AppField[] = [
  {
    key: 'terms', label: '术语表', kind: 'pipeList', required: true,
    columns: [{ key: 'term', label: '术语' }, { key: 'definition', label: '定义' }],
    placeholder: '术语|定义',
    aiHint: '列文档里出现的业务/技术专有名词，每条一句话定义',
    reviewHint: '是否覆盖易误解的词；定义是否一句话说清'
  }
]

/** 按章聚合的字段表（顺序与 APP_PARTS 一致） */
export const APP_CHAPTER_FIELDS: Readonly<Record<string, readonly AppField[]>> = {
  meta: APP_META_FIELDS,
  overview: OVERVIEW_FIELDS,
  users: USERS_FIELDS,
  scope: SCOPE_FIELDS,
  features: FEATURES_FIELDS,
  flows: FLOWS_FIELDS,
  interaction: INTERACTION_FIELDS,
  architecture: ARCHITECTURE_FIELDS,
  alternatives: ALTERNATIVES_FIELDS,
  data_interface: DATA_INTERFACE_FIELDS,
  nonfunctional: NONFUNCTIONAL_FIELDS,
  testing: TESTING_FIELDS,
  security: SECURITY_FIELDS,
  release: RELEASE_FIELDS,
  milestones: MILESTONES_FIELDS,
  risks: RISKS_FIELDS,
  glossary: GLOSSARY_FIELDS,
  // AI 模型层四章：仅当文档信息勾选「含 AI 模型层」时才可见（章号排在 16 章之后，不挤占现有章号）
  model_card: AI_MODEL_CARD_FIELDS,
  data_sheet: AI_DATA_SHEET_FIELDS,
  system_card: AI_SYSTEM_CARD_FIELDS,
  eval_redteam: AI_EVAL_REDTEAM_FIELDS
}

/** 每章必填字段（由 `required: true` 派生，规格层直接取，不另写一份） */
export function appRequiredFields(chapter: string): readonly string[] {
  return (APP_CHAPTER_FIELDS[chapter] ?? []).filter((field) => field.required === true).map((field) => field.key)
}

/** 与 `ChapterSchema` 同形的按章 schema（供后续接 `CESHU_CHAPTER_FIELDS` 等价物） */
export const APP_CHAPTER_SCHEMAS: Readonly<Record<string, ChapterSchema>> = Object.fromEntries(
  Object.entries(APP_CHAPTER_FIELDS).map(([key, fields]) => [
    key,
    { fields: fields as CeshuFieldDef[], splits: [], defaults: appChapterDefaults(fields) }
  ])
)

/** 章节默认值：按字段 kind 给空值，保证新建应用文档的每章都是干净对象 */
function appChapterDefaults(fields: readonly CeshuFieldDef[]): ChapterData {
  const out: ChapterData = {}
  for (const field of fields) {
    if (field.key.includes('.')) continue
    if (['stringList', 'multiCombo', 'pipeList'].includes(field.kind)) out[field.key] = []
  }
  return out
}

/**
 * 应用文档的全部章节默认值（顶层平铺，与游戏 `createDefaultChapters` 同形）。
 *
 * `baseMeta` 用于**合并**文档信息段：应用档仍保留游戏侧 24 章作为兼容底座
 * （196 个消费方假设它们存在），meta 因此要同时承载两套字段。直接展开应用
 * meta 会把 `gdd_scope` / `game_name` / `doc_kind` 覆盖掉，所以显式合并。
 */
export function createAppDefaultChapters(baseMeta?: ChapterData): Record<string, ChapterData> {
  const out: Record<string, ChapterData> = {}
  for (const [key, schema] of Object.entries(APP_CHAPTER_SCHEMAS)) {
    out[key] = structuredClone(schema.defaults ?? {})
  }
  if (baseMeta !== undefined) {
    out.meta = { ...baseMeta, ...out.meta }
  }
  return out
}
