import { describe, expect, it } from 'vitest'

// 注意：求值引擎已归区到 domain/attr/attrEngine（2b 批），模型与拓扑排序仍在 contract 根
import { createDefaultAttrSystem, defaultBaseValues, topoSortAttributes } from '@mobai/shared/attrSystem'
import { calculateAttributes } from '@mobai/shared/domain/attr/attrEngine'
import { SEARCH_ALL_FIELDS, SEARCH_ALL_TYPES, searchItems } from '@mobai/shared/util/search'
import { summarizeNumeric } from '@mobai/shared/util/data'
import { filterItemRecords } from '@mobai/shared/util/data'
import type { ItemRecord } from '@mobai/shared/types'

/**
 * 大库性能基线（评估文档 P1#10）：给「列表过滤 / 搜索 / 统计 / 属性计算」在大库量级下的
 * 耗时留一份对照，供后续重构前后比对；同时用宽松上界防数量级级回归。
 *
 * ## 为什么默认跳过
 * vitest 5.0.3 **不导出 `bench`**（bench 功能需额外包，不为此引入新依赖），故退化为
 * 普通测试 + `performance.now`。大库用例跑一次约数秒，会拖慢日常 10s 级的测试，
 * 因此**默认跳过，仅 `MB_PERF=1` 时执行**：
 *
 *   MB_PERF=1 node <abs>/node_modules/vitest/vitest.mjs run --root <abs>/desktop
 *
 * ## 范围
 * 只测 `shared/` 纯逻辑（Node 可跑、无 Electron / DOM 依赖）。
 * 「导入导出」涉及 main 层 fs + SQLite，不在此文件范围（需单独 harness）。
 *
 * ## 上界口径
 * 阈值取实测值的 **10 倍**（Windows 本机首次测量），只为拦数量级退化，不拦抖动。
 */
const N = 5000
const ENABLED = process.env.MB_PERF === '1'

/** 单轮重复次数：让单次耗时落在可测区间（太小被计时噪声淹没） */
const ROUNDS = 20

function makeItems(n: number): ItemRecord[] {
  const items: ItemRecord[] = []
  for (let i = 0; i < n; i++) {
    items.push({
      id: `id-${i}`,
      type: ['role', 'monster', 'equip', 'item', 'skill'][i % 5],
      data: {
        name: `条目${i}技能${i % 37}`,
        desc: `第 ${i} 条描述文本，含关键词技能与数值 ${i * 3}`,
        value: i % 100,
        level: i % 60
      },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    })
  }
  return items
}

function measure(fn: () => unknown, times: number): number {
  const start = performance.now()
  for (let i = 0; i < times; i++) fn()
  return performance.now() - start
}

const items = makeItems(N)
const attrSystem = createDefaultAttrSystem()
const baseValues = defaultBaseValues(attrSystem)

describe.skipIf(!ENABLED)(`大库性能基线（${N} 条 ItemRecord × ${ROUNDS} 轮）`, () => {
  it('列表过滤 filterItemRecords', () => {
    const ms = measure(() => filterItemRecords(items, '技能'), ROUNDS)
    console.log(`[perf] filterItemRecords ×${ROUNDS}: ${ms.toFixed(1)}ms`)
    expect(ms).toBeLessThan(200)
  })

  it('高级搜索（全类型 + 全字段）', () => {
    const ms = measure(
      () => searchItems(items, { keyword: '技能', type: SEARCH_ALL_TYPES, field: SEARCH_ALL_FIELDS }),
      ROUNDS
    )
    console.log(`[perf] searchItems ×${ROUNDS}: ${ms.toFixed(1)}ms`)
    expect(ms).toBeLessThan(300)
  })

  it('数值统计 summarizeNumeric', () => {
    const ms = measure(() => summarizeNumeric(items, 'value'), ROUNDS)
    console.log(`[perf] summarizeNumeric ×${ROUNDS}: ${ms.toFixed(1)}ms`)
    expect(ms).toBeLessThan(50)
  })

  it('属性系统计算 calculateAttributes（18 属性）', () => {
    const ms = measure(() => calculateAttributes(attrSystem, baseValues), ROUNDS)
    console.log(`[perf] calculateAttributes ×${ROUNDS}: ${ms.toFixed(1)}ms`)
    expect(ms).toBeLessThan(20)
  })

  it('属性系统拓扑排序 topoSortAttributes', () => {
    const ms = measure(() => topoSortAttributes(attrSystem), ROUNDS)
    console.log(`[perf] topoSortAttributes ×${ROUNDS}: ${ms.toFixed(1)}ms`)
    expect(ms).toBeLessThan(20)
  })
})
