import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { AgentMemoryStore } from '@mobai/agent-core/store/memoryStore'
import { MEMORY_DIMS, embedText } from '@mobai/shared/agent/conversation'

function makeDir(): string {
  return mkdtempSync(join(tmpdir(), 'mb-agent-memory-'))
}

const DOCS = ['火球术 范围伤害 技能', '刺客 敏捷 暴击 技能', '金币 商店 经济 系统']

describe('embedText：确定性 n-gram 哈希嵌入', () => {
  it('维度固定且 L2 归一化', () => {
    const vector = embedText('火球术 范围伤害')
    expect(MEMORY_DIMS).toBe(32)
    expect(vector).toHaveLength(MEMORY_DIMS)
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
    expect(norm).toBeCloseTo(1, 6)
  })

  it('确定性：同一文本两次嵌入完全一致（可锁死检索断言）', () => {
    expect(embedText('火球术 范围伤害')).toEqual(embedText('火球术 范围伤害'))
  })

  it('大小写归一；不同文本产生不同向量', () => {
    expect(embedText('FireBall')).toEqual(embedText('fireball'))
    expect(embedText('火球术')).not.toEqual(embedText('金币商店'))
  })

  it('支持自定义维度', () => {
    expect(embedText('abc', 8)).toHaveLength(8)
  })
})

describe('AgentMemoryStore：语义检索', () => {
  it('写入后按相似度检索命中（近义文本排在首位）', async () => {
    const store = new AgentMemoryStore(makeDir())
    for (const text of DOCS) {
      await store.add(text)
    }
    expect(await store.count()).toBe(3)

    const hit = await store.search('火球术 伤害 技能', 3)
    expect(hit).toHaveLength(3)
    expect(hit[0]?.text).toBe(DOCS[0])
    expect(hit[0]?.id).toBeTruthy()
    expect(hit[0]?.score).toBeGreaterThan(0)
  })

  it('未命中：无关查询的首条得分显著低于命中查询', async () => {
    const store = new AgentMemoryStore(makeDir())
    for (const text of DOCS) {
      await store.add(text)
    }
    const hit = await store.search('火球术 伤害 技能', 1)
    const miss = await store.search('完全无关的星际飞船曲率引擎', 1)
    expect((miss[0]?.score ?? 0) < (hit[0]?.score ?? 0)).toBe(true)
  })

  it('metadata 可携带业务字段并原样回读', async () => {
    const store = new AgentMemoryStore(makeDir())
    await store.add('角色 法师', { kind: 'note', refId: 'role-1' })
    const [first] = await store.search('角色 法师', 1)
    expect(first?.metadata.kind).toBe('note')
    expect(first?.metadata.refId).toBe('role-1')
    expect(first?.metadata.text).toBe('角色 法师')
  })

  it('持久化：同目录新建 store 仍可检索（vectra 落盘重载）', async () => {
    const dir = makeDir()
    const first = new AgentMemoryStore(dir)
    await first.add('火球术 范围伤害 技能')

    const reloaded = new AgentMemoryStore(dir)
    expect(await reloaded.count()).toBe(1)
    const hits = await reloaded.search('火球术 伤害', 1)
    expect(hits[0]?.text).toBe('火球术 范围伤害 技能')
  })

  it('空索引：count 为 0，search 返回空数组', async () => {
    const store = new AgentMemoryStore(makeDir())
    expect(await store.count()).toBe(0)
    expect(await store.search('任意查询')).toEqual([])
  })

  it('topK 限制返回条数', async () => {
    const store = new AgentMemoryStore(makeDir())
    for (const text of DOCS) {
      await store.add(text)
    }
    expect(await store.search('技能', 2)).toHaveLength(2)
    expect(await store.search('技能', 99)).toHaveLength(3)
  })
})
