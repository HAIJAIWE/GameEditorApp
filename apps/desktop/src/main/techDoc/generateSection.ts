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
 * 预算档固定 `chapter`（4000 token）：一节正文远比一章 GDD 短，`full` 档会把确认门
 * 抬到「整篇」的量级，用户每节都要多点一次确认。云端超预算时仍会如实抛确认原因。
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
