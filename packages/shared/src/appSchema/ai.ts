/**
 * 应用 SDD 的 AI 元数据（路线 A 第 4 步）。
 *
 * ## 为什么要放在 appSchema 而不是 documentSpec
 * `ceshu/prompts/ceshuAi.ts` 需要按档位取应用档角色/生成要求，但
 * `documentSpec/gameSpec.ts` 顶层会 import `ceshu/prompts` 桶来构造 GAME_SPEC，
 * 于是「ceshuAi → documentSpec → gameSpec → ceshu/prompts 桶 → ceshuAi」成环，
 * 顶层常量还没初始化就被读，实测报 `Cannot read properties of undefined`。
 *
 * `appSchema` 只依赖 `ceshu/reference` 的 **type**（运行时擦除），不碰 ceshu/prompts，
 * 是应用档事实源的安全落点。`documentSpec/appSpec.ts` 从这里 re-export，保持既有 API。
 */
import { APP_META_KEY } from './table'

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

/**
 * 应用档岗位 → 相关 SDD 章（章级映射，实际参与章再由 visibleChaptersForDoc 裁剪）。
 * 与游戏档 `ROLE_CHAPTERS` 并列，互不引用；章 key 都是 appSchema 命名空间。
 */
export const APP_ROLE_CHAPTERS: Readonly<Record<string, readonly string[]>> = {
  product: ['overview', 'users', 'scope', 'features', 'flows', 'alternatives', 'milestones', 'glossary'],
  frontend: ['features', 'flows', 'interaction', 'nonfunctional'],
  backend: ['architecture', 'data_interface', 'security', 'model_card', 'data_sheet'],
  qa: ['testing', 'nonfunctional', 'risks', 'system_card', 'eval_redteam'],
  devops: ['release', 'nonfunctional', 'security']
}

/** 整章 / 补全生成时 system 里的文档类型措辞 */
export const APP_SYSTEM_DOC_NOUN = '软件设计文档'

/** 成稿反审的角色措辞 */
export const APP_REVIEW_ROLE_NOUN = '资深软件架构师'

/** 文档信息段的生成要求（meta 段不占章号，单独声明） */
export const APP_META_AI_HINT = '整理项目名称、目标平台、文档状态与保密级别。'

/** 每章的 AI 子智能体与生成要求（章号由分区表派生，不在此手写） */
export interface AppChapterAi {
  key: string
  agentId: string
  aiHint: string
}

export const APP_CHAPTER_AI: readonly AppChapterAi[] = [
  {
    key: 'overview', agentId: 'product_manager',
    aiHint: '一句话说清这个应用解决谁的问题、和现有方案有何不同；给出 2-3 条成功指标。'
  },
  {
    key: 'users', agentId: 'product_manager',
    aiHint: '列出 2-4 类目标用户与各自的核心使用场景，写清触发时机与完成标准。'
  },
  {
    key: 'scope', agentId: 'product_manager',
    aiHint: '明确本期做什么、明确不做什么；非目标要给出边界，禁止「暂不做」这类无边界表述。'
  },
  {
    key: 'features', agentId: 'product_manager',
    aiHint: '按模块列功能点与验收条件，每条可判定；标注优先级与依赖关系。'
  },
  {
    key: 'flows', agentId: 'ux_designer',
    aiHint: '给出主流程步骤与关键状态机，覆盖失败分支与回退路径。'
  },
  {
    // 章 key 刻意不叫 `uiux`：那是游戏 GDD 的章 key，同名会让文档数据被两套规格解释成不同内容
    key: 'interaction', agentId: 'ux_designer',
    aiHint: '描述信息架构、页面结构、导航与关键交互，覆盖加载/空/错三态与响应式策略。'
  },
  {
    key: 'architecture', agentId: 'architect',
    aiHint: '模块划分、依赖方向、技术选型理由与被否决方案；说明扩展点与未提前实现的部分。'
  },
  {
    key: 'alternatives', agentId: 'architect',
    aiHint: '列 2-3 个真实候选方案，写清各自优点、缺点与为何不选；再说明选定依据与关键权衡。'
  },
  {
    key: 'data_interface', agentId: 'backend',
    aiHint: '实体/字段/关系与存储、迁移策略；对外与关键内部接口的路径/入参/出参/错误码/幂等；第三方依赖的认证与配额、降级与单点。'
  },
  {
    key: 'nonfunctional', agentId: 'architect',
    aiHint: '性能预算、兼容矩阵（桌面/移动/浏览器）、可用性与可访问性，指标要可测。'
  },
  {
    key: 'security', agentId: 'security',
    aiHint: '认证授权模型、数据分级、敏感信息处理与威胁模型；写清合规边界。'
  },
  {
    key: 'testing', agentId: 'qa',
    aiHint: '分层测试策略、关键用例与验收条件、回归范围与上线门禁。'
  },
  {
    key: 'release', agentId: 'devops',
    aiHint: '部署形态、灰度策略、监控指标、告警阈值与回滚路径。'
  },
  {
    key: 'milestones', agentId: 'tech_lead',
    aiHint: '按可交付成果拆里程碑，标注依赖、人力与关键假设。'
  },
  {
    key: 'risks', agentId: 'tech_lead',
    aiHint: '列风险登记表与应对，并写清关键决策的候选方案、否决理由与结论。'
  },
  {
    key: 'glossary', agentId: 'tech_lead',
    aiHint: '列文档里出现的业务/技术专有名词，每条一句话定义，避免读者误解。'
  },
  // AI 模型层四章（可选）：复用现有角色，只在 AI 提示里加模型风味
  {
    key: 'model_card', agentId: 'architect',
    aiHint: '写清底座模型/服务、能力边界与已知局限（幻觉、长上下文衰减等），版本与调用方式可复现。'
  },
  {
    key: 'data_sheet', agentId: 'data_engineer',
    aiHint: '说明训练/微调/RAG 数据来源、许可与合规、个人信息处理与偏差审计结论。'
  },
  {
    key: 'system_card', agentId: 'security',
    aiHint: '描述预期行为边界、内容安全与拒答机制、对齐红线与失效降级（超时/限流/异常）。'
  },
  {
    key: 'eval_redteam', agentId: 'qa',
    aiHint: '给出可量化的评测指标与目标值，列越狱/提示注入/数据泄露等红队场景与线上监控。'
  }
]

/** 按章 key 取 AI 元数据；未知章回落到技术负责人（不抛错，保证生成链不中断） */
export function appChapterAi(key: string): AppChapterAi {
  if (key === APP_META_KEY) {
    return { key, agentId: 'tech_lead', aiHint: APP_META_AI_HINT }
  }
  return APP_CHAPTER_AI.find((def) => def.key === key) ?? { key, agentId: 'tech_lead', aiHint: '' }
}
