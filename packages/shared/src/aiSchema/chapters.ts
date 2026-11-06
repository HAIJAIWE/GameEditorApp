/**
 * AI 产品设计文档（SDD + 模型层）章节字段 schema（2026-11-07）。
 *
 * 与 `appSchema/`（应用 SDD）和 `ceshuSchema/`（游戏 GDD 24 章）**三足并列、互不引用**：
 * AI 章 key 是独立命名空间，由 `documentSpec.test.ts` 的零重叠守卫锁定。
 *
 * 关键决策（呼应调研 2026-11-07）：AI 产品**本质是软件产品**，所以软件设计部分
 * （概述/用户/范围/功能/流程/交互/架构/数据/接口/集成/非功能/安全/测试/发布/里程碑/风险）
 * **直接复用应用 SDD 的字段语义**（`APP_CHAPTER_FIELDS`），只在 `aiSchema/ai.ts` 的章节
 * AI 提示里加 AI 风味（架构章提示提 LLM/RAG、安全章提合规/EU AI Act、测试章提 Eval）。
 * 真正 AI 独有的、应用 SDD 装不下的是**模型层四章**：模型卡 / 数据表 / 系统卡 / 评测与红队。
 *
 * 起步阶段刻意集中在单文件（与 appSchema/chapters.ts 同策略）。
 */
import type { CeshuFieldDef, ChapterData } from '../ceshu/reference'
import type { ChapterSchema } from '../ceshuSchema/core'
import { APP_CHAPTER_FIELDS, APP_META_FIELDS } from '../appSchema'

/** 必填字段：`required: true` 是必填信息的唯一标记，供规格派生 */
type AiField = CeshuFieldDef & { required?: boolean }

/** 文档信息段：复用应用 SDD 的 meta 字段，仅把 `doc_kind` 选项扩到含 AI */
function withAiDocKind(fields: readonly AiField[]): AiField[] {
  return fields.map((field) =>
    field.key === 'doc_kind'
      ? { ...field, values: ['game', 'application', 'ai'], optionLabels: { game: '游戏', application: '应用', ai: 'AI' } }
      : field
  )
}

/** 文档信息段（不占章号）；`doc_kind` 含 `ai` 以便用户在这里切到 AI 档 */
export const AI_META_FIELDS: AiField[] = withAiDocKind(APP_META_FIELDS as AiField[])

// ── AI 模型层专属四章（应用 SDD 装不下的标准化产物）──

const MODEL_CARD_FIELDS: AiField[] = [
  { key: 'base_model', label: '底座模型 / 服务', kind: 'textarea', required: true, aiHint: '写清使用的模型、服务或自研底座，以及版本/快照与调用方式', reviewHint: '是否具体到版本；微调与基座是否分清' },
  { key: 'capabilities', label: '能力边界', kind: 'stringList', required: true, aiHint: '列模型能稳定做到什么、以及明确做不到什么', reviewHint: '是否既写能力也写边界；有无夸大' },
  { key: 'limitations', label: '已知局限', kind: 'stringList', required: true, aiHint: '列已知的失效场景、幻觉倾向、长上下文衰减等', reviewHint: '是否覆盖用户会踩的坑' },
  { key: 'model_version', label: '版本 / 快照', kind: 'text', aiHint: '记录模型版本、权重快照或知识截止日期', reviewHint: '是否可复现；知识截止是否注明' },
  { key: 'inference_cost', label: '推理成本与配额', kind: 'text', aiHint: '说明单次调用成本、QPS 配额与超限降级', reviewHint: '是否与发布规模匹配' }
]

const DATA_SHEET_FIELDS: AiField[] = [
  { key: 'training_data', label: '训练 / 微调数据来源', kind: 'textarea', required: true, aiHint: '说明训练、SFT、RAG 语料的数据来源与规模', reviewHint: '来源是否可追溯；有无授权问题' },
  { key: 'data_license', label: '数据许可与合规', kind: 'text', required: true, aiHint: '写清数据许可、授权范围与跨境/合规约束', reviewHint: '是否覆盖授权与合规；有无缺失许可' },
  { key: 'pii_handling', label: '个人信息处理', kind: 'stringList', aiHint: '列涉及的个人信息、脱敏与留存策略', reviewHint: '是否最小化；留存与删除是否明确' },
  { key: 'bias_audit', label: '偏差审计', kind: 'textarea', aiHint: '说明做了哪些偏差/公平性审计与结论', reviewHint: '是否有可验证的审计而非口头声明' }
]

