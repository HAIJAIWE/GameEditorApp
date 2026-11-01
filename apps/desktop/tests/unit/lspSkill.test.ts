import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createLspSkill } from '@mobai/agent-core/skills/lspSkill'

const FIXTURE = fileURLToPath(new URL('../fixtures/fakeLspServer.mjs', import.meta.url))

let dir = ''

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mb-lsp-'))
  await writeFile(join(dir, 'a.ts'), 'const x = 1\nexport { x }\n', 'utf8')
})

afterEach(async () => {
  if (dir !== '') await rm(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
})

type R = { success: boolean; message: string; error?: string; data?: unknown }

function skill(resolveServer?: () => { command: string; args: string[] } | null) {
  const s = createLspSkill({
    root: () => dir,
    resolveServer: resolveServer ?? (() => ({ command: process.execPath, args: [FIXTURE] })),
    timeoutMs: 8000
  })
  return (params: Record<string, unknown>): Promise<R> => s.execute(params, {}) as Promise<R>
}

describe('system.lsp（对齐 dsh tool-lsp，假服务器）', () => {
  it('definition 返回位置 path:line:col（1-based）', async () => {
    const run = skill()
    const result = await run({ action: 'definition', path: 'a.ts', line: 1, character: 1 })
    expect(result.success).toBe(true)
    expect(result.message).toContain('a.ts:3:5')
  })

  it('references 返回多处', async () => {
    const run = skill()
    const result = await run({ action: 'references', path: 'a.ts', line: 1, character: 1 })
    expect(result.success).toBe(true)
    expect(result.message).toContain('2 处')
  })

  it('hover 返回文本', async () => {
    const run = skill()
    const result = await run({ action: 'hover', path: 'a.ts', line: 1, character: 1 })
    expect(result.success).toBe(true)
    expect(result.message).toContain('hover text')
  })

  it('implementation 返回位置', async () => {
    const run = skill()
    const result = await run({ action: 'implementation', path: 'a.ts', line: 1, character: 1 })
    expect(result.success).toBe(true)
    expect(result.message).toContain('a.ts:8:2')
  })

  it('未配置服务器 → ENOSERVER', async () => {
    const run = skill(() => null)
    const result = await run({ action: 'definition', path: 'a.ts', line: 1, character: 1 })
    expect(result.success).toBe(false)
    expect(result.error).toBe('ENOSERVER')
  })

  it('非法行列 → EBADARG', async () => {
    const run = skill()
    const result = await run({ action: 'definition', path: 'a.ts', line: 0, character: 1 })
    expect(result.success).toBe(false)
    expect(result.error).toBe('EBADARG')
  })

  it('越界路径 → EESCAPE', async () => {
    const run = skill()
    const result = await run({ action: 'definition', path: '../evil.ts', line: 1, character: 1 })
    expect(result.success).toBe(false)
    expect(result.error).toBe('EESCAPE')
  })
})
