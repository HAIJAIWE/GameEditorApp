import { describe, expect, it } from 'vitest'

import {
  buildPaletteItems,
  filterPaletteItems,
  movePaletteIndex,
  type PaletteItem
} from '@mobai/shared/agent/tools'

/** 造条目的最小工厂（测试只关心 id/label/group，run 不参与断言） */
function item(id: string, label: string, group: PaletteItem['group'] = '命令'): PaletteItem {
  return { id, label, group, run: () => undefined }
}

describe('命令面板纯逻辑', () => {
  describe('buildPaletteItems', () => {
    it('把命令/面板/页签拍平，label 缺省用 id，组内保持原顺序', () => {
      const items = buildPaletteItems({
        commands: [
          { id: 'statistics.open', label: '数据统计' },
          { id: 'app.save' }
        ],
        panels: [{ id: 'statistics.panel', title: '数据统计' }],
        mainViews: [{ id: 'code.mainView', label: '代码编辑' }]
      })

      expect(items.map((entry) => entry.id)).toEqual([
        'statistics.open',
        'app.save',
        'statistics.panel',
        'code.mainView'
      ])
      expect(items.map((entry) => entry.label)).toEqual(['数据统计', 'app.save', '数据统计', '代码编辑'])
      expect(items.map((entry) => entry.group)).toEqual(['命令', '命令', '面板', '页签'])
    })

    it('按 id 去重：同一 id 只留第一条（保留先到者的 label 与分组）', () => {
      const items = buildPaletteItems({
        commands: [
          { id: 'dup.open', label: '先到的命令' },
          { id: 'dup.open', label: '后到的命令' }
        ],
        panels: [{ id: 'dup.open', title: '面板抢注' }],
        mainViews: []
      })

      expect(items).toHaveLength(1)
      expect(items[0]?.label).toBe('先到的命令')
      expect(items[0]?.group).toBe('命令')
    })
  })

  describe('filterPaletteItems', () => {
    const items = [item('statistics.open', '数据统计'), item('plugin.center', '插件中心'), item('app.save', '保存')]

    it('空查询原样返回（同一数组，不做无谓的复制）', () => {
      expect(filterPaletteItems(items, '')).toBe(items)
      expect(filterPaletteItems(items, '   ')).toBe(items)
    })

    it('子串匹配且大小写不敏感（label 与 id 都参与）', () => {
      expect(filterPaletteItems(items, '统计').map((entry) => entry.id)).toEqual(['statistics.open'])
      expect(filterPaletteItems(items, 'PLUGIN').map((entry) => entry.id)).toEqual(['plugin.center'])
      expect(filterPaletteItems(items, 'Save').map((entry) => entry.id)).toEqual(['app.save'])
    })

    it('子序列匹配：不连续的字符按序出现也算命中（中文逐字）', () => {
      // 「插中」不是「插件中心」的子串，但两个字符按序出现
      expect(filterPaletteItems(items, '插中').map((entry) => entry.id)).toEqual(['plugin.center'])
      expect(filterPaletteItems(items, '插统')).toEqual([])
    })
  })

  describe('movePaletteIndex', () => {
    it('前进一位，越界回绕到开头 / 反向回绕到末尾', () => {
      expect(movePaletteIndex(0, 1, 3)).toBe(1)
      expect(movePaletteIndex(2, 1, 3)).toBe(0)
      expect(movePaletteIndex(0, -1, 3)).toBe(2)
    })

    it('空列表固定返回 0（避免 % 0 得 NaN）', () => {
      expect(movePaletteIndex(5, 1, 0)).toBe(0)
      expect(movePaletteIndex(0, -1, 0)).toBe(0)
    })
  })
})
