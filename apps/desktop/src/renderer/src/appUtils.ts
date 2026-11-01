import type { ImportSummary } from '@mobai/shared/types'

export { toErrorMessage } from '@mobai/shared/util/system'

export function formatImportSummary(summary: ImportSummary): string {
  const unknownKeys = Object.keys(summary.unknownTypes)
  const unknownNote =
    unknownKeys.length > 0
      ? `；另有 ${unknownKeys.length} 个未收录类型键（数据已保留）：${unknownKeys.slice(0, 6).join('、')}`
      : ''
  // 没有 id 列 ⇒ 每一行都成了新条目。若用户本意是改已有数据，结果就是整表翻倍，必须说出来
  const missingIdNote =
    summary.missingIdSources.length > 0
      ? `；注意：${summary.missingIdSources.slice(0, 4).join('、')} 没有 id 列，已全部按「新增」导入——若本想修改已有数据，会变成重复项`
      : ''
  return `导入完成：新增 ${summary.imported} 条，更新 ${summary.updated} 条，跳过 ${summary.skipped} 条${unknownNote}${missingIdNote}`
}
