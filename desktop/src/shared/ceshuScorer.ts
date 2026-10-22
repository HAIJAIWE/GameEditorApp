import { CHAPTER_KEYS, CHAPTER_LABELS, CHAPTER_REQUIRED_FIELDS, type CeshuDocument } from './ceshuConstants'
import { computeChapterProgress, isPlainObject } from './ceshuModel'
import { validateCeshu } from './ceshuValidation'
import { classifyValidationMessage } from './ceshuValidationGroups'

/**
 * N4: 工业级 GDD 评分引擎（自 Python core/ceshu/ceshu_scorer.py 匹平迁移）。
 * 三维度（总分 100）：结构完整度 30 + 内容质量 40 + 市场潜力 30。
 */

import {
  CHAPTER_WORD_BENCHMARK,
  INDUSTRY_BENCHMARKS,
  PASS_THRESHOLDS,
  WEIGHT_COMPLETION,
  WEIGHT_WORD_COUNT,
  WEIGHT_REQUIRED,
  STRUCT_WEIGHT_COMPLETION,
  STRUCT_WEIGHT_REQUIRED,
  STRUCT_FULL_SCORE,
  QUALITY_FULL_SCORE,
  CONSISTENCY_PENALTY_PER_ERROR,
  CONSISTENCY_PENALTY_MAX,
  MARKET_FULL_SCORE,
  MARKET_SCORE_RULES,
  RE_CHINESE_CHARS,
  RE_ENGLISH_WORDS,
  type CeshuChapterScore,
  type CeshuIndustryBenchmark,
  type CeshuScoreReport
} from './ceshuScorerData'
export * from './ceshuScorerData'

/** Python 真值语义：null/undefined/''/0/false/空数组/空对象 → false */
function pyTruthy(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return value !== ''
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}

/** Python `v in (None, "", [], {})`：null/undefined/''/空数组/空对象 视为缺失（0/false 不算） */
function isMissingRequired(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return true
  if (Array.isArray(value)) return value.length === 0
  if (isPlainObject(value)) return Object.keys(value).length === 0
  return false
}

/** Python len()：字符串/数组取长度，普通对象取键数，其余 0 */
function pyLen(value: unknown): number {
  if (typeof value === 'string' || Array.isArray(value)) return value.length
  if (isPlainObject(value)) return Object.keys(value).length
  return 0
}

/** 递归统计章节字数（中文按字符 + 英文按词；递归 str/dict/list，其余 0，与 Python 一致） */
export function countWordsInChapter(chapterData: unknown): number {
  if (typeof chapterData === 'string') {
    const chineseChars = (chapterData.match(RE_CHINESE_CHARS) ?? []).length
    const englishWords = (chapterData.match(RE_ENGLISH_WORDS) ?? []).length
    return chineseChars + englishWords
  }
  if (Array.isArray(chapterData)) {
    return chapterData.reduce<number>((sum, item) => sum + countWordsInChapter(item), 0)
  }
  if (isPlainObject(chapterData)) {
    return Object.values(chapterData).reduce<number>((sum, value) => sum + countWordsInChapter(value), 0)
  }
  return 0
}

/** Python int()：向零截断（用于 pct*100） */
function pyInt(value: number): number {
  return Math.trunc(value)
}

/** Python round(x, 1)：四舍五入到 1 位（与 Python banker's rounding 的差异可忽略） */
function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function gradeFromScore(score: number): string {
  if (score >= 90) return 'S'
  if (score >= 80) return 'A'
  if (score >= 70) return 'B'
  if (score >= 60) return 'C'
  return 'D'
}

/** 等级对应的中文文字说明（与 Python _grade_label 一致） */
export function gradeLabel(grade: string): string {
  const labels: Record<string, string> = {
    S: 'S 卓越 — 工业级标杆',
    A: 'A 优秀 — 接近工业级',
    B: 'B 良好 — 基本达标',
    C: 'C 合格 — 待优化',
    D: 'D 不足 — 需重做'
  }
  return labels[grade] ?? '未知'
}

