/**
 * 工业级 GDD 评分引擎 —— 定义层（与 ceshuScorer.ts 的求值逻辑分离）：
 * 报告接口、字数基准、行业基准、及格阈值、评分权重、市场评分规则、字数统计正则。
 * 纯数据 / 常量，无求值逻辑；逻辑层 ceshuScorer.ts 导入此处常量并 re-export 公共 API。
 */

import type { ChapterKey } from './ceshuConstants'

export interface CeshuChapterScore {
  chapter_key: string
  chapter_label: string
  score: number // 0-100
  completion: number // 0-1（来自 chapter_progress）
  word_count: number
  benchmark_word: [number, number, number] // (min, max, mid)
  has_required: boolean
  missing_required: string[]
  notes: string[]
}

export interface CeshuIndustryBenchmark {
  game_type: string
  label: string
  structure_avg: number
  quality_avg: number
  market_avg: number
  total_avg: number
  top_games: string[]
  vs_structure: number
  vs_quality: number
  vs_market: number
  vs_total: number
}

export interface CeshuScoreReport {
  total_score: number
  structure_score: number
  content_quality_score: number
  market_potential_score: number
  grade: string
  chapter_scores: CeshuChapterScore[]
  suggestions: string[]
  industry_benchmark: CeshuIndustryBenchmark
  pass_status: { structure: boolean; quality: boolean; market: boolean; total: boolean }
}

/**
 * 字数基准（来自 word_stats_dialog，与 旧版 CHAPTER_WORD_BENCHMARK 一致）：(min, max, mid)
 *
 * **按 ChapterKey 收口**（不是 `Record<string, …>`）：2026-10-23 体检发现 `worldview` /
 * `characters` 两章合并为 `story` 后，基准表仍留死条目、**却没有 story**——
 * 评分引擎 `CHAPTER_WORD_BENCHMARK[key] ?? [0,0,0]` 于是对最大的章按 0 基准算
 * 「字数达标 30%」，等于白丢 30% 质量分。改成按 ChapterKey 索引后，
 * 新增/合并章节漏配基准会**在编译期**报错，不再静默走默认值。
 */
export const CHAPTER_WORD_BENCHMARK: Record<ChapterKey, [number, number, number]> = {
  meta: [50, 300, 150],
  vision: [200, 800, 400],
  // story = 原 worldview(500-1500) + characters(400-1200) 合并，取并集上界
  story: [500, 1500, 800],
  gameplay: [500, 1500, 800],
  systems: [300, 1000, 500],
  numeric: [400, 1200, 600],
  art: [300, 1000, 500],
  tech: [400, 1200, 600],
  resources: [300, 1000, 500],
  market_analysis: [400, 1200, 600],
  combat: [400, 1200, 600],
  economy: [400, 1200, 600],
  monetization: [300, 1000, 500],
  mvp: [300, 1000, 500],
  risk_handling: [300, 1000, 500],
  audio: [200, 800, 400],
  accessibility: [200, 800, 400],
  // P2 扩展设计 7 章（2026-10-23）：区间按章性质估，待真实内容回填后校准
  uiux: [300, 1000, 500],
  level_design: [300, 1000, 500],
  live_ops: [300, 1000, 500],
  analytics: [300, 1000, 500],
  qa: [300, 1000, 500],
  publishing: [300, 1000, 500],
  performance: [300, 1000, 500]
}

/** 同行业基准（按游戏类型），含 default 键（与 旧版 INDUSTRY_BENCHMARKS 一致） */
export const INDUSTRY_BENCHMARKS: Record<string, Omit<CeshuIndustryBenchmark, 'game_type' | 'vs_structure' | 'vs_quality' | 'vs_market' | 'vs_total'>> = {
  RPG: { label: 'RPG / ARPG', structure_avg: 25, quality_avg: 30, market_avg: 22, total_avg: 77, top_games: ['原神', '古剑奇谭', '鬼谷八荒'] },
  MMORPG: { label: 'MMORPG', structure_avg: 26, quality_avg: 32, market_avg: 23, total_avg: 81, top_games: ['魔兽世界', '最终幻想 14', '剑网 3'] },
  ARPG: { label: 'ARPG', structure_avg: 24, quality_avg: 28, market_avg: 21, total_avg: 73, top_games: ['暗黑破坏神 4', '流放之路', '永劫无间'] },
  MOBA: { label: 'MOBA', structure_avg: 27, quality_avg: 33, market_avg: 24, total_avg: 84, top_games: ['英雄联盟', '王者荣耀', 'Dota 2'] },
  FPS: { label: 'FPS / TPS', structure_avg: 25, quality_avg: 30, market_avg: 22, total_avg: 77, top_games: ['CS2', '瓦罗兰特', 'Apex'] },
  SLG: { label: 'SLG / 战略', structure_avg: 26, quality_avg: 31, market_avg: 22, total_avg: 79, top_games: ['文明 6', '三国志', '全战'] },
  休闲益智: { label: '休闲 / 益智', structure_avg: 22, quality_avg: 26, market_avg: 20, total_avg: 68, top_games: ['开心消消乐', '羊了个羊', '糖豆人'] },
  放置: { label: '放置 / 挂机', structure_avg: 22, quality_avg: 25, market_avg: 19, total_avg: 66, top_games: ['剑与远征', '咸鱼之王', '放置奇兵'] },
  default: { label: '通用基准', structure_avg: 23, quality_avg: 28, market_avg: 20, total_avg: 71, top_games: [] }
}

/** 及格阈值（60% 视为及格，与 旧版 PASS_THRESHOLDS 一致） */
export const PASS_THRESHOLDS = { structure: 18, quality: 24, market: 18, total: 60 }

// 评分权重与满分常量（与 旧版 一致）
export const WEIGHT_COMPLETION = 0.5
export const WEIGHT_WORD_COUNT = 0.3
export const WEIGHT_REQUIRED = 0.2
export const STRUCT_WEIGHT_COMPLETION = 0.6
export const STRUCT_WEIGHT_REQUIRED = 0.4
export const STRUCT_FULL_SCORE = 30
export const QUALITY_FULL_SCORE = 40
export const CONSISTENCY_PENALTY_PER_ERROR = 2
export const CONSISTENCY_PENALTY_MAX = 15
export const MARKET_FULL_SCORE = 30

/** 市场潜力评分规则表：章节 -> [字段名, 分值, 最小长度或 null]（与 旧版 MARKET_SCORE_RULES 一致） */
export const MARKET_SCORE_RULES: Record<string, Array<[string, number, number | null]>> = {
  market_analysis: [
    ['target_market', 2, null],
    ['competitors', 3, 2],
    ['market_size', 2, null],
    ['kpi_forecast', 3, null]
  ],
  monetization: [
    ['payment_model', 2, null],
    ['pricing_tiers', 3, 3],
    ['iap_design', 3, null],
    ['arpu_target', 2, null]
  ],
  mvp: [
    ['mvp_scope', 3, null],
    ['mvp_timeline', 2, null],
    ['milestones', 3, 2],
    ['success_criteria', 2, null]
  ]
}

// 预编译正则：避免每次统计字数时重复编译（与 旧版 模块级预编译一致）
export const RE_CHINESE_CHARS = /[\u4e00-\u9fff]/g
export const RE_ENGLISH_WORDS = /[a-zA-Z0-9]+/g
