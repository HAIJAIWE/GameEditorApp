import { isPlainObject } from './util/guards'

/**
 * 「写对」代理指标：机器可判定的内容质量信号（纯函数，供校验链使用）。
 *
 * 背景：现有 ceshuScorer 的「内容质量 40 分」只看字数是否落在基准区间，
 * 奖励的是「写满」而不是「写对」——AI 产出容易又长又空（空话套话、长句、
 * 无可验证数字），机器完全测不出来。本模块把「写对」拆成四个可判定信号：
 *   1. 空话套话密度（命中清单且密度超标才报，少量命中不报）
 *   2. 超长句比例（> 40 字的句子占比）
 *   3. 列表结构率（多行内容是否用「- 」组织，利于机器解析与扫读）
 *   4. 数字具体性（含数字的句子占比，衡量可验证性）
 * 只读字符串、不碰 fs/网络/React，可被 Node 直接单测。
 */

/** 空话套话清单（命中即记录；可后续扩充） */
export const CLICHE_PHRASES: readonly string[] = [
  '丰富多样',
  '深度融合',
  '极致体验',
  '沉浸式体验',
  '爽快',
  '精美',
  '流畅',
  '多样化',
  '全方位',
  '创新性',
  '高品质',
  '良好体验'
]

/** 空话密度告警阈值（命中种数） */
export const CLICHE_COUNT_THRESHOLD = 3
/** 空话密度告警阈值（占句子比例） */
export const CLICHE_RATE_THRESHOLD = 0.2
/** 超长句字数界限 */
export const LONG_SENTENCE_CHARS = 40
/** 超长句比例告警阈值 */
export const LONG_SENTENCE_RATE_THRESHOLD = 0.3
/** 列表结构率告警阈值（仅对多行字段） */
export const LIST_RATE_THRESHOLD = 0.3
/** 参与列表判定的最少非空行数 */
export const LIST_MIN_LINES = 3
/** 含数字句子比例告警阈值 */
export const NUMERIC_RATE_THRESHOLD = 0.15
/** 参与数字判定的最少字数 */
export const NUMERIC_MIN_CHARS = 120
/** 值得分析的最少字数（比数字判定更宽：短字段没有分析价值，但不该被数字门槛挡掉） */
export const ANALYSIS_MIN_CHARS = 60

/** 单段文本的内容质量信号 */
export interface ContentQualitySignal {
  cliches: string[]
  longSentenceRate: number
  listRate: number
  numericRate: number
  charCount: number
  /** 参与判定的句子数（断句后） */
  sentenceCount: number
  /** 参与判定的非空行数 */
  lineCount: number
}

/** 断句标点：中文句末标点 + 分号 + 换行（换行视作硬边界，避免把多行粘成一句） */
const SENTENCE_SPLIT_RE = /[。！？；\n]/
/** 数字检测：至少一个 0-9，是可验证数字的最小机器信号 */
const DIGIT_RE = /\d/
/** 列表行前缀：Markdown 无序列表项 */
const LIST_PREFIX = '- '

/** 断句并去掉空白句（空串不参与任何比率分母，保证 0 值保护） */
function splitSentences(text: string): string[] {
  return text
    .split(SENTENCE_SPLIT_RE)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/** 按行拆分并去掉空行（lineCount/listRate 的分母只数非空行） */
function splitLines(text: string): string[] {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/** 比率计算：分母为 0 时恒返回 0（无句子/无行不能产出 NaN 污染下游加权） */
function rate(part: number, total: number): number {
  return total > 0 ? part / total : 0
}

/** 命中空话去重、按在文本中首次出现的顺序排列（把最扎眼的放前面） */
function detectCliches(text: string): string[] {
  const hits: Array<{ phrase: string; index: number }> = []
  for (const phrase of CLICHE_PHRASES) {
    const index = text.indexOf(phrase)
    if (index >= 0) hits.push({ phrase, index })
  }
  hits.sort((a, b) => a.index - b.index)
  return hits.map((h) => h.phrase)
}

/** 分析一段文本（纯函数） */
export function analyzeTextQuality(text: string): ContentQualitySignal {
  const sentences = splitSentences(text)
  const lines = splitLines(text)
  const longSentenceCount = sentences.filter((s) => s.length > LONG_SENTENCE_CHARS).length
  const listLineCount = lines.filter((l) => l.startsWith(LIST_PREFIX)).length
  const numericSentenceCount = sentences.filter((s) => DIGIT_RE.test(s)).length
  return {
    cliches: detectCliches(text),
    longSentenceRate: rate(longSentenceCount, sentences.length),
    listRate: rate(listLineCount, lines.length),
    numericRate: rate(numericSentenceCount, sentences.length),
    charCount: text.length,
    sentenceCount: sentences.length,
    lineCount: lines.length
  }
}

/** 递归收集章节数据里的所有字符串值（含数组元素与嵌套对象；其余类型不参与） */
function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    out.push(value)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out)
    return
  }
  if (isPlainObject(value)) {
    for (const item of Object.values(value)) collectStrings(item, out)
  }
}

