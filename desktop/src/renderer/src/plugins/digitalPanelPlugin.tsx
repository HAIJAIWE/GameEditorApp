import type { ComponentType } from 'react'

import { CONVERSATION_STORE_KEY, createConversationStoreDecl } from '../../../shared/agent/conversationStore'
import { createConversationService } from '../../../shared/agent/conversationService'
import type { DigitalPanelState } from '../../../shared/agent/panel'
import type { PluginHost } from '../../../shared/plugin/host'
import type { PluginManifest } from '../../../shared/plugin/types'
import DigitalPanel from '../components/digital/DigitalPanel'
import { registerSlotComponent } from './reactBindings'

/**
 * 智能体面板插件（右栏 `app.rightPanel` 的默认占据者）。
 *
 * 把原本内联在 App `<aside className="ai-dock">` 里的 `DigitalPanel` 收编成 slot 占据者：
 * - 富 UI 经 `registerSlotComponent('digital.panel', DigitalPanel)` 外置注册；
 * - slot 能力 `{ key:'app.rightPanel', component:'digital.panel' }` 由宿主注册进 slot 内核；
 * - 受保护（`protected:true`）：智能体面板是核心，不可禁用。
 *
 * 另外**声明根级 store** `conversation.state`：对话状态由面板写入、任何插件可读
 * （命令面板据此显示运行中/消息数）。声明放在这里是因为「面板的插件」天然拥有这份状态，
 * 放进宿主构造器会让 `shared/plugin` 反向依赖 `shared/agent`。
 *
 * App 只负责 `<SlotOutlet slotKey="app.rightPanel" ownerProps={{ onOpenCapabilities }} />`，
 * 插件生态可在同 key 注册更高优先级条目替换它（single 遮蔽）。
 */
export function defineDigitalPanelPlugin(_host: PluginHost): PluginManifest {
  registerSlotComponent('digital.panel', DigitalPanel as unknown as ComponentType<Record<string, unknown>>)
  // 幂等：重复注册（测试重建宿主）返回既有实例，不会把面板的订阅甩到旧 store 上
  _host.declareStore(CONVERSATION_STORE_KEY, createConversationStoreDecl())
  return {
    id: 'digital-panel',
    name: 'digital-panel',
    version: '0.1.0',
    description: '智能体面板（右栏 app.rightPanel 的默认占据者）',
    meta: { label: '智能体', icon: '🤖' },
    protected: true,
    capabilities: [
      {
        kind: 'slot',
        id: 'digitalPanel.slot',
        key: 'app.rightPanel',
        component: 'digital.panel',
        ui: { type: 'text', text: '智能体' }
      },
      {
        // 对外服务面：插件清单里可见、可 invoke，不必知道 store key 与内部类型
        kind: 'service',
        id: 'agent.conversation',
        invoke: createConversationService(_host.slotStore<DigitalPanelState>(CONVERSATION_STORE_KEY))
      }
    ]
  }
}
