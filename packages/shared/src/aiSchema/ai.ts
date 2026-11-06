/**
 * AI 产品设计文档（SDD + 模型层）的 AI 元数据（2026-11-07）。
 *
 * 与 `appSchema/ai.ts` 同因放在 `aiSchema` 而非 `documentSpec`：切断 cyclic 依赖，
 * 只 type-import `ceshu/reference`。`documentSpec/aiSpec.ts` 从这里 re-export。
 *
 * 软件设计章复用应用 SDD 的岗位/智能体体系（AI 产品本质是软件产品），并在 AI 模型层
 * 补两个专属角色：`ml_engineer`（模型/数据）与 `ai_safety`（系统卡/红队）。
 */
import { AI_META_KEY } from './table'

/** AI 子智能体（软件设计部分复用应用 SDD 体系，模型层另加 ml_engineer / ai_safety） */
export const AI_AGENT_DISPLAY: Readonly<Record<string, string>> = {
  product_manager: '产品经理',
  ux_designer: '交互设计师',
  architect: '系统架构师',
  frontend: '前端工程师',
  backend: '后端工程师',
  data_engineer: '数据工程师',
  ml_engineer: '机器学习工程师',
  ai_safety: 'AI 安全工程师',
  security: '安全工程师',
  qa: '测试工程师',
  devops: '运维工程师',
  tech_lead: '技术负责人'
}

export const AI_AGENT_PROMPTS: Readonly<Record<string, string>> = {
  product_manager: '从用户价值与业务目标出发，界定问题、范围与验收标准；避免堆功能清单。',
  ux_designer: '描述页面结构、导航与关键交互，给出状态与异常态，不写视觉稿细节。',
  architect: '给出模块划分、依赖方向、关键 trade-off 与被否决方案；说明 LLM/推理/向量库的接入点。',
  frontend: '按组件边界、状态管理与接口约定描述实现方案，覆盖加载/空/错三态。',
  backend: '按服务边界、数据一致性与幂等性描述实现方案，写清失败与重试；含模型服务调用。',
  data_engineer: '定义实体、字段、关系与生命周期，说明向量/嵌入存储与迁移口径。',
  ml_engineer: '界定底座模型选择、训练/微调数据、评测与迭代策略，写清能力边界。',
  ai_safety: '按系统卡描述预期行为与安全措施，给出红队/越狱防护与失效降级。',
  security: '按认证授权、数据分级与威胁模型描述风险与对策，点明 AI 合规边界（如 EU AI Act）。',
  qa: '给出可判定的测试用例、模型回归与上线门禁，覆盖边界与对抗场景。',
  devops: '描述部署、灰度、监控与回滚路径，写清触发条件与模型更新策略。',
  tech_lead: '统筹范围、里程碑与风险取舍，确保各章结论互相一致。'
}

/** AI 档岗位（替换游戏侧 程序/美术/测试/数值/音频；在应用 SDD 五岗基础上加 ml / ai_safety） */
export const AI_ROLES: readonly { key: string; label: string }[] = [
  { key: 'product', label: '产品' },
  { key: 'frontend', label: '前端' },
  { key: 'backend', label: '后端' },
  { key: 'ml', label: '算法' },
  { key: 'qa', label: '测试' },
  { key: 'devops', label: '运维' },
  { key: 'ai_safety', label: 'AI 安全' }
]

/** AI 档岗位 → 相关章（章 key 属 aiSchema 命名空间） */
export const AI_ROLE_CHAPTERS: Readonly<Record<string, readonly string[]>> = {
  product: ['overview', 'users', 'scope', 'features', 'flows', 'milestones'],
  frontend: ['features', 'flows', 'interaction', 'nonfunctional'],
  backend: ['architecture', 'data_model', 'api', 'integration', 'security'],
  ml: ['architecture', 'data_model', 'model_card', 'data_sheet', 'eval_redteam'],
  qa: ['testing', 'nonfunctional', 'eval_redteam', 'risks'],
  devops: ['release', 'nonfunctional', 'security', 'system_card'],
  ai_safety: ['system_card', 'eval_redteam', 'security', 'risks']
}

/** 整章 / 补全生成时 system 里的文档类型措辞 */
export const AI_SYSTEM_DOC_NOUN = 'AI 产品设计文档'

