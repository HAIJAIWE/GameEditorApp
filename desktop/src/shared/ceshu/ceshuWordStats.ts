/**
 * F6: 章节字数统计 + 写作建议（自 Python src/ui/ceshu/word_stats_dialog.py 匹平迁移）。
 *
 * 统计策划书每章字数，对照工业级 GDD 标准给出完成度与写作建议。
 * 注意：本文件的基线表来自 word_stats_dialog.py 的 CHAPTER_WORD_BENCHMARK，
 * 与 ceshuScorer.ts 的 CHAPTER_WORD_BENCHMARK（scorer 专用、数值不同）互不影响。
 */

import { CHAPTER_KEYS, CHAPTER_LABELS, type CeshuDocument, type ChapterKey } from '../ceshuConstants'
import { countWordsInChapter } from './ceshuScorer'

/** 工业级 GDD 章节字数参考标准：(下限, 上限, 期望中位)，与 Python CHAPTER_WORD_BENCHMARK 一致 */
export const WORD_STATS_BENCHMARK: Record<ChapterKey, [number, number, number]> = {
  meta: [50, 300, 150],
  vision: [200, 800, 400],
  // 原 worldview + characters 两章合并为 story（基准值相加）
  story: [1000, 3000, 1600],
  gameplay: [300, 1000, 500],
  systems: [200, 800, 400],
  numeric: [300, 1000, 500],
  art: [300, 800, 500],
  tech: [300, 1000, 500],
  resources: [200, 800, 400],
  market_analysis: [400, 1200, 700],
  combat: [400, 1200, 700],
  economy: [400, 1200, 700],
  monetization: [300, 1000, 600],
  mvp: [200, 800, 400],
  risk_handling: [300, 1000, 500],
  audio: [200, 800, 400],
  accessibility: [100, 500, 250]
}

/** 未在基准表中命中时的兜底值（与 Python get(key, (100, 500, 250)) 一致） */
const FALLBACK_BENCHMARK: [number, number, number] = [100, 500, 250]

/** 单章字数统计行 */
export interface CeshuWordStatRow {
  chapter_key: ChapterKey
  chapter_label: string
  words: number
  benchmark: [number, number, number]
  percent: number
  percent_level: 'hi' | 'mid' | 'low'
  advice: string
  advice_color: string
}

/** 全文字数统计报告 */
export interface CeshuWordStatsReport {
  rows: CeshuWordStatRow[]
  total_words: number
  total_target: number
  overall_percent: number
  overall_level: 'hi' | 'mid' | 'low'
}

/** 单章完成度分档（UI 用）：>=100 hi、>=50 mid、其余 low（对应 Python pct 着色） */
function percentLevel(pct: number): 'hi' | 'mid' | 'low' {
  if (pct >= 100) return 'hi'
  if (pct >= 50) return 'mid'
  return 'low'
}

/** 单章写作建议与颜色（照抄 Python 文案，含 emoji 与全角括号） */
function buildAdvice(words: number, lo: number, hi: number): { advice: string; advice_color: string } {
  if (words === 0) {
    return { advice: '🔴 章节为空，建议尽快填写', advice_color: '#e57373' }
  }
  if (words < lo) {
    return { advice: `🟠 字数偏少（建议至少 ${lo} 字）`, advice_color: '#ffb74d' }
  }
  if (words > hi * 1.5) {
    return { advice: `🟡 字数过多（建议精简到 ${hi} 字以内）`, advice_color: '#fff176' }
  }
  return { advice: '🟢 字数合理', advice_color: '#81c784' }
}

/**
 * 构建字数统计报告。
 * 行序按 CHAPTER_KEYS 的文档信息 + 16 章全量（不受档位裁剪，与 Python _populate 一致）。
 */
export function buildWordStatsReport(doc: CeshuDocument): CeshuWordStatsReport {
  const rows: CeshuWordStatRow[] = []
  let totalWords = 0
  let totalTarget = 0

  for (const key of CHAPTER_KEYS) {
    const label = CHAPTER_LABELS[key] ?? key
    const chapterData = doc[key]
    const words = countWordsInChapter(chapterData)
    const benchmark = WORD_STATS_BENCHMARK[key] ?? FALLBACK_BENCHMARK
    const [lo, hi, mid] = benchmark

    // 完成度计算：达到 mid 视为 100%，超过视 120%；Python int() 为向零截断
    let pct: number
    if (mid > 0) {
      pct = Math.min(120, Math.trunc((words / mid) * 100))
    } else {
      pct = words > 0 ? 100 : 0
    }

    const { advice, advice_color } = buildAdvice(words, lo, hi)

    rows.push({
      chapter_key: key,
      chapter_label: label,
      words,
      benchmark,
      percent: pct,
      percent_level: percentLevel(pct),
      advice,
      advice_color
    })

    totalWords += words
    totalTarget += mid
  }

  const overallPercent = Math.min(100, Math.trunc((totalWords / Math.max(1, totalTarget)) * 100))
  const overallLevel: 'hi' | 'mid' | 'low' = overallPercent >= 80 ? 'hi' : overallPercent >= 50 ? 'mid' : 'low'

  return {
    rows,
    total_words: totalWords,
    total_target: totalTarget,
    overall_percent: overallPercent,
    overall_level: overallLevel
  }
}