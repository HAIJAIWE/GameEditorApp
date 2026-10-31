import { describe, expect, it } from 'vitest'

import {
  LIBRARY_IMAGES_DIRNAME,
  planLibraryImageName,
  toLibraryRelativePath
} from '../../src/shared/util/io'

/** 入库文件名的纯逻辑（不碰 fs） */
describe('planLibraryImageName', () => {
  it('无重名时保留原文件名', () => {
    expect(planLibraryImageName('/tmp/hero.png', [])).toBe('hero.png')
  })

  it('重名加 -2/-3 后缀且保留扩展名', () => {
    expect(planLibraryImageName('/tmp/hero.png', ['hero.png'])).toBe('hero-2.png')
    expect(planLibraryImageName('/tmp/hero.png', ['hero.png', 'hero-2.png'])).toBe('hero-3.png')
  })

  it('重名判定大小写不敏感（Windows 语义）', () => {
    expect(planLibraryImageName('/tmp/HERO.PNG', ['hero.png'])).toBe('HERO-2.PNG')
  })

  it('Windows 反斜杠路径与无扩展名都能取到最后一段', () => {
    expect(planLibraryImageName('C:\\Users\\me\\Desktop\\hero.png', [])).toBe('hero.png')
    expect(planLibraryImageName('/tmp/hero', [])).toBe('hero')
    expect(planLibraryImageName('', [])).toBe('image')
  })

  it('路径末段是目录形态（以斜杠结尾）也退化为 image', () => {
    expect(planLibraryImageName('/tmp/', [])).toBe('image')
  })
})

describe('toLibraryRelativePath', () => {
  const dir = 'D:/app/libraries/初始库/images'

  it('库内文件 → images/xxx.png（正斜杠）', () => {
    expect(toLibraryRelativePath(dir, `${dir}/hero.png`)).toBe(`${LIBRARY_IMAGES_DIRNAME}/hero.png`)
  })

  it('反斜杠输入也归一', () => {
    expect(toLibraryRelativePath('D:\\app\\images', 'D:\\app\\images\\a b.png')).toBe('images/a b.png')
  })

  it('不在图片目录下 → 空串（调用方跳过）', () => {
    expect(toLibraryRelativePath(dir, 'D:/elsewhere/hero.png')).toBe('')
  })

  it('目录本身（不是文件）不算命中', () => {
    expect(toLibraryRelativePath(dir, dir)).toBe('')
  })
})
