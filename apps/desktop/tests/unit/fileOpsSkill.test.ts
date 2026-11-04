import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createFileOpsSkill } from '@mobai/agent-core/skills/fileOpsSkill'
import { SKILL_ERRORS } from '@mobai/shared/agent/config'

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

/**
 * 读后写版本闸（对齐 dsh `fs-observation-policy`）。
 *
 * 为什么必须有：`edit` / `write` 是整文件落盘。若用户在编辑器里改过同一文件，
 * agent 的写入会**静默踩掉**用户改动 —— 这是真实的数据丢失，鼠标用户永远看不到。
 */
describe('读后写版本闸', () => {
  it('未读就 edit 被拒绝（提示先 read）', async () => {
    await writeFile(join(root, 'a.txt'), 'hello', 'utf8') // 外部预置，skill 没见过
    const run = skill()
    const edit = await run({ action: 'edit', path: 'a.txt', old_text: 'hello', new_text: 'hi' })
    expect(edit.success).toBe(false)
    expect(edit.error).toBe('not_read')
  })

  it('未读就覆盖已存在文件被拒绝', async () => {
    await writeFile(join(root, 'a.txt'), 'hello', 'utf8')
    const run = skill()
    const write = await run({ action: 'write', path: 'a.txt', content: 'replaced' })
    expect(write.success).toBe(false)
    expect(write.error).toBe('not_read')
  })

  it('read → edit 正常通过（不影响既有用法）', async () => {
    await writeFile(join(root, 'a.txt'), 'hello', 'utf8')
    const run = skill()
    await run({ action: 'read', path: 'a.txt' })
    const edit = await run({ action: 'edit', path: 'a.txt', old_text: 'hello', new_text: 'hi' })
    expect(edit.success).toBe(true)
    expect(await readFile(join(root, 'a.txt'), 'utf8')).toBe('hi')
  })

  it('读完之后文件被外部修改 → 拒绝，提示重新读', async () => {
    await writeFile(join(root, 'a.txt'), 'hello', 'utf8')
    const run = skill()
    await run({ action: 'read', path: 'a.txt' })
    // 模拟用户在编辑器里改了同一文件
    await writeFile(join(root, 'a.txt'), 'changed by user', 'utf8')
    const edit = await run({ action: 'edit', path: 'a.txt', old_text: 'changed', new_text: 'x' })
    expect(edit.success).toBe(false)
    expect(edit.error).toBe('stale_file')
    // 关键：用户的改动没被覆盖
    expect(await readFile(join(root, 'a.txt'), 'utf8')).toBe('changed by user')
  })

  it('write 到新路径不拦（首次落盘），且写入后可用于后续 edit', async () => {
    const run = skill()
    expect((await run({ action: 'write', path: 'new.txt', content: 'a' })).success).toBe(true)
    // 自己写的文件算「已知内容」，可以直接 edit
    const edit = await run({ action: 'edit', path: 'new.txt', old_text: 'a', new_text: 'b' })
    expect(edit.success).toBe(true)
  })
})

/**
 * grep / glob（对齐 dsh `fs/tool-fs-search` 的可用子集）。
 *
 * 守三件事：**能按内容找到东西**、**不扫 node_modules 之类的噪声**、
 * 以及**正则有错时如实报错**（而不是静默返回空结果让 agent 以为文件里没有）。
 */
describe('grep / glob 检索', () => {
  it('grep 命中「路径:行号」，默认不区分大小写', async () => {
    const run = skill()
    await run({ action: 'write', path: 'src/a.ts', content: 'const Foo = 1\nconst bar = 2' })
    await run({ action: 'write', path: 'src/b.ts', content: '// foo 在注释里' })

    const hit = await run({ action: 'grep', pattern: 'foo' })
    expect(hit.success).toBe(true)
    expect(hit.message).toContain('src/a.ts:1')
    expect(hit.message).toContain('src/b.ts:1')
  })

  it('grep 不扫 node_modules（否则结果会被依赖淹没）', async () => {
    const run = skill()
    await run({ action: 'write', path: 'node_modules/x/index.js', content: 'TARGET' })
    await run({ action: 'write', path: 'src/ok.ts', content: 'TARGET' })

    const hit = await run({ action: 'grep', pattern: 'TARGET' })
    expect(hit.message).toContain('src/ok.ts')
    expect(hit.message).not.toContain('node_modules')
  })

  it('grep 正则非法时如实报错（不静默返回空）', async () => {
    const run = skill()
    const hit = await run({ action: 'grep', pattern: '([' })
    expect(hit.success).toBe(false)
    expect(hit.error).toBe(SKILL_ERRORS.BAD_ARG)
  })

  it('glob 的 ** 跨目录匹配', async () => {
    const run = skill()
    await run({ action: 'write', path: 'a.ts', content: '' })
    await run({ action: 'write', path: 'deep/b.ts', content: '' })
    await run({ action: 'write', path: 'c.md', content: '' })

    const found = await run({ action: 'glob', pattern: '**/*.ts' })
    expect(found.message).toContain('a.ts')
    expect(found.message).toContain('deep/b.ts')
    expect(found.message).not.toContain('c.md')
  })

  it('glob 的单段 * 不跨目录', async () => {
    const run = skill()
    await run({ action: 'write', path: 'src/x.ts', content: '' })
    await run({ action: 'write', path: 'src/deep/y.ts', content: '' })

    const found = await run({ action: 'glob', pattern: 'src/*.ts' })
    expect(found.message).toContain('src/x.ts')
    expect(found.message).not.toContain('deep/y.ts')
  })
})
