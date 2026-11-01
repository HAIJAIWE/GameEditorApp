import { parseLlmJson } from '../object'
import { uniquifyFieldId, validateFieldId, type FieldIdSuggestion } from './fieldId'

/**
 * 字段 ID 的 **AI 候选**（术语表未收录时的第二级兜底）。
 *
 * ## 为什么需要它
 * `fieldId.ts` 的规则层只覆盖术语表内与标签里已有的英文 —— 而真正落到第二级的恰恰是**自造词**
 * （如「斗能」），这类词的正确答案 AI 能给（`combat_energy`），词典反而查不到。
 * 实测 旧版 用 CEDICT 词典处理这个词得到的是 `abbr_surname` 这种垃圾。
 *
 * ## 架构约束（沿用既有先例，不新开通路）
 * UI 触发的 AI 生成在本项目**已有三处先例**（`main/ipc.ts:370/382/407` 的
 * `ceshu:aiGenerateChapter`/`aiGenerateData`/`aiReview`）。因此这里照同一形状做：
 * **提示词构建（纯函数）→ main 侧 `llmClient.generate` → 响应解析（纯函数）**，
 * 本文件只含两个纯函数，可完整单测。
 *
 * 注意：A1-5b 那条「技能内调 LLM 会形成第二条通路，应由 Brain 单通路负责」针对的是 **Agent 技能绕过 Brain**；
 * 本处是**用户在界面上显式点击**触发的辅助生成，与 W30「AI 生成数据表」同性质。
 *
 * ## 铁律：AI 只提案，且提案必须过校验
 * 解析出的每个候选都要过 `validateFieldId`，非法的一律**丢弃**而不是"修一修凑合用"——
 * 与规则层同理：**绝不产出看起来像答案的垃圾**。最终落盘由人点击决定，ID 一旦落盘不可变。
 */

export const FIELD_ID_AI_ERROR_EMPTY_LABEL = '请先填写中文显示名，再让 AI 生成字段 ID。'
export const FIELD_ID_AI_ERROR_NO_CANDIDATE = 'AI 未给出可用的字段 ID 候选，请重试或手动填写。'

/** 最多保留几个 AI 候选（够选就行，避免刷屏） */
export const FIELD_ID_AI_MAX_CANDIDATES = 3

export interface FieldIdAiPrompt {
  system: string
  prompt: string
}

export interface FieldIdAiContext {
  /** 所属数据类型的中文名（给 AI 一点语境） */
  typeName?: string
  /** 控件类型（如 spinbox / combobox） */
  fieldType?: string
}

/** AI 候选的 IPC 响应 */
export interface FieldIdSuggestResult {
  /** 实际使用的模型名（对齐其它 AI 通道的返回形状） */
  model: string
  candidates: FieldIdSuggestion[]
}

/** 构造字段 ID 的 AI 提示词（对齐 `shared/ceshu/data/ceshuDataGen.ts` 的中文提示词风格与区块结构） */
export function buildFieldIdPrompt(
  label: string,
  existingNames: readonly string[],
  context: FieldIdAiContext = {}
): FieldIdAiPrompt {
  const system = [
    '你是资深游戏数据架构师，负责把中文显示名转成英文的字段 ID（标识符）。',
    '你只输出一个合法 JSON 对象，不输出任何解释、注释或代码块标记。'
  ].join('')

  const fieldLines = [`显示名：${label.trim()}`]
  if (context.typeName) fieldLines.push(`所属数据类型：${context.typeName}`)
  if (context.fieldType) fieldLines.push(`控件类型：${context.fieldType}`)

  const taken = existingNames.map((name) => String(name ?? '').trim()).filter((name) => name !== '')
  const takenText = taken.length > 0 ? taken.join(', ') : '（无）'

  const requirements = [
    `1. 给出 ${FIELD_ID_AI_MAX_CANDIDATES} 个候选，按推荐度从高到低排列。`,
    '2. 只输出一个 JSON 对象，键为 candidates，值为字符串数组。',
    '3. 不要输出任何解释文字。'
  ]

  const prompt =
    '请为下列游戏数据字段起英文 ID（要能用作 JSON 键与 Lua 表键的标识符）。\n\n' +
    `[字段]\n${fieldLines.join('\n')}\n\n` +
    `[已有字段名（不得重复）]\n${takenText}\n\n` +
    '[命名规范]\n' +
    '1. 只含小写字母、数字与下划线，且不能以数字开头。\n' +
    '2. 采用 snake_case 风格。\n' +
    '3. 语义优先：给出能让人看懂含义的英文词（如「斗能」→ combat_energy），不要用拼音拼写。\n' +
    '4. 不得与上面的「已有字段名」重复。\n\n' +
    `[要求]\n${requirements.join('\n')}\n` +
    '输出格式示例：{"candidates": ["combat_energy", "fight_energy", "energy"]}'

  return { system, prompt }
}

