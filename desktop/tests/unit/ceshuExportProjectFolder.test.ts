import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { exportProjectFolder } from '../../src/main/ceshu/export/delivery/projectFolder'
import { createDefaultCeshu } from '../../src/shared/ceshu/model'

/**
 * 导出项目文件夹：落点是 `<所选目录>/<游戏名>/`，不是直接摊在所选目录里。
 * 这条断言的意义：一个游戏一个文件夹 —— 选了个已有内容的目录也不该混进去。
 */
describe('exportProjectFolder', () => {
  it('在所选目录下建同名子目录，产物齐全', () => {
    const target = mkdtempSync(join(tmpdir(), 'mb-export-'))
    const doc = createDefaultCeshu({ scope: 'full', name: '星海计划' })
    doc.meta.positioning = '一句话定位'

    const result = exportProjectFolder(doc, target)

    expect(result.dir).toBe(join(target, '星海计划'))
    expect(existsSync(join(result.dir, 'config.json'))).toBe(true)
    expect(existsSync(join(result.dir, 'design', 'meta.md'))).toBe(true)
    expect(existsSync(join(result.dir, 'tasks', 'programmer.md'))).toBe(true)
    // 没有直接摊在所选目录
    expect(existsSync(join(target, 'config.json'))).toBe(false)
    expect(readFileSync(join(result.dir, 'design', 'meta.md'), 'utf-8')).toContain('一句话定位')
    expect(result.files).toContain('config.json')
  })

  it('导出后能被重新导入还原（导出 → 打开，闭环）', () => {
    const target = mkdtempSync(join(tmpdir(), 'mb-export-'))
    const doc = createDefaultCeshu({ scope: 'full', name: '闭环项目' })
    doc.gameplay.core_loop = '探索→战斗→养成'
    const { dir } = exportProjectFolder(doc, target)

    // 复用与「打开项目文件夹」相同的读取路径
    const files: Record<string, string> = {}
    const read = (relative: string): void => {
      files[relative] = readFileSync(join(dir, relative), 'utf-8')
    }
    read('config.json')
    read('design/gameplay.md')
    expect(files['config.json']).toContain('闭环项目')
    expect(files['design/gameplay.md']).toContain('探索→战斗→养成')
  })
})
