import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createLspServerResolver, LSP_CONFIG_FILE } from '@mobai/agent-core/lsp/lspConfig'

let dir = ''

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mb-lspcfg-'))
})

afterEach(async () => {
  if (dir !== '') await rm(dir, { recursive: true, force: true })
})

describe('createLspServerResolver（<库>/lsp.json）', () => {
  it('无配置 → null', () => {
    expect(createLspServerResolver(dir)('/x/a.ts')).toBeNull()
  })

  it('按扩展名解析命令与参数', async () => {
    await writeFile(
      join(dir, LSP_CONFIG_FILE),
      JSON.stringify({ servers: { '.ts': { command: 'typescript-language-server', args: ['--stdio'] } } }),
      'utf8'
    )
    const resolve = createLspServerResolver(dir)
    expect(resolve('/x/a.ts')).toEqual({ command: 'typescript-language-server', args: ['--stdio'] })
  })

  it('未配置的扩展名 → null', async () => {
    await writeFile(join(dir, LSP_CONFIG_FILE), JSON.stringify({ servers: { '.ts': { command: 'x' } } }), 'utf8')
    expect(createLspServerResolver(dir)('/x/a.py')).toBeNull()
  })

  it('命令为空 → null', async () => {
    await writeFile(join(dir, LSP_CONFIG_FILE), JSON.stringify({ servers: { '.ts': { command: '  ' } } }), 'utf8')
    expect(createLspServerResolver(dir)('/x/a.ts')).toBeNull()
  })

  it('坏 JSON → null（不崩）', async () => {
    await writeFile(join(dir, LSP_CONFIG_FILE), '{ not json', 'utf8')
    expect(createLspServerResolver(dir)('/x/a.ts')).toBeNull()
  })
})
