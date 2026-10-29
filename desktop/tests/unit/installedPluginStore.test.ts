import { describe, expect, it } from 'vitest'

import { pruneObsoleteSources } from '../../src/renderer/src/plugins/installedPluginStore'

/**
 * 已安装插件清单的迁移：`agent-team` / `trajectory` 合并为 `session` 后，
 * 旧 source 不能再被加载（否则启动时留一个 error 占位），但其它 source 必须原样保留。
 */
describe('已安装插件清单迁移', () => {
  it('剔除已下线的 agent-team / trajectory', () => {
    expect(
      pruneObsoleteSources(['factory:agent-team', 'factory:trajectory', 'factory:session-history'])
    ).toEqual(['factory:session-history'])
  })

  it('未知或新 source 原样保留（不误删）', () => {
    const sources = ['factory:plugin-market', 'factory:session', 'link:https://example.com/p.js']
    expect(pruneObsoleteSources(sources)).toEqual(sources)
  })

  it('空清单返回空清单', () => {
    expect(pruneObsoleteSources([])).toEqual([])
  })
})
