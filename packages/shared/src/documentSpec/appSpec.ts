/**
 * 软件设计文档规格（SDD）——应用档的独立章表。
 *
 * 与游戏 GDD **完全分开**：章 key、章名、章号、分区、AI 子智能体、岗位都是自己的，
 * 不复用 CHAPTER_PARTS / CHAPTER_LABELS / CHAPTER_AGENT_MAP 里的任何游戏语义。
 * 章号由 `APP_PARTS` 顺序派生（1..N 连续），不会出现「第十三章前面没有第一～十二章」。
 *
 * 章表依据通用软件设计文档范式（用户 2026-11-06 拍板「通用软件设计」）：
 * 需求 → 功能 → 架构 → 接口/数据 → 非功能 → 测试 → 发布 → 风险。
 * 每章的字段 schema 尚未落地（见 docs/app-development-plan.md 分阶段计划），
 * 本文件先钉死「有哪些章、叫什么、谁写」这份结构契约。
 */
import type { DocumentSpec, SpecChapter, SpecPart } from './types'

/** 文档信息段 key（不占章号） */
export const APP_META_KEY = 'meta'

/** 应用档分区（章号唯一事实源） */
export const APP_PARTS: readonly SpecPart[] = [
  { key: 'definition', label: '定义与范围', chapters: ['overview', 'users', 'scope'] },
  { key: 'product', label: '产品设计', chapters: ['features', 'flows', 'interaction'] },
  { key: 'engineering', label: '技术设计', chapters: ['architecture', 'data_model', 'api', 'integration'] },
  { key: 'quality', label: '质量与保障', chapters: ['nonfunctional', 'security', 'testing'] },
  { key: 'delivery', label: '交付与治理', chapters: ['release', 'milestones', 'risks'] }
] as const

/** AI 子智能体（应用语义，不含「策划」「数值」「关卡」等游戏角色） */
export const APP_AGENT_DISPLAY: Readonly<Record<string, string>> = {
  product_manager: '产品经理',
  ux_designer: '交互设计师',
  architect: '系统架构师',
  frontend: '前端工程师',
  backend: '后端工程师',
  data_engineer: '数据工程师',
  security: '安全工程师',
  qa: '测试工程师',
  devops: '运维工程师',
  tech_lead: '技术负责人'
}

export const APP_AGENT_PROMPTS: Readonly<Record<string, string>> = {
  product_manager: '从用户价值与业务目标出发，界定问题、范围与验收标准；避免堆功能清单。',
  ux_designer: '描述页面结构、导航与关键交互，给出状态与异常态，不写视觉稿细节。',
  architect: '给出模块划分、依赖方向、关键 trade-off 与被否决方案，避免罗列技术栈名称。',
  frontend: '按组件边界、状态管理与接口约定描述实现方案，覆盖加载/空/错三态。',
  backend: '按服务边界、数据一致性与幂等性描述实现方案，写清失败与重试策略。',
  data_engineer: '定义实体、字段、关系与生命周期，说明迁移与埋点口径。',
  security: '按认证授权、数据分级与威胁模型描述风险与对策，不写泛泛的「注意安全」。',
  qa: '给出可判定的测试用例与验收条件，覆盖边界与回归。',
  devops: '描述部署、灰度、监控与回滚路径，写清触发条件。',
  tech_lead: '统筹范围、里程碑与风险取舍，确保各章结论互相一致。'
}

/** 应用档岗位（交接包 / 岗位任务用；替换游戏侧的 程序/美术/测试/数值/音频） */
export const APP_ROLES: readonly { key: string; label: string }[] = [
  { key: 'product', label: '产品' },
  { key: 'frontend', label: '前端' },
  { key: 'backend', label: '后端' },
  { key: 'qa', label: '测试' },
  { key: 'devops', label: '运维' }
]

/** 章名 + AI 角色 + 生成要求（章号由分区位置派生，不在此手写） */
interface AppChapterDef {
  key: string
  name: string
  agentId: string
  aiHint: string
  requiredFields: readonly string[]
}

