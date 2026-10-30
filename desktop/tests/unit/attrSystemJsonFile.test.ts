import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { exportAttrSystemJsonFile, importAttrSystemJsonFile } from '../../src/main/attr/attrSystemJsonFile'
import { createDefaultAttrSystem } from '../../src/shared/ceshu/attrSystem'

function makeDir(): string {
  return mkdtempSync(join(tmpdir(), 'mb-attr-json-'))
}

describe('属性系统 JSON 导入 / 导出（W22）', () => {
  it('导出：旧版 同构平铺结构（formula 为公式文本）、原子写、无 tmp 残留', async () => {
    const dir = makeDir()
    const filePath = join(dir, 'attr_system.json')
    await exportAttrSystemJsonFile(filePath, createDefaultAttrSystem())

    expect(existsSync(filePath)).toBe(true)
    expect(readdirSync(dir).filter((file) => file.endsWith('.tmp'))).toHaveLength(0)

    const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, Record<string, unknown>>
    expect(Object.keys(raw)).toHaveLength(17)
    expect(raw['HP']).toMatchObject({
      name: 'HP',
      type: 'derived',
      max_value: null,
      formula: '= 力量*10 + 体质*20 + 敏捷*5'
    })
    // 中文不转义（ensure_ascii=False 等价）
    const text = readFileSync(filePath, 'utf-8')
    expect(text).toContain('暴击率')
    expect(text).not.toContain('\\u')
  })

  it('导出 → 导入往返：属性数量与公式系数保持', async () => {
    const dir = makeDir()
    const filePath = join(dir, 'roundtrip.json')
    await exportAttrSystemJsonFile(filePath, createDefaultAttrSystem())

    const { system, warnings } = await importAttrSystemJsonFile(filePath)
    expect(warnings).toEqual([])
    expect(Object.keys(system.attributes)).toHaveLength(17)
    expect(system.attributes['HP']?.formula.coefficients['力量']).toBe(10)
    expect(system.attributes['HP']?.maxValue).toBeNull()
    expect(system.attributes['暴击率']?.maxValue).toBe(100)
  })

  it('导入异常文件：未知类型 / 公式无法解析 / 非数字上限 → warnings 上报并尽力保留', async () => {
    const dir = makeDir()
    const filePath = join(dir, 'warnings.json')
    writeFileSync(
      filePath,
      JSON.stringify(
        {
          OK: {
            name: 'OK',
            type: 'base',
            category: '基础',
            display_name: 'OK',
            min_value: 0,
            max_value: 100,
            default_value: 10,
            formula: '= 0'
          },
          坏公式: {
            name: '坏公式',
            type: 'derived',
            category: '派生',
            display_name: '坏公式',
            min_value: '非数字',
            max_value: null,
            default_value: 0,
            formula: '= 力量*'
          },
          怪类型: { type: 'weird', formula: '= 0' }
        },
        null,
        2
      ),
      'utf-8'
    )

    const { system, warnings } = await importAttrSystemJsonFile(filePath)
    expect(Object.keys(system.attributes)).toHaveLength(3)
    expect(warnings).toHaveLength(3)
    expect(warnings.join('\n')).toContain('类型「weird」未知')
    expect(warnings.join('\n')).toContain('公式无法解析')
    expect(warnings.join('\n')).toContain('最小值不是数字')
    // 异常值按缺省处理，属性仍保留
    expect(system.attributes['坏公式']?.minValue).toBe(0)
    expect(system.attributes['坏公式']?.formula).toEqual({ coefficients: {}, baseValue: 0 })
    expect(system.attributes['怪类型']?.type).toBe('base')
    expect(system.attributes['怪类型']?.name).toBe('怪类型')
  })

  it('导入错误路径：JSON 损坏 / 文件不存在 / 无有效属性 均抛中文错误', async () => {
    const dir = makeDir()
    const corrupt = join(dir, 'corrupt.json')
    writeFileSync(corrupt, '{not-json', 'utf-8')

    await expect(importAttrSystemJsonFile(corrupt)).rejects.toThrow('损坏')
    await expect(importAttrSystemJsonFile(join(dir, 'missing.json'))).rejects.toThrow('读取属性系统文件失败')

    const empty = join(dir, 'empty.json')
    writeFileSync(empty, JSON.stringify({ 非对象: 1 }), 'utf-8')
    await expect(importAttrSystemJsonFile(empty)).rejects.toThrow('未解析出任何属性')
  })
})