const SYSTEM_CARD_FIELDS: AiField[] = [
  { key: 'behavior', label: '预期行为与边界', kind: 'textarea', required: true, aiHint: '描述模型在正常与边缘输入下的预期行为边界', reviewHint: '边界是否清晰；有无不可预期行为敞口' },
  { key: 'safety', label: '安全措施', kind: 'stringList', required: true, aiHint: '列内容安全、拒答、越权防护等机制', reviewHint: '是否具体可执行；与威胁模型是否对应' },
  { key: 'alignment', label: '对齐与价值观约束', kind: 'textarea', aiHint: '写清对齐约束、不可逾越的红线与处理方式', reviewHint: '红线是否明确；越线如何处置' },
  { key: 'degradation', label: '失效降级策略', kind: 'textarea', required: true, aiHint: '说明模型超时/限流/异常时的降级与兜底', reviewHint: '降级是否可执行；用户是否感知' }
]

const EVAL_REDTEAM_FIELDS: AiField[] = [
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

/** 按章聚合的字段表（软件章复用 app SDD，模型层四章为 AI 独有） */
export const AI_CHAPTER_FIELDS: Readonly<Record<string, readonly AiField[]>> = {
  ...(APP_CHAPTER_FIELDS as Record<string, readonly AiField[]>),
  meta: AI_META_FIELDS,
  model_card: MODEL_CARD_FIELDS,
  data_sheet: DATA_SHEET_FIELDS,
  system_card: SYSTEM_CARD_FIELDS,
  eval_redteam: EVAL_REDTEAM_FIELDS
}

/** 每章必填字段（由 `required: true` 派生，规格层直接取，不另写一份） */
export function aiRequiredFields(chapter: string): readonly string[] {
  return (AI_CHAPTER_FIELDS[chapter] ?? []).filter((field) => field.required === true).map((field) => field.key)
}

/** 与 `ChapterSchema` 同形的按章 schema */
export const AI_CHAPTER_SCHEMAS: Readonly<Record<string, ChapterSchema>> = Object.fromEntries(
  Object.entries(AI_CHAPTER_FIELDS).map(([key, fields]) => [
    key,
    { fields: fields as CeshuFieldDef[], splits: [], defaults: aiChapterDefaults(fields) }
  ])
)

/** 章节默认值：按字段 kind 给空值，保证新建 AI 文档的每章都是干净对象 */
function aiChapterDefaults(fields: readonly CeshuFieldDef[]): ChapterData {
  const out: ChapterData = {}
  for (const field of fields) {
    if (field.key.includes('.')) continue
    if (['stringList', 'multiCombo', 'pipeList'].includes(field.kind)) out[field.key] = []
  }
  return out
}

/**
 * AI 文档的全部章节默认值（顶层平铺，与游戏 `createDefaultChapters`、应用
 * `createAppDefaultChapters` 同形）。
 *
 * 注意：游戏档 24 章作为兼容底座由 `createDefaultCeshu` 的 `...createDefaultChapters()`
 * 先行铺好，这里只补 AI 自己的 20 章（meta + 软件 16 + 模型层 4）；`meta` 会与传入的
 * 游戏侧 meta 合并，避免覆盖 `gdd_scope` / `game_name` / `doc_kind`。
 */
export function createAiDefaultChapters(baseMeta?: ChapterData): Record<string, ChapterData> {
  const out: Record<string, ChapterData> = {}
  for (const [key, schema] of Object.entries(AI_CHAPTER_SCHEMAS)) {
    out[key] = structuredClone(schema.defaults ?? {})
  }
  if (baseMeta !== undefined) {
    out.meta = { ...baseMeta, ...out.meta }
  }
  return out
}
