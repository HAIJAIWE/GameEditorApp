import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { AttrSystemStore } from '../../src/main/attr/attrSystemStore'
import { calculateAttributes } from '../../src/shared/attrSystem'

describe('AttrSystemStore（attr_system.json 唯一写者）', () => {
  it('无文件时以内置默认集为种子；保存后落盘并可重新加载（公式与上限均保留）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mb-attr-'))
    const filePath = join(dir, 'attr_system.json')
    const store = new AttrSystemStore(filePath)

    expect(Object.keys(store.getSystem().attributes)).toHaveLength(17)
    expect(existsSync(filePath)).toBe(false)

    const edited = store.getSystem()
    const hp = edited.attributes['HP']
    expect(hp).toBeDefined()
    if (hp) hp.formula.coefficients['力量'] = 12
    const saved = store.saveSystem(edited)
    expect(saved.attributes['HP']?.formula.coefficients['力量']).toBe(12)

    const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, { formula: string; max_value: number | null }>
    expect(raw['HP']?.formula).toBe('= 力量*12 + 体质*20 + 敏捷*5')
    expect(raw['暴击率']?.max_value).toBe(100)

    const reloaded = new AttrSystemStore(filePath)
    expect(reloaded.getSystem().attributes['HP']?.formula.coefficients['力量']).toBe(12)
    expect(calculateAttributes(reloaded.getSystem(), { 力量: 10, 体质: 10, 敏捷: 10 }).values['HP']).toBe(370)
  })

  it('保存校验失败：抛中文错误且不落盘', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mb-attr-'))
    const filePath = join(dir, 'attr_system.json')
    const store = new AttrSystemStore(filePath)

    const broken = store.getSystem()
    const hp = broken.attributes['HP']
    if (hp) hp.formula.coefficients['不存在'] = 1
    expect(() => store.saveSystem(broken)).toThrow('属性系统校验失败')
    expect(existsSync(filePath)).toBe(false)
  })

  it('文件损坏时读取报错含文件路径', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mb-attr-'))
    const filePath = join(dir, 'attr_system.json')
    writeFileSync(filePath, '{ not json', 'utf-8')
    expect(() => new AttrSystemStore(filePath).getSystem()).toThrow('读取属性系统文件失败')
  })
})