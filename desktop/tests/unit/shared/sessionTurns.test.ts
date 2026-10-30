import { describe, expect, it } from 'vitest'

import { groupSessionTurns, type SessionTurnSummary } from '../../../src/shared/agent/conversation/session'

const turn = (
  sessionId: string,
  timestamp: number,
  messages: Array<Record<string, unknown>>
): Record<string, unknown> => ({ type: 'turn', timestamp, sessionId, messages })

const userMsg = (content: string): Record<string, unknown> => ({ role: 'user', content })
const assistantMsg = (content: string): Record<string, unknown> => ({ role: 'assistant', content })

describe('groupSessionTurns（#25 会话历史聚合）', () => {
  it('空日志 → 空列表', () => {
    expect(groupSessionTurns([])).toEqual([])
    expect(groupSessionTurns(undefined as unknown as Record<string, unknown>[])).toEqual([])
  })

  it('单会话单轮：取首条 user 消息作标题，统计消息数与轮次', () => {
    const entries = [turn('s1', 1000, [userMsg('帮我设计战斗系统'), assistantMsg('好的')])]
    const result = groupSessionTurns(entries)
    expect(result).toHaveLength(1)
    const s = result[0] as SessionTurnSummary
    expect(s.sessionId).toBe('s1')
    expect(s.title).toBe('帮我设计战斗系统')
    expect(s.firstMessage).toBe('帮我设计战斗系统')
    expect(s.messageCount).toBe(2)
    expect(s.turnCount).toBe(1)
    expect(s.lastActivity).toBe(1000)
  })

  it('标题超长截断到 60 字符；无 user 消息回落「(空会话)」', () => {
    const longContent = 'x'.repeat(120)
    const entries = [turn('s1', 1000, [userMsg(longContent)])]
    const result = groupSessionTurns(entries)
    expect((result[0] as SessionTurnSummary).title).toBe('x'.repeat(60))
    expect((result[0] as SessionTurnSummary).firstMessage).toBe(longContent)

    const noUser = [turn('s2', 1000, [assistantMsg('我先说点啥')])]
    expect((groupSessionTurns(noUser)[0] as SessionTurnSummary).title).toBe('(空会话)')
  })

  it('多轮同一会话：消息数累加、轮次数累加、lastActivity 取最大', () => {
    const entries = [
      turn('s1', 1000, [userMsg('第一轮'), assistantMsg('a')]),
      turn('s1', 3000, [userMsg('第二轮'), assistantMsg('b'), assistantMsg('c')]),
      turn('s1', 2000, [userMsg('第三轮')])
    ]
    const result = groupSessionTurns(entries)
    expect(result).toHaveLength(1)
    const s = result[0] as SessionTurnSummary
    expect(s.messageCount).toBe(6)
    expect(s.turnCount).toBe(3)
    expect(s.lastActivity).toBe(3000)
  })

  it('多会话按 lastActivity 倒序排列', () => {
    const entries = [
      turn('old', 1000, [userMsg('早的')]),
      turn('new', 5000, [userMsg('新的')]),
      turn('mid', 3000, [userMsg('中间的')])
    ]
    const order = groupSessionTurns(entries).map((s) => s.sessionId)
    expect(order).toEqual(['new', 'mid', 'old'])
  })

  it('query 大小写不敏感、匹配标题或首消息', () => {
    const entries = [
      turn('a', 5000, [userMsg('设计战斗系统'), assistantMsg('x')]),
      turn('b', 4000, [userMsg('let us chat about design'), assistantMsg('y')])
    ]
    expect(groupSessionTurns(entries, '战斗').map((s) => s.sessionId)).toEqual(['a'])
    expect(groupSessionTurns(entries, 'CHAT').map((s) => s.sessionId)).toEqual(['b'])
    // 空 query ⇒ 不过滤
    expect(groupSessionTurns(entries, '   ').map((s) => s.sessionId)).toEqual(['a', 'b'])
    // 无匹配 ⇒ 空
    expect(groupSessionTurns(entries, '不存在的关键词')).toEqual([])
  })

  it('忽略无 sessionId 的坏行，不污染聚合', () => {
    const entries = [
      turn('s1', 1000, [userMsg('正常会话')]),
      { type: 'turn', timestamp: 9999, messages: [userMsg('野行')] } // 无 sessionId
    ]
    const result = groupSessionTurns(entries as Record<string, unknown>[])
    expect(result).toHaveLength(1)
    expect((result[0] as SessionTurnSummary).sessionId).toBe('s1')
  })
})
