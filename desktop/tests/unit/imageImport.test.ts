import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { importImageIntoLibrary, ensureLibraryImagesDir } from '../../src/main/imageImport'
import { resolveImagePath } from '../../src/shared/util/cleanupImages'

/**
 * 图片入库的真实 fs 行为（`importImageIntoLibrary`）。
 *
 * 关键锁两件事：
 * 1. **字段值变成库相对路径**，且库内真的有那份文件（不是只记路径）；
 * 2. 已在库里的图片**不再复制** —— 否则每选一次同一条目就多出一份副本。
 */

let tempDir: string | null = null

function makeDir(): string {
  tempDir = mkdtempSync(join(tmpdir(), 'mb-img-import-'))
  return tempDir
}

afterEach(() => {
  if (tempDir !== null) {
    rmSync(tempDir, { recursive: true, force: true })
    tempDir = null
  }
})

/** 造一张假 PNG（内容无所谓，只要是文件） */
function writeFakeImage(path: string, content = '\x89PNG-fake'): void {
  writeFileSync(path, content)
}

describe('importImageIntoLibrary', () => {
  it('复制进库 images/ 并返回相对路径', () => {
    const root = makeDir()
    const source = join(root, 'desktop-hero.png')
    writeFakeImage(source, 'pic-A')

    const result = importImageIntoLibrary(source, root)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.relativePath).toBe('images/desktop-hero.png')
    expect(result.copied).toBe(true)
    // 库里真的有一份内容相同的文件
    expect(existsSync(join(root, 'images', 'desktop-hero.png'))).toBe(true)
    expect(readFileSync(join(root, 'images', 'desktop-hero.png'), 'utf8')).toBe('pic-A')
    // 原文件不动
    expect(existsSync(source)).toBe(true)
  })

  it('重名不覆盖，落成 -2', () => {
    const root = makeDir()
    const source = join(root, 'hero.png')
    writeFakeImage(source, 'new')

    const first = importImageIntoLibrary(source, root)
    writeFakeImage(source, 'newer') // 同名但内容不同

    const second = importImageIntoLibrary(source, root)

    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    expect(first.relativePath).toBe('images/hero.png')
    expect(second.relativePath).toBe('images/hero-2.png')
    expect(readFileSync(join(root, 'images', 'hero.png'), 'utf8')).toBe('new')
    expect(readFileSync(join(root, 'images', 'hero-2.png'), 'utf8')).toBe('newer')
  })

  it('源文件已在库内：不复制，直接算相对路径', () => {
    const root = makeDir()
    const source = join(root, 'a.png')
    writeFakeImage(source, 'original')
    const inLib = importImageIntoLibrary(source, root)
    expect(inLib.ok).toBe(true)
    if (!inLib.ok) return

    const again = importImageIntoLibrary(join(root, 'images', 'a.png'), root)

    expect(again.ok).toBe(true)
    if (!again.ok) return
    expect(again.copied).toBe(false)
    expect(again.relativePath).toBe('images/a.png')
    // 没有被复制出一份 a-2.png
    expect(existsSync(join(root, 'images', 'a-2.png'))).toBe(false)
  })

  it('源文件不存在：ok=false 且中文原因（不静默）', () => {
    const root = makeDir()
    const result = importImageIntoLibrary(join(root, 'ghost.png'), root)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('不存在')
  })

  it('入库后的相对路径能被 resolveImagePath 解回库内文件（未用清理用的就是它）', () => {
    const root = makeDir()
    const source = join(root, 'hero.png')
    writeFakeImage(source)

    const result = importImageIntoLibrary(source, root)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const resolved = resolveImagePath(result.relativePath, root)
    expect(resolved.toLowerCase()).toBe(join(root, 'images', 'hero.png').replace(/\\/g, '/').toLowerCase())
    expect(existsSync(resolved)).toBe(true)
  })
})

describe('ensureLibraryImagesDir', () => {
  it('目录不存在则创建，已存在则原样返回', () => {
    const root = makeDir()
    const created = ensureLibraryImagesDir(root)
    expect(existsSync(created)).toBe(true)
    expect(created.replace(/\\/g, '/').endsWith('/images')).toBe(true)
    // 二次调用不抛
    expect(ensureLibraryImagesDir(root)).toBe(created)
  })
})
