import { describe, expect, it } from 'vitest'

import { buildSshArgs, createSshSkill } from '../../src/main/agent/skills/sshSkill'

type R = { success: boolean; message: string; error?: string }

function run(params: Record<string, unknown>): Promise<R> {
  const skill = createSshSkill()
  return skill.execute(params, {}) as Promise<R>
}

describe('buildSshArgs（纯函数）', () => {
  it('默认加 BatchMode 与 ConnectTimeout', () => {
    expect(buildSshArgs({ target: 'u@h', command: 'ls' })).toEqual([
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=10',
      'u@h',
      'ls'
    ])
  })

  it('端口与私钥追加在目标之前', () => {
    expect(buildSshArgs({ target: 'u@h', command: 'ls', port: 2222, identityFile: '/k/id' })).toEqual([
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=10',
      '-p',
      '2222',
      '-i',
      '/k/id',
      'u@h',
      'ls'
    ])
  })

  it('自定义 ConnectTimeout', () => {
    expect(buildSshArgs({ target: 'h', command: 'x', connectTimeout: 30 })).toContain('ConnectTimeout=30')
  })
})

describe('system.ssh 参数校验（不真连）', () => {
  it('缺 target → EBADARG', async () => {
    const result = await run({ action: 'run', command: 'ls' })
    expect(result.success).toBe(false)
    expect(result.error).toBe('EBADARG')
  })

  it('缺 command → EBADARG', async () => {
    const result = await run({ action: 'run', target: 'u@h' })
    expect(result.success).toBe(false)
    expect(result.error).toBe('EBADARG')
  })

  it('未知 action → EBADACTION', async () => {
    const result = await run({ action: 'frob', target: 'u@h', command: 'ls' })
    expect(result.success).toBe(false)
    expect(result.error).toBe('EBADACTION')
  })
})
