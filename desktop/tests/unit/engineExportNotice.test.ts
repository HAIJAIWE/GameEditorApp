import { describe, expect, it } from 'vitest'

import { engineExportNotice } from '../../src/shared/util/engineExportNotice'

/** 导出提示文案（纯函数）：让用户知道图片有没有一起走 */
describe('engineExportNotice', () => {
  const base = { filePath: 'D:/out/GameData.lua', bytes: 1234 }

  it('没有图片相关字段时只报基础信息', () => {
    expect(engineExportNotice(base)).toBe('已导出 D:/out/GameData.lua（1234 字节）')
  })

  it('拷到了图要明说，否则用户不知道旁边多了 images 目录', () => {
    expect(engineExportNotice({ ...base, copiedImages: 3 })).toContain('图片已一起导出（3 张）')
  })

  it('一张都没拷到、也没有缺失：不画蛇添足', () => {
    expect(engineExportNotice({ ...base, copiedImages: 0, missingImages: [] })).toBe(
      '已导出 D:/out/GameData.lua（1234 字节）'
    )
  })

  it('有引用但文件不在盘上：点名数量，不静默', () => {
    const text = engineExportNotice({ ...base, copiedImages: 0, missingImages: ['images/a.png'] })
    expect(text).toContain('⚠️')
    expect(text).toContain('1 张引用的图片没找到')
  })

  it('部分成功：两个数都说清', () => {
    const text = engineExportNotice({ ...base, copiedImages: 2, missingImages: ['images/a.png', 'images/b.png'] })
    expect(text).toContain('已导出 2 张图片')
    expect(text).toContain('另有 2 张没找到')
  })

  it('覆盖前已备份：提示里告知可回滚（导出目标是游戏活文件）', () => {
    const text = engineExportNotice({ ...base, backupPath: 'D:/out/GameData.lua.bak' })
    expect(text).toContain('已备份上一版供回滚')
  })

  it('首次导出无备份：不提回滚', () => {
    const text = engineExportNotice({ ...base, backupPath: undefined })
    expect(text).not.toContain('回滚')
  })

  it('写了热更新清单：提示里带版本号并提示游戏可监听', () => {
    const text = engineExportNotice({ ...base, manifestPath: 'D:/out/GameData.lua.hotreload.json', version: 3 })
    expect(text).toContain('热更新清单')
    expect(text).toContain('v3')
    expect(text).toContain('游戏可监听')
  })
})
