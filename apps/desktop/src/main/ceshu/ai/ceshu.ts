/**
 * 策划书域的四路 AI 任务编排（W1）。
 *
 * ## 为什么集中在这里
 * 这四路的差别只在「提示词怎么组」和「正文怎么解析」，而**治理**（预算确认、取消、
 * 计时、观测）完全一致。把编排集中后，`ceshuIpc.ts` 退化为「取文档 → 调这里 → 返回」，
 * 四处重复的前导只剩一份，新增通道也不会再漏掉某一项治理。
 *
 * ## 分层约束
 * 本文件属 `main/ceshu/ai/**`（策划书域自有的 AI 编排），因此不在 `main/ai/**` 的受限范围
 * （eslint 规则 7 只约束 `main/ai/**`）：
 * - 文档、类型清单、既有条目计数一律由调用方（`ceshuIpc`）经参数传入；
 * - 依赖的纯逻辑全部来自 `shared/`（提示词、解析、质量门），不反向依赖 IPC 层。
 *
 * 这样 `main/ai/` 只认识「提示词进、结构化结果出」的通用机制（runner / 判官），而策划书这一路
 * 的具体编排随策划书域一起落在 `main/ceshu/ai`，测试时无需构造 `CeshuManager` / `DataService`。
 */

import type { DataTypeDef, QualityGateVerdict } from '@mobai/shared/types'
import type { ChapterData, ChapterKey, CeshuDocument } from '@mobai/shared/ceshu/reference'
import type { FieldAction } from '@mobai/shared/ceshu/fields'
import type { LlmUsage } from '@mobai/shared/config/llm'
import {
  buildChapterPrompt,
  buildReviewPrompts,
  filterGeneratedFields,
  mergeChapterDraft,
  parseReviewResponse,
  finalizeReview,
  type CeshuReviewPayload
} from '@mobai/shared/ceshu/prompts'
import { buildCloneDecomposePrompt, parseCloneDecompose } from '@mobai/shared/ceshu/prompts'
import { buildRoleTaskPrompt, parseRoleTaskPlan, taskRolesForDoc } from '@mobai/shared/ceshu/prompts'
import type { CeshuRole, CeshuTaskPlan } from '@mobai/shared/ceshu/workflow'
import {
  DATA_GEN_ERROR_EMPTY,
  DATA_GEN_ERROR_NO_TYPE,
  DATA_GEN_ERROR_UNPARSABLE,
  buildDataGenPrompt,
  buildDataGenSummaryMessage,
  clampDataGenCount,
  normalizeDataGenCandidates,
  resolveSelectedDataTypes,
  type CeshuDataGenResult
} from '@mobai/shared/ceshu/data'
import { computeChapterProgress } from '@mobai/shared/ceshu/model'
import { validateCeshu } from '@mobai/shared/ceshu/validation'
import { parseLlmJson } from '@mobai/shared/util/object'
import { applyJudge, evaluateChapterDraft, evaluateDataCandidates } from '@mobai/shared/agent/runtime'
import { runLlmJudge } from '../../agent/execution/qualityJudge'
import { runAiTask, type AiGeneratePort, type AiLlmPort } from '../../ai/runner'

/** 四路任务共用的两个外部端口（配置门面 + 生成客户端） */
export interface CeshuAiPorts {
  llm: AiLlmPort
  client: AiGeneratePort
}

/* ------------------------------------------------------------------ */
/* 整章 / 一键生成                                                     */
/* ------------------------------------------------------------------ */

export interface GenerateChapterInput {
  /** 落盘的文档（质量门的 before 基准） */
  base: CeshuDocument
  /** 一键生成时把已生成章节作为提示词上下文；单章生成时传 `{}` */
  draft: Partial<Record<ChapterKey, ChapterData>>
  chapter: ChapterKey
  onlyEmpty?: boolean
  styleKey?: string
  extraPrompt?: string
  /** 整篇 / 一键生成：走 `full` 档并需确认 */
  fullGenerate?: boolean
  confirmed?: boolean
  senderId?: number
}

export interface GenerateChapterOutput {
  model: string
  fields: Record<string, unknown>
  rawText: string
  quality?: QualityGateVerdict | null
  /** 未调用 LLM 的短路路径**不带此键**（与重构前一致，渲染层按 `?? null` 消费） */
  usage?: LlmUsage | null
}

/**
 * 整章生成。
 *
 * 注意 `onlyEmpty && 无空字段` 的**短路必须在预算门之前**：此时根本不会调用模型，
 * 不该因为「提示词很长」就先要求用户确认一次并不存在的花费。
 */
