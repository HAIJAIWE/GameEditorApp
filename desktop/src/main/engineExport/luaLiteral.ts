/**
 * 值 → Lua 字面量序列化（纯函数）。
 * 供引擎数据导出（Lua）复用，不依赖任何运行时环境，便于 vitest 直接断言。
 */

/** 合法 Lua 标识符（可作 `t.k = v` 的裸键） */
const LUA_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Lua 保留字：即便形似标识符也不能作为裸键 */
const LUA_RESERVED = new Set([
  'and',
  'break',
  'do',
  'else',
  'elseif',
  'end',
  'false',
  'for',
  'function',
  'goto',
  'if',
  'in',
  'local',
  'nil',
  'not',
  'or',
  'repeat',
  'return',
  'then',
  'true',
  'until',
  'while'
])

/**
 * 把任意值序列化为 Lua 字面量：
 * - string → `"..."`（转义 `\`、`"` 与换行等控制字符）
 * - number → 数字字面量（非有限数兜底为 `nil`）
 * - boolean → `true` / `false`
 * - null / undefined → `nil`
 * - 数组 → `{ v1, v2, ... }`
 * - 嵌套对象 → `{ k = v, ... }`
 * - 空对象 / 空数组 → `{}`
 */
export function toLuaLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'nil'
  if (typeof value === 'string') return `"${escapeLuaString(value)}"`
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'nil'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (Array.isArray(value)) return renderArray(value)
  if (typeof value === 'object') return renderTable(value as Record<string, unknown>)
  // 其余类型（bigint / symbol / function 等）不会出现在数据表中，兜底为 nil
  return 'nil'
}

/**
 * 把字符串键渲染为 Lua 表键：合法标识符输出裸键（`name`），否则输出括号字符串键（`["a b"]`）。
 * 供 `{ k = v }` 与 `GameData.<key>` 复用。
 */
export function toLuaKey(key: string): string {
  if (LUA_IDENTIFIER.test(key) && !LUA_RESERVED.has(key)) return key
  return `[${toLuaLiteral(key)}]`
}

/** 转义 Lua 双引号字符串内容（反斜杠 / 双引号 / 换行等控制字符） */
function escapeLuaString(value: string): string {
  let out = ''
  for (const ch of value) {
    switch (ch) {
      case '\\':
        out += '\\\\'
        break
      case '"':
        out += '\\"'
        break
      case '\n':
        out += '\\n'
        break
      case '\r':
        out += '\\r'
        break
      case '\t':
        out += '\\t'
        break
      default: {
        const code = ch.codePointAt(0) ?? 0
        // 其余控制字符用 Lua 十进制转义 `\ddd`（补齐 3 位，避免吞掉后续数字）
        out += code < 0x20 ? `\\${code.toString().padStart(3, '0')}` : ch
      }
    }
  }
  return out
}

function renderArray(values: unknown[]): string {
  if (values.length === 0) return '{}'
  return `{ ${values.map((item) => toLuaLiteral(item)).join(', ')} }`
}

function renderTable(record: Record<string, unknown>): string {
  const keys = Object.keys(record)
  if (keys.length === 0) return '{}'
  return `{ ${keys.map((key) => `${toLuaKey(key)} = ${toLuaLiteral(record[key])}`).join(', ')} }`
}
