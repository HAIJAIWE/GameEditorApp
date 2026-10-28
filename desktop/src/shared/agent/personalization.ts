/**
 * Agent 个性化（对应早期版本的 `core/agent/learner` 的「偏好/反馈」子集）。
 *
 * 范围边界（刻意收敛，防过度开发）：
 * - **做**：从用户反馈评论里提取偏好（`extractPreferences`）+ 把偏好拼成系统提示词片段
 *   （`buildPersonalizedContext`）。这两段是纯函数，可单测，且能接进现有 `buildSystemPrompts`
 *   的 `extraBlocks`（消费点已在 `brainService.ts` 存在）。
 * - **不做**（属原 `learner` 的过度开发部分，且依赖 TS 没有的 `Intent`/`BrainState`）：
 *   动作计数/转移矩阵、「下一步建议」、时间峰值预测、技能模板自动生成；`semantic_memory`
 *   （vectra 的 `AgentMemoryStore` 已覆盖其 add/search）；`brain_reflect`（绑死 Brain 内部状态）。
 *
 * 触发链路：UI 评分 → `agent:feedback` IPC → `FeedbackStore.record`（提取偏好写入 `PreferenceStore`）
 * → 后续 `chat()` 把偏好注入系统提示词。未收到任何反馈时个性化片段为空（与早期版本 Learner
 * 冷启动一致的「空着、随使用变厚」语义）。
 */

/** 单条反馈记录 */
export interface FeedbackRecord {
  rating: number
  comment: string
  timestamp: string
}

/**
 * 反馈评论 → 偏好键值对（对齐早期版本 `Learner._extract_preference_from_feedback` 的关键词映射）。
 * 仅做「显式关键词 → 偏好」，不做 NLP 推断（避免发明语义）。
 */
export const PREFERENCE_KEYWORDS: ReadonlyArray<readonly [string, string, string]> = [
  // [匹配子串(小写), 偏好键, 偏好值]
  ['python', 'language', 'python'],
  ['javascript', 'language', 'javascript'],
  ['typescript', 'language', 'typescript'],
  ['java', 'language', 'java'],
  ['go 语言', 'language', 'go'],
  ['golang', 'language', 'go'],
  ['vscode', 'code_editor', 'vscode'],
  ['vsc', 'code_editor', 'vscode'],
  ['pycharm', 'code_editor', 'pycharm'],
  ['桌面', 'archive_dir', '桌面'],
  ['文档', 'archive_dir', '文档'],
  ['下载', 'archive_dir', '下载']
]

/** 从一条反馈评论里提取偏好（无命中返回空对象） */
export function extractPreferences(comment: string): Record<string, string> {
  const lower = comment.toLowerCase()
  const found: Record<string, string> = {}
  for (const [keyword, key, value] of PREFERENCE_KEYWORDS) {
    if (lower.includes(keyword)) {
      found[key] = value
    }
  }
  return found
}

/** 偏好展示文案（注入系统提示词用） */
const PREFERENCE_LABELS: Readonly<Record<string, string>> = {
  language: '用户偏好的编程语言',
  code_editor: '用户偏好的代码编辑器',
  archive_dir: '用户常用的归档目录'
}

/**
 * 把偏好拼成系统提示词片段。无偏好返回空串（调用方据此跳过注入）。
 * 纯函数，便于单测锁死格式。
 */
export function buildPersonalizedContext(prefs: Record<string, string>): string {
  const keys = Object.keys(prefs).sort()
  if (keys.length === 0) return ''
  const lines = keys.map((key) => {
    const label = PREFERENCE_LABELS[key] ?? key
    return `- ${label}：${prefs[key]}`
  })
  return `## 用户偏好（来自历史反馈，仅供参考，不要强行套用）\n${lines.join('\n')}`
}
