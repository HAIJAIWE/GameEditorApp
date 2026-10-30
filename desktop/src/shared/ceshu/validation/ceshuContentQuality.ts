import { isPlainObject } from '../../util/object/guards'

/**
 * 「写对」代理指标：机器可判定的内容质量信号（纯函数，供校验链与完备度共用）。
 *
 * 背景：改造前评分引擎的「内容质量 40 分」只看字数是否落在基准区间，
 * 奖励的是「写满」而不是「写对」——AI 产出容易又长又空（空话套话、长句、
 * 无可验证数字），机器完全测不出来。本模块把「写对」拆成四个可判定信号：
 *   1. 空话套话密度（命中清单且密度超标才报，少量命中不报）
 *   2. 超长句比例（> 50 字的句子占比，阈值经人类写作校准）
 *   3. 列表结构率（多行内容是否用「- 」组织，利于机器解析与扫读）
 *   4. 数字具体性（含数字的句子占比，衡量可验证性）
 * 只读字符串、不碰 fs/网络/React，可被 Node 直接单测。
 *
 * 两个消费方（2026-10-27 起）：
 *   · 校验链 `ceshuValidation` → `contentQualityIssues()`：逐条给「内容质量提示」；
 *   · 完备度 `ceshuReadiness` → `analyzeChapterQuality()` + `contentQualityIssues()`：
 *     填进逐章的 `quality_notes`，让「写满但空」在完备度里也被点出来。
 *
 * ⚠️ 曾经的第三个消费方（评分引擎的 `contentQualityFactor()`，把系数乘到字数分上）
 * 已随 100 分制一起删除 —— 那是「字数=质量」的最后一处残留。
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
/**
 * 超长句字数界限。
 *
 * 2026-10-23 用 docs/ 下 161 段人类真实写作校准：40 字线对人类技术/策划
 * 写作误报严重（长句率均值 0.375、P90 达 1.0，81% 的段落被标记）。
 * 中文一句话 50 字以上才公认算长句，故从 40 放宽到 50。
 */
export const LONG_SENTENCE_CHARS = 50
/**
 * 超长句比例告警阈值。
 * 同轮校准：人类写作均值 0.375，0.3 的阈值会把正常写作普遍标记——
 * 提示疲劳比漏报更糟（人会学会忽略所有提示）。放宽到 0.5：
 * 只抓「一半以上句子都超长」的极端情况。
 */
export const LONG_SENTENCE_RATE_THRESHOLD = 0.5
/** 列表结构率告警阈值（仅作 signal 消费方参考；字段级不再据此报问题，见 contentQualityIssues 内注释） */
export const LIST_RATE_THRESHOLD = 0.3
/** 列表结构率有意义的最少非空行数（同上，仅参考） */
export const LIST_MIN_LINES = 3
/** 含数字句子比例告警阈值 */
export const NUMERIC_RATE_THRESHOLD = 0.15
/**
 * 参与数字判定的最少字数。
 * 2026-10-23 校准：120 字时人类写作误报约 9%，放宽到 200——
 * 短描述（如设计理念）没有数字完全正常，只有长文才谈得上「要可验证」。
 */
export const NUMERIC_MIN_CHARS = 200
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

  /*
   * 列表结构率**不进字段级问题输出**（2026-10-23 校准决策）：
   * 用 docs/ 下 161 段人类真实写作验证，要求「多行文本用 '- '前缀」会把
   * 正常散文普遍标记（写作指南 109 段误报 60+ 条）。且该要求与三件套拆分
   * 设计自相矛盾——本体字段的契约就是「一段概述」，可核对的条目本该在
   * points 字段（它本身就是 stringList，天然结构化）。
   * signal.listRate 仍保留在信号里，供 UI 展示或将来的章级汇总消费。
   */

  // 短文本不强制塞数字（如名称、标签），仅长文本要求可验证性。
  // 门槛 200 字同为校准结果：120 字时人类技术/策划写作误报约 9%，
  // 「一段设计理念没数字」在策划语境里完全正常。
  if (signal.numericRate < NUMERIC_RATE_THRESHOLD && signal.charCount > NUMERIC_MIN_CHARS) {
    issues.push(`内容质量提示：${target} 缺少可验证的数字或实例`)
  }

  return issues
}

