/**
 * 项目约定文件（对齐 dsh `context/agent-instructions` 的 AGENTS.md 机制，取最小子集）。
 *
 * dsh 会从项目根到工作目录逐级发现 `AGENTS.md`/`CLAUDE.md` 并拼成指令链，带字节预算与
 * 去重、增量刷新。我们产品是「一库一目录」，故简化为：读**库级** `<库>/AGENTS.md`，
 * 非空则作为一段常驻系统提示词注入（有界截断）。用户直接编辑该文件即可设定
 * 本作约定（术语、数值规范、必须遵守的规则），智能体每轮都遵守。
 *
 * 为什么不复用偏好/记忆：偏好是「从反馈里学到的」，记忆是「历史事实检索」；
 * 本文件是**用户显式手写的强约定**，语义不同、必须常驻、优先级更高。
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/** 约定文件名（库根目录下） */
export const PROJECT_INSTRUCTIONS_FILE = 'AGENTS.md'

/** 注入上限（字符；对齐 dsh 的 maxBytes 取向，取 32K 足够放下常见约定） */
export const MAX_PROJECT_INSTRUCTIONS_CHARS = 32768

/**
 * 读取库级项目约定文件。文件不存在 / 读取失败 / 空白 ⇒ `null`（不注入空块）。
 * 超长按上限截断（提示词预算优先，不因约定文件过长撑爆上下文）。
 */
export async function readProjectInstructions(libDir: string): Promise<string | null> {
  try {
    const raw = await readFile(join(libDir, PROJECT_INSTRUCTIONS_FILE), 'utf8')
    const trimmed = raw.trim()
    if (trimmed === '') return null
    return trimmed.length > MAX_PROJECT_INSTRUCTIONS_CHARS
      ? trimmed.slice(0, MAX_PROJECT_INSTRUCTIONS_CHARS)
      : trimmed
  } catch {
    return null
  }
}

/** 把约定内容包成系统提示词块（标题点明来源与强制性） */
export function buildProjectInstructionsBlock(content: string): string {
  return `## 项目约定（AGENTS.md，用户维护，必须遵守）\n${content}`
}
