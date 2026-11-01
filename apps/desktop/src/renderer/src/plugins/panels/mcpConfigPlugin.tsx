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
    description: 'MCP config panel (reads/writes userData/mcp.json, reconnects on save)',
    meta: {
      label: 'MCP config',
      labelKey: 'plugin.mcp.label',
      icon: '🔌',
      description: 'Configure external MCP servers (stdio / http)',
      descriptionKey: 'plugin.mcp.desc'
    },
    capabilities: [
      {
        kind: 'command',
        id: 'mcpConfig.open',
        label: 'MCP config',
        labelKey: 'plugin.mcp.label',
        run: () => host.openPanel('mcpConfig.panel')
      },
      {
        kind: 'panel',
        id: 'mcpConfig.panel',
        title: 'MCP config',
        titleKey: 'plugin.mcp.label',
        ui: { type: 'text', text: 'Edit userData/mcp.json and reconnect on save' }
      }
    ]
  }
}
