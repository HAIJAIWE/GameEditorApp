/**
 * 纯工具：容错解析 LLM 返回的 JSON（匹平 旧版 `_parse_llm_json`）。
 *
 * 分层归属：`shared/util/` —— 不含任何业务域名词，main / renderer / 任意 domain 均可 import。
 * 收敛自 `ceshu/ceshuAi.ts`：原为策划书 AI 生成模块私有函数，但 `main/agent/qualityJudge`、
 * `main/ipc/ceshuIpc`、`shared/fieldIdAi` 等域外消费方同样需要它 ⇒ 拆出为公共工具，
 * 使 ceshuAi 可整体沉入 domain 层而不拖垮 main 侧依赖。
 *
 * 行为：去 markdown 代码块围栏 → 截取首尾大括号 → 解析失败再去尾逗号重试；失败返回 {}。
 */
import { isPlainObject } from './guards'

export function parseLlmJson(content: string): Record<string, unknown> {
  if (!content) return {}
  let text = content.trim()
  if (text.startsWith('```')) {
    const lines = text.split('\n')
    if (lines[0]?.startsWith('```')) lines.shift()
    if (lines.length > 0 && lines[lines.length - 1]?.startsWith('```')) lines.pop()
    text = lines.join('\n')
  }
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) text = text.slice(start, end + 1)

  const parsed = tryParseObject(text)
  if (parsed) return parsed
  const cleaned = text.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']')
  return tryParseObject(cleaned) ?? {}
}

function tryParseObject(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text)
    return isPlainObject(parsed) ? parsed : null
  } catch {
    return null
  }
}
