import { describe, expect, it } from 'vitest'

import { renderLuaGameData } from '../../src/main/engineExport/lua'
import { toLuaKey, toLuaLiteral } from '../../src/main/engineExport/luaLiteral'
import type { DataTypeDef, ItemRecord } from '@mobai/shared/types'

/**
 * 引擎代码导出 · Lua 渲染器「对抗性边界」测试（QA 独立加造，与实现者单测分离）。
 *
 * 设计目标：不重复实现者已覆盖的 happy path，专攻转义陷阱、非法标识符键、数值极值、
 * 结构极值与括号配平——即最可能产出「合法文本但是非法 Lua」的输入。
 *
 * 说明：本机无 Lua 运行时/解析器，故用「自建 Lua 字符串解析器做往返校验 + 括号配平扫描 +
 * 人工产物审查」代替真实解析器校验（报告已如实标注该局限）。
 */

/* ---------------- 验证工具 ---------------- */

/** 解析 Lua 双引号字符串字面量（支持 \\ \" \n \r \t 与 \ddd），用于对序列化结果做往返校验 */
function parseLuaStringLiteral(literal: string): string {
  if (literal.length < 2 || !literal.startsWith('"') || !literal.endsWith('"')) {
    throw new Error(`不是合法的 Lua 字符串字面量：${literal}`)
  }
  const inner = literal.slice(1, -1)
  let out = ''
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!
    if (ch !== '\\') {
      out += ch
      continue
    }
    const next = inner[++i]
    if (next === undefined) throw new Error('转义符后缺少字符')
    if (next === '\\') out += '\\'
    else if (next === '"') out += '"'
    else if (next === 'n') out += '\n'
    else if (next === 'r') out += '\r'
    else if (next === 't') out += '\t'
    else if (next >= '0' && next <= '9') {
      let digits = next
      while (digits.length < 3 && inner[i + 1] !== undefined && inner[i + 1]! >= '0' && inner[i + 1]! <= '9') {
        digits += inner[++i]
      }
      out += String.fromCharCode(Number(digits))
    } else {
      throw new Error(`非法转义：\\${next}`)
    }
  }
  return out
}

interface BraceScan {
  open: number
  close: number
  minDepth: number
  finalDepth: number
}

/** 统计 `{` / `}`（跳过双引号字符串内部，避免把字符串里的花括号计入），并检测是否出现孤立 `}` */
function scanBraces(source: string): BraceScan {
  let open = 0
  let close = 0
  let depth = 0
  let minDepth = 0
  let i = 0
  while (i < source.length) {
    const ch = source[i]!
    if (ch === '"') {
      i++
      while (i < source.length && source[i] !== '"') {
        if (source[i] === '\\') i++
        i++
      }
      i++ // 跳过收尾引号
      continue
    }
    if (ch === '{') {
      open++
      depth++
      if (depth > 0) minDepth = Math.min(minDepth, depth)
    } else if (ch === '}') {
      close++
      depth--
      minDepth = Math.min(minDepth, depth)
    }
    i++
  }
  return { open, close, minDepth, finalDepth: depth }
}

/** 断言：括号数量配平、深度从不为负、最终归零（即不存在孤立/多余 `}`） */
function expectBalanced(source: string): void {
  const scan = scanBraces(source)
  expect(scan.open).toBe(scan.close)
  expect(scan.minDepth).toBe(0)
  expect(scan.finalDepth).toBe(0)
}

function record(id: string, type: string, data: Record<string, unknown>): ItemRecord {
  return { id, type, data, createdAt: '', updatedAt: '' }
}

/** role→roles、skill→skills 的最小 schema */
const TYPES: DataTypeDef[] = [
  {
    id: 'role',
    name: '角色',
    pluralKey: 'roles',
    color: '#2196F3',
    formFields: [
      { name: 'id', label: 'ID:', type: 'entry', editable: false },
      { name: 'name', label: '名称:', type: 'entry', editable: true },
      { name: 'hp', label: '生命:', type: 'spinbox', editable: true }
    ]
  },
  {
    id: 'skill',
    name: '技能',
    pluralKey: 'skills',
    color: '#4CAF50',
    formFields: [{ name: 'id', label: 'ID:', type: 'entry', editable: false }]
  }
]

