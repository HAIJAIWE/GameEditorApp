/**
 * `system.session_search` 内置技能（#25，对齐 dsh `tool-session-query` 的模型侧检索工具）。
 *
 * 给**智能体**用的只读历史检索：让模型在开始任务前翻一翻「以前做过什么」。
 * 底层是 `SessionSearchIndex`（SQLite FTS5，见 `main/agent/sessionIndex.ts`），数据来自本库 `turns.jsonl`。
 *
 * 动作：
 * - `search`：按关键词（多词空白分隔，OR 语义）检索历史会话 → 会话级命中 + 高亮片段；
 * - `read`：读取指定会话的消息（重建后取最后 N 条）；
 * - `list`：列出最近会话摘要。
 *
 * 授权：索引按库隔离（每个 `<库>/agent` 一份 `AgentSessionStore`），故只可见**本库**会话；
 * `search` 会排除调用方当前会话（对齐 dsh「不返回 caller 自己」）。
 */

import type { SkillProtocol, SkillResult } from '../../../shared/agent/config'
import type { AgentSessionStore } from '../session/sessionStore'
import { SessionSearchIndex } from '../session/sessionIndex'

const ACTIONS = ['search', 'read', 'list'] as const

export function createSessionSearchSkill(deps: { sessionStore: AgentSessionStore }): SkillProtocol {
  const index = new SessionSearchIndex(deps.sessionStore)

  return {
    id: 'system.session_search',
    description:
      '检索本库历史会话（SQLite FTS5 全文索引，只读）。action=search 按关键词搜索；action=read 读取指定会话消息；action=list 列出最近会话。开始任务前可用它回顾以往做过的工作。',
    version: '0.1.0',
    parameters: [
      {
        name: 'action',
        type: 'string',
        description: '动作：search（搜索）/ read（读取会话）/ list（列出最近会话）',
        required: true,
        enum: [...ACTIONS]
      },
      { name: 'query', type: 'string', description: 'search 的检索词（可多词，空白分隔，OR 语义）', required: false },
      { name: 'session_id', type: 'string', description: 'read 的目标会话 id（search/list 结果里带）', required: false },
      { name: 'limit', type: 'integer', description: '返回条数上限（默认 20，最大 200）', required: false, minimum: 1, maximum: 200 }
    ],
    async execute(params, ctx): Promise<SkillResult> {
      const action = typeof params.action === 'string' ? params.action.trim() : ''

      if (action === 'search') {
        const query = typeof params.query === 'string' ? params.query : ''
        if (query.trim() === '') return { success: false, error: 'search 需要 query 参数', message: '' }
        const hits = index.search(query, {
          excludeSession: ctx.sessionId,
          limit: typeof params.limit === 'number' ? params.limit : undefined
        })
        if (hits.length === 0) {
          return { success: true, message: `未找到匹配「${query}」的历史会话`, data: { hits: [] } }
        }
        const lines = hits.map(
          (hit, i) => `${i + 1}. [${hit.sessionId}] ${hit.title}（${hit.messageCount} 条）\n   ${hit.snippet}`
        )
        return { success: true, message: `找到 ${hits.length} 个相关会话：\n${lines.join('\n')}`, data: { hits } }
      }

      if (action === 'read') {
        const sessionId = typeof params.session_id === 'string' ? params.session_id : ''
        if (sessionId === '') return { success: false, error: 'read 需要 session_id 参数', message: '' }
        const messages = index.readSession(sessionId, typeof params.limit === 'number' ? params.limit : 50)
        if (messages.length === 0) {
          return { success: true, message: `会话 ${sessionId} 无消息或不存在`, data: { messages: [] } }
        }
        const text = messages
          .map((message) => `[${String(message.role)}] ${typeof message.content === 'string' ? message.content : ''}`)
          .join('\n')
        return { success: true, message: `会话 ${sessionId}（${messages.length} 条）：\n${text}`, data: { messages } }
      }

      if (action === 'list') {
        const sessions = index.list().slice(0, typeof params.limit === 'number' ? params.limit : 20)
        if (sessions.length === 0) {
          return { success: true, message: '本库暂无历史会话', data: { sessions: [] } }
        }
        const lines = sessions.map(
          (s, i) => `${i + 1}. [${s.sessionId}] ${s.title}（${s.messageCount} 条 / ${s.turnCount} 轮）`
        )
        return { success: true, message: `最近 ${sessions.length} 个会话：\n${lines.join('\n')}`, data: { sessions } }
      }

      return {
        success: false,
        error: `未知 action: ${action || '(空)'}（支持 ${ACTIONS.join(' / ')}）`,
        message: ''
      }
    }
  }
}
