import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  DEFAULT_CODE_SUBDIR,
  WORKSPACE_FILE,
  defaultWorkspaceRoot,
  getWorkspaceRoot,
  initWorkspace,
  setWorkspaceRoot
} from '@mobai/agent-core/workspace/workspaceStore'

let dir = ''

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mb-ws-'))
})

afterEach(async () => {
  if (dir !== '') await rm(dir, { recursive: true, force: true })
})

describe('workspaceStore（对齐 dsh fs-sandbox cwd）', () => {
  it('init 后默认根为 <库>/code', () => {
    initWorkspace(dir)
    expect(getWorkspaceRoot()).toBe(join(dir, DEFAULT_CODE_SUBDIR))
    expect(defaultWorkspaceRoot()).toBe(join(dir, DEFAULT_CODE_SUBDIR))
  })

  it('set 生效并持久化到 workspace.json', async () => {
    initWorkspace(dir)
    const chosen = join(dir, 'my-project')
    expect(setWorkspaceRoot(chosen)).toBe(chosen)
    expect(getWorkspaceRoot()).toBe(chosen)
    const raw = await readFile(join(dir, WORKSPACE_FILE), 'utf8')
    expect(JSON.parse(raw)).toEqual({ root: chosen })
  })

  it('重新 init 会读回持久化的覆盖', async () => {
    initWorkspace(dir)
    const chosen = join(dir, 'proj2')
    setWorkspaceRoot(chosen)
    initWorkspace(dir) // 模拟切库/重启后重建
    expect(getWorkspaceRoot()).toBe(chosen)
  })

  it('set(null) 重置为默认', () => {
    initWorkspace(dir)
    setWorkspaceRoot(join(dir, 'x'))
    expect(setWorkspaceRoot(null)).toBe(join(dir, DEFAULT_CODE_SUBDIR))
  })
})