/** 按字数加权平均逐段信号；cliches 取并集（去重、保持出现顺序） */
function mergeSignals(signals: ContentQualitySignal[], totalChars: number): ContentQualitySignal {
  const cliches: string[] = []
  for (const signal of signals) {
    for (const phrase of signal.cliches) {
      if (!cliches.includes(phrase)) cliches.push(phrase)
    }
  }
  // 长文本的段落理应主导章级判断，故三项比率统一按 charCount 加权
  const weightedRate = (pick: (s: ContentQualitySignal) => number): number =>
    totalChars > 0 ? signals.reduce((sum, s) => sum + pick(s) * s.charCount, 0) / totalChars : 0
  return {
    cliches,
    longSentenceRate: weightedRate((s) => s.longSentenceRate),
    listRate: weightedRate((s) => s.listRate),
    numericRate: weightedRate((s) => s.numericRate),
    charCount: totalChars,
    sentenceCount: signals.reduce((sum, s) => sum + s.sentenceCount, 0),
    lineCount: signals.reduce((sum, s) => sum + s.lineCount, 0)
  }
}

/** 汇总一章的信号（遍历章节数据里的所有字符串值，含数组元素与嵌套对象，逐段分析后按字数加权平均） */
export function analyzeChapterQuality(chapterData: Record<string, unknown>): ContentQualitySignal {
  const texts: string[] = []
  collectStrings(chapterData, texts)
  const signals = texts.map(analyzeTextQuality)
  const totalChars = signals.reduce((sum, s) => sum + s.charCount, 0)
  return mergeSignals(signals, totalChars)
}

/** 生成中文问题提示（无问题返回空数组）；fieldName 可空（章级汇总时省略） */
export function contentQualityIssues(
  signal: ContentQualitySignal,
  context: { chapterLabel: string; fieldName?: string }
): string[] {
  const { chapterLabel, fieldName } = context
  const target = fieldName ? `${chapterLabel} ${fieldName}` : chapterLabel
  const issues: string[] = []

  // 空话：少量命中不报（「流畅」形容操作可能合理），种数或密度超标才报
  const clicheCount = signal.cliches.length
  const clicheRate = clicheCount / Math.max(1, signal.sentenceCount)
  if (clicheCount >= CLICHE_COUNT_THRESHOLD || clicheRate > CLICHE_RATE_THRESHOLD) {
    const shown = signal.cliches.slice(0, 3)
    const ellipsis = clicheCount > shown.length ? '…' : ''
    issues.push(
      `内容质量提示：${target} 命中 ${clicheCount} 个空话套话（${shown.join('、')}${ellipsis}），建议换成具体描述`
    )
  }

  if (signal.longSentenceRate > LONG_SENTENCE_RATE_THRESHOLD) {
    const pct = Math.round(signal.longSentenceRate * 100)
    issues.push(`内容质量提示：${target} 长句偏多（>${LONG_SENTENCE_CHARS} 字占 ${pct}%），建议拆短`)
  }

  // 列表结构只对多行内容有意义：单行字段（如一句话定位）不适用列表化要求
  if (signal.lineCount >= LIST_MIN_LINES && signal.listRate < LIST_RATE_THRESHOLD) {
    issues.push(`内容质量提示：${target} 多行内容未用「${LIST_PREFIX}」列表结构，不利机器解析与扫读`)
  }

  // 短文本不强制塞数字（如名称、标签），仅长文本要求可验证性
  if (signal.numericRate < NUMERIC_RATE_THRESHOLD && signal.charCount > NUMERIC_MIN_CHARS) {
    issues.push(`内容质量提示：${target} 缺少可验证的数字或实例`)
  }

  return issues
}

/**
 * 带选项的问题提示（校验链集成用）。
 *
 * `checkListStructure: false` 用于**已经是结构化列表的字段**（stringList/pipeList：
 * 值本身是数组，拼成多行也没有 `- ` 前缀）——对它们要求「列表结构」是误报，
 * 故由调用方按字段 kind 关掉这项检查。
 */
export function contentQualityIssuesWith(
  signal: ContentQualitySignal,
  context: { chapterLabel: string; fieldName?: string },
  options: { checkListStructure?: boolean } = {}
): string[] {
  const all = contentQualityIssues(signal, context)
  if (options.checkListStructure !== false) return all
  return all.filter((message) => !message.includes('列表结构'))
}