export async function generateChapterTask(
  ports: CeshuAiPorts,
  input: GenerateChapterInput
): Promise<GenerateChapterOutput> {
  const doc = Object.keys(input.draft).length > 0 ? mergeChapterDraft(input.base, input.draft) : input.base
  const built = buildChapterPrompt(doc, input.chapter, {
    onlyEmpty: input.onlyEmpty,
    styleOverride: input.styleKey,
    extraPrompt: input.extraPrompt
  })
  if (input.onlyEmpty === true && built.fields.length === 0) {
    // 无空字段：不调用 LLM，直接返回空结果（UI 提示「无需补全」）
    // 刻意不写 `usage`：短路时没有发生调用，键的缺席本身就是「没花钱」的信号
    return { model: '', fields: {}, rawText: '' }
  }

  const task = await runAiTask(ports, {
    system: built.system,
    prompt: built.prompt,
    budget: { taskType: input.fullGenerate === true ? 'full' : 'chapter', bulk: input.fullGenerate === true },
    confirmed: input.confirmed === true,
    ...(input.senderId !== undefined ? { senderId: input.senderId } : {}),
    interpret: async (content, ctx) => {
      const parsed = parseLlmJson(content)
      const fields = filterGeneratedFields(doc, input.chapter, parsed)
      // DD-19：确定性评分门为主结论
      const deterministic = evaluateChapterDraft(input.base, input.chapter, fields)
      // judge 为辅：走同源 callOpts + 同一 signal（自动遵守保密）；业务失败降级 null，
      // 但取消会向上抛（见 qualityJudge.ts 的「取消 ≠ 失败」）
      const judge = await runLlmJudge(ctx.callOpts, input.chapter, fields, ctx.signal)
      return { fields, quality: applyJudge(deterministic, judge) }
    }
  })

  return {
    model: task.model,
    fields: task.value.fields,
    rawText: task.content,
    quality: task.value.quality,
    usage: task.usage
  }
}

/* ------------------------------------------------------------------ */
/* 复刻拆解（复刻单线 MVP）                                            */
/* ------------------------------------------------------------------ */

export interface CloneDecomposeTaskInput {
  /** 参考游戏名（如「吸血鬼幸存者」） */
  gameName: string
  /** 品类（可选） */
  gameType?: string
  senderId?: number
}

export interface CloneDecomposeTaskOutput {
  model: string
  /** 立项一页（只含立项章）；落盘/套用由调用方做 */
  fields: Partial<Record<ChapterKey, ChapterData>>
  rawText: string
  usage: LlmUsage | null
}

/**
 * 参考游戏名 → 立项一页。纯编排（组提示词 → 调模型 → 解析），不落盘。
 * 落盘（新建文档 + 逐章保存）由 IPC 层做，保持 `main/ai/**` 不依赖存储。
 */
export async function cloneDecomposeTask(
  ports: CeshuAiPorts,
  input: CloneDecomposeTaskInput
): Promise<CloneDecomposeTaskOutput> {
  const built = buildCloneDecomposePrompt({
    gameName: input.gameName,
    ...(input.gameType !== undefined && input.gameType !== '' ? { gameType: input.gameType } : {})
  })
  const task = await runAiTask(ports, {
    system: built.system,
    prompt: built.prompt,
    budget: { taskType: 'chapter' },
    ...(input.senderId !== undefined ? { senderId: input.senderId } : {}),
    interpret: async (content) => ({ fields: parseCloneDecompose(content) })
  })
  return { model: task.model, fields: task.value.fields, rawText: task.content, usage: task.usage }
}

/* ------------------------------------------------------------------ */
/* 岗位任务生成                                                        */
/* ------------------------------------------------------------------ */

export interface GenerateRoleTasksInput {
  base: CeshuDocument
  /** 指定岗位；缺省 = 全部岗位 */
  roles?: CeshuRole[]
  senderId?: number
}

/**
 * 读整份策划书 → 拆成各岗位可执行任务。
 * 与「按章搬运字段」的旧口径不同：这里产出的是动作（实现/搭建/绘制/配置），不是阅读清单。
 */
export async function generateRoleTasksTask(
  ports: CeshuAiPorts,
  input: GenerateRoleTasksInput
): Promise<{ model: string; plan: CeshuTaskPlan; rawText: string; usage: LlmUsage | null }> {
  const built = buildRoleTaskPrompt(input.base, input.roles ?? taskRolesForDoc(input.base))
  const task = await runAiTask(ports, {
    system: built.system,
    prompt: built.prompt,
    /*
     * `budget: null`：输入被 `TASK_DIGEST_LIMIT`（8000 字符）硬封顶，输出是「每岗 3-8 条」，
     * 单次成本有上界；而通道入参里没有 `confirmed`、界面也没有确认回路
     * ⇒ 挂确认门只会抛出一个用户无法确认的错误。这里只借用取消 / 计时 / 观测。
     */
    budget: null,
    ...(input.senderId !== undefined ? { senderId: input.senderId } : {}),
    interpret: async (content) => ({ plan: parseRoleTaskPlan(content, input.base) })
  })
  return { model: task.model, plan: task.value.plan, rawText: task.content, usage: task.usage }
}

/* ------------------------------------------------------------------ */
/* 单字段定向生成                                                       */
/* ------------------------------------------------------------------ */

export interface GenerateFieldInput {
  base: CeshuDocument
  chapter: ChapterKey
  field: string
  /** 局部重生成动作（改写/展开/精简/通俗化）；缺省 = 重新起草 */
  action?: FieldAction
  senderId?: number
}

