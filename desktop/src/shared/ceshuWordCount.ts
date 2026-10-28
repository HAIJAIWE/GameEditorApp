/**
 * 章节字数统计（纯函数）—— 从旧 `ceshuScorer` 抽出的唯一仍有价值的工具。
 *
 * 100 分制评分引擎已整体移除（用户判定「一百分制…纯瞎评价」），
 * 但「这章到底写了多少字」本身是**客观、可复算**的观测值，完备度报告仍会用，
 * 故单独成模块，避免为它保留一个已废弃的评分文件。
 */

/** 中文字符匹配（按字符计） */
export const RE_CHINESE_CHARS = /[\u4e00-\u9fff]/g
/** 英文/数字词匹配（按词计） */
export const RE_ENGLISH_WORDS = /[a-zA-Z0-9]+/g

/**
 * 递归统计章节字数（中文按字符 + 英文按词；递归 str / array / dict，
 * 其余类型记 0）。与旧版 `ceshu_scorer.count_words` 逐字一致，便于横向对比历史数据。
 */
export function countWordsInChapter(chapterData: unknown): number {
  if (typeof chapterData === 'string') {
    const chineseChars = (chapterData.match(RE_CHINESE_CHARS) ?? []).length
    const englishWords = (chapterData.match(RE_ENGLISH_WORDS) ?? []).length
    return chineseChars + englishWords
  }
  if (Array.isArray(chapterData)) {
    return chapterData.reduce<number>((sum, item) => sum + countWordsInChapter(item), 0)
  }
  if (chapterData !== null && typeof chapterData === 'object') {
    return Object.values(chapterData).reduce<number>((sum, value) => sum + countWordsInChapter(value), 0)
  }
  return 0
}
