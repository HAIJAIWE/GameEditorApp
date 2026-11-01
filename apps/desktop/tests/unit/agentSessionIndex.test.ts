import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { AgentSessionStore } from '../../src/main/agent/session/sessionStore'
import { SessionSearchIndex } from '../../src/main/agent/session/sessionIndex'
import { createSessionSearchSkill } from '../../src/main/agent/skills/sessionSearchSkill'

let dir: string
let store: AgentSessionStore

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'mb-session-index-'))
  store = new AgentSessionStore(dir)
  await store.appendTurn('s1', [
    { role: 'user', content: '设计战斗系统' },
    { role: 'assistant', content: '好的，先定伤害公式' }
  ])
  await store.appendTurn('s1', [
    { role: 'user', content: '再补充技能树' },
    { role: 'assistant', content: '已补充' }
  ])
  await store.appendTurn('s2', [
    { role: 'user', content: '帮我做角色属性表' },
    { role: 'assistant', content: '好的' }
  ])
})

afterEach(() => {
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    // 清理失败不影响断言
  }
})

describe('SessionSearchIndex（#25 SQLite FTS5）', () => {
  it('search 命中并按会话去重', () => {
    const index = new SessionSearchIndex(store)
    const hits = index.search('战斗')
    expect(hits.map((hit) => hit.sessionId)).toEqual(['s1'])
    expect(hits[0]?.title).toContain('战斗')
    index.close()
  })

  it('search 支持多词 OR（技能 / 属性 分别命中两个会话）', () => {
    const index = new SessionSearchIndex(store)
    const ids = index
      .search('技能 属性')
      .map((hit) => hit.sessionId)
      .sort()
    expect(ids).toEqual(['s1', 's2'])
    index.close()
  })

  it('search 排除当前会话', () => {
    const index = new SessionSearchIndex(store)
    expect(index.search('战斗', { excludeSession: 's1' })).toEqual([])
    index.close()
  })

  it('readSession 重建消息（跨轮）', () => {
    const index = new SessionSearchIndex(store)
    const messages = index.readSession('s1')
    const texts = messages.map((message) => message.content)
    expect(texts).toContain('设计战斗系统')
    expect(texts).toContain('再补充技能树')
    index.close()
  })

  it('list 返回全部会话摘要（按最后活跃倒序）', () => {
    const index = new SessionSearchIndex(store)
    expect(index.list().map((summary) => summary.sessionId).sort()).toEqual(['s1', 's2'])
    index.close()
  })
})

describe('createSessionSearchSkill（system.session_search）', () => {
  it('action=search 命中返回会话文本', async () => {
    const skill = createSessionSearchSkill({ sessionStore: store })
    const result = await skill.execute({ action: 'search', query: '战斗' }, {})
    expect(result.success).toBe(true)
    expect(result.message).toContain('s1')
  })

  it('action=search 缺 query → 报错', async () => {
    const skill = createSessionSearchSkill({ sessionStore: store })
    const result = await skill.execute({ action: 'search' }, {})
    expect(result.success).toBe(false)
    expect(result.error).toContain('query')
  })

  it('action=search 无命中 → 成功但提示未找到', async () => {
    const skill = createSessionSearchSkill({ sessionStore: store })
    const result = await skill.execute({ action: 'search', query: '完全不存在的词' }, {})
    expect(result.success).toBe(true)
    expect(result.message).toContain('未找到')
  })

  it('action=read 返回指定会话消息', async () => {
    const skill = createSessionSearchSkill({ sessionStore: store })
    const result = await skill.execute({ action: 'read', session_id: 's1' }, {})
    expect(result.success).toBe(true)
    expect(result.message).toContain('设计战斗系统')
  })

  it('action=read 缺 session_id → 报错', async () => {
    const skill = createSessionSearchSkill({ sessionStore: store })
    const result = await skill.execute({ action: 'read' }, {})
    expect(result.success).toBe(false)
  })

  it('action=list 列出最近会话', async () => {
    const skill = createSessionSearchSkill({ sessionStore: store })
    const result = await skill.execute({ action: 'list' }, {})
    expect(result.success).toBe(true)
    expect(result.message).toContain('s1')
    expect(result.message).toContain('s2')
  })

  it('未知 action → 报错', async () => {
    const skill = createSessionSearchSkill({ sessionStore: store })
    const result = await skill.execute({ action: 'nope' }, {})
    expect(result.success).toBe(false)
  })
})
