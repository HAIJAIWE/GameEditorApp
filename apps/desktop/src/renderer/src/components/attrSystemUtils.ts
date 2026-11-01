import { formulaToText, type AttrSystem } from '@mobai/shared/attrSystem'

/** 由属性系统生成「属性名 → 公式文本」映射（编辑前初始化，改名时同步） */
export function textsOf(system: AttrSystem): Record<string, string> {
  const texts: Record<string, string> = {}
  for (const [name, attr] of Object.entries(system.attributes)) {
    texts[name] = formulaToText(attr.formula)
  }
  return texts
}

/** 示例值展示：最多保留 4 位小数（消除浮点长尾，核心计算值不受影响） */
export function formatPreview(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '—'
  return String(Math.round(value * 10000) / 10000)
}
