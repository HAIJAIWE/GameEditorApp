import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { setLogSink, log } from '../../src/shared/util/logger'
import {
  formatLogLine,
  initLogger,
  needsRotate,
  rotateLogFile
} from '../../src/main/logger'
import type { AppLogInput } from '../../src/shared/types'

const fixedTime = new Date('2026-10-04T12:00:00')

describe('logger：格式化（与 旧版 Formatter 对齐）', () => {
  it('基础字段：时间 - 名 - 级别 - 消息', () => {
    expect(formatLogLine({ level: 'info', message: '启动完成' }, fixedTime)).toBe(
      '2026-10-04 12:00:00 - GameEditorApp - INFO - 启动完成'
    )
  })

  it('级别名映射：warn→WARNING / error→ERROR / debug→DEBUG', () => {
    expect(formatLogLine({ level: 'warn', message: 'x' }, fixedTime)).toContain(' - WARNING - ')
    expect(formatLogLine({ level: 'error', message: 'x' }, fixedTime)).toContain(' - ERROR - ')
    expect(formatLogLine({ level: 'debug', message: 'x' }, fixedTime)).toContain(' - DEBUG - ')
  })

  it('meta 序列化：字符串直接附带，对象 JSON，Error 取 name:message', () => {
    expect(formatLogLine({ level: 'info', message: 'm', meta: 'extra' }, fixedTime)).toBe(
      '2026-10-04 12:00:00 - GameEditorApp - INFO - m | meta: extra'
    )
    expect(formatLogLine({ level: 'info', message: 'm', meta: { a: 1 } }, fixedTime)).toBe(
      '2026-10-04 12:00:00 - GameEditorApp - INFO - m | meta: {"a":1}'
    )
    expect(formatLogLine({ level: 'error', message: 'm', meta: new Error('boom') }, fixedTime)).toContain(
      '| meta: Error: boom'
    )
  })
})

describe('logger：轮转决策与执行', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'logtest-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('needsRotate：文件不存在 → false', () => {
    expect(needsRotate(join(dir, 'app.log'), 100)).toBe(false)
  })

  it('needsRotate：未达上限 → false；达到 → true', () => {
    const f = join(dir, 'app.log')
    write(f, 'x'.repeat(50))
    expect(needsRotate(f, 100)).toBe(false)
    write(f, 'x'.repeat(120))
    expect(needsRotate(f, 100)).toBe(true)
  })

  it('rotateLogFile：主日志→.1，旧 .1→.2，最老备份被删', () => {
    const f = join(dir, 'app.log')
    write(f, 'CURRENT')
    write(`${f}.1`, 'B1')
    write(`${f}.2`, 'B2')
    write(`${f}.3`, 'B3') // backupCount=3 → 应被删
    rotateLogFile(f, 3)
    expect(readFileSync(`${f}.1`, 'utf-8')).toBe('CURRENT')
    expect(readFileSync(`${f}.2`, 'utf-8')).toBe('B1')
    expect(readFileSync(`${f}.3`, 'utf-8')).toBe('B2')
    expect(existsSync(`${f}.4`)).toBe(false)
  })
})

describe('logger：initLogger 写文件', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'logtest-'))
    initLogger(dir, { maxBytes: 200, backupCount: 3, consoleLevel: 'warn', echoConsole: false })
  })
  afterEach(() => {
    setLogSink(null)
    rmSync(dir, { recursive: true, force: true })
  })

  it('info 写入 app.log（含级别与格式）', () => {
    log.info('数据加载完成')
    const content = readFileSync(join(dir, 'app.log'), 'utf-8')
    expect(content).toContain(' - INFO - 数据加载完成')
  })

  it('error 写入且 level 正确', () => {
    log.error('失败', { code: 1 })
    const content = readFileSync(join(dir, 'app.log'), 'utf-8')
    expect(content).toContain(' - ERROR - 失败')
    expect(content).toContain('| meta: {"code":1}')
  })

  it('超过 maxBytes 后触发轮转（旧内容进 .1，主文件继续）', () => {
    for (let i = 0; i < 10; i++) log.info('x'.repeat(40))
    expect(existsSync(join(dir, 'app.log.1'))).toBe(true)
    const main = readFileSync(join(dir, 'app.log'), 'utf-8')
    const backup = readFileSync(join(dir, 'app.log.1'), 'utf-8')
    expect(main.length).toBeGreaterThan(0)
    expect(backup.length).toBeGreaterThan(0)
    expect(main).not.toBe(backup)
  })

  it('sink 未注入时降级 console（不抛错）', () => {
    setLogSink(null)
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    log.info('降级路径')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('logger：渲染层经 IPC 转发（不写文件、不抛错）', () => {
  const mockLog = vi.fn()
  let originalWindow: unknown

  beforeEach(() => {
    originalWindow = (globalThis as Record<string, unknown>).window
    ;(globalThis as Record<string, unknown>).window = {
      mbApi: { app: { log: mockLog } }
    } as unknown
    setLogSink(null) // 确保主进程 sink 不干扰
  })

  afterEach(() => {
    mockLog.mockClear()
    setLogSink(null)
    ;(globalThis as Record<string, unknown>).window = originalWindow
  })

  it('info/warn/error 都转发到 window.mbApi.app.log，且带 level', () => {
    const entries: AppLogInput[] = []
    mockLog.mockImplementation((e: AppLogInput) => {
      entries.push(e)
    })
    log.info('来自渲染层')
    log.warn('警告')
    log.error('错误', { detail: true })
    expect(entries).toHaveLength(3)
    expect(entries[0]).toMatchObject({ level: 'info', message: '来自渲染层' })
    expect(entries[1].level).toBe('warn')
    expect(entries[2]).toMatchObject({ level: 'error', meta: { detail: true } })
  })

  it('桥接异常时降级 console 不抛', () => {
    mockLog.mockImplementation(() => {
      throw new Error('bridge down')
    })
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(() => log.info('兜底')).not.toThrow()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

function write(path: string, content: string): void {
  writeFileSync(path, content, 'utf-8')
}
