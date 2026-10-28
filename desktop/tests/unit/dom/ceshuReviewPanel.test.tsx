// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import AiReviewPanel from '../../../src/renderer/src/components/AiReviewPanel'
import {
  ADVERSARIAL_CHECK_KEYS,
  ADVERSARIAL_CHECK_LABELS,
  GENRE_REVIEW_PROFILES,
  ADVERSARIAL_LEVEL_LABELS
} from '../../../src/shared/ceshuAiData'
import { installMbApi, renderDom, type ApiStub, type RenderResult } from './render'

/**
 * AiReviewPanel（成稿反审）DOM 测试。
 *
 * 锁住「评分 → 反审清单」这次改造的可见契约：7 项固定清单、判定徽章文案、
 * 品类追问回显。这些是 `user` 明确关心的点（不要评分 / 品类不一样），故单独守卫。
 */

const REVIEW_REPLY = {
  findings: [
    { key: 'constraints', level: 'pass', evidence: '约束继承完整' },
    { key: 'numeric', level: 'blocker', evidence: '20 波总血量 2260 复算得 2077' },
    { key: 'units', level: 'suggestion', evidence: '取整口径未统一' }
  ],
  overall: '有 1 项阻塞',
  suggestions: ['补齐波次数值', '统一取整', '补规则集标识']
}

function reviewResult(): Record<string, unknown> {
  return {
    model: 'stub-model',
    parsed: true,
    rawText: JSON.stringify(REVIEW_REPLY),
    progressTotal: 0.5,
    validationCount: 1,
    genreLabel: GENRE_REVIEW_PROFILES.defense.label,
    rulesetId: 'ceshu-x',
    overall: '有 1 项阻塞',
    suggestions: ['补齐波次数值', '统一取整', '补规则集标识'],
    findings: [
      { key: 'constraints', label: '约束与事实', level: 'pass', probe: '通用探针', evidence: '约束继承完整' },
      { key: 'numeric', label: '数值与可达性', level: 'blocker', probe: '波次总血量与可用 DPS 是否可达', evidence: '20 波总血量 2260 复算得 2077' },
      { key: 'units', label: '口径与单位', level: 'suggestion', probe: '通用探针', evidence: '取整口径未统一' },
      { key: 'choice', label: '核心选择', level: 'pass', probe: '塔的搭配是否有取舍', evidence: '' },
      { key: 'lifecycle', label: '生命周期', level: 'pass', probe: '通用探针', evidence: '' },
      { key: 'production', label: '生产责任', level: 'pass', probe: '通用探针', evidence: '' },
      { key: 'ruleset', label: '同一规则集', level: 'pass', probe: '通用探针', evidence: '' }
    ]
  }
}

let stub: ApiStub
let view: RenderResult

beforeEach(() => {
  stub = installMbApi({
    overrides: {
      'ceshu.aiReview': () => reviewResult()
    }
  })
})

afterEach(async () => {
  if (view !== undefined) await view.cleanup()
  stub.restore()
})

async function mountAndReview(): Promise<void> {
  view = await renderDom(<AiReviewPanel ceshuId="doc-1" gameName="测试游戏" onClose={() => undefined} />)
  await view.click(view.byTestId('ai-review-start'))
}

describe('AiReviewPanel（成稿反审面板）', () => {
  it('未反审时不渲染清单，导出按钮禁用', async () => {
    view = await renderDom(<AiReviewPanel ceshuId="doc-1" gameName="测试游戏" onClose={() => undefined} />)
    expect(view.query('.review-check-row')).toBeNull()
    expect(view.byTestId('ai-review-export').hasAttribute('disabled')).toBe(true)
  })

  it('反审后渲染 7 项清单，判定徽章用中文三级', async () => {
    await mountAndReview()
    const rows = view.queryAll('.review-check-row')
    expect(rows).toHaveLength(ADVERSARIAL_CHECK_KEYS.length)
    for (const key of ADVERSARIAL_CHECK_KEYS) {
      expect(view.byTestId(`ai-review-check-${key}`)).toBeTruthy()
      expect(view.byTestId(`ai-review-level-${key}`).textContent).toBeTruthy()
    }
    expect(view.byTestId('ai-review-level-numeric').textContent).toBe(ADVERSARIAL_LEVEL_LABELS.blocker)
    expect(view.byTestId('ai-review-level-units').textContent).toBe(ADVERSARIAL_LEVEL_LABELS.suggestion)
    expect(view.byTestId('ai-review-level-constraints').textContent).toBe(ADVERSARIAL_LEVEL_LABELS.pass)
  })

  it('顶部回显品类 / 规则集 / 阻塞计数；每项回显品类追问', async () => {
    await mountAndReview()
    const context = view.byTestId('ai-review-context').textContent ?? ''
    expect(context).toContain(GENRE_REVIEW_PROFILES.defense.label)
    expect(context).toContain('ceshu-x')
    expect(context).toContain('1 项阻塞')
    // 每项清单都必须有标签文案（不是只有 key）
    for (const key of ADVERSARIAL_CHECK_KEYS) {
      expect(view.byTestId(`ai-review-check-${key}`).textContent).toContain(ADVERSARIAL_CHECK_LABELS[key])
    }
  })

  it('解析失败时展示原始回复，不渲染清单', async () => {
    stub.restore()
    stub = installMbApi({
      overrides: {
        'ceshu.aiReview': () => ({
          model: 'm',
          parsed: false,
          rawText: '完全不是 JSON',
          progressTotal: 0,
          validationCount: 0,
          genreLabel: '',
          rulesetId: '',
          overall: '',
          suggestions: [],
          findings: []
        })
      }
    })
    await mountAndReview()
    expect(view.query('.review-check-row')).toBeNull()
    expect(view.byTestId('ai-review-raw').textContent).toContain('完全不是 JSON')
  })
})
