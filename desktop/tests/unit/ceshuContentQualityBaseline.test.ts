import { describe, expect, it } from 'vitest'

import {
  CLICHE_COUNT_THRESHOLD,
  LONG_SENTENCE_CHARS,
  LONG_SENTENCE_RATE_THRESHOLD,
  NUMERIC_MIN_CHARS,
  analyzeTextQuality,
  contentQualityIssues
} from '../../src/shared/ceshu/validation'

/*
 * 「写对」指标的**人类写作基线**（2026-10-23 校准实验的固化）。
 *
 * 背景：指标上线后用 docs/ 下 161 段人类真实写作回测，发现初版阈值
 * （长句 40 字 / 0.3、数字门槛 120）会把 81% 的正常段落标记——提示比漏报
 * 更糟的情况是「提示疲劳」：人会学会忽略所有提示，真问题也被淹没。
 * 阈值按校准数据放宽后（50 字 / 0.5 / 200 字），用本测试锁住两类边界：
 *   ① 人类正常写作（长句、无数字、散文段落）不得触发；
 *   ② 真正的「又长又空」必须触发。
 * 将来若有人把阈值调严，这里会失败并要求重新做校准——不许拍脑袋。
 */

/** 人类正常写作样本：技术/策划文档风格，有长有短的多句段落、无空话词 */
const HUMAN_SAMPLES: readonly string[] = [
  '战斗系统的设计目标是在保证操作感的前提下降低认知负荷。玩家不需要记住复杂的连段表，也能打出像样的连击。',
  '整体架构分为渲染进程与主进程两部分。渲染进程负责界面与交互。主进程负责文件读写和窗口管理。两者通过预加载脚本暴露的受控接口通信，不直接共享内存。',
  '新手引导的目标是让玩家在前两分钟内完成第一次有效战斗，并且明确知道自己为什么赢了。这比把全部系统一次性铺开更重要。'
]

/**
 * 单句超长样本：整段就一句 70+ 字。
 * 这种**确实该报**——不管人写的还是 AI 写的，一句 70 字都该拆。
 * （校准时不把它算误报：初版真正的问题是把「多数句子超长」也报了。）
 */
const SINGLE_LONG_SENTENCE =
  '该模块负责把用户在表单里填写的内容转换成内部数据结构，转换过程中会保留原始输入用于出错时回滚，因此界面上的每一次修改都可以安全地撤销和重做。'

/** 「又长又空」样本：AI 生成内容的典型形态——空话密度超标、无具体信息 */
const FLUFF_SAMPLES: readonly string[] = [
  '我们致力于打造丰富多样的游戏体验，深度融合多种玩法，为玩家带来极致体验。整体内容非常丰富多彩，融合了全方位创新性与高品质的制作水准，整体体验良好流畅。这样多样化的设计让游戏体验极丰富多样，深度融合各类元素，形成沉浸式体验。',
  '游戏拥有精美的画面表现和流畅的操作手感，爽快的战斗体验让玩家欲罢不能。高品质的音效与多样化的人物设定深度融合，营造出沉浸式的游戏世界，带来极致体验。'
]

describe('内容质量指标：人类写作基线（校准固化，2026-10-23）', () => {
  it('人类正常写作样本（多句、有长有短）不触发任何提示', () => {
    for (const sample of HUMAN_SAMPLES) {
      const signal = analyzeTextQuality(sample)
      expect(contentQualityIssues(signal, { chapterLabel: '第一章·产品愿景' }), sample.slice(0, 20)).toEqual([])
    }
  })

  it('整段只有一句超长句 → 报（这种人也都该拆，不算误报）', () => {
    const signal = analyzeTextQuality(SINGLE_LONG_SENTENCE)
    expect(signal.sentenceCount).toBe(1)
    expect(signal.longSentenceRate).toBe(1)
    expect(contentQualityIssues(signal, { chapterLabel: '第十章·技术规格' })).toEqual([
      `内容质量提示：第十章·技术规格 长句偏多（>${LONG_SENTENCE_CHARS} 字占 100%），建议拆短`
    ])
  })

  it('「又长又空」样本必须触发空话提示', () => {
    for (const sample of FLUFF_SAMPLES) {
      const signal = analyzeTextQuality(sample)
      const issues = contentQualityIssues(signal, { chapterLabel: '第一章·产品愿景' })
      expect(issues.some((i) => i.includes('空话套话')), sample.slice(0, 20)).toBe(true)
    }
  })

  it('阈值常量保持校准后的取值（改动需先重做校准实验）', () => {
    expect(LONG_SENTENCE_CHARS).toBe(50)
    expect(LONG_SENTENCE_RATE_THRESHOLD).toBe(0.5)
    expect(NUMERIC_MIN_CHARS).toBe(200)
    expect(CLICHE_COUNT_THRESHOLD).toBe(3)
  })
})
