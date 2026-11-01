import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  buildClickScript,
  buildDragScript,
  buildMoveScript,
  buildScreenInfoScript,
  buildScreenshotScript,
  buildScrollScript,
  buildTypeScript,
  createComputerSkill,
  escapeSendKeys,
  parseScreenInfo
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

  it('move / scroll / drag 的脚本各自带对应常量', () => {
    expect(buildMoveScript(3, 4)).toContain('SetCursorPos(3, 4)')
    expect(buildScrollScript(1, 2, 2)).toContain('0x0800')
    expect(buildDragScript(0, 0, 10, 10, 5)).toContain('$n = 5')
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

  it('move 只移动不点击（悬停用）', async () => {
    const { run, scripts } = make()
    const result = await run({ action: 'move', x: 7, y: 8 })
    expect(result.success).toBe(true)
    expect(scripts[0]).toContain('SetCursorPos(7, 8)')
    // 只断言"没有调用"，不能断言"没有出现"——C# 类声明里本来就有 DllImport 的 mouse_event
    expect(scripts[0]).not.toContain('[MbMouse]::mouse_event')
  })

  it('scroll 用 WHEEL 常量且负数（下滚）原样进脚本', async () => {
    const { run, scripts } = make()
    const result = await run({ action: 'scroll', x: 1, y: 2, delta: -3 })
    expect(result.success).toBe(true)
    expect(result.message).toContain('下')
    expect(scripts[0]).toContain('0x0800')
    expect(scripts[0]).toContain('-3 * 120')
  })

  it('scroll 缺省 3 格；delta=0 拒绝', async () => {
    const { run, scripts } = make()
    expect((await run({ action: 'scroll', x: 1, y: 2 })).success).toBe(true)
    expect(scripts[0]).toContain('3 * 120')
    expect((await run({ action: 'scroll', x: 1, y: 2, delta: 0 })).error).toBe('EBADARG')
  })

  it('scroll 的 delta 被夹到 ±50（防一次滚到底）', async () => {
    const { run, scripts } = make()
    await run({ action: 'scroll', x: 0, y: 0, delta: 999 })
    expect(scripts[0]).toContain('50 * 120')
  })

  it('drag 是按下→插值移动→松开（瞬移不会触发拖放）', async () => {
    const { run, scripts } = make()
    const result = await run({ action: 'drag', from_x: 1, from_y: 2, to_x: 30, to_y: 40, steps: 6 })
    expect(result.success).toBe(true)
    expect(scripts[0]).toContain('0x02')
    expect(scripts[0]).toContain('0x04')
    expect(scripts[0]).toContain('$n = 6')
    expect(scripts[0]).toContain('for ($i = 1; $i -le $n; $i++)')
  })

  it('drag 缺坐标 → EBADARG；steps 被夹到 [2,40]', async () => {
    const { run, scripts } = make()
    expect((await run({ action: 'drag', from_x: 1, from_y: 2, to_x: 3 })).error).toBe('EBADARG')
    await run({ action: 'drag', from_x: 0, from_y: 0, to_x: 1, to_y: 1, steps: 999 })
    expect(scripts[0]).toContain('$n = 40')
  })

  it('screen 解析 JSON 并把显示器列表放进 data（多屏坐标要靠它）', async () => {
    const payload = JSON.stringify({
      virtual: { x: -1920, y: 0, width: 3840, height: 1080 },
      monitors: [
        { device: '\\\\.\\DISPLAY1', primary: true, x: 0, y: 0, width: 1920, height: 1080 },
        { device: '\\\\.\\DISPLAY2', primary: false, x: -1920, y: 0, width: 1920, height: 1080 }
      ]
    })
    const { run } = make({ stdout: payload, stderr: '', code: 0 })
    const result = await run({ action: 'screen' })
    expect(result.success).toBe(true)
    expect(result.message).toContain('3840×1080')
    expect(result.message).toContain('2 块显示器')
    expect((result.data as { monitors: unknown[] }).monitors).toHaveLength(2)
  })

  it('screen 输出不是 JSON → ESCRIPT（不静默当成功）', async () => {
    const { run } = make({ stdout: 'not json', stderr: '', code: 0 })
    expect((await run({ action: 'screen' })).error).toBe('ESCRIPT')
  })
})

describe('parseScreenInfo', () => {
  it('缺 virtual 或字段类型不对 → null', () => {
    expect(parseScreenInfo('')).toBeNull()
    expect(parseScreenInfo('{}')).toBeNull()
    expect(parseScreenInfo('{"virtual":{"x":"a","width":1}}')).toBeNull()
  })

  it('monitors 非数组时退化为空列表（不整体失败）', () => {
    const info = parseScreenInfo('{"virtual":{"x":0,"y":0,"width":100,"height":50},"monitors":"x"}')
    expect(info?.virtual.width).toBe(100)
    expect(info?.monitors).toEqual([])
  })
})

describe('screen 脚本', () => {
  it('取 VirtualScreen 与 AllScreens 并输出 JSON', () => {
    const script = buildScreenInfoScript()
    expect(script).toContain('SystemInformation]::VirtualScreen')
    expect(script).toContain('AllScreens')
    expect(script).toContain('ConvertTo-Json')
  })
})
