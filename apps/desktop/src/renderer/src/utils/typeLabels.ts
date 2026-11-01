/**
 * 数据类型展示名（纯函数，可单测）。
 *
 * 旧库存在**同名类型**（实测某库 role 与 character 都叫「角色」，字段数不同），
 * 数据编辑面板若原样列出，会出现两个一模一样的按钮、用户无从选择。
 * 规则：同名（出现 ≥2 次）的类型追加 `（id）` 消歧义；单名保持干净不加噪音。
 */

export interface NamedType {
  id: string
  name: string
}

/** id → 展示名。调用方按 id 取，缺失时回落原 name */
export function buildTypeLabelMap(types: readonly NamedType[]): Map<string, string> {
  const nameCount = new Map<string, number>()
  for (const type of types) nameCount.set(type.name, (nameCount.get(type.name) ?? 0) + 1)
  const labels = new Map<string, string>()
  for (const type of types) {
    labels.set(type.id, (nameCount.get(type.name) ?? 0) > 1 ? `${type.name}（${type.id}）` : type.name)
  }
  return labels
}
