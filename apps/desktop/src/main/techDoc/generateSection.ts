/**
 * 技术设计文档（TDD）的**分节 AI 生成**编排。
 *
 * ## 为什么只生成一节
 * 整篇加成一次调用时，模型的推理链会先复述 GDD 再补两句实现，正文被压到每节两三百字
 * （本仓「AI 生成内容过少」的实测根因）。分节后提示词只带本节的素材与写作指引，
 * 长度下限才咬得住；调用成本也降为一次 4k 档。
 *
 * ## 分层
 * 本文件属 `main/techDoc/**`（业务域自有编排），不在 `main/ai/**` 的 eslint 规则 7 范围内。
 * 仍然只依赖 `shared/` 的纯逻辑与 `main/ai/runner`（通用治理），文档一律由调用方经参数注入，
 * 于是单测不必构造 `CeshuManager` / `TechDocSkill`。
 */

import { runAiTask, type AiGeneratePort, type AiLlmPort } from '../ai/runner'
import type { LlmUsage } from '@mobai/shared/config/llm'
import {
  buildTechDocSectionPrompt,
  sanitizeSectionBody
} from '@mobai/shared/agent/techDoc/techDocPrompt'
import { TECH_DOC_SECTIONS } from '@mobai/shared/agent/techDoc/techDocSchema'
import type { TechDocMaterial } from '@mobai/shared/agent/techDoc/techDocDraft'

/**
 * 单节生成的输出上限（2026-11-10）。
 *
 * 与整章生成（`ceshu/ai/ceshu.ts::CHAPTER_GENERATE_MAX_TOKENS`）取同一量级 16000：
 * 二者都是「长篇正文 + 推理型模型」，1000 的上限会被思考过程吃光。
 * 合法范围 1..32000（`LLM_MAX_TOKENS_MAX`）。
 */
const TDD_SECTION_MAX_TOKENS = 16000

export interface TechDocAiPorts {
  llm: AiLlmPort
  client: AiGeneratePort
}

export interface GenerateTechDocSectionInput {
  /** 当前游戏名（取不到时提示词层会用兜底名） */
  gameName: string
  sectionId: string
  materials: readonly TechDocMaterial[]
  /** 文档里已写完的其它节（用于交叉引用，不给正文） */
  written?: readonly { title: string; body: string }[]
  extra?: string
  confirmed?: boolean
  senderId?: number
}

export interface GenerateTechDocSectionOutput {
  /** 清洗后的本节正文（已剥整篇围栏 / 自报标题 / 开场白） */
  body: string
  sectionId: string
  /** 该节的**标准标题**（来自 TECH_DOC_SECTIONS；未知 id 退化为 id 本身） */
  title: string
  model: string
  usage: LlmUsage | null
}

/** 未知 sectionId 时按 id 当标题：与提示词层的兜底保持一致，避免两边标题不一致 */
function resolveTitle(sectionId: string): string {
  const id = sectionId.trim()
  return TECH_DOC_SECTIONS.find((section) => section.id === id)?.title ?? id
}

/**
 * 生成一节 TDD 正文。
 *
 * 预算档固定 `chapter`：2026-11-10 起该档位**不再**触发「预估 token 超预算」的确认门
 * （确认门只剩整篇 / 批量条数两条，见 `shared/agent/config/protocol.ts::llmConfirmReason`），
 * 故一节素材再长也直接开跑，不再要用户先点一次确认。
 *
 * 输出上限取 `TDD_SECTION_MAX_TOKENS`（16000）而非配置里的 1000：推理型模型的思考过程
 * 占掉大半 completion tokens，1000 下本节正文常常只剩两三百字甚至为空（本仓「AI 生成内容过少」的实测根因）。
 */
export async function generateTechDocSectionTask(
  ports: TechDocAiPorts,
  input: GenerateTechDocSectionInput
): Promise<GenerateTechDocSectionOutput> {
  const title = resolveTitle(input.sectionId)
  const built = buildTechDocSectionPrompt({
    gameName: input.gameName,
    sectionId: input.sectionId,
    materials: input.materials,
    ...(input.written !== undefined ? { written: input.written } : {}),
    ...(input.extra !== undefined ? { extra: input.extra } : {})
  })

  const task = await runAiTask(ports, {
    system: built.system,
    prompt: built.prompt,
    budget: { taskType: 'chapter' },
    confirmed: input.confirmed === true,
    ...(input.senderId !== undefined ? { senderId: input.senderId } : {}),
    // 长篇正文一次给足输出上限（默认 1000 下正文常被思考过程挤空，见常量注释）
    maxTokens: TDD_SECTION_MAX_TOKENS,
    // 清洗放在 interpret 里：取消 / 超时都从 runAiTask 抛出，不会被这里吞掉
    interpret: async (content) => sanitizeSectionBody(content, title)
  })

  return {
    body: task.value,
    sectionId: input.sectionId.trim(),
    title,
    model: task.model,
    usage: task.usage
  }
}
