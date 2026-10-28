import { describe, expect, it } from 'vitest'

import { RE_CHINESE_CHARS, RE_ENGLISH_WORDS, countWordsInChapter } from '../../src/shared/ceshuWordCount'

/**
 * `countWordsInChapter` 单测（2026-10-27）。
 *
 * 该函数从已删除的 100 分制 `ceshuScorer` 抽出为独立模块 —— 评分引擎整体移除，
 * 但「这章写了多少字」是客观可复算的观测值，完备度报告仍在用。
 * 口径要求与旧版 `ceshu_scorer.count_words` 逐字一致，便于横向对比历史数据。
 */
describe('章节字数统计（纯函数）', () => {
  it('中文按字符 + 英文/数字按词', () => {
    // 4 个中文字（中/文/中/文）+ 2 个词（abc、123）
    expect(countWordsInChapter('中文abc中文123')).toBe(6)
  })

  it('纯中文按字符、纯英文按词、中英混排相加', () => {
    expect(countWordsInChapter('墨白')).toBe(2)
    expect(countWordsInChapter('hello world')).toBe(2)
    expect(countWordsInChapter('HP 120 ATK 30')).toBe(4) // 4 个词，无中文
  })

  it('递归 str / array / dict', () => {
    expect(countWordsInChapter({ a: ['中文'], b: { c: 'abc' } })).toBe(3) // 2 中文字 + 1 英文词
    expect(countWordsInChapter(['中文', 'abc'])).toBe(3)
    expect(countWordsInChapter([{ x: '甲' }, { y: ['乙'] }])).toBe(2)
  })

  it('非字符串/数组/对象类型记 0（数字、布尔、null、undefined）', () => {
    expect(countWordsInChapter(123)).toBe(0)
    expect(countWordsInChapter(true)).toBe(0)
    expect(countWordsInChapter(false)).toBe(0)
    expect(countWordsInChapter(null)).toBe(0)
    expect(countWordsInChapter(undefined)).toBe(0)
  })

  it('空串与空容器计 0', () => {
    expect(countWordsInChapter('')).toBe(0)
    expect(countWordsInChapter([])).toBe(0)
    expect(countWordsInChapter({})).toBe(0)
    expect(countWordsInChapter('   ')).toBe(0) // 空白字符不算中文字也不算词
  })

  it('正则作为具名单源导出（消费方可直接复用同一口径）', () => {
    expect('中文abc'.match(RE_CHINESE_CHARS)).toHaveLength(2)
    // [a-zA-Z0-9]+ 是连续匹配：abc123 之间无分隔 ⇒ 算一个词
    expect('中文abc123'.match(RE_ENGLISH_WORDS)).toEqual(['abc123'])
  })
})
