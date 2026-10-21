import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { copyImagesForExport, detectMissingImages } from '../../src/main/exportImagesCopy'
import type { ItemRecord } from '../../src/shared/types'

/**
 * 导出拷图的端到端（真实 fs）：从「字段里的相对路径」到「导出目录旁真的有图」。
 *
 * 这是"游戏能不能读到图"的最后一环 —— 光有相对路径不够，文件必须真的在。
 */

let tempDir: string | null = null

function makeDir(): string {
  tempDir = mkdtempSync(join(tmpdir(), 'mb-export-img-'))
  return tempDir
}

afterEach(() => {
  if (tempDir !== null) {
    rmSync(tempDir, { recursive: true, force: true })
    tempDir = null
  }
})

const record = (id: string, data: Record<string, unknown>): ItemRecord => ({
  id,
  type: 'role',
  data,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
})

describe('copyImagesForExport', () => {
  it('图片落到导出文件旁边的 images/，内容一致', () => {
    const root = makeDir()
    const libDir = join(root, 'lib')
    const imagesDir = join(libDir, 'images')
    mkdirSync(imagesDir, { recursive: true })
    writeFileSync(join(imagesDir, 'hero.png'), 'pic-A')

    const exportDir = join(root, 'out')
    mkdirSync(exportDir, { recursive: true })
    const exportFile = join(exportDir, 'GameData.lua')

    const result = copyImagesForExport([record('r1', { image: 'images/hero.png' })], libDir, exportFile)

    expect(result).toEqual({ copied: 1, missing: [] })
    expect(existsSync(join(exportDir, 'images', 'hero.png'))).toBe(true)
    expect(readFileSync(join(exportDir, 'images', 'hero.png'), 'utf8')).toBe('pic-A')
  })

  it('没有图片字段时不创建 images 目录（不留下空壳）', () => {
    const root = makeDir()
    const exportDir = join(root, 'out')
    mkdirSync(exportDir, { recursive: true })

    const result = copyImagesForExport([record('r1', { name: '无图' })], join(root, 'lib'), join(exportDir, 'GameData.lua'))

    expect(result).toEqual({ copied: 0, missing: [] })
    expect(existsSync(join(exportDir, 'images'))).toBe(false)
  })

  it('引用了但文件不在盘上：记 missing、不阻断（数据已落盘）', () => {
    const root = makeDir()
    const libDir = join(root, 'lib')
    mkdirSync(join(libDir, 'images'), { recursive: true })
    const exportDir = join(root, 'out')
    mkdirSync(exportDir, { recursive: true })

    const result = copyImagesForExport(
      [record('r1', { image: 'images/ghost.png' })],
      libDir,
      join(exportDir, 'GameData.lua')
    )

    expect(result.copied).toBe(0)
    expect(result.missing).toEqual(['images/ghost.png'])
  })

  it('库外绝对路径不拷（不属于这个库）', () => {
    const root = makeDir()
    const outside = join(root, 'elsewhere')
    mkdirSync(outside, { recursive: true })
    writeFileSync(join(outside, 'x.png'), 'nope')

    const exportDir = join(root, 'out')
    mkdirSync(exportDir, { recursive: true })

    const result = copyImagesForExport(
      [record('r1', { image: join(outside, 'x.png') })],
      join(root, 'lib'),
      join(exportDir, 'GameData.lua')
    )

    expect(result).toEqual({ copied: 0, missing: [] })
    expect(existsSync(join(exportDir, 'images'))).toBe(false)
  })

  it('多张图 + 同名去重，一次拷齐', () => {
    const root = makeDir()
    const libDir = join(root, 'lib')
    const imagesDir = join(libDir, 'images')
    mkdirSync(imagesDir, { recursive: true })
    writeFileSync(join(imagesDir, 'a.png'), 'A')
    writeFileSync(join(imagesDir, 'b.png'), 'B')

    const exportDir = join(root, 'out')
    mkdirSync(exportDir, { recursive: true })

    const result = copyImagesForExport(
      [record('r1', { image: 'images/a.png' }), record('r2', { image: 'images/b.png', icon: 'images/a.png' })],
      libDir,
      join(exportDir, 'GameData.lua')
    )

    expect(result.copied).toBe(2)
    expect(readFileSync(join(exportDir, 'images', 'a.png'), 'utf8')).toBe('A')
    expect(readFileSync(join(exportDir, 'images', 'b.png'), 'utf8')).toBe('B')
  })
})

describe('detectMissingImages', () => {
  it('引用的图片都在盘上：返回空', () => {
    const root = makeDir()
    const libDir = join(root, 'lib')
    mkdirSync(join(libDir, 'images'), { recursive: true })
    writeFileSync(join(libDir, 'images', 'hero.png'), 'A')

    expect(detectMissingImages([record('r1', { image: 'images/hero.png' })], libDir)).toEqual([])
  })

  it('引用了但文件不在盘上：返回该相对路径', () => {
    const root = makeDir()
    const libDir = join(root, 'lib')
    mkdirSync(join(libDir, 'images'), { recursive: true })

    expect(detectMissingImages([record('r1', { image: 'images/ghost.png' })], libDir)).toEqual([
      'images/ghost.png'
    ])
  })

  it('多张图里只有缺的那几张入列', () => {
    const root = makeDir()
    const libDir = join(root, 'lib')
    const imagesDir = join(libDir, 'images')
    mkdirSync(imagesDir, { recursive: true })
    writeFileSync(join(imagesDir, 'a.png'), 'A')

    const result = detectMissingImages(
      [record('r1', { image: 'images/a.png' }), record('r2', { icon: 'images/b.png' })],
      libDir
    )
    expect(result).toEqual(['images/b.png'])
  })
})

describe('路径基准必须是库根目录（双段 images/images bug 回归）', () => {
  it('传库根目录能找到图，传 images 目录则全盘落空', () => {
    const root = makeDir()
    const libDir = join(root, 'lib')
    mkdirSync(join(libDir, 'images'), { recursive: true })
    writeFileSync(join(libDir, 'images', 'hero.png'), 'A')

    // 正确口径：传库根 → 找到
    expect(detectMissingImages([record('r1', { image: 'images/hero.png' })], libDir)).toEqual([])
    // 历史错误口径：传 <库>/images → planExportImages 再叠一层 images，
    // 变成 images/images/hero.png（不存在）→ 把「引用得到」误判成「引用不到」
    // 调用方（engineIpc）必须传库根，这个断言锁住契约。
    expect(detectMissingImages([record('r1', { image: 'images/hero.png' })], join(libDir, 'images'))).toEqual([
      'images/hero.png'
    ])

    const exportDir = join(root, 'out')
    mkdirSync(exportDir, { recursive: true })
    const exportFile = join(exportDir, 'GameData.lua')

    // copyImagesForExport 同样要求库根：传库根 → 拷贝成功
    expect(copyImagesForExport([record('r1', { image: 'images/hero.png' })], libDir, exportFile)).toEqual({
      copied: 1,
      missing: []
    })
    // 传错 → 拷贝 0 张、缺失列满
    expect(
      copyImagesForExport([record('r1', { image: 'images/hero.png' })], join(libDir, 'images'), join(root, 'out2', 'GameData.lua'))
    ).toEqual({ copied: 0, missing: ['images/hero.png'] })
  })
})