describe('引擎代码导出 · Lua 渲染器对抗性边界', () => {
  /* -------- 1. 字符串转义陷阱 -------- */

  it('字符串往返：反斜杠 / 双引号 / 换行 / 制表符 / 反斜杠紧邻引号均可无损往返', () => {
    const samples = [
      'a\\b', // 反斜杠
      'a"b', // 双引号
      'a\nb', // 换行
      'a\tb', // 制表符
      'a\rb', // 回车
      'a\\"b', // 反斜杠紧邻引号（转义陷阱）
      '\\', // 单个反斜杠
      '"', // 单个引号
      'C:\\path\\to\\"file"', // Windows 路径 + 引号混排
      'tab\tnewline\nquote"slash\\end' // 混合
    ]
    for (const sample of samples) {
      const literal = toLuaLiteral(sample)
      // 必须是合法的双引号 Lua 字面量
      expect(literal.startsWith('"')).toBe(true)
      expect(literal.endsWith('"')).toBe(true)
      // 往返必须无损（用与 Lua 一致的解析规则）
      expect(parseLuaStringLiteral(literal)).toBe(sample)
    }
  })

  it('控制字符（<0x20）用 \\ddd 三进制转义，且不会被后续数字吞并', () => {
    const withBell = `a\u0001b`
    const literal = toLuaLiteral(withBell)
    expect(literal).toContain('\\001')
    expect(parseLuaStringLiteral(literal)).toBe(withBell)

    // 控制字符后紧跟数字：\001 后接 '9' 必须仍解析为「控制符 + 9」
    const tricky = `a\u00019`
    expect(parseLuaStringLiteral(toLuaLiteral(tricky))).toBe(tricky)
  })

  it('含花括号/引号的字符串值不会破坏产物括号配平', () => {
    const out = renderLuaGameData(
      [record('role_1', 'role', { id: 'role_1', name: '{ } "}) = }', hp: 1 })],
      TYPES
    )
    expectBalanced(out)
    expect(out).toContain('{ } \\"}) = }')
  })

  /* -------- 2. 键名合法性 -------- */

  it('非法标识符键名必须用 ["..."]，保留字/数字开头/空格/连字符/中文均不得裸键', () => {
    expect(toLuaKey('name')).toBe('name')
    expect(toLuaKey('_x1')).toBe('_x1')
    expect(toLuaKey('a b')).toBe('["a b"]')
    expect(toLuaKey('a-b')).toBe('["a-b"]')
    expect(toLuaKey('中文')).toBe('["中文"]')
    expect(toLuaKey('1abc')).toBe('["1abc"]')
    expect(toLuaKey('')).toBe('[""]')
    // Lua 保留字即便是合法标识符形态也不得裸键
    expect(toLuaKey('and')).toBe('["and"]')
    expect(toLuaKey('end')).toBe('["end"]')
    expect(toLuaKey('nil')).toBe('["nil"]')
    expect(toLuaKey('return')).toBe('["return"]')
  })

  it('非法字段名 / 非法 pluralKey 在完整产物中确实被括号化，且产物配平', () => {
    const weirdTypes: DataTypeDef[] = [
      {
        id: 'role',
        name: '角色',
        pluralKey: 'my roles', // 非法 pluralKey（含空格）
        color: '#000000',
        formFields: [
          { name: 'id', label: 'ID:', type: 'entry', editable: false },
          { name: 'full name', label: '全名:', type: 'entry', editable: true },
          { name: 'hp-max', label: '生命上限:', type: 'spinbox', editable: true },
          { name: '中文名', label: '中文名:', type: 'entry', editable: true },
          { name: 'end', label: '结束:', type: 'entry', editable: true }
        ]
      }
    ]
    const out = renderLuaGameData(
      [record('role_1', 'role', { id: 'role_1', 'full name': '艾拉', 'hp-max': 10, 中文名: '主角', end: true })],
      weirdTypes
    )
    expect(out).toContain('GameData["my roles"] = {')
    expect(out).toContain('["full name"] = "艾拉"')
    expect(out).toContain('["hp-max"] = 10')
    expect(out).toContain('["中文名"] = "主角"')
    expect(out).toContain('["end"] = true')
    // 不得出现非法裸键写法
    expect(out).not.toContain('GameData.my roles')
    expect(out).not.toContain('full name =')
    expectBalanced(out)
  })

  /* -------- 3. 数值极值 -------- */

  it('数值：0 / 负数 / 小数 / 大整数 原样；NaN / Infinity 兜底为 nil', () => {
    expect(toLuaLiteral(0)).toBe('0')
    expect(toLuaLiteral(-0)).toBe('0')
    expect(toLuaLiteral(-2)).toBe('-2')
    expect(toLuaLiteral(1.5)).toBe('1.5')
    expect(toLuaLiteral(-3.25)).toBe('-3.25')
    expect(toLuaLiteral(Number.MAX_SAFE_INTEGER)).toBe('9007199254740991')
    // 非有限数：当前实现兜底为 nil（Lua 无 Infinity/NaN 字面量）
    expect(toLuaLiteral(Number.NaN)).toBe('nil')
    expect(toLuaLiteral(Number.POSITIVE_INFINITY)).toBe('nil')
    expect(toLuaLiteral(Number.NEGATIVE_INFINITY)).toBe('nil')
  })

  /* -------- 4. null / undefined -------- */

  it('null 与 undefined 字段 → nil', () => {
    expect(toLuaLiteral(null)).toBe('nil')
    expect(toLuaLiteral(undefined)).toBe('nil')
    const out = renderLuaGameData(
      [record('role_1', 'role', { id: 'role_1', name: null, hp: undefined })],
      TYPES
    )
    expect(out).toContain('name = nil')
    expect(out).toContain('hp = nil')
  })

  /* -------- 5. 结构极值：空数组 / 空对象 / 深层嵌套 -------- */

  it('空数组 / 空对象 / 深层嵌套（3 层以上）序列化正确', () => {
    expect(toLuaLiteral([])).toBe('{}')
    expect(toLuaLiteral({})).toBe('{}')
    expect(toLuaLiteral([[]])).toBe('{ {} }')
    expect(toLuaLiteral({ a: [] })).toBe('{ a = {} }')
    expect(toLuaLiteral([{}, {}])).toBe('{ {}, {} }')
    expect(toLuaLiteral({ a: { b: { c: { d: 1 } } } })).toBe('{ a = { b = { c = { d = 1 } } } }')
    // 数组内嵌套对象 + 字符串混合
    expect(toLuaLiteral([{ k: 'v' }, [1, 2]])).toBe('{ { k = "v" }, { 1, 2 } }')
  })

  /* -------- 6. 未收录类型 / 重复 id -------- */

  it('未收录类型用 record.type 原文追加（排在内置类型之后）', () => {
    const out = renderLuaGameData(
      [
        record('role_1', 'role', { id: 'role_1' }),
        record('ghost_1', 'ghost', { id: 'ghost_1' })
      ],
      TYPES
    )
    expect(out).toContain('GameData.ghost = {')
    expect(out.indexOf('GameData.ghost = {')).toBeGreaterThan(out.indexOf('GameData.skills = {'))
    expectBalanced(out)
  })

  it('重复 id：当前实现不去重（两次出现同键）——记录行为，供团队判断是否需去重', () => {
    const out = renderLuaGameData(
      [record('role_1', 'role', { id: 'role_1', name: 'A' }), record('role_1', 'role', { id: 'role_1', name: 'B' })],
      TYPES
    )
    const occurrences = out.split('["role_1"] = {').length - 1
    expect(occurrences).toBe(2)
    // 语法仍配平（Lua 语义为后者覆盖前者）
    expectBalanced(out)
  })

  /* -------- 7. 空类型：**重点怀疑项**（实现者汇报尾部多余 `}`） -------- */

  it('空类型（无任何条目）：产物括号配平，无孤立/多余 `}`（实证实现者汇报的疑似 bug）', () => {
    const out = renderLuaGameData([], TYPES)

    const scan = scanBraces(out)
    expect(scan.open).toBe(scan.close)
    expect(scan.minDepth).toBe(0)
    expect(scan.finalDepth).toBe(0)
    expect(out).toContain('GameData.roles = {\n}')
    expect(out).toContain('GameData.skills = {\n}')
    // 明确否定「尾部多余 }」：不应出现 {} 后紧跟另一个 }
    expect(out).not.toContain('{}\n}')
    expectBalanced(out)
  })

  /* -------- 8. records 非空 + types 为空：必须抛中文错误 -------- */

  it('records 非空但 types 为空 → 抛含「数据类型定义」的中文错误', () => {
    expect(() => renderLuaGameData([record('role_1', 'role', { id: 'role_1' })], [])).toThrow('数据类型定义')
  })

  /* -------- 9. 对所有代表性产物统一做配平断言 -------- */

  it('所有代表性产物统一括号配平（含空数据、单条、多条、未收录类型）', () => {
    const products = [
      renderLuaGameData([], TYPES),
      renderLuaGameData([record('role_1', 'role', { id: 'role_1', name: 'a"b' })], TYPES),
      renderLuaGameData(
        [
          record('role_2', 'role', { id: 'role_2', skills: ['skill_1', 'skill_2'], attr: { atk: 1 } }),
          record('role_1', 'role', { id: 'role_1' }),
          record('skill_1', 'skill', { id: 'skill_1' })
        ],
        TYPES
      ),
      renderLuaGameData([record('x_1', 'unknownType', { id: 'x_1' })], TYPES)
    ]
    for (const product of products) {
      expectBalanced(product)
    }
  })
})