/** 判断完成度是否为数值（对应 Python isinstance(pct, (int, float)) 的守卫） */
function isNumeric(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** 遍历全部章节计算单章评分（不受 lite 档裁剪——与 Python 行为一致：始终评全部章节） */
function scoreChapters(doc: CeshuDocument): CeshuChapterScore[] {
  const progress = computeChapterProgress(doc)
  const chapterScores: CeshuChapterScore[] = []
  for (const key of CHAPTER_KEYS) {
    const label = CHAPTER_LABELS[key] ?? key
    const pct = progress[key] ?? 0
    const pctVal = isNumeric(pct) ? pyInt(pct * 100) : 0

    const chapterData = doc[key] as Record<string, unknown>
    const wordCount = countWordsInChapter(chapterData)
    // 基准表按 ChapterKey 收口：漏配章节会在编译期报错，故此处不再需要
    // `?? [0,0,0]` 兜底——那个兜底曾把「合并后漏配的 story 章」静默按 0 基准算分
    const benchmark = CHAPTER_WORD_BENCHMARK[key]

    // 必填字段检查（与校验模块不同：空对象 {} 也视为缺失）
    const required = CHAPTER_REQUIRED_FIELDS[key] ?? []
    const missing: string[] = []
    if (required.length > 0 && isPlainObject(chapterData)) {
      for (const field of required) {
        if (isMissingRequired(chapterData[field])) missing.push(field)
      }
    }
    const hasRequired = missing.length === 0

    // 单章评分：完成度 50% + 字数达标 30% + 必填字段 20%
    const completionScore = Math.min(100, pctVal)
    let wordScore = 100
    if (benchmark[2] > 0) {
      if (wordCount === 0) {
        wordScore = 0
      } else if (wordCount < benchmark[0]) {
        wordScore = 30
      } else if (wordCount < benchmark[2]) {
        wordScore = 60 + pyInt((40 * (wordCount - benchmark[0])) / Math.max(1, benchmark[2] - benchmark[0]))
      } else if (wordCount <= benchmark[1]) {
        wordScore = 100
      } else {
        wordScore = 90 // 略超不算扣分
      }
    }
    const requiredScore = hasRequired ? 100 : Math.max(0, 100 - 30 * missing.length)
    const chScore = completionScore * WEIGHT_COMPLETION + wordScore * WEIGHT_WORD_COUNT + requiredScore * WEIGHT_REQUIRED

    const notes: string[] = []
    if (pctVal < 50) notes.push(`完成度仅 ${pctVal}%，需补充内容`)
    if (wordCount < benchmark[0] && benchmark[0] > 0) notes.push(`字数 ${wordCount} < 最低标准 ${benchmark[0]}`)
    if (missing.length > 0) notes.push(`缺失必填字段: ${missing.join(', ')}`)

    chapterScores.push({
      chapter_key: key,
      chapter_label: label,
      score: round1(chScore),
      completion: pct,
      word_count: wordCount,
      benchmark_word: benchmark,
      has_required: hasRequired,
      missing_required: missing,
      notes
    })
  }
  return chapterScores
}

/** 结构分统计信息（对应 Python _calc_structure_score 返回的 info + empty_count） */
interface StructureInfo {
  score: number
  emptyCount: number
  missingRequiredTotal: Array<[string, string[]]>
  missingRequiredCount: number
}

/** 计算结构完整度分（满分 30）与统计信息 */
function calcStructureScore(chapterScores: CeshuChapterScore[]): StructureInfo {
  let completedCount = 0
  let halfCount = 0
  let emptyCount = 0
  const missingRequiredTotal: Array<[string, string[]]> = []

  for (const c of chapterScores) {
    const pctVal = isNumeric(c.completion) ? pyInt(c.completion * 100) : 0
    if (pctVal >= 100) completedCount += 1
    else if (pctVal > 0) halfCount += 1
    else emptyCount += 1
    if (c.missing_required.length > 0) missingRequiredTotal.push([c.chapter_key, c.missing_required])
  }

  const completionRate = (completedCount * 1.0 + halfCount * 0.5) / CHAPTER_KEYS.length
  const totalRequired = CHAPTER_KEYS.reduce((sum, key) => sum + (CHAPTER_REQUIRED_FIELDS[key]?.length ?? 0), 0)
  const missingRequiredCount = missingRequiredTotal.reduce((sum, [, miss]) => sum + miss.length, 0)
  const requiredCoverage = 1.0 - missingRequiredCount / Math.max(1, totalRequired)
  const score = round1((completionRate * STRUCT_WEIGHT_COMPLETION + requiredCoverage * STRUCT_WEIGHT_REQUIRED) * STRUCT_FULL_SCORE)

  return { score, emptyCount, missingRequiredTotal, missingRequiredCount }
}

/** 计算内容质量分（满分 40）：平均章节分折算 - 一致性扣分，clamp 到 0~40 */
function calcQualityScore(chapterScores: CeshuChapterScore[], doc: CeshuDocument): { score: number; errors: string[] } {
  const avgChapterScore =
    chapterScores.length > 0 ? chapterScores.reduce((sum, c) => sum + c.score, 0) / chapterScores.length : 0

  // 一致性校验（异常时按无错误处理，对应 Python logger.warning 分支）
  let errors: string[]
  try {
    errors = validateCeshu(doc) ?? []
  } catch {
    errors = []
  }

  const consistencyPenalty = Math.min(
    CONSISTENCY_PENALTY_MAX,
    hardErrorCount(errors) * CONSISTENCY_PENALTY_PER_ERROR
  )
  let qualityScore = round1((avgChapterScore / 100) * QUALITY_FULL_SCORE - consistencyPenalty)
  qualityScore = Math.max(0, Math.min(QUALITY_FULL_SCORE, qualityScore))
  return { score: qualityScore, errors }
}

/**
 * 只数「硬错误」——2026-10-23 复刻演练（完整案例 289 字段）暴露：
 * 此前 validateCeshu 的**全部输出**（含「人定字段待填」状态提示、「内容质量提示」
 * 长句/空话风格建议、「一致性警告」级提醒）都按条扣质量分，满额惩罚 15/40。
 * 后果：一份填满 275 字段的完整策划书，仅因 7 条提示就被砍 15 分质量分
 * （章均分 89.9，质量分却只有 21）——评分在惩罚「有提示」而不是「有错误」。
 *
 * 口径与校验面板同一套分类（classifyValidationMessage，severity==='error'：
 * 必填缺失/格式异常/一致性冲突/依赖缺失）；提示级（人定待填/质量提示/
 * 一致性警告/重复/术语）仍全量展示在报告里，只是不扣分。
 */
function hardErrorCount(messages: readonly string[]): number {
  return messages.filter((message) => classifyValidationMessage(message).severity === 'error').length
}

/** 按规则表为单个市场章节评分（非 dict 返回 0；字段 falsy 不计分；最小长度不达标不计分） */
function scoreMarketSection(data: unknown, rules: Array<[string, number, number | null]>): number {
  if (!isPlainObject(data)) return 0
  let score = 0
  for (const [fieldName, points, minLen] of rules) {
    const value = data[fieldName]
    if (!pyTruthy(value)) continue
    if (minLen !== null && pyLen(value) < minLen) continue
    score += points
  }
  return score
}

/** 计算市场潜力分（满分 30）：市场分析 + 商业模式 + MVP 各 10 分，另对愿景差异化 +1 加分 */
function calcMarketScore(doc: CeshuDocument): number {
  let score = 0
  score += scoreMarketSection(doc.market_analysis, MARKET_SCORE_RULES.market_analysis)
  score += scoreMarketSection(doc.monetization, MARKET_SCORE_RULES.monetization)
  score += scoreMarketSection(doc.mvp, MARKET_SCORE_RULES.mvp)

  const visionData = doc.vision
  if (isPlainObject(visionData) && pyTruthy(visionData.differentiation)) {
    score = Math.min(MARKET_FULL_SCORE, score + 1)
  }
  return round1(score)
}

/** 生成改进建议清单（与 Python _build_suggestions 一致，含 emoji） */
function buildSuggestions(params: {
  emptyCount: number
  missingRequiredTotal: Array<[string, string[]]>
  missingRequiredCount: number
  errors: string[]
  chapterScores: CeshuChapterScore[]
  structureScore: number
  qualityScore: number
  marketScore: number
}): string[] {
  const { emptyCount, missingRequiredTotal, missingRequiredCount, errors, chapterScores, structureScore, qualityScore, marketScore } = params
  const suggestions: string[] = []
  if (emptyCount > 0) {
    suggestions.push(`📋 有 ${emptyCount} 章完全未填写，请优先补全核心章节（meta/vision/gameplay）`)
  }
  if (missingRequiredTotal.length > 0) {
    suggestions.push(`⚠️ 共缺失 ${missingRequiredCount} 个必填字段，影响结构完整度评分`)
    for (const [key, miss] of missingRequiredTotal.slice(0, 5)) {
      const label = CHAPTER_LABELS[key as keyof typeof CHAPTER_LABELS] ?? key
      suggestions.push(`   - ${label}: ${miss.join(', ')}`)
    }
  }
  if (errors.length > 0) {
    suggestions.push(`🔍 校验发现 ${errors.length} 个一致性问题，建议通过「校验」按钮查看详情`)
  }
  const lowWordChapters = chapterScores.filter((c) => c.word_count < c.benchmark_word[0] && c.benchmark_word[0] > 0)
  if (lowWordChapters.length > 0) {
    suggestions.push(`📝 ${lowWordChapters.length} 章字数低于最低标准，建议扩充内容`)
  }
  if (structureScore < 20) suggestions.push('🏗️ 结构完整度偏低，建议优先补全必填字段')
  if (qualityScore < 25) suggestions.push('✍️ 内容质量偏低，建议参考「字数」按钮的写作建议')
  if (marketScore < 20) suggestions.push('📈 市场潜力偏低，建议完善市场分析、商业模式、MVP 规划三章')

  if (suggestions.length === 0) suggestions.push('✅ 各维度表现良好，已达到工业级标准！')
  return suggestions
}

/** 构建同行业基准对比数据（game_type 精确匹配，未命中用 default） */
function buildIndustryBenchmark(doc: CeshuDocument, structure: number, quality: number, market: number, total: number): CeshuIndustryBenchmark {
  const rawType = isPlainObject(doc.meta) ? doc.meta.game_type : ''
  const gameType = typeof rawType === 'string' ? rawType : ''
  const benchmark = INDUSTRY_BENCHMARKS[gameType] ?? INDUSTRY_BENCHMARKS.default
  return {
    game_type: gameType,
    label: benchmark.label,
    structure_avg: benchmark.structure_avg,
    quality_avg: benchmark.quality_avg,
    market_avg: benchmark.market_avg,
    total_avg: benchmark.total_avg,
    top_games: benchmark.top_games,
    vs_structure: round1(structure - benchmark.structure_avg),
    vs_quality: round1(quality - benchmark.quality_avg),
    vs_market: round1(market - benchmark.market_avg),
    vs_total: round1(total - benchmark.total_avg)
  }
}

/** 计算各维度及格状态（对照 PASS_THRESHOLDS） */
function buildPassStatus(structure: number, quality: number, market: number, total: number): CeshuScoreReport['pass_status'] {
  return {
    structure: structure >= PASS_THRESHOLDS.structure,
    quality: quality >= PASS_THRESHOLDS.quality,
    market: market >= PASS_THRESHOLDS.market,
    total: total >= PASS_THRESHOLDS.total
  }
}

/* ---- Markdown 报告（对应 Python score_report_dialog._build_markdown） ---- */

/** 有符号差距格式化：对齐 Python `f"{x:+.1f}"`（恒带符号 + 一位小数，如 +5.5 / -3.0） */
function formatSignedDiff(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}`
}

/** 章节明细表格单元格转义：转义管道符，避免破坏 Markdown 表格（与 ceshuChecklist 同款） */
function escapeScoreCell(text: string): string {
  return text.replace(/\|/g, '\\|')
}

/**
 * 生成评分报告的 Markdown 文本（逐节对齐 Python `score_report_dialog._build_markdown`，603 行）。
 * 纯函数：`gameName`/`gameType`/`timestamp` 由调用方传入，便于渲染层展示与测试固定。
 */
export function buildScoreReportMarkdown(
  gameName: string,
  gameType: string,
  report: CeshuScoreReport,
  timestamp: string
): string {
  const r = report
  const lines: string[] = [
    '# 工业级 GDD 评分报告',
    '',
    `**游戏名称**: ${gameName || '未命名'}`,
    `**游戏类型**: ${gameType || '未知'}`,
    `**评分时间**: ${timestamp}`,
    '',
    '## 总评',
    '',
    `- **总分**: ${r.total_score.toFixed(1)} / 100`,
    `- **等级**: ${r.grade} (${gradeLabel(r.grade)})`,
    `- **结构完整度**: ${r.structure_score.toFixed(1)} / 30`,
    `- **内容质量**: ${r.content_quality_score.toFixed(1)} / 40`,
    `- **市场潜力**: ${r.market_potential_score.toFixed(1)} / 30`,
    '',
    '## 章节明细',
    '',
    '| 章节 | 评分 | 完成度 | 字数 | 必填字段 | 备注 |',
    '|------|------|--------|------|----------|------|'
  ]
  for (const cs of r.chapter_scores) {
    const pct = pyInt(cs.completion * 100)
    const req = cs.has_required ? '齐全' : `缺 ${cs.missing_required.length}`
    const notes = cs.notes.length > 0 ? escapeScoreCell(cs.notes.join('; ')) : '—'
    lines.push(
      `| ${escapeScoreCell(cs.chapter_label)} | ${cs.score.toFixed(1)} | ${pct}% | ${cs.word_count} | ${req} | ${notes} |`
    )
  }

  lines.push('', '## 改进建议', '')
  for (const suggestion of r.suggestions) {
    lines.push(`- ${suggestion}`)
  }

  lines.push(
    '',
    '## 同行业对比',
    '',
    `- **行业**: ${r.industry_benchmark.label || '未知'}`,
    `- **行业平均总分**: ${r.industry_benchmark.total_avg.toFixed(1)}`,
    `- **你的总分**: ${r.total_score.toFixed(1)}`,
    `- **差距**: ${formatSignedDiff(r.industry_benchmark.vs_total)}`
  )
  if (r.industry_benchmark.top_games.length > 0) {
    lines.push(`- **行业代表**: ${r.industry_benchmark.top_games.join(', ')}`)
  }

  return lines.join('\n')
}

/** N4: 评估 CeshuDocument 的工业级 GDD 评分 */
export function scoreCeshu(doc: CeshuDocument): CeshuScoreReport {
  const chapterScores = scoreChapters(doc)
  const structure = calcStructureScore(chapterScores)
  const quality = calcQualityScore(chapterScores, doc)
  const marketScore = calcMarketScore(doc)

  const total = round1(structure.score + quality.score + marketScore)
  const grade = gradeFromScore(total)

  const suggestions = buildSuggestions({
    emptyCount: structure.emptyCount,
    missingRequiredTotal: structure.missingRequiredTotal,
    missingRequiredCount: structure.missingRequiredCount,
    errors: quality.errors,
    chapterScores,
    structureScore: structure.score,
    qualityScore: quality.score,
    marketScore
  })
  const industryBenchmark = buildIndustryBenchmark(doc, structure.score, quality.score, marketScore, total)
  const passStatus = buildPassStatus(structure.score, quality.score, marketScore, total)

  return {
    total_score: total,
    structure_score: structure.score,
    content_quality_score: quality.score,
    market_potential_score: marketScore,
    grade,
    chapter_scores: chapterScores,
    suggestions,
    industry_benchmark: industryBenchmark,
    pass_status: passStatus
  }
}