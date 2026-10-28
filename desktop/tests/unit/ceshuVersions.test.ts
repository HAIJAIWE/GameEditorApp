import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { CeshuManager } from '../../src/main/ceshu/manager'
import { CeshuStorage } from '../../src/main/ceshu/storage'
import { buildChangelogEntry, computeCeshuDiff, nextVersionLabel } from '../../src/shared/ceshuDiff'
import { createDefaultCeshu } from '../../src/shared/ceshuModel'

function makeDir(): string {
  return mkdtempSync(join(tmpdir(), 'mb-ceshu-versions-'))
}

function makeManager(): CeshuManager {
  return new CeshuManager(new CeshuStorage(makeDir()))
}

function changed(diffs: ReturnType<typeof computeCeshuDiff>): ReturnType<typeof computeCeshuDiff> {
  return diffs.filter((diff) => diff.diffType !== 'unchanged')
}

describe('版本链：版本号递增', () => {
  it('v1.0 → v1.1；已有 v1.1 时 → v1.2', () => {
    expect(nextVersionLabel('v1.0', [])).toBe('v1.1')
    expect(nextVersionLabel('v1.0', ['v1.0', 'v1.1'])).toBe('v1.2')
  })

  it('同 major 内取最大 minor + 1；非法标签回退 v1.x', () => {
    expect(nextVersionLabel('V2.3', ['v2.3', 'v2.5'])).toBe('v2.6')
    expect(nextVersionLabel('bad-label', [])).toBe('v1.1')
  })
})

describe('版本链：版本 diff', () => {
  it('空值语义：旧值为空视为新增，新值为空视为删除', () => {
    const base = createDefaultCeshu({ scope: 'full' })
    const withName = structuredClone(base)
    withName.meta.game_name = '正式名'
    expect(changed(computeCeshuDiff(base, withName))).toEqual([
      expect.objectContaining({ chapter: 'meta', field: 'game_name', diffType: 'added' })
    ])

    const withFormula = structuredClone(base)
    withFormula.combat.damage_formula = '伤害 = 攻击 - 防御'
    expect(changed(computeCeshuDiff(withFormula, base))).toEqual([
      expect.objectContaining({ chapter: 'combat', field: 'damage_formula', diffType: 'removed' })
    ])
    expect(changed(computeCeshuDiff(base, withFormula))[0]?.diffType).toBe('added')
  })

  it('两侧均非空 → modified；简单字典作叶节点、含嵌套结构时按路径展开', () => {
    const base = createDefaultCeshu({ scope: 'full' })
    const next = structuredClone(base)
    next.meta.game_name = 'A'
    const previous = structuredClone(base)
    previous.meta.game_name = 'B'
    expect(changed(computeCeshuDiff(previous, next))[0]?.diffType).toBe('modified')

    // 简单字典（值均为标量）整体作为叶节点
    const leafChanged = structuredClone(base)
    ;(leafChanged.vision.user_personas as Record<string, unknown>).primary = '核心玩家'
    expect(changed(computeCeshuDiff(base, leafChanged))).toEqual([
      expect.objectContaining({ chapter: 'vision', field: 'user_personas', diffType: 'modified' })
    ])

    // 含嵌套 dict 的字段按点路径展开（每层简单字典止于叶节点）
    const nestedChanged = structuredClone(base)
    ;(nestedChanged.market_analysis as Record<string, unknown>).user_demographics = { regional: { tier: '一线' } }
    expect(changed(computeCeshuDiff(base, nestedChanged))).toEqual([
      expect.objectContaining({ chapter: 'market_analysis', field: 'user_demographics.regional', diffType: 'added' })
    ])
  })

  it('列表整体比较（顺序与重复元素保留）；systems：enabled 翻转=修改，key 缺失=启用/禁用', () => {
    const base = createDefaultCeshu({ scope: 'full' })
    const tagsChanged = structuredClone(base)
    tagsChanged.meta.tags = ['剧情向']
    expect(changed(computeCeshuDiff(base, tagsChanged))[0]?.field).toBe('tags')

    // 仅改 config（enabled 不变）→ 无变更
    const configOnly = structuredClone(base)
    ;(configOnly.systems.battle as { config: Record<string, unknown> }).config.turn_mode = 'turn_based'
    expect(changed(computeCeshuDiff(base, configOnly))).toHaveLength(0)

    // key 存在时 enabled 翻转 → modified（描述为「修改系统 battle 配置」）
    const enabled = structuredClone(base)
    ;(enabled.systems.battle as Record<string, unknown>).enabled = true
    expect(changed(computeCeshuDiff(base, enabled))).toEqual([
      expect.objectContaining({ chapter: 'systems', field: 'battle (enabled)', diffType: 'modified' })
    ])
    expect(buildChangelogEntry(base, enabled, 'v1.1', '2026-10-01 10:00:00').changes[0]?.description).toBe(
      '修改系统 battle 配置'
    )

    // key 缺失 → added/removed（描述为「启用系统 / 禁用系统」）
    const withoutBattle = structuredClone(enabled)
    delete (withoutBattle.systems as Record<string, unknown>).battle
    expect(buildChangelogEntry(withoutBattle, enabled, 'v1.2', '').changes[0]?.description).toBe('启用系统 battle')
    expect(buildChangelogEntry(enabled, withoutBattle, 'v1.3', '').changes[0]?.description).toBe('禁用系统 battle')
  })

  it('变更描述文案：新增/删除/修改与 systems 三类', () => {
    const base = createDefaultCeshu({ scope: 'full' })
    const next = structuredClone(base)
    next.meta.game_name = '测试名'
    const entry = buildChangelogEntry(base, next, 'v1.1', '2026-10-01 10:00:00')
    expect(entry.version).toBe('v1.1')
    expect(entry.changes[0]?.description).toBe('新增字段 game_name：测试名')
    expect(entry.changes[0]?.chapter).toBe('文档信息')

    const removedBase = structuredClone(base)
    removedBase.combat.damage_formula = '旧公式'
    const removedEntry = buildChangelogEntry(removedBase, base, 'v1.2', '')
    expect(removedEntry.changes[0]?.description).toBe('删除字段 damage_formula（原值：旧公式）')

    const before = structuredClone(base)
    before.meta.game_name = '旧名'
    const after = structuredClone(base)
    after.meta.game_name = '新名'
    const modifiedEntry = buildChangelogEntry(before, after, 'v1.3', '')
    expect(modifiedEntry.changes[0]?.description).toBe('修改字段 game_name：旧名 → 新名')
  })
})

