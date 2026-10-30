/**
 * MCP 配置插件（Slice 20）：只验证「能力齐全 + 有 React 绑定」。
 * 面板渲染依赖 `window.mbApi.mcp`，属主进程 IPC，不在单测覆盖范围。
 */
import { describe, expect, it } from 'vitest'

import { defineMcpConfigPlugin } from '../../../src/renderer/src/plugins/panels/mcpConfigPlugin'
import { getReactBinding } from '../../../src/renderer/src/plugins/host/reactBindings'
import { PluginHost } from '../../../src/shared/plugin/host'

describe('MCP 配置插件（Slice 20）', () => {
  it('提供打开命令 + 面板能力 + React 绑定', () => {
    const host = new PluginHost()
    host.register(defineMcpConfigPlugin(host))
    expect(host.commands().map((command) => command.id)).toContain('mcpConfig.open')
    expect(host.panels().map((panel) => panel.id)).toContain('mcpConfig.panel')
    expect(getReactBinding('mcpConfig.panel')).toBeDefined()
  })
})
