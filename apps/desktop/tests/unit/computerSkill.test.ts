import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  buildClickScript,
  buildScreenshotScript,
  buildTypeScript,
  createComputerSkill,
  escapeSendKeys
} from '@mobai/agent-core/skills/computerSkill'

let dir = ''

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mb-computer-'))
})

afterEach(async () => {
  if (dir !== '') await rm(dir, { recursive: true, force: true })
})

type R = { success: boolean; message: string; error?: string; data?: unknown }

describe('escapeSendKeys', () => {
  it('特殊字符用 {} 包裹', () => {
    expect(escapeSendKeys('a+b')).toBe('a{+}b')
    expect(escapeSendKeys('^%')).toBe('{^}{%}')
    expect(escapeSendKeys('{x}')).toBe('{{}x{}}')
  })
})

describe('脚本构造', () => {
  it('screenshot 含 CopyFromScreen 与目标路径', () => {
    const script = buildScreenshotScript('C:\\tmp\\a.png')
    expect(script).toContain('CopyFromScreen')
    expect(script).toContain('C:\\tmp\\a.png')
  })

  it('click 含坐标', () => {
    expect(buildClickScript(10, 20)).toContain('SetCursorPos(10, 20)')
  })

  it('type 转义特殊字符；raw 不转义', () => {
    expect(buildTypeScript('a+b')).toContain('a{+}b')
    expect(buildTypeScript('^c', true)).toContain("SendWait('^c')")
  })
})

describe('system.computer（注入脚本执行）', () => {
  function make(result: { stdout: string; stderr: string; code: number } = { stdout: 'ok', stderr: '', code: 0 }) {
    const scripts: string[] = []
    const skill = createComputerSkill({
      root: () => dir,
      runScript: async (script) => {
        scripts.push(script)
        return result
      }
    })
    return { scripts, run: (p: Record<string, unknown>): Promise<R> => skill.execute(p, {}) as Promise<R> }
  }

  it('click 执行脚本并返回坐标', async () => {
    const { run, scripts } = make()
    const result = await run({ action: 'click', x: 5, y: 6 })
    expect(result.success).toBe(true)
    expect(result.message).toContain('(5, 6)')
    expect(scripts[0]).toContain('SetCursorPos(5, 6)')
  })

  it('screenshot 返回相对路径', async () => {
    const { run, scripts } = make()
    const result = await run({ action: 'screenshot' })
    expect(result.success).toBe(true)
    expect(result.message).toContain('.mb-shots/')
    expect(scripts[0]).toContain('.mb-shots')
  })

  it('type 空文本 / key 缺 keys / 坏 action', async () => {
    const { run } = make()
    expect((await run({ action: 'type', text: '' })).error).toBe('EBADARG')
    expect((await run({ action: 'key' })).error).toBe('EBADARG')
    expect((await run({ action: 'frob' })).error).toBe('EBADACTION')
  })

  it('脚本失败 → ESCRIPT', async () => {
    const { run } = make({ stdout: '', stderr: 'boom', code: 1 })
    const result = await run({ action: 'click', x: 1, y: 1 })
    expect(result.success).toBe(false)
    expect(result.error).toBe('ESCRIPT')
  })
})