export async function generateFieldTask(
  ports: CeshuAiPorts,
  input: GenerateFieldInput
): Promise<{ model: string; fields: Record<string, unknown>; rawText: string; usage: LlmUsage | null }> {
  const built = buildChapterPrompt(input.base, input.chapter, {
    onlyFields: [input.field],
    ...(input.action !== undefined ? { action: input.action } : {})
  })

  const task = await runAiTask(ports, {
    system: built.system,
    prompt: built.prompt,
    /*
     * `budget: null`：单字段是最小粒度，且 `ceshu:aiGenerateField` 的入参里**没有**
     * `confirmed`，渲染层没有确认回路。此处只借用取消 / 计时 / 观测，
     * 不新增确认门（否则超大文档下会抛出一个用户无法确认的错误）。
     */
    budget: null,
    ...(input.senderId !== undefined ? { senderId: input.senderId } : {}),
    interpret: async (content) => {
      const parsed = parseLlmJson(content)
      const raw = parsed[input.field]
      const empty =
        raw === undefined || raw === null || raw === '' || (Array.isArray(raw) && raw.length === 0)
      // 单字段回填无需整章质量门
      return { fields: empty ? {} : { [input.field]: raw } }
    }
  })

  return { model: task.model, fields: task.value.fields, rawText: task.content, usage: task.usage }
}

/* ------------------------------------------------------------------ */
/* 批量数据生成                                                         */
/* ------------------------------------------------------------------ */

export interface GenerateDataInput {
  doc: CeshuDocument
  types: DataTypeDef[]
  /** 渲染层选中的类型键（单数 id 或复数 key 均可） */
  dataTypes: string[]
  count: number
  instruction: string
  confirmed?: boolean
  senderId?: number
  /** 既有条目计数（质量门的平衡性维度用）；由调用方从 DataService 取，ai/ 层不 import data/ */
  existingCounts: () => Promise<Record<string, number>>
}

export interface GenerateDataOutput extends CeshuDataGenResult {
  model: string
  usage: LlmUsage | null
}

export async function generateDataTask(
  ports: CeshuAiPorts,
  input: GenerateDataInput
): Promise<GenerateDataOutput> {
  const selected = resolveSelectedDataTypes(input.types, input.dataTypes)
  if (selected.length === 0) {
    throw new Error(DATA_GEN_ERROR_NO_TYPE)
  }
  const count = clampDataGenCount(input.count)
  const built = buildDataGenPrompt(input.doc, input.types, selected, count, input.instruction.trim())

  const task = await runAiTask(ports, {
    system: built.system,
    prompt: built.prompt,
    budget: { taskType: 'datagen', count },
    confirmed: input.confirmed === true,
    ...(input.senderId !== undefined ? { senderId: input.senderId } : {}),
    interpret: async (content) => {
      const parsed = parseLlmJson(content)
      if (Object.keys(parsed).length === 0) {
        throw new Error(DATA_GEN_ERROR_UNPARSABLE)
      }
      const normalized = normalizeDataGenCandidates(
        parsed,
        selected,
        new Set(input.types.map((type) => type.pluralKey))
      )
      if (normalized.total === 0) {
        throw new Error(DATA_GEN_ERROR_EMPTY)
      }
      const existingCounts = await input.existingCounts()
      // DD-19（数据半边）：数量约束（硬）+ 平衡性（建议）
      const quality = evaluateDataCandidates(normalized.candidates, {
        types: input.types,
        systems: input.doc.systems,
        existingCounts
      })
      return {
        candidates: normalized.candidates,
        generatedCounts: normalized.generatedCounts,
        total: normalized.total,
        summary: buildDataGenSummaryMessage(normalized.generatedCounts),
        quality
      }
    }
  })

  return { model: task.model, ...task.value, usage: task.usage }
}

/* ------------------------------------------------------------------ */
/* AI 审阅                                                             */
/* ------------------------------------------------------------------ */

export interface ReviewInput {
  doc: CeshuDocument
  /** 云端档超预算时渲染层带 `confirmed: true` 重发（DD-17） */
  confirmed?: boolean
  senderId?: number
}

export interface ReviewOutput extends CeshuReviewPayload {
  model: string
  progressTotal: number
  validationCount: number
  usage: LlmUsage | null
}

export async function reviewTask(ports: CeshuAiPorts, input: ReviewInput): Promise<ReviewOutput> {
  const progress = computeChapterProgress(input.doc)
  const validationErrors = validateCeshu(input.doc)
  const built = buildReviewPrompts(input.doc, {
    progressTotal: progress.total ?? 0,
    validationCount: validationErrors.length
  })

  const task = await runAiTask(ports, {
    system: built.system,
    prompt: built.prompt,
    budget: { taskType: 'review' },
    confirmed: input.confirmed === true,
    ...(input.senderId !== undefined ? { senderId: input.senderId } : {}),
    interpret: async (content) => finalizeReview(parseReviewResponse(content), input.doc)
  })

  return {
    model: task.model,
    ...task.value,
    progressTotal: progress.total ?? 0,
    validationCount: validationErrors.length,
    usage: task.usage
  }
}
