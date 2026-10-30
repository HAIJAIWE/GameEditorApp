import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { exportEngineData, type EngineTarget } from '../../src/main/engineExport/exporter'
import { renderLuaGameData } from '../../src/main/engineExport/lua'
import { toLuaLiteral } from '../../src/main/engineExport/luaLiteral'
import { engineExportInputSchema } from '../../src/shared/schema/core/schemas'
import type { DataTypeDef, ItemRecord } from '../../src/shared/types'

/** 最小 schema：role→roles、skill→skills（AC1 分组依据） */
const TYPES: DataTypeDef[] = [
  {
    id: 'role',
    name: '角色',
    pluralKey: 'roles',
    color: '#2196F3',
    formFields: [
      { name: 'id', label: 'ID:', type: 'entry', editable: false },
      { name: 'name', label: '角色名称:', type: 'entry', editable: true },
      { name: 'job', label: '职业:', type: 'combobox', editable: true, values: ['法师'] },
      { name: 'hp', label: '生命:', type: 'spinbox', editable: true, from: 0, to: 9999 },
      { name: 'skills', label: '技能列表:', type: 'multiselect', editable: true, refType: 'skills' },
      { name: 'attr_list', label: '属性列表:', type: 'attrpanel', editable: true }
    ]
  },
  {
    id: 'skill',
    name: '技能',
    pluralKey: 'skills',
    color: '#4CAF50',
    formFields: [
      { name: 'id', label: 'ID:', type: 'entry', editable: false },
      { name: 'name', label: '技能名称:', type: 'entry', editable: true }
    ]
  }
]

function record(id: string, type: string, data: Record<string, unknown>): ItemRecord {
  return { id, type, data, createdAt: '', updatedAt: '' }
}

function makeDir(): string {
  return mkdtempSync(join(tmpdir(), 'mb-engine-lua-'))
}

