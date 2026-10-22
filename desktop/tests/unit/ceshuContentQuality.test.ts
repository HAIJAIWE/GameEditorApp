import { describe, expect, it } from 'vitest'

import {
  CLICHE_COUNT_THRESHOLD,
  CLICHE_RATE_THRESHOLD,
  LONG_SENTENCE_CHARS,
  analyzeChapterQuality,
  analyzeTextQuality,
  contentQualityIssues
} from '../../src/shared/ceshuContentQuality'

/**
 * 单测约定（与 tsconfig.node.json 一致：无 DOM lib，不使用 window/document）。
 * 句子拼接统一用「。」；中文标点同样计入 charCount（text.length 原样长度）。
 */

/** 40 字整（边界内，不算长句） */
const SENTENCE_40 = '一二三四五六七八九十'.repeat(4)
/** 41 字整（边界外，算长句） */
const SENTENCE_41 = `${SENTENCE_40}一`

/** 构造「k 句 × 8 字无数字句 + 1 句 3 字」的纯文本，用于数字具体性边界 */
function plainText(sentenceCount: number): string {
  const sentences = Array.from({ length: sentenceCount }, () => '一二三四五六七八')
  sentences.push('附加句')
  return sentences.join('。')
}

describe('analyzeTextQuality：基础信号与 0 值保护', () => {
  it('空文本：所有信号为 0，不产生 issue', () => {
    const signal = analyzeTextQuality('')
    expect(signal).toEqual({
      cliches: [],
      longSentenceRate: 0,
      listRate: 0,
      numericRate: 0,
      charCount: 0,
      sentenceCount: 0,
      lineCount: 0
    })
    expect(contentQualityIssues(signal, { chapterLabel: '第一章·产品愿景' })).toEqual([])
  })

  it('单行短文本：比率为 0、sentenceCount/lineCount 为 1，不产生 issue', () => {
    const signal = analyzeTextQuality('点击按钮即可开始游戏')
    expect(signal.cliches).toEqual([])
    expect(signal.longSentenceRate).toBe(0)
    expect(signal.listRate).toBe(0)
    expect(signal.numericRate).toBe(0)
    expect(signal.charCount).toBe(10)
    expect(signal.sentenceCount).toBe(1)
    expect(signal.lineCount).toBe(1)
    expect(contentQualityIssues(signal, { chapterLabel: '第一章·产品愿景' })).toEqual([])
  })

  it('换行同时是行边界与句边界；分号也是句边界', () => {
    const signal = analyzeTextQuality('第一段\n第二段；第三段')
    expect(signal.sentenceCount).toBe(3)
    expect(signal.lineCount).toBe(2)
    expect(Number.isFinite(signal.longSentenceRate)).toBe(true)
  })

  it('空白句/空行不参与分母（纯空白与纯标点不得产出 NaN）', () => {
    const blank = analyzeTextQuality('\n\n')
    expect(blank.sentenceCount).toBe(0)
    expect(blank.lineCount).toBe(0)
    expect(blank.longSentenceRate).toBe(0)
    expect(blank.numericRate).toBe(0)
    expect(blank.listRate).toBe(0)

    // 纯标点行算非空行（行级只看内容非空），但任何比率都不得是 NaN
    const punctOnly = analyzeTextQuality('。\n；')
    expect(punctOnly.sentenceCount).toBe(0)
    expect(punctOnly.lineCount).toBe(2)
    expect(punctOnly.listRate).toBe(0)
    expect(Number.isFinite(punctOnly.longSentenceRate)).toBe(true)
    expect(Number.isFinite(punctOnly.numericRate)).toBe(true)
  })
})

