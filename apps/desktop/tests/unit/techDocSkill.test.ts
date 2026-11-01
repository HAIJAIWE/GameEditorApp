import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createTechDocSkill, isSafeDocName } from '@mobai/agent-core/skills/techDocSkill'

let dir = ''

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mb-techdoc-'))
})

afterEach(async () => {
  if (dir !== '') await rm(dir, { recursive: true, force: true })
})

type R = { success: boolean; message: string; error?: string; data?: unknown }

function skill(): (params: Record<string, unknown>) => Promise<R> {
  const s = createTechDocSkill({ root: () => dir })
  return (params) => s.execute(params, {}) as Promise<R>
}

describe('isSafeDocName', () => {
  it('接受普通名，拒绝路径与非法字符', () => {
    expect(isSafeDocName('battle-system')).toBe(true)
    expect(isSafeDocName('战斗系统')).toBe(true)
    expect(isSafeDocName('')).toBe(false)
    expect(isSafeDocName('..')).toBe(false)
    expect(isSafeDocName('../x')).toBe(false)
    expect(isSafeDocName('a/b')).toBe(false)
    expect(isSafeDocName('a:b')).toBe(false)
  })
})

describe('system.tech_doc（技术设计文档）', () => {
  it('outline 返回标准大纲', async () => {
    const result = await skill()({ action: 'outline' })
    expect(result.success).toBe(true)
    expect(result.message).toContain('技术设计文档大纲')
    expect(result.message).toContain('架构总览')
  })

  it('write → read 往返', async () => {
    const run = skill()
    const doc = '# 战斗系统技术设计\n\n## 1. 概述与目标\n...'
    expect((await run({ action: 'write', name: 'battle', content: doc })).success).toBe(true)
    const read = await run({ action: 'read', name: 'battle' })
    expect(read.success).toBe(true)
    expect(read.message).toBe(doc)
  })

  it('list 列出已保存文档', async () => {
    const run = skill()
    await run({ action: 'write', name: 'a', content: '# A' })
    await run({ action: 'write', name: 'b', content: '# B' })
    const list = await run({ action: 'list' })
    expect(list.success).toBe(true)
    expect(list.message).toContain('a')
    expect(list.message).toContain('b')
  })

  it('delete 删除已有文档；不存在 → ENOTFOUND', async () => {
    const run = skill()
    await run({ action: 'write', name: 'gone', content: '# G' })
    expect((await run({ action: 'delete', name: 'gone' })).success).toBe(true)
    const list = await run({ action: 'list' })
    expect(list.message).not.toContain('gone')

    const missing = await run({ action: 'delete', name: 'gone' })
    expect(missing.success).toBe(false)
    expect(missing.error).toBe('ENOTFOUND')
  })

  it('read 不存在 → ENOTFOUND', async () => {
    const result = await skill()({ action: 'read', name: 'nope' })
    expect(result.success).toBe(false)
    expect(result.error).toBe('ENOTFOUND')
  })

  it('write 非法名 → EBADNAME', async () => {
    const result = await skill()({ action: 'write', name: '../evil', content: '# x' })
    expect(result.success).toBe(false)
    expect(result.error).toBe('EBADNAME')
  })

  it('write 空内容 → EBADARG', async () => {
    const result = await skill()({ action: 'write', name: 'ok', content: '   ' })
    expect(result.success).toBe(false)
    expect(result.error).toBe('EBADARG')
  })

  it('未知 action → EBADACTION', async () => {
    const result = await skill()({ action: 'frob' })
    expect(result.success).toBe(false)
    expect(result.error).toBe('EBADACTION')
  })
})