/** 单个候选的清洗：小写化、把非字母数字下划线的连续字符并成下划线、去首尾下划线 */
function normalizeCandidate(raw: unknown): string {
  // 只接受字符串：`String({})` 会得到 '[object Object]' 进而产出 'object_object' 这种垃圾
  if (typeof raw !== 'string') return ''
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/**
 * 从 LLM 返回文本中提取候选字段 ID。
 *
 * 容错（对齐本项目 `parseLlmJson` 的容错取向）：
 * - 优先取 `candidates` 键；缺失时退而取**任意一个数组值的键**（模型偶尔换个键名）
 * - 对象解析不出来时，尝试把首个 `[...]` 片段当作裸数组解析
 *
 * **清洗后仍不合法的一律丢弃**（如以数字开头、非字符串项），不做"修补成合法"的处理 —— 那是发明而非解析。
 *
 * 重名分两种，处理不同：
 * - 与**既有字段名**冲突 → 用 `uniquifyFieldId` 加后缀（AI 可能没看到全部已有字段名，直接丢太浪费）
 * - 与**本次响应里前面的候选**重复 → 视为重复项**丢弃**（换个说法等同一个人，不该变成 `_2`）
 */
export function parseFieldIdCandidates(
  content: string,
  existingNames: readonly string[] = []
): FieldIdSuggestion[] {
  const items = extractCandidateList(content)
  const existing = [...existingNames]
  const accepted = new Set<string>(existingNames.map((name) => String(name ?? '').trim()))
  const suggestions: FieldIdSuggestion[] = []

  for (const item of items) {
    const normalized = normalizeCandidate(item)
    if (normalized === '') continue
    if (!validateFieldId(normalized).ok) continue

    if (accepted.has(normalized)) {
      // 与本次响应里前面的候选重复 → 丢弃
      if (!existing.includes(normalized)) continue
      // 与既有字段名冲突 → 加后缀
      const { id, renamedFrom } = uniquifyFieldId(normalized, [...accepted])
      if (!validateFieldId(id).ok) continue
      accepted.add(id)
      suggestions.push({ id, source: 'ai', skipped: [], renamedFrom })
    } else {
      accepted.add(normalized)
      suggestions.push({ id: normalized, source: 'ai', skipped: [], renamedFrom: null })
    }
    if (suggestions.length >= FIELD_ID_AI_MAX_CANDIDATES) break
  }

  return suggestions
}

/** 取出候选原始值列表（多重容错） */
function extractCandidateList(content: string): unknown[] {
  const parsed = parseLlmJson(content)
  const direct = parsed['candidates']
  if (Array.isArray(direct)) return direct

  for (const value of Object.values(parsed)) {
    if (Array.isArray(value)) return value
  }

  // 裸数组兜底：模型只回了一个 `["a","b"]`
  const start = content.indexOf('[')
  const end = content.lastIndexOf(']')
  if (start >= 0 && end > start) {
    try {
      const value: unknown = JSON.parse(content.slice(start, end + 1))
      if (Array.isArray(value)) return value
    } catch {
      return []
    }
  }
  return []
}