describe('版本链：CeshuManager（derive / versions / setActive / changelog）', () => {
  it('derive：复制父本 → parent_id 指向链根 → 版本号递增 → 默认未激活', async () => {
    const manager = makeManager()
    const root = await manager.create({ scope: 'full', name: '链测试' })

    const child = await manager.derive(root.ceshu_id, '第一次派生')
    expect(child.parent_id).toBe(root.ceshu_id)
    expect(child.version_label).toBe('v1.1')
    expect(child.version_note).toBe('第一次派生')
    expect(child.is_active).toBe(false)
    expect(child.ceshu_id).toMatch(/^[0-9a-f]{8}$/)
    expect(child.meta.game_name).toBe('链测试')

    // 根文档保持激活；从子文档再派生仍挂在链根，版本号继续递增
    expect(manager.get(root.ceshu_id).is_active).toBe(true)
    const grandChild = await manager.derive(child.ceshu_id, '第二次派生')
    expect(grandChild.parent_id).toBe(root.ceshu_id)
    expect(grandChild.version_label).toBe('v1.2')
  })

  it('versions：主策划首位 + 子版本按版本号排序（任意链成员视角一致）', async () => {
    const manager = makeManager()
    const root = await manager.create({ scope: 'full' })
    await manager.derive(root.ceshu_id, '')
    await manager.derive(root.ceshu_id, '')

    const fromRoot = manager.versions(root.ceshu_id)
    expect(fromRoot.map((item) => item.versionLabel)).toEqual(['v1.0', 'v1.1', 'v1.2'])
    expect(fromRoot[0]?.id).toBe(root.ceshu_id)
    expect(fromRoot[0]?.isActive).toBe(true)

    const childId = fromRoot[1]?.id as string
    expect(manager.versions(childId).map((item) => item.versionLabel)).toEqual(['v1.0', 'v1.1', 'v1.2'])
  })

  it('setActive：同链互斥，每次仅一个激活版本', async () => {
    const manager = makeManager()
    const root = await manager.create({ scope: 'full' })
    const v11 = await manager.derive(root.ceshu_id, '')
    const v12 = await manager.derive(root.ceshu_id, '')

    await manager.setActive(v11.ceshu_id)
    let chain = manager.versions(root.ceshu_id)
    expect(chain.filter((item) => item.isActive).map((item) => item.versionLabel)).toEqual(['v1.1'])
    expect(manager.get(root.ceshu_id).is_active).toBe(false)

    await manager.setActive(v12.ceshu_id)
    chain = manager.versions(root.ceshu_id)
    expect(chain.filter((item) => item.isActive).map((item) => item.versionLabel)).toEqual(['v1.2'])
  })

  it('changelog：逐对 diff 生成条目；单文档链为空', async () => {
    const manager = makeManager()
    const root = await manager.create({ scope: 'full' })
    expect(manager.changelog(root.ceshu_id).entries).toEqual([])

    const child = await manager.derive(root.ceshu_id, '')
    await manager.saveChapter(child.ceshu_id, 'meta', { ...child.meta, game_name: '正式名' })

    const log = manager.changelog(root.ceshu_id)
    expect(log.entries).toHaveLength(1)
    expect(log.entries[0]?.version).toBe('v1.1')
    expect(log.entries[0]?.changes.some((change) => change.description === '新增字段 game_name：正式名')).toBe(true)

    // 从子版本视角查询同一链，结果一致
    expect(manager.changelog(child.ceshu_id).entries).toHaveLength(1)
  })
})