const CHAPTER_DEFS: readonly AppChapterDef[] = [
  {
    key: 'overview', name: '项目概述', agentId: 'product_manager',
    aiHint: '一句话说清这个应用解决谁的问题、和现有方案有何不同；给出 2-3 条成功指标。',
    requiredFields: ['problem', 'value_proposition', 'success_metrics']
  },
  {
    key: 'users', name: '用户与场景', agentId: 'product_manager',
    aiHint: '列出 2-4 类目标用户与各自的核心使用场景，写清触发时机与完成标准。',
    requiredFields: ['personas', 'scenarios']
  },
  {
    key: 'scope', name: '范围与非目标', agentId: 'product_manager',
    aiHint: '明确本期做什么、明确不做什么；非目标要给出边界，禁止「暂不做」这类无边界表述。',
    requiredFields: ['in_scope', 'non_goals']
  },
  {
    key: 'features', name: '功能规格', agentId: 'product_manager',
    aiHint: '按模块列功能点与验收条件，每条可判定；标注优先级与依赖关系。',
    requiredFields: ['feature_list', 'priorities']
  },
  {
    key: 'flows', name: '核心流程与状态', agentId: 'ux_designer',
    aiHint: '给出主流程步骤与关键状态机，覆盖失败分支与回退路径。',
    requiredFields: ['main_flow', 'state_machine']
  },
  {
    // 章 key 刻意不叫 `uiux`：那是游戏 GDD 的章 key，同名会让文档数据被两套规格解释成不同内容
    key: 'interaction', name: '交互与界面', agentId: 'ux_designer',
    aiHint: '描述信息架构、页面结构、导航与关键交互，覆盖加载/空/错三态与响应式策略。',
    requiredFields: ['information_architecture', 'screens', 'states']
  },
  {
    key: 'architecture', name: '技术架构', agentId: 'architect',
    aiHint: '模块划分、依赖方向、技术选型理由与被否决方案；说明扩展点与未提前实现的部分。',
    requiredFields: ['modules', 'tech_choices', 'alternatives']
  },
  {
    key: 'data_model', name: '数据模型', agentId: 'data_engineer',
    aiHint: '实体、字段、关系与生命周期；说明存储选型、迁移与一致性策略。',
    requiredFields: ['entities', 'storage', 'migration']
  },
  {
    key: 'api', name: '接口契约', agentId: 'backend',
    aiHint: '按接口列路径/入参/出参/错误码/幂等性；内部模块边界也一并写清。',
    requiredFields: ['endpoints', 'error_codes']
  },
  {
    key: 'integration', name: '第三方与集成', agentId: 'backend',
    aiHint: '列出外部依赖、认证方式、配额与降级方案；标清单点故障。',
    requiredFields: ['dependencies', 'fallbacks']
  },
  {
    key: 'nonfunctional', name: '非功能需求', agentId: 'architect',
    aiHint: '性能预算、兼容矩阵（桌面/移动/浏览器）、可用性与可访问性，指标要可测。',
    requiredFields: ['performance_budget', 'compatibility', 'accessibility']
  },
  {
    key: 'security', name: '安全与隐私', agentId: 'security',
    aiHint: '认证授权模型、数据分级、敏感信息处理与威胁模型；写清合规边界。',
    requiredFields: ['auth_model', 'data_classification', 'threats']
  },
  {
    key: 'testing', name: '测试与质量', agentId: 'qa',
    aiHint: '分层测试策略、关键用例与验收条件、回归范围与上线门禁。',
    requiredFields: ['test_strategy', 'acceptance', 'release_gate']
  },
  {
    key: 'release', name: '发布与运维', agentId: 'devops',
    aiHint: '部署形态、灰度策略、监控指标、告警阈值与回滚路径。',
    requiredFields: ['deployment', 'rollout', 'monitoring', 'rollback']
  },
  {
    key: 'milestones', name: '里程碑与资源', agentId: 'tech_lead',
    aiHint: '按可交付成果拆里程碑，标注依赖、人力与关键假设。',
    requiredFields: ['milestones', 'resources']
  },
  {
    key: 'risks', name: '风险与取舍', agentId: 'tech_lead',
    aiHint: '列风险登记表与应对，并写清关键决策的候选方案、否决理由与结论。',
    requiredFields: ['risk_register', 'decisions']
  }
]

/** 中文数字（章号派生；够用即可） */
const CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十'] as const

const NUMBERED_KEYS: readonly string[] = APP_PARTS.flatMap((part) => [...part.chapters])
const CHAPTER_KEYS: readonly string[] = [APP_META_KEY, ...NUMBERED_KEYS]

function chaptersForSpec(): SpecChapter[] {
  const defs = new Map(CHAPTER_DEFS.map((def) => [def.key, def]))
  return CHAPTER_KEYS.map((key) => {
    const part = APP_PARTS.find((candidate) => candidate.chapters.includes(key))
    const index = NUMBERED_KEYS.indexOf(key)
    if (key === APP_META_KEY) {
      return {
        key, name: '文档信息', label: '文档信息', part: 'meta',
        aiHint: '整理项目名称、目标平台、文档状态与保密级别。',
        agentId: 'tech_lead', requiredFields: ['project_name', 'platform']
      }
    }
    const def = defs.get(key)
    if (def === undefined) throw new Error(`应用规格缺少章定义: ${key}`)
    const ordinal = CN[index] ?? String(index + 1)
    return {
      key,
      name: def.name,
      label: `第${ordinal}章·${def.name}`,
      part: part?.key ?? '',
      aiHint: def.aiHint,
      agentId: def.agentId,
      requiredFields: def.requiredFields
    }
  })
}

export const APP_SPEC: DocumentSpec = {
  kind: 'application',
  label: '软件设计文档',
  shortLabel: '应用',
  metaKey: APP_META_KEY,
  numberedKeys: NUMBERED_KEYS,
  chapterKeys: CHAPTER_KEYS,
  parts: APP_PARTS,
  chapters: chaptersForSpec(),
  chapterLabels: Object.fromEntries(chaptersForSpec().map((c) => [c.key, c.label])),
  agentDisplay: APP_AGENT_DISPLAY,
  agentPrompts: APP_AGENT_PROMPTS,
  roles: APP_ROLES,
  // 应用档不启用游戏数据编辑（角色/怪物/技能对软件设计无意义）
  hiddenMainViewIds: ['data.mainView'],
  systemDocNoun: '软件设计文档',
  reviewRoleNoun: '资深软件架构师'
}
