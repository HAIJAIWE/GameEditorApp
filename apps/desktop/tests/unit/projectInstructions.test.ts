import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  buildProjectInstructionsBlock,
  MAX_PROJECT_INSTRUCTIONS_CHARS,
  PROJECT_INSTRUCTIONS_FILE,
  readProjectInstructions
} from '@mobai/agent-core/agentService/projectInstructions'

let dir = ''

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mb-agents-'))
})

afterEach(async () => {
  if (dir !== '') await rm(dir, { recursive: true, force: true })
})

describe('readProjectInstructions（对齐 dsh agent-instructions）', () => {
  it('文件不存在 → null', async () => {
    expect(await readProjectInstructions(dir)).toBeNull()
  })

  it('空白文件 → null（不注入空块）', async () => {
    await writeFile(join(dir, PROJECT_INSTRUCTIONS_FILE), '   \n\t\n', 'utf8')
    expect(await readProjectInstructions(dir)).toBeNull()
  })

  it('正常内容去首尾空白后返回', async () => {
    await writeFile(join(dir, PROJECT_INSTRUCTIONS_FILE), '\n  本作用语用「职业」。  \n', 'utf8')
    expect(await readProjectInstructions(dir)).toBe('本作用语用「职业」。')
  })

  it('超长按上限截断', async () => {
    await writeFile(join(dir, PROJECT_INSTRUCTIONS_FILE), 'a'.repeat(MAX_PROJECT_INSTRUCTIONS_CHARS + 100), 'utf8')
    const content = await readProjectInstructions(dir)
    expect(content).not.toBeNull()
    expect(content?.length).toBe(MAX_PROJECT_INSTRUCTIONS_CHARS)
  })
})

describe('buildProjectInstructionsBlock', () => {
  it('标题点明来源并保留内容', () => {
    const block = buildProjectInstructionsBlock('数值用整数')
    expect(block).toContain('AGENTS.md')
    expect(block).toContain('必须遵守')
    expect(block).toContain('数值用整数')
  })
})
