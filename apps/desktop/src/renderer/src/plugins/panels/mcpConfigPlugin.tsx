import type { PluginHost } from '@mobai/shared/plugin/host'
import type { PluginManifest } from '@mobai/shared/plugin/types'
import { McpConfigPanel } from '../../components/agent'
import { registerReactBinding, type PanelBindingProps } from '../host'

/**
 * MCP 配置插件（Slice 20）：一个面板 + 一条打开命令。
 *
 * 面板编辑 `userData/mcp.json`，保存后主进程写盘并重连（见 `main/ipc/agentIpc.ts` 的
 * `mcp:getConfig` / `mcp:setConfig`）。
 */
export function defineMcpConfigPlugin(host: PluginHost): PluginManifest {
  function McpConfigPanelBound({ onClose }: PanelBindingProps) {
    return <McpConfigPanel onClose={onClose} />
  }

  registerReactBinding('mcpConfig.panel', McpConfigPanelBound)

  return {
    id: 'mcp-config',
    name: 'mcp-config',
    version: '0.1.0',
    description: 'MCP 配置面板（读写 userData/mcp.json，保存后重连）',
    meta: { label: 'MCP 配置', icon: '🔌', description: '配置外部 MCP 服务器（stdio / http）' },
    capabilities: [
      {
        kind: 'command',
        id: 'mcpConfig.open',
        label: 'MCP 配置',
        run: () => host.openPanel('mcpConfig.panel')
      },
      {
        kind: 'panel',
        id: 'mcpConfig.panel',
        title: 'MCP 配置',
        ui: { type: 'text', text: '编辑 userData/mcp.json 并保存重连' }
      }
    ]
  }
}
