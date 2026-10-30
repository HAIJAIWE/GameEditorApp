import { describe, expect, it } from 'vitest'

import { planExportImages } from '../../src/shared/util/io/exportImages'
import type { ItemRecord } from '../../src/shared/types'

/**
 * 导出拷图计划（纯函数）。
 *
 * 关键锁三件事：
 * 1. **只收库内文件** —— 存量数据里的库外绝对路径不属于这个库，拷过去是灾难；
 * 2. 去重 + 目标相对路径与字段值严丝合缝（`images/xxx.png`）；
 * 3. 空值/脏值不炸。
 */

/* 传的是**库根目录**，不是 images 目录 —— 见 planExportImages 的口径说明 */
const LIBRARY_DIR = 'D:/app/libraries/初始库'
const IMAGES_DIR = `${LIBRARY_DIR}/images`

const record = (id: string, data: Record<string, unknown>): ItemRecord => ({
  id,
  type: 'role',
  data,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
})

describe('planExportImages', () => {
  it('库内图片 → 待拷清单，相对路径与字段值一致', () => {
    const plan = planExportImages([record('r1', { image: 'images/hero.png' })], LIBRARY_DIR)

    expect(plan.images).toEqual([{ absolutePath: `${IMAGES_DIR}/hero.png`, relativePath: 'images/hero.png' }])
    expect(plan.referencedCount).toBe(1)
  })

  it('库外绝对路径不收（存量数据：文件不属于这个库）', () => {
    const plan = planExportImages(
      [record('r1', { image: 'C:/Users/me/Desktop/hero.png' })],
      LIBRARY_DIR
    )

    expect(plan.images).toEqual([])
  })

  it('多条记录引用同一张图只拷一次', () => {
    const plan = planExportImages(
      [record('r1', { image: 'images/hero.png' }), record('r2', { image: 'images/hero.png' })],
      LIBRARY_DIR
    )

    expect(plan.images).toHaveLength(1)
  })

  it('四个图片字段名都认（image/icon/avatar/img，与未用清理同名单）', () => {
    const plan = planExportImages(
      [record('r1', { image: 'images/a.png', icon: 'images/b.png', avatar: 'images/c.png', img: 'images/d.png' })],
      LIBRARY_DIR
    )

    expect(plan.images.map((item) => item.relativePath)).toEqual([
      'images/a.png',
      'images/b.png',
      'images/c.png',
      'images/d.png'
    ])
  })

  it('空串 / 空白 / 非字符串 / 无 data 都不炸', () => {
    const plan = planExportImages(
      [
        record('r1', { image: '' }),
        record('r2', { image: '   ' }),
        record('r3', { image: 42 }),
        record('r4', {})
      ],
      LIBRARY_DIR
    )

    expect(plan.images).toEqual([])
  })

  it('反斜杠写法也认（Windows 上手打路径）', () => {
    const plan = planExportImages(
      [record('r1', { image: 'images\\sub\\hero.png' })],
      LIBRARY_DIR
    )

    expect(plan.images).toHaveLength(1)
    expect(plan.images[0]?.relativePath).toBe('images/sub/hero.png')
  })

  it('images 目录本身（不是文件）跳过', () => {
    const plan = planExportImages([record('r1', { image: 'images' })], LIBRARY_DIR)
    expect(plan.images).toEqual([])
  })

  /*
   * 回归用例（本轮真实抓到）：拿 images 目录（而不是库根）当基准会把
   * `images/hero.png` 解成 `<库>/images/images/hero.png` —— 文件不存在 ⇒
   * 引用判定失败 ⇒ 未用清理会把用户正在用的图删掉。
   * 这条用例只锁"库根基准"这一个口径。
   */
  it('相对路径按**库根**解析，不会拼出 images/images 这种双段路径', () => {
    const plan = planExportImages([record('r1', { image: 'images/hero.png' })], LIBRARY_DIR)

    expect(plan.images).toHaveLength(1)
    expect(plan.images[0]?.relativePath).toBe('images/hero.png')
    expect(plan.images[0]?.absolutePath).toBe('D:/app/libraries/初始库/images/hero.png')
    expect(plan.images[0]?.absolutePath).not.toContain('images/images')
  })
})
