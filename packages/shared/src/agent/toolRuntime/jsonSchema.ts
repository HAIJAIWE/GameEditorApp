/**
 * 极简 JSON Schema 校验（对齐 dsh `core/tools/json-schema.ts` 的 `validateJsonSchemaValue`）。
 *
 * 只覆盖本仓工具真正会用的子集：type / required / properties / items / enum /
 * minimum / maximum / minLength。**未知 type 放行**（宽松），因为参数 schema 的
 * 唯一真源在 `SkillProtocol.parametersSchema`，这里只做"输出/入参形状"的第二道闸。
 *
 * @module agent/tools/jsonSchema
 */

/** 可校验的 JSON Schema 节点（object/array 可递归） */
export interface JsonSchemaNode {
  type?: string
  description?: string
  enum?: readonly unknown[]
  default?: unknown
  minimum?: number
  maximum?: number
  minLength?: number
  /** type=array 的元素 schema */
  items?: JsonSchemaNode
  /** type=object 的属性表 */
  properties?: Record<string, JsonSchemaNode>
  /** type=object 的必填键 */
  required?: readonly string[]
}

/** 一条校验失败（带路径，便于定位是哪个字段坏了） */
export interface JsonSchemaViolation {
  /** 形如 `user.tags[2]`；根为 `$` */
  path: string
  message: string
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const proto: unknown = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * 校验一个值是否符合 schema。
 * @param schema - 校验规则
 * @param value - 待校验值
 * @param path - 起始路径（内部递归用）
 * @returns 第一条违规；通过时返回 `null`
 */
export function validateJsonSchemaValue(
  schema: JsonSchemaNode,
  value: unknown,
  path = '$'
): JsonSchemaViolation | null {
  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    return { path, message: `expected one of ${JSON.stringify(schema.enum)}` }
  }
  switch (schema.type) {
    case undefined:
      return null
    case 'object': {
      if (!isPlainObject(value)) return { path, message: 'expected object' }
      for (const key of schema.required ?? []) {
        if (!(key in value)) return { path: `${path}.${key}`, message: 'is required' }
      }
      for (const [key, child] of Object.entries(schema.properties ?? {})) {
        if (!(key in value)) continue
        const violation = validateJsonSchemaValue(child, value[key], `${path}.${key}`)
        if (violation !== null) return violation
      }
      return null
    }
    case 'array': {
      if (!Array.isArray(value)) return { path, message: 'expected array' }
      if (schema.items !== undefined) {
        for (let index = 0; index < value.length; index += 1) {
          const violation = validateJsonSchemaValue(schema.items, value[index], `${path}[${index}]`)
          if (violation !== null) return violation
        }
      }
      return null
    }
    case 'string': {
      if (typeof value !== 'string') return { path, message: 'expected string' }
      if (schema.minLength !== undefined && value.length < schema.minLength) {
        return { path, message: `expected length >= ${schema.minLength}` }
      }
      return null
    }
    case 'integer': {
      if (typeof value !== 'number' || !Number.isInteger(value)) return { path, message: 'expected integer' }
      return checkRange(schema, value, path)
    }
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return { path, message: 'expected number' }
      return checkRange(schema, value, path)
    }
    case 'boolean':
      return typeof value === 'boolean' ? null : { path, message: 'expected boolean' }
    case 'null':
      return value === null ? null : { path, message: 'expected null' }
    default:
      // 未知 type：宽松放行（schema 由技能自己声明，宁可少拦也不误拦）
      return null
  }
}

function checkRange(schema: JsonSchemaNode, value: number, path: string): JsonSchemaViolation | null {
  if (schema.minimum !== undefined && value < schema.minimum) {
    return { path, message: `expected >= ${schema.minimum}` }
  }
  if (schema.maximum !== undefined && value > schema.maximum) {
    return { path, message: `expected <= ${schema.maximum}` }
  }
  return null
}
