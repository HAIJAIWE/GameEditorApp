/**
 * 渲染用的最小文本工具：表格单元格转义与标量格式化。
 *
 * 单独成文件是因为文档正文、系统配置块、卷目录与总纲都要用同一套转义口径。
 */

/** 单元格里的竖线会破坏表格：转义成 `\|` */
export function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|')
}

export function formatScalar(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'number') return String(value)
  return `\`${JSON.stringify(value)}\``
}
