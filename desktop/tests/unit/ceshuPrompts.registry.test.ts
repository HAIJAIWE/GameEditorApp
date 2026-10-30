import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildReviewPrompts } from '../../src/shared/ceshu/ceshuAi'
import {
  ADVERSARIAL_CHECK_KEYS,
  ADVERSARIAL_CHECK_LABELS,
  GENRE_REVIEW_PROFILES,
  genreReviewProfile,
  reviewProbeFor
} from '../../src/shared/ceshu/ceshuAiData'
import { createDefaultCeshu } from '../../src/shared/ceshu/ceshuModel'

/** 读取 shared 层源码（vitest 在 desktop/ 下运行；兼容从仓库根跑） */
function readSharedSource(name: string): string {
  const candidates = [
    resolve(process.cwd(), 'src', 'shared', name),
    resolve(process.cwd(), 'desktop', 'src', 'shared', name)
  ]
  for (const path of candidates) {
    try {
      return readFileSync(path, 'utf-8')
    } catch {
      /* 试下一个候选路径 */
    }
  }
  throw new Error(`找不到 ${name}（尝试过：${candidates.join(' / ')}）`)
}

/**
 * 提示词登记表守卫（观察项①收编后的防回归）：
 * 反审项的 key/label 由 ceshuAiData 单处定义、同时被 UI 与提示词消费，
 * 提示词里一旦手写一份就会漂移——这里钉住「派生」而非「复制」。
 */
describe('反审提示词与检查项枚举同源', () => {
  it('system 的检查项样例完全由 ADVERSARIAL_CHECK_KEYS / LABELS 派生（数量 + 顺序 + 文案）', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    const { system } = buildReviewPrompts(doc, { progressTotal: 0, validationCount: 0 })

    // 数量同源：常量加一项，提示词必须跟着多一条
    const keyOccurrences = system.match(/"key":"/g) ?? []
    expect(keyOccurrences).toHaveLength(ADVERSARIAL_CHECK_KEYS.length)

    // 文案同源：每条 key + label 成对出现
    for (const key of ADVERSARIAL_CHECK_KEYS) {
      expect(system).toContain(`{"key":"${key}","label":"${ADVERSARIAL_CHECK_LABELS[key]}"`)
    }

    // 顺序同源：与规范顺序一致
    const positions = ADVERSARIAL_CHECK_KEYS.map((key) => system.indexOf(`"key":"${key}"`))
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it('user 提示词的项数文案不写死，且注入 7 项品类追问', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    const { prompt } = buildReviewPrompts(doc, { progressTotal: 0, validationCount: 0 })
    expect(prompt).toContain(`${ADVERSARIAL_CHECK_KEYS.length} 项成稿反审`)
    // 每一项的追问都要下发给 LLM（否则「按品类追问」只是口号）
    for (const key of ADVERSARIAL_CHECK_KEYS) {
      expect(prompt).toContain(ADVERSARIAL_CHECK_LABELS[key])
    }
  })

  it('品类不同 ⇒ 「数值与可达性 / 核心选择」追问不同（品类自适应）', () => {
    const actionDoc = createDefaultCeshu({ scope: 'full' })
    actionDoc.meta.game_type = 'RPG'
    const defenseDoc = createDefaultCeshu({ scope: 'full' })
    defenseDoc.meta.game_type = '塔防'
    const narrativeDoc = createDefaultCeshu({ scope: 'full' })
    narrativeDoc.meta.game_type = '视觉小说'

    const actionPrompt = buildReviewPrompts(actionDoc, { progressTotal: 0, validationCount: 0 }).prompt
    const defensePrompt = buildReviewPrompts(defenseDoc, { progressTotal: 0, validationCount: 0 }).prompt
    const narrativePrompt = buildReviewPrompts(narrativeDoc, { progressTotal: 0, validationCount: 0 }).prompt

    // 三个品类必须产生不同的数值追问
    expect(actionPrompt).not.toBe(defensePrompt)
    expect(defensePrompt).not.toBe(narrativePrompt)
    expect(actionPrompt).toContain(reviewProbeFor('numeric', 'action'))
    expect(defensePrompt).toContain(reviewProbeFor('numeric', 'defense'))
    expect(narrativePrompt).toContain(reviewProbeFor('numeric', 'narrative'))
    // 品类展示名要写进提示词（LLM 才知道在按哪套档案审）
    expect(defensePrompt).toContain(genreReviewProfile('塔防').label)
  })

  it('ceshuAi.ts 不得手写检查项标签（防双处维护回归）', () => {
    const source = readSharedSource('ceshuAi.ts')
    for (const label of Object.values(ADVERSARIAL_CHECK_LABELS)) {
      expect(source).not.toContain(label)
    }
  })

  it('消费式提示词复用 ceshuAiData 的写作规范，不各自重写', () => {
    // 机读包消费提示词必须引用单一来源的写作规范
    expect(readSharedSource('ceshuBundlePrompt.ts')).toContain("from './ceshu/ceshuAiData'")
    // 各任务的提示词组装入口都在登记表注释里点名，改动前有导航
    const registry = readSharedSource('ceshuAiData.ts')
    for (const module of ['ceshuAi.ts', 'ceshuBundlePrompt.ts', 'ceshuDataGen.ts', 'ceshuDemoPrompt.ts']) {
      expect(registry).toContain(module)
    }
  })

  it('品类档案覆盖非 generic 时至少有追问，且未匹配回落 generic', () => {
    // 每个非 generic 档案至少覆盖一项追问（否则「品类自适应」名不副实）
    for (const [key, profile] of Object.entries(GENRE_REVIEW_PROFILES)) {
      if (key === 'generic') continue
      expect(profile.numeric ?? profile.choice).toBeTruthy()
    }
    // 未匹配的品类回落 generic（追问 = 通用探针，与不传品类一致）
    expect(genreReviewProfile('不存在的品类').key).toBe('generic')
    expect(genreReviewProfile('').key).toBe('generic')
  })
})