describe('空话套话判定：少量不报、密度超标才报', () => {
  it('少量命中（2 种 / 12 句）不报', () => {
    const text = [
      '战斗流畅爽快',
      '提供 3 种武器',
      '敌人数量为 12',
      '关卡共 8 个',
      '时长 5 分钟',
      '支持 2 人联机',
      '画质高清',
      '音效完整',
      '操作直观',
      '引导清晰',
      '反馈及时',
      '难度分层'
    ].join('。')
    const signal = analyzeTextQuality(text)
    expect(signal.cliches).toEqual(['流畅', '爽快'])
    expect(signal.cliches.length / signal.sentenceCount).toBeLessThan(CLICHE_RATE_THRESHOLD)
    expect(contentQualityIssues(signal, { chapterLabel: '第一章·产品愿景' })).toEqual([])
  })

  it('命中种数达标（4 种 ≥ 阈值）即报，文案带计数与省略号', () => {
    const signal = analyzeTextQuality('画面精美，操作流畅，体验爽快，整体高品质')
    expect(signal.cliches).toEqual(['精美', '流畅', '爽快', '高品质'])
    expect(signal.cliches.length).toBeGreaterThanOrEqual(CLICHE_COUNT_THRESHOLD)
    const issues = contentQualityIssues(signal, { chapterLabel: '第一章·产品愿景', fieldName: 'design_vision' })
    expect(issues).toEqual([
      '内容质量提示：第一章·产品愿景 design_vision 命中 4 个空话套话（精美、流畅、爽快…），建议换成具体描述'
    ])
  })

  it('密度达标才报：2 种 / 5 句（0.4 > 0.2）报', () => {
    const text = ['手感流畅', '节奏爽快', '难度共 3 档', '时长 10 分钟', '人数 2 人'].join('。')
    const signal = analyzeTextQuality(text)
    expect(signal.cliches.length).toBe(2)
    expect(signal.cliches.length / signal.sentenceCount).toBeGreaterThan(CLICHE_RATE_THRESHOLD)
    const issues = contentQualityIssues(signal, { chapterLabel: '第一章·产品愿景' })
    expect(issues).toEqual([
      '内容质量提示：第一章·产品愿景 命中 2 个空话套话（流畅、爽快），建议换成具体描述'
    ])
  })

  it('密度边界：1 种 / 5 句 = 0.2 不报；2 种 / 10 句 = 0.2 不报', () => {
    const single = analyzeTextQuality(['手感流畅', '难度 3 档', '时长 10 分钟', '人数 2 人', '关卡 4 个'].join('。'))
    expect(single.cliches.length / single.sentenceCount).toBe(CLICHE_RATE_THRESHOLD)
    expect(contentQualityIssues(single, { chapterLabel: '第一章·产品愿景' })).toEqual([])

    const double = analyzeTextQuality(
      ['手感流畅', '节奏爽快', '难度 3 档', '时长 10 分钟', '人数 2 人', '关卡 4 个', '武器 5 种', '敌人 12 类', '场景 8 张', '任务 6 条'].join('。')
    )
    expect(double.cliches.length).toBe(2)
    expect(double.cliches.length / double.sentenceCount).toBe(CLICHE_RATE_THRESHOLD)
    expect(contentQualityIssues(double, { chapterLabel: '第一章·产品愿景' })).toEqual([])
  })

  it('命中去重、按在文本中首次出现的顺序排列', () => {
    const signal = analyzeTextQuality('操作流畅，画面精美，体验爽快，再次流畅')
    expect(signal.cliches).toEqual(['流畅', '精美', '爽快'])
  })
})

describe('超长句判定：40 字边界', () => {
  it('40 字整不算长句；41 字整算长句（1/3 > 0.3 报）', () => {
    const shortOnly = analyzeTextQuality(`${SENTENCE_40}。${SENTENCE_40}。短`)
    expect(shortOnly.sentenceCount).toBe(3)
    expect(shortOnly.longSentenceRate).toBe(0)
    expect(contentQualityIssues(shortOnly, { chapterLabel: '第一章·产品愿景' })).toEqual([])

    const withLong = analyzeTextQuality(`${SENTENCE_40}。${SENTENCE_41}。短句结尾`)
    expect(withLong.sentenceCount).toBe(3)
    expect(withLong.longSentenceRate).toBeCloseTo(1 / 3, 10)
    expect(contentQualityIssues(withLong, { chapterLabel: '第一章·产品愿景' })).toEqual([
      `内容质量提示：第一章·产品愿景 长句偏多（>${LONG_SENTENCE_CHARS} 字占 33%），建议拆短`
    ])
  })

  it('长句率边界：1 长 / 4 句 = 0.25 不报', () => {
    const signal = analyzeTextQuality(`${SENTENCE_41}。短一。短二。短三`)
    expect(signal.longSentenceRate).toBeCloseTo(0.25, 10)
    expect(contentQualityIssues(signal, { chapterLabel: '第一章·产品愿景' })).toEqual([])
  })
})

describe('列表结构率判定：仅多行参与', () => {
  it('2 行不判定（lineCount < 3），即使无列表行', () => {
    const signal = analyzeTextQuality('第一行内容\n第二行内容')
    expect(signal.lineCount).toBe(2)
    expect(signal.listRate).toBe(0)
    expect(contentQualityIssues(signal, { chapterLabel: '第一章·产品愿景' })).toEqual([])
  })

  it('「- 」行占比计算正确；3 行 2 列表（0.67 ≥ 0.3）不报', () => {
    const signal = analyzeTextQuality('系统说明\n- 战斗系统\n- 成长系统')
    expect(signal.lineCount).toBe(3)
    expect(signal.listRate).toBeCloseTo(2 / 3, 10)
    expect(contentQualityIssues(signal, { chapterLabel: '第一章·产品愿景' })).toEqual([])
  })

  it('4 行 1 列表（0.25 < 0.3）报', () => {
    const signal = analyzeTextQuality('总体概述一段\n战斗系统说明\n成长系统说明\n- 社交系统')
    expect(signal.lineCount).toBe(4)
    expect(signal.listRate).toBeCloseTo(0.25, 10)
    expect(contentQualityIssues(signal, { chapterLabel: '第一章·产品愿景', fieldName: 'systems' })).toEqual([
      '内容质量提示：第一章·产品愿景 systems 多行内容未用「- 」列表结构，不利机器解析与扫读'
    ])
  })
})