/** 成稿反审的角色措辞 */
export const AI_REVIEW_ROLE_NOUN = '资深 AI 产品架构师'

/** 文档信息段的生成要求（meta 段不占章号，单独声明） */
export const AI_META_AI_HINT = '整理项目名称、目标平台、文档状态与保密级别。'

/** 每章的 AI 子智能体与生成要求（章号由分区表派生，不在此手写） */
export interface AiChapterAi {
  key: string
  agentId: string
  aiHint: string
}

export const AI_CHAPTER_AI: readonly AiChapterAi[] = [
  { key: 'overview', agentId: 'product_manager', aiHint: '一句话说清这个 AI 产品解决谁的问题、和现有方案有何不同；给出 2-3 条成功指标。' },
  { key: 'users', agentId: 'product_manager', aiHint: '列出 2-4 类目标用户与各自的核心使用场景，写清触发时机与完成标准。' },
  { key: 'scope', agentId: 'product_manager', aiHint: '明确本期做什么、明确不做什么；非目标要给出边界，禁止「暂不做」这类无边界表述。' },
  { key: 'features', agentId: 'product_manager', aiHint: '按模块列功能点与验收条件，每条可判定；标注优先级与依赖关系。' },
  { key: 'flows', agentId: 'ux_designer', aiHint: '给出主流程步骤与关键状态机，覆盖失败分支与回退路径；注明哪些步骤调用模型。' },
  { key: 'interaction', agentId: 'ux_designer', aiHint: '描述信息架构、页面结构、导航与关键交互，覆盖加载/空/错三态与响应式策略。' },
  { key: 'architecture', agentId: 'architect', aiHint: '模块划分、依赖方向、技术选型理由与被否决方案；说明 LLM/推理/向量库的接入点与上下文管理。' },
  { key: 'data_model', agentId: 'data_engineer', aiHint: '实体、字段、关系与生命周期；说明向量/嵌入存储、检索策略与一致性。' },
  { key: 'api', agentId: 'backend', aiHint: '按接口列路径/入参/出参/错误码/幂等性；含模型服务与流式输出的约定。' },
  { key: 'integration', agentId: 'backend', aiHint: '列出外部依赖、认证方式、配额与降级方案；标清单点故障，含模型服务提供商。' },
  { key: 'model_card', agentId: 'ml_engineer', aiHint: '写清底座模型/服务、版本快照、能力边界与已知局限、推理成本与配额。' },
  { key: 'data_sheet', agentId: 'ml_engineer', aiHint: '说明训练/微调/RAG 语料的数据来源、许可与合规、个人信息处理与偏差审计。' },
  { key: 'system_card', agentId: 'ai_safety', aiHint: '描述预期行为边界、安全措施、对齐约束与失效降级策略。' },
  { key: 'eval_redteam', agentId: 'ai_safety', aiHint: '列评测指标与目标值、红队/越狱测试场景与防护、线上行为监控。' },
  { key: 'nonfunctional', agentId: 'architect', aiHint: '性能预算（含模型推理延迟与并发）、兼容矩阵、可用性与可访问性，指标要可测。' },
  { key: 'security', agentId: 'security', aiHint: '认证授权模型、数据分级、敏感信息处理与威胁模型；点明 AI 合规边界（如 EU AI Act）。' },
  { key: 'testing', agentId: 'qa', aiHint: '分层测试策略、模型回归与关键用例、对抗场景覆盖与上线门禁。' },
  { key: 'release', agentId: 'devops', aiHint: '部署形态、灰度策略、监控指标、告警阈值与回滚路径；含模型更新与回滚。' },
  { key: 'milestones', agentId: 'tech_lead', aiHint: '按可交付成果拆里程碑，标注依赖、人力与关键假设。' },
  { key: 'risks', agentId: 'tech_lead', aiHint: '列风险登记表与应对，并写清关键决策的候选方案、否决理由与结论。' }
]

/** 按章 key 取 AI 元数据；未知章回落到技术负责人（不抛错，保证生成链不中断） */
export function aiChapterAi(key: string): AiChapterAi {
  if (key === AI_META_KEY) {
    return { key, agentId: 'tech_lead', aiHint: AI_META_AI_HINT }
  }
  return AI_CHAPTER_AI.find((def) => def.key === key) ?? { key, agentId: 'tech_lead', aiHint: '' }
}
