import { describe, expect, it } from 'vitest'

import { PluginHost } from '../../src/shared/plugin/host'
import type { PluginManifest } from '../../src/shared/plugin/types'

/**
 * 宿主遍历性能守卫（Slice 23）。
 *
 * 回答「全改成插件会不会拖慢」：宿主 `capabilities(kind)` 是 O(插件×能力) 的线性扫描，
 * 且只在**用户操作/渲染**时调用（不是每帧）。这里用 200 插件 × 5 能力 = 1000 能力压测，
 * 断言 1000 次遍历仍在宽松阈值内——防的是「未来有人写出 O(n²) 或每次全量深拷贝」这类回归。
 *
 * 阈值刻意给得很宽（2000ms）：CI 机器慢也不会误报，但能抓数量级退化。
 */
describe('插件宿主遍历性能（Slice 23）', () => {
  it('1000 个能力下 capabilities() 仍是线性、轻量', () => {
    const host = new PluginHost()
    for (let p = 0; p < 200; p += 1) {
      const manifest: PluginManifest = {
        id: `perf-${p}`,
        name: `perf-${p}`,
        version: '0.1.0',
        capabilities: Array.from({ length: 5 }, (_, c) => ({
          kind: 'command' as const,
          id: `perf-${p}.c${c}`,
          label: `c${c}`,
          run: () => undefined
        }))
      }
      host.register(manifest)
    }

    const start = performance.now()
    for (let i = 0; i < 1000; i += 1) host.capabilities('command')
    const elapsed = performance.now() - start

    expect(host.capabilities('command')).toHaveLength(1000)
    expect(elapsed).toBeLessThan(2000)
  })
})