describe('数字具体性判定', () => {
  it('含数字句识别正确（2/4 = 0.5）', () => {
    const signal = analyzeTextQuality('共 3 关。场景宏大。时长 2 小时。音乐悠扬')
    expect(signal.numericRate).toBeCloseTo(0.5, 10)
  })

  it('长文本（>120 字）无数字才报', () => {
    const signal = analyzeTextQuality(plainText(14))
    expect(signal.charCount).toBe(129)
    expect(signal.numericRate).toBe(0)
    expect(contentQualityIssues(signal, { chapterLabel: '第二章·核心玩法' })).toEqual([
      '内容质量提示：第二章·核心玩法 缺少可验证的数字或实例'
    ])
  })

  it('短文本（≤120 字）无数字不报；120 字整为边界不报', () => {
    const boundary = analyzeTextQuality(plainText(13))
    expect(boundary.charCount).toBe(120)
    expect(boundary.numericRate).toBe(0)
    expect(contentQualityIssues(boundary, { chapterLabel: '第二章·核心玩法' })).toEqual([])
  })
})

describe('analyzeChapterQuality：章级汇总', () => {
  it('遍历嵌套对象与数组；标量/布尔/空值不参与', () => {
    const signal = analyzeChapterQuality({
      a: { b: '战斗流畅爽快精彩' },
      c: ['第一行', '第二行'],
      d: 42,
      e: null,
      f: true
    })
    expect(signal.charCount).toBe(14)
    expect(signal.sentenceCount).toBe(3)
    expect(signal.lineCount).toBe(3)
    expect(signal.cliches).toEqual(['流畅', '爽快'])
    expect(signal.longSentenceRate).toBe(0)
    expect(signal.numericRate).toBe(0)
  })

  it('比率按字数加权平均（41×1 + 41×0）/ 82 = 0.5', () => {
    const signal = analyzeChapterQuality({
      a: '甲'.repeat(41),
      b: `${'乙'.repeat(20)}。${'丙'.repeat(20)}`
    })
    expect(signal.charCount).toBe(82)
    expect(signal.sentenceCount).toBe(3)
    expect(signal.longSentenceRate).toBeCloseTo(0.5, 10)
  })

  it('cliches 跨段并集去重；长文本无数字时报数字问题（章级省略字段名）', () => {
    const signal = analyzeChapterQuality({
      vision: '画面精美，操作流畅，体验爽快，整体高品质，内容丰富',
      detail: plainText(14)
    })
    expect(signal.cliches).toEqual(['精美', '流畅', '爽快', '高品质'])
    const issues = contentQualityIssues(signal, { chapterLabel: '第一章·产品愿景' })
    expect(issues.some((i) => i.includes('命中 4 个空话套话'))).toBe(true)
    expect(issues.some((i) => i.includes('缺少可验证的数字或实例'))).toBe(true)
    expect(issues.every((i) => i.startsWith('内容质量提示：第一章·产品愿景 '))).toBe(true)
  })

  it('空章节 / 无字符串章节：全部信号为 0，无 issue', () => {
    for (const data of [{}, { a: 1, b: [2, 3], c: { d: null } }]) {
      const signal = analyzeChapterQuality(data)
      expect(signal).toEqual({
        cliches: [],
        longSentenceRate: 0,
        listRate: 0,
        numericRate: 0,
        charCount: 0,
        sentenceCount: 0,
        lineCount: 0
      })
      expect(contentQualityIssues(signal, { chapterLabel: '第一章·产品愿景' })).toEqual([])
    }
  })
})

describe('contentQualityIssues：文案格式', () => {
  it('带 fieldName 拼「章节标签 字段名」，不带时只拼章节标签', () => {
    const signal = analyzeTextQuality('画面精美，操作流畅，体验爽快，整体高品质')
    const withField = contentQualityIssues(signal, { chapterLabel: '第一章·产品愿景', fieldName: 'design_vision' })
    expect(withField[0]).toContain('第一章·产品愿景 design_vision')

    const withoutField = contentQualityIssues(signal, { chapterLabel: '第一章·产品愿景' })
    expect(withoutField[0]).toContain('第一章·产品愿景 命中')
    expect(withoutField[0]).not.toContain('design_vision')
  })

  it('所有条目前缀统一为「内容质量提示：」', () => {
    const signal = analyzeChapterQuality({
      a: '甲'.repeat(41),
      b: '总体概述一段\n战斗系统说明\n成长系统说明\n- 社交系统',
      c: plainText(14)
    })
    // 长句被短段稀释后 41/194≈0.21 未超标，最终只剩列表结构与数字两条
    expect(contentQualityIssues(signal, { chapterLabel: '第三章·战斗系统', fieldName: 'combat' })).toEqual([
      '内容质量提示：第三章·战斗系统 combat 多行内容未用「- 」列表结构，不利机器解析与扫读',
      '内容质量提示：第三章·战斗系统 combat 缺少可验证的数字或实例'
    ])
  })
})
