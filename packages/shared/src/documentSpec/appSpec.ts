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
import {
  APP_CHAPTER_FIELDS,
  APP_CHAPTER_KEYS,
  APP_CHAPTER_LABELS,
  APP_CHAPTER_NAMES,
  APP_META_KEY,
  APP_NUMBERED_KEYS,
  APP_PARTS,
  appPartOf,
  appRequiredFields
} from '../appSchema'
import type { DocumentSpec, SpecChapter } from './types'

// 章表 / 标签 / 章号 / 分区的唯一事实源在 `appSchema/table.ts`；
// 这里 re-export 保持既有对外 API（documentSpec/index.ts 与测试都从这里取）。
export { APP_META_KEY, APP_PARTS } from '../appSchema'

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
 * 章名 + AI 角色 + 生成要求（章号由分区位置派生，不在此手写）。
 * **必填字段不在这里声明**：由 `appRequiredFields(key)` 从 `appSchema` 派生，
 * 字段表是唯一事实源，避免两边各写一份必填清单并悄悄漂移。
 */
interface AppChapterDef {
  key: string
  agentId: string
  aiHint: string
}

const CHAPTER_DEFS: readonly AppChapterDef[] = [
  {
    key: 'overview', agentId: 'product_manager',
    aiHint: '一句话说清这个应用解决谁的问题、和现有方案有何不同；给出 2-3 条成功指标。',
  },
  {
    key: 'users', agentId: 'product_manager',
    aiHint: '列出 2-4 类目标用户与各自的核心使用场景，写清触发时机与完成标准。',
  },
  {
    key: 'scope', agentId: 'product_manager',
    aiHint: '明确本期做什么、明确不做什么；非目标要给出边界，禁止「暂不做」这类无边界表述。',
  },
  {
    key: 'features', agentId: 'product_manager',
    aiHint: '按模块列功能点与验收条件，每条可判定；标注优先级与依赖关系。',
  },
  {
    key: 'flows', agentId: 'ux_designer',
    aiHint: '给出主流程步骤与关键状态机，覆盖失败分支与回退路径。',
  },
  {
    // 章 key 刻意不叫 `uiux`：那是游戏 GDD 的章 key，同名会让文档数据被两套规格解释成不同内容
    key: 'interaction', agentId: 'ux_designer',
    aiHint: '描述信息架构、页面结构、导航与关键交互，覆盖加载/空/错三态与响应式策略。',
  },
  {
    key: 'architecture', agentId: 'architect',
    aiHint: '模块划分、依赖方向、技术选型理由与被否决方案；说明扩展点与未提前实现的部分。',
  },
  {
    key: 'data_model', agentId: 'data_engineer',
    aiHint: '实体、字段、关系与生命周期；说明存储选型、迁移与一致性策略。',
  },
  {
    key: 'api', agentId: 'backend',
    aiHint: '按接口列路径/入参/出参/错误码/幂等性；内部模块边界也一并写清。',
  },
  {
    key: 'integration', agentId: 'backend',
    aiHint: '列出外部依赖、认证方式、配额与降级方案；标清单点故障。',
  },
  {
    key: 'nonfunctional', agentId: 'architect',
    aiHint: '性能预算、兼容矩阵（桌面/移动/浏览器）、可用性与可访问性，指标要可测。',
  },
  {
    key: 'security', agentId: 'security',
    aiHint: '认证授权模型、数据分级、敏感信息处理与威胁模型；写清合规边界。',
  },
  {
    key: 'testing', agentId: 'qa',
    aiHint: '分层测试策略、关键用例与验收条件、回归范围与上线门禁。',
  },
  {
    key: 'release', agentId: 'devops',
    aiHint: '部署形态、灰度策略、监控指标、告警阈值与回滚路径。',
  },
  {
    key: 'milestones', agentId: 'tech_lead',
    aiHint: '按可交付成果拆里程碑，标注依赖、人力与关键假设。',
  },
  {
    key: 'risks', agentId: 'tech_lead',
    aiHint: '列风险登记表与应对，并写清关键决策的候选方案、否决理由与结论。',
  }
]

/** 规格章表必须与 appSchema 字段表一一对应（缺一章就抛错，避免规格与内容脱节） */
for (const key of APP_CHAPTER_KEYS) {
  if ((APP_CHAPTER_FIELDS[key] ?? []).length === 0) {
    throw new Error(`应用规格的章在 appSchema 里没有字段定义: ${key}`)
  }
}

function chaptersForSpec(): SpecChapter[] {
  const defs = new Map(CHAPTER_DEFS.map((def) => [def.key, def]))
  return APP_CHAPTER_KEYS.map((key) => {
    // 标签 / 章号 / 分区 / 必填全部来自 appSchema（唯一事实源），这里只补 AI 元数据
    const requiredFields = appRequiredFields(key)
    if (key === APP_META_KEY) {
      return {
        key, name: APP_CHAPTER_NAMES[key], label: APP_CHAPTER_LABELS[key], part: 'meta',
        aiHint: '整理项目名称、目标平台、文档状态与保密级别。',
        agentId: 'tech_lead', requiredFields
      }
    }
    const def = defs.get(key)
    if (def === undefined) throw new Error(`应用规格缺少章定义: ${key}`)
    return {
      key,
      name: APP_CHAPTER_NAMES[key],
      label: APP_CHAPTER_LABELS[key],
      part: appPartOf(key),
      aiHint: def.aiHint,
      agentId: def.agentId,
      requiredFields
    }
  })
}

export const APP_SPEC: DocumentSpec = {
  kind: 'application',
  label: '软件设计文档',
  shortLabel: '应用',
  metaKey: APP_META_KEY,
  numberedKeys: APP_NUMBERED_KEYS,
  chapterKeys: APP_CHAPTER_KEYS,
  parts: APP_PARTS,
  chapters: chaptersForSpec(),
  chapterLabels: APP_CHAPTER_LABELS,
  agentDisplay: APP_AGENT_DISPLAY,
  agentPrompts: APP_AGENT_PROMPTS,
  roles: APP_ROLES,
  // 应用档不启用游戏数据编辑（角色/怪物/技能对软件设计无意义）
  hiddenMainViewIds: ['data.mainView'],
  systemDocNoun: '软件设计文档',
  reviewRoleNoun: '资深软件架构师'
}
