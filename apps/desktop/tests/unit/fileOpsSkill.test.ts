import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createFileOpsSkill } from '@mobai/agent-core/skills/fileOpsSkill'

let root = ''

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'mb-fsops-'))
})

afterEach(async () => {
  if (root !== '') await rm(root, { recursive: true, force: true })
})

type R = { success: boolean; message: string; error?: string; data?: unknown }

function skill(policy?: 'read-only' | 'workspace-write') {
  const s = createFileOpsSkill({ root: () => root, ...(policy ? { policy } : {}) })
  return (params: Record<string, unknown>): Promise<R> => s.execute(params, {}) as Promise<R>
}

describe('system.file_ops（对齐 dsh tool-fs + fs-sandbox）', () => {
  it('write → read 往返', async () => {
    const run = skill()
    expect((await run({ action: 'write', path: 'a.txt', content: 'hello' })).success).toBe(true)
    const read = await run({ action: 'read', path: 'a.txt' })
    expect(read.success).toBe(true)
    expect(read.message).toBe('hello')
  })

  it('write 自动建父目录', async () => {
    const run = skill()
    expect((await run({ action: 'write', path: 'deep/x/y.txt', content: 'v' })).success).toBe(true)
    expect(await readFile(join(root, 'deep', 'x', 'y.txt'), 'utf8')).toBe('v')
  })

  it('list 列目录', async () => {
    const run = skill()
    await run({ action: 'write', path: 'f1.txt', content: 'a' })
    const listed = await run({ action: 'list', path: '.' })
    expect(listed.success).toBe(true)
    expect(listed.message).toContain('f1.txt')
  })

  it('edit 唯一替换；多次出现拒绝', async () => {
    const run = skill()
    await run({ action: 'write', path: 'e.txt', content: 'foo bar' })
    expect((await run({ action: 'edit', path: 'e.txt', old_text: 'bar', new_text: 'baz' })).success).toBe(true)
    expect(await readFile(join(root, 'e.txt'), 'utf8')).toBe('foo baz')

    await run({ action: 'write', path: 'dup.txt', content: 'x x' })
    const dup = await run({ action: 'edit', path: 'dup.txt', old_text: 'x', new_text: 'y' })
    expect(dup.success).toBe(false)
    expect(dup.error).toBe('EAMBIGUOUS')
  })

  it('delete 文件 / 目录需 recursive', async () => {
    const run = skill()
    await run({ action: 'write', path: 'd.txt', content: 'x' })
    expect((await run({ action: 'delete', path: 'd.txt' })).success).toBe(true)

    await run({ action: 'mkdir', path: 'dir/sub' })
    const noRec = await run({ action: 'delete', path: 'dir' })
    expect(noRec.success).toBe(false)
    expect((await run({ action: 'delete', path: 'dir', recursive: true })).success).toBe(true)
  })

  it('copy / move', async () => {
    const run = skill()
    await run({ action: 'write', path: 'src.txt', content: 'S' })
    expect((await run({ action: 'copy', from: 'src.txt', to: 'dst.txt' })).success).toBe(true)
    expect(await readFile(join(root, 'dst.txt'), 'utf8')).toBe('S')
    expect((await run({ action: 'move', from: 'dst.txt', to: 'moved.txt' })).success).toBe(true)
    expect(await readFile(join(root, 'moved.txt'), 'utf8')).toBe('S')
  })

  it('越界写入被围栏拒绝', async () => {
    const run = skill()
    const escaped = await run({ action: 'write', path: '../evil.txt', content: 'x' })
    expect(escaped.success).toBe(false)
    expect(escaped.message).toContain('越界')
  })

  it('read-only 沙箱拒绝一切变更', async () => {
    const run = skill('read-only')
    const write = await run({ action: 'write', path: 'a.txt', content: 'x' })
    expect(write.success).toBe(false)
    expect(write.error).toBe('FS_SANDBOX_DENIED')
  })

  it('未知 action 拒绝', async () => {
    const run = skill()
    expect((await run({ action: 'frob' })).success).toBe(false)
  })
})
