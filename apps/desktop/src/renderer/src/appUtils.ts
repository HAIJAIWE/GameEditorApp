import type { ImportSummary } from '@mobai/shared/types'
import { translate } from '@mobai/shared/i18n'

import { getLocalePreference } from './localePreference'

export { toErrorMessage } from '@mobai/shared/util/system'

export function formatImportSummary(summary: ImportSummary): string {
  const locale = getLocalePreference()
  // 列表分隔符跟语言走：中文用「、」，英文用逗号
  const sep = locale === 'en' ? ', ' : '、'
  const unknownKeys = Object.keys(summary.unknownTypes)
  const unknownNote =
    unknownKeys.length > 0
      ? translate(locale, 'appUtils.importUnknownTypes', {
          n: unknownKeys.length,
          keys: unknownKeys.slice(0, 6).join(sep)
        })
      : ''
  // 没有 id 列 ⇒ 每一行都成了新条目。若用户本意是改已有数据，结果就是整表翻倍，必须说出来
  const missingIdNote =
    summary.missingIdSources.length > 0
      ? translate(locale, 'appUtils.importMissingId', {
          sources: summary.missingIdSources.slice(0, 4).join(sep)
        })
      : ''
  return translate(locale, 'appUtils.importDone', {
    imported: summary.imported,
    updated: summary.updated,
    skipped: summary.skipped,
    unknown: unknownNote,
    missingId: missingIdNote
  })
}
