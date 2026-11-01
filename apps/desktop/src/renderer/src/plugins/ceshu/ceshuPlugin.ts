import type { PluginManifest } from '@mobai/shared/plugin/types'
import type { CeshuDocument } from '@mobai/shared/ceshu/reference'
import { computeReadiness } from '@mobai/shared/ceshu/readiness'
import {
  renderHandoffHealthMarkdown,
  renderHandoffRouteMarkdown
} from '@mobai/shared/ceshu/workflow'

/**
 * 策划书子系统作为「第一个插件」注册进宿主。
 *
 * 它没有贡献 UI 命令/面板（编辑器仍由 App 直接挂载，见 App.tsx 的 CeshuView 接线）——
 * 而是把已有的分析能力以**服务**形式暴露，供未来插件在拿到 doc 时调用：
 * 完备度 / 开发路线 / 开发体检。这正是 dsh 的「Host IPC 服务可被其他插件消费」形态。
 *
 * `protected: true`：它是核心子系统，禁用列表与崩溃恢复都不动它（类比 dsh PROTECTED_PLUGINS）。
 */
export function defineCeshuPlugin(): PluginManifest {
  return {
    id: 'ceshu',
    name: 'ceshu',
    version: '0.1.0',
    description: '设计文档生成 + 开发交接路线（首个插件化子系统）',
    meta: { label: '策划书子系统', icon: '📘', description: '设计文档生成 + 开发交接路线（完备度 / 路线 / 体检服务）' },
    protected: true,
    capabilities: [
      {
        kind: 'service',
        id: 'ceshu.readiness',
        invoke: (doc) => computeReadiness(doc as CeshuDocument)
      },
      {
        kind: 'service',
        id: 'ceshu.route',
        invoke: (doc) => renderHandoffRouteMarkdown(doc as CeshuDocument)
      },
      {
        kind: 'service',
        id: 'ceshu.health',
        invoke: (doc) => renderHandoffHealthMarkdown(doc as CeshuDocument)
      }
    ]
  }
}
