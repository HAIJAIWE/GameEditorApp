import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildReviewPrompts } from '../../src/shared/ceshuAi'
import { REVIEW_DIMENSION_KEYS, REVIEW_DIMENSION_LABELS } from '../../src/shared/ceshuAiData'
import { createDefaultCeshu } from '../../src/shared/ceshuModel'

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
 * 审阅维度的 key/label 由 ceshuAiData 单处定义、同时被 UI 与提示词消费，
 * 提示词里一旦手写一份就会漂移——这里钉住「派生」而非「复制」。
 */
describe('审阅提示词与维度枚举同源', () => {
  it('system 的维度样例完全由 REVIEW_DIMENSION_KEYS / LABELS 派生（数量 + 顺序 + 文案）', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    const { system } = buildReviewPrompts(doc, { progressTotal: 0, validationCount: 0 })

    // 数量同源：常量加一个维度，提示词必须跟着多一条
    const keyOccurrences = system.match(/"key":"/g) ?? []
    expect(keyOccurrences).toHaveLength(REVIEW_DIMENSION_KEYS.length)

    // 文案同源：每条 key + label 成对出现
    for (const key of REVIEW_DIMENSION_KEYS) {
      expect(system).toContain(`{"key":"${key}","label":"${REVIEW_DIMENSION_LABELS[key]}"`)
    }

    // 顺序同源：与规范顺序一致（旧版 set 遍历顺序不稳，曾因此错乱）
    const positions = REVIEW_DIMENSION_KEYS.map((key) => system.indexOf(`"key":"${key}"`))
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it('user 提示词的维度数文案不写死', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    const { prompt } = buildReviewPrompts(doc, { progressTotal: 0, validationCount: 0 })
    expect(prompt).toContain(`${REVIEW_DIMENSION_KEYS.length} 维度结构化审阅`)
  })

  it('ceshuAi.ts 不得手写维度标签（防双处维护回归）', () => {
    const source = readSharedSource('ceshuAi.ts')
    for (const label of Object.values(REVIEW_DIMENSION_LABELS)) {
      expect(source).not.toContain(label)
    }
  })

  it('消费式提示词复用 ceshuAiData 的写作规范，不各自重写', () => {
    // 机读包消费提示词必须引用单一来源的写作规范
    expect(readSharedSource('ceshuBundlePrompt.ts')).toContain("from './ceshuAiData'")
    // 各任务的提示词组装入口都在登记表注释里点名，改动前有导航
    const registry = readSharedSource('ceshuAiData.ts')
    for (const module of ['ceshuAi.ts', 'ceshuBundlePrompt.ts', 'ceshuDataGen.ts', 'ceshuDemoPrompt.ts']) {
      expect(registry).toContain(module)
    }
  })
})
