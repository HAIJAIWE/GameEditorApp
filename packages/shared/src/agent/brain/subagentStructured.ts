/**
 * 子智能体结构化输出（对齐 dsh `subagent/structured.ts` 的**简化版**）。
 *
 * dsh 的做法是给子智能体注入一个 `structured_output` 工具 + 提示词指令 + 终端守卫，
 * 只有工具调用才算结果。墨白的子循环没有「动态注册工具」的钩子，故改为
 * **约束提示 + 父侧解析校验 + 一次修复重试**：
 *
 * 1. 派发时把 JSON Schema 写进子任务描述（要求最终答复是纯 JSON 对象）；
 * 2. 父侧解析（容忍 ```json 围栏与前后说明文字）并用 `validateJsonSchemaValue` 校验；
 * 3. 不合规 → 带上「上次输出 + 违规点」重跑一次；
 * 4. 仍不合规 → 明确失败并保留原始输出，不假装拿到了结构化结果。
 *
 * 诚实的边界：这是**软约束**，不是强制。子智能体若坚持输出散文，我们只能判失败。
 * dsh 用工具强制是因为它能在子作用域注册工具；本仓做不到，就不假装做到了。
 */

import {
  validateJsonSchemaValue,
  type JsonSchemaNode,
  type JsonSchemaViolation
} from '../toolRuntime/jsonSchema'

/** 子任务描述里追加的结构化输出要求 */
export function structuredInstruction(schema: JsonSchemaNode): string {
  return [
    '',
    '',
    '【结构化输出要求】',
    '你的最终答复必须是**一个 JSON 对象**（不要 markdown 代码块、不要额外解释文字），',
    '并符合下面的 JSON Schema：',
    JSON.stringify(schema, null, 2),
    '不符合会导致结果被判为失败。'
  ].join('\n')
}

/** 重跑时的任务描述：原任务 + 上次输出 + 具体违规点（reason 形如 `$.title is required`） */
export function structuredRepairPrompt(
  task: string,
  previous: string,
  reason: string,
  schema: JsonSchemaNode
): string {
  const trimmed = previous.length > 800 ? `${previous.slice(0, 800)}…` : previous
  return [
    task,
    '',
    '【上一次尝试不合格】你上次的最终答复是：',
    trimmed,
    '',
    `问题：${reason}`,
    '',
    '请重新完成任务，并且**只输出**符合下面 JSON Schema 的 JSON 对象：',
    JSON.stringify(schema, null, 2)
  ].join('\n')
}

export type StructuredParse =
  | { ok: true; value: unknown }
  | { ok: false; reason: string }

/** 去掉 ```json … ``` 围栏（模型最常见的"多余包装"） */
function stripFence(text: string): string {
  const fenced = /^```(?:json|JSON)?\s*([\s\S]*?)\s*```$/u.exec(text)
  return fenced?.[1] !== undefined ? fenced[1] : text
}

/**
 * 把子智能体的最终答复解析成 JSON 值。
 * 容忍：纯 JSON、```json 围栏、JSON 前后夹一句说明。
 */
export function parseStructuredReply(text: string): StructuredParse {
  const raw = text.trim()
  if (raw === '') return { ok: false, reason: '答复为空' }
  const candidates = [stripFence(raw)]
  // 前后夹说明文字：取第一个 `{` 到最后一个 `}`（对象是唯一有意义的结构化根）
  const first = raw.indexOf('{')
  const last = raw.lastIndexOf('}')
  if (first !== -1 && last > first) candidates.push(raw.slice(first, last + 1))

  for (const candidate of candidates) {
    try {
      return { ok: true, value: JSON.parse(candidate) as unknown }
    } catch {
      // 换下一个候选
    }
  }
  const preview = raw.length > 200 ? `${raw.slice(0, 200)}…` : raw
  return { ok: false, reason: `没有解析出 JSON（原文开头：${preview}）` }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const proto: unknown = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * 校验模型传入的 `output_schema` 是否是**可用的对象 schema**。
 * 不接受：非对象、数组、`type` 明确写成非 object、`properties` 不是对象。
 * 返回 `null` 表示不可用（调用方应拒绝派发，而不是带着坏 schema 硬跑）。
 */
export function coerceOutputSchema(raw: unknown): JsonSchemaNode | null {
  if (!isPlainObject(raw)) return null
  if (raw.type !== undefined && raw.type !== 'object') return null
  if (raw.properties !== undefined && !isPlainObject(raw.properties)) return null
  if (raw.required !== undefined && !Array.isArray(raw.required)) return null
  return raw as JsonSchemaNode
}

export type StructuredCheck =
  | { ok: true; value: unknown }
  | { ok: false; violation: JsonSchemaViolation }

/** 解析 + 校验一步到位；失败时给带路径的违规点 */
export function checkStructuredReply(text: string, schema: JsonSchemaNode): StructuredCheck {
  const parsed = parseStructuredReply(text)
  if (!parsed.ok) return { ok: false, violation: { path: '$', message: parsed.reason } }
  const violation = validateJsonSchemaValue(schema, parsed.value)
  return violation === null ? { ok: true, value: parsed.value } : { ok: false, violation }
}

/** 通过校验后回灌给父对话的文本（父模型要能直接读到 JSON） */
export function renderStructured(value: unknown): string {
  return `结构化结果（已通过 schema 校验）：\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``
}