describe('引擎代码导出 · Lua（P0，AC1–AC9）', () => {
  // AC1：分组与条目
  it('AC1 分组与条目：外层用 pluralKey，内层用 ["<id>"]', () => {
    const records = [
      record('role_1', 'role', { id: 'role_1', name: '艾拉' }),
      record('role_2', 'role', { id: 'role_2', name: '波比' }),
      record('skill_1', 'skill', { id: 'skill_1', name: '火球术' })
    ]
    const out = renderLuaGameData(records, TYPES)

    expect(out).toContain('GameData.roles = {')
    expect(out).toContain('["role_1"]')
    expect(out).toContain('["role_2"]')
    expect(out).toContain('GameData.skills = {')
    expect(out).toContain('["skill_1"]')
  })

  // AC2：字符串转义
  it('AC2 字符串转义：双引号与换行被转义，无裸引号', () => {
    const lit = toLuaLiteral('a"b\nc')
    expect(lit).toBe('"a\\"b\\nc"')
    // 整串必须是合法的 Lua 双引号字面量（内部引号/反斜杠均已转义）
    expect(/^"(?:[^"\\]|\\.)*"$/.test(lit)).toBe(true)

    const out = renderLuaGameData([record('role_1', 'role', { id: 'role_1', name: 'a"b\nc' })], TYPES)
    expect(out).toContain('"a\\"b\\nc"')
    expect(out).not.toContain('a"b')
  })

  // AC3：类型映射
  it('AC3 类型映射：数字不带引号 / 布尔 / nil / 数组 / 嵌套对象', () => {
    expect(toLuaLiteral(320)).toBe('320')
    expect(toLuaLiteral(1.5)).toBe('1.5')
    expect(toLuaLiteral(-2)).toBe('-2')
    expect(toLuaLiteral(true)).toBe('true')
    expect(toLuaLiteral(false)).toBe('false')
    expect(toLuaLiteral(null)).toBe('nil')
    expect(toLuaLiteral(undefined)).toBe('nil')
    expect(toLuaLiteral(['skill_1'])).toBe('{ "skill_1" }')
    expect(toLuaLiteral({ atk: 120 })).toBe('{ atk = 120 }')
    expect(toLuaLiteral({})).toBe('{}')
    expect(toLuaLiteral([])).toBe('{}')

    const out = renderLuaGameData(
      [
        record('role_1', 'role', {
          id: 'role_1',
          hp: 320,
          skills: ['skill_1', 'skill_2'],
          attr_list: { atk: 120, def: 40 }
        })
      ],
      TYPES
    )
    expect(out).toContain('hp = 320')
    expect(out).not.toContain('"320"')
    expect(out).toContain('skills = { "skill_1", "skill_2" }')
    expect(out).toContain('attr_list = { atk = 120, def = 40 }')
  })

  it('AC3 字符串存的数字原样输出（不做类型换算）', () => {
    const out = renderLuaGameData([record('skill_1', 'skill', { id: 'skill_1', multiplier: '1.5' })], TYPES)
    expect(out).toContain('multiplier = "1.5"')
  })

  // AC4：空数据合法
  it('AC4 空数据：仍输出合法 Lua 模块且不抛错', () => {
    const out = renderLuaGameData([], TYPES)
    expect(out).toContain('local GameData = {}')
    expect(out).toContain('return GameData')
    // 空类型保留空表，结构稳定
    expect(out).toContain('GameData.roles = {\n}')
    expect(out).toContain('GameData.skills = {\n}')
  })

  // AC5：落盘
  it('AC5 落盘：自动补 .lua 扩展名，内容与渲染一致，bytes 正确', async () => {
    const dir = makeDir()
    const target = join(dir, 'gamedata')
    const records = [
      record('role_1', 'role', { id: 'role_1', name: '艾拉' }),
      record('skill_1', 'skill', { id: 'skill_1', name: '火球术' })
    ]
    const result = await exportEngineData(records, TYPES, { engine: 'lua', targetPath: target })

    const expectedPath = join(dir, 'gamedata.lua')
    expect(result.filePath).toBe(expectedPath)
    expect(result.engine).toBe('lua')
    expect(existsSync(expectedPath)).toBe(true)

    const content = readFileSync(expectedPath, 'utf-8')
    expect(content).toBe(renderLuaGameData(records, TYPES))
    expect(result.bytes).toBe(Buffer.byteLength(content))
  })

  // AC6：原子写无 tmp 残留
  it('AC6 原子写：导出后目录内无 *.tmp 残留', async () => {
    const dir = makeDir()
    await exportEngineData([record('role_1', 'role', { id: 'role_1' })], TYPES, {
      engine: 'lua',
      targetPath: join(dir, 'gamedata')
    })
    expect(readdirSync(dir).filter((file) => file.endsWith('.tmp'))).toHaveLength(0)
  })

  // AC7：非法输入中文错误
  it('AC7 非法引擎 / 空 types 抛中文错误', async () => {
    const dir = makeDir()
    // 「非法引擎」样本用 `unreal5` 这类**真不在枚举里**的值 ——
    // 早期这里写的是 'unity'，那是单引擎时代（只支持 lua）的遗留断言，
    // 补齐 unity/unreal/godot/cocos2d 后 unity 已是合法目标。
    await expect(
      exportEngineData([], TYPES, { engine: 'unreal5' as unknown as EngineTarget, targetPath: join(dir, 'x') })
    ).rejects.toThrow('目标引擎不支持')

    await expect(
      exportEngineData([], [], { engine: 'lua', targetPath: join(dir, 'y') })
    ).rejects.toThrow('数据类型定义')
  })

  // AC8：幂等 / 稳定
  it('AC8 幂等：同输入两次渲染完全相等；字段键序稳定（先 schema 序、后额外键排序）', () => {
    const records = [
      record('role_1', 'role', { zz: 1, hp: 320, id: 'role_1', name: '艾拉', aa: 2 }),
      record('role_2', 'role', { id: 'role_2', name: '波比' })
    ]
    const first = renderLuaGameData(records, TYPES)
    const second = renderLuaGameData(records, TYPES)
    expect(first).toBe(second)

    // schema 字段序：id, name, hp；额外键按字典序：aa, zz
    const idIndex = first.indexOf('id = "role_1"')
    const nameIndex = first.indexOf('name = "艾拉"')
    const hpIndex = first.indexOf('hp = 320')
    const aaIndex = first.indexOf('aa = 2')
    const zzIndex = first.indexOf('zz = 1')
    expect(idIndex).toBeGreaterThan(-1)
    expect(idIndex).toBeLessThan(nameIndex)
    expect(nameIndex).toBeLessThan(hpIndex)
    expect(hpIndex).toBeLessThan(aaIndex)
    expect(aaIndex).toBeLessThan(zzIndex)
  })

  it('AC8 未收录类型：用 record.type 原文无损追加（排序在后）', () => {
    const records = [
      record('p_1', 'players', { id: 'p_1', name: '未收录' }),
      record('role_1', 'role', { id: 'role_1', name: '艾拉' })
    ]
    const out = renderLuaGameData(records, TYPES)
    expect(out).toContain('GameData.players = {')
    expect(out.indexOf('GameData.players = {')).toBeGreaterThan(out.indexOf('GameData.skills = {'))
  })

  // AC9：IPC 输入校验
  it('AC9 engineExportInputSchema：合法通过，缺 path / 非法 engine 校验失败', () => {
    expect(engineExportInputSchema.safeParse({ engine: 'lua', path: '/tmp/game.lua' }).success).toBe(true)
    expect(engineExportInputSchema.safeParse({ engine: 'lua' }).success).toBe(false)
    expect(engineExportInputSchema.safeParse({ engine: 'lua', path: '' }).success).toBe(false)
    // 五个目标全部合法（补齐 unity/unreal/godot/cocos2d 后，unity 不再是「非法」样本）
    for (const engine of ['unity', 'unreal', 'godot', 'cocos2d']) {
      expect(engineExportInputSchema.safeParse({ engine, path: '/tmp/game' }).success).toBe(true)
    }
    expect(engineExportInputSchema.safeParse({ engine: 'unreal5', path: '/tmp/game' }).success).toBe(false)
  })
})
