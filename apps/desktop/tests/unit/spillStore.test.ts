import { readdirSync } from 'node:fs'
import { mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createSpillWriter } from '@mobai/agent-core/store/spillStore'

const dirs: string[] = []

async function makeDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'mb-spill-test-'))
  dirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

function spillFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.txt'))
    .map((entry) => entry.name)
}

describe('spillStore（头尾保留 + 单文件上限 + 数量/时间双清理）', () => {
  it('返回头 + 省略数 + 尾 + 文件引用，落盘内容完整', async () => {
    const dir = await makeDir()
    const writer = createSpillWriter({ dir, headChars: 20, tailChars: 40 })
    const text = `HEAD:${'A'.repeat(30)}:MIDDLE:${'B'.repeat(200)}:TAIL:${'C'.repeat(30)}`
    const result = writer.write('system.file_ops', text)

    expect(result).toContain('HEAD:')
    expect(result).toContain('TAIL:')
    expect(result).toContain('中间省略')
    expect(result).toContain('.mb-spill/')
    expect(result).toContain('system.file_ops read')

    const [name] = spillFiles(dir)
    expect(name).toBeDefined()
    expect(await readFile(join(dir, name!), 'utf8')).toBe(text)
  })

  it('单文件超上限：落盘截断且提示里明说，不假称完整', async () => {
    const dir = await makeDir()
    const writer = createSpillWriter({ dir, maxFileChars: 100, headChars: 10, tailChars: 10 })
    const text = 'X'.repeat(500)
    const result = writer.write('tool', text)

    expect(result).toContain('落盘内容已截断到前 100 字符')
    expect(result).toContain('原文 500 字符')
    const [name] = spillFiles(dir)
    expect(await readFile(join(dir, name!), 'utf8')).toHaveLength(100)
  })

  it('头尾切点不切断 UTF-16 代理对', async () => {
    const dir = await makeDir()
    const writer = createSpillWriter({ dir, headChars: 3, tailChars: 3 })
    // 头切点正好落在 emoji 的高低代理之间
    const text = `AB😀${'m'.repeat(40)}😀Z`
    const result = writer.write('tool', text)
    // 结果里不该出现孤立代理字符
    expect(result).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u)
  })

  it('超过 maxFiles 时只保留最近若干个', async () => {
    const dir = await makeDir()
    const writer = createSpillWriter({ dir, maxFiles: 3, headChars: 5, tailChars: 5 })
    for (let i = 0; i < 8; i += 1) writer.write('tool', `第 ${i} 条${'x'.repeat(50)}`)
    expect(spillFiles(dir)).toHaveLength(3)
  })

  it('超过 retentionMs 的旧文件被清掉（启动清扫路径）', async () => {
    const dir = await makeDir()
    const old = join(dir, '1000-tool-aaaaaa.txt')
    const fresh = join(dir, '2000-tool-bbbbbb.txt')
    await writeFile(old, 'old')
    await writeFile(fresh, 'fresh')
    const eightDaysAgo = (Date.now() - 8 * 24 * 60 * 60 * 1000) / 1000
    await utimes(old, eightDaysAgo, eightDaysAgo)

    const writer = createSpillWriter({ dir, retentionMs: 7 * 24 * 60 * 60 * 1000 })
    const report = writer.prune()
    expect(report.removed).toBe(1)
    expect(spillFiles(dir)).toEqual(['2000-tool-bbbbbb.txt'])
  })

  it('清扫只认自己的文件形状：不碰无关文件、不递归子目录', async () => {
    const dir = await makeDir()
    await writeFile(join(dir, 'notes.txt'), 'user note')
    await writeFile(join(dir, 'README.md'), 'user doc')
    const writer = createSpillWriter({ dir, maxFiles: 0, headChars: 5, tailChars: 5 })
    writer.write('tool', 'x'.repeat(50))
    writer.prune()
    expect(await readFile(join(dir, 'notes.txt'), 'utf8')).toBe('user note')
    expect(await readFile(join(dir, 'README.md'), 'utf8')).toBe('user doc')
  })

  it('上一代文件名（无随机后缀）也纳入清扫', async () => {
    const dir = await makeDir()
    await writeFile(join(dir, '123456-system.file_ops.txt'), 'legacy')
    const writer = createSpillWriter({ dir, maxFiles: 0 })
    expect(writer.prune().removed).toBe(1)
  })

  it('落盘失败退化为内存头尾截断，不抛错、不假称已落盘', async () => {
    const dir = await makeDir()
    const blocker = join(dir, 'not-a-dir')
    await writeFile(blocker, 'x')
    const warnings: string[] = []
    const writer = createSpillWriter({
      dir: join(blocker, 'child'),
      headChars: 10,
      tailChars: 10,
      warn: (message) => warnings.push(message)
    })
    const result = writer.write('tool', 'H'.repeat(30) + 'M'.repeat(100) + 'T'.repeat(30))
    expect(result).toContain('落盘失败')
    expect(result).toContain('完整内容未保留')
    expect(result).toContain('TTT')
    expect(warnings.length).toBeGreaterThan(0)
  })

  it('dir 为函数时每次写入都取最新工作区（支持运行时切库）', async () => {
    const first = await makeDir()
    const second = await makeDir()
    let current = first
    const writer = createSpillWriter({ dir: () => current, headChars: 5, tailChars: 5 })
    writer.write('tool', 'first'.repeat(20))
    current = second
    writer.write('tool', 'second'.repeat(20))
    expect(spillFiles(first)).toHaveLength(1)
    expect(spillFiles(second)).toHaveLength(1)
  })

  it('目录不存在时写入自动创建；但启动清扫不凭空建目录', async () => {
    const base = await makeDir()
    const nested = join(base, 'nested', 'spill')
    const writer = createSpillWriter({ dir: nested })
    expect(writer.prune()).toEqual({ removed: 0, kept: 0 })
    expect(() => readdirSync(nested)).toThrow()
    writer.write('tool', 'x'.repeat(50))
    expect(spillFiles(nested)).toHaveLength(1)
  })
})
