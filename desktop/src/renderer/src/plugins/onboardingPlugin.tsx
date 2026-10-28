import type { PluginHost } from '../../../shared/plugin/host'
import type { PluginManifest } from '../../../shared/plugin/types'
import OnboardingPanel from '../components/OnboardingPanel'
import { useAppContext } from './appContext'
import { getActiveCeshuId, notify, openPanel, setHomeVisible } from './hostBridge'
import { registerReactBinding, type PanelBindingProps } from './reactBindings'

/**
 * 快速入门 → 插件化（Slice 8a 收尾 + 8d 命令化）。
 *
 * 8a 时它只是「最后一个直连面板」；8d 把卡片派发的 **12 个 actionId** 从 App 的
 * `handleOnboardingAction` 搬到本插件的 `nav.*` command —— App 里那个回调已删除。
 *
 * 为什么这些命令能搬：它们本质是**导航**（开哪个面板 / 回不回首页），需要的四样东西
 * （提示、带守卫的 openPanel、首页开关、当前策划书 id）都在 `hostBridge` 上，由 App 注入。
 *
 * `command.run()` 不带参数 ⇒ 4 个「创建某类型」动作各成一个命令，把类型**烘进命令**里
 * （`nav.createRole` → `quickCreate.panel` + `{ type:'role' }`）。
 */

/** 引导卡 actionId → 命令 id（一个 action 一条命令，命令自带上下文） */
const COMMAND_BY_ACTION: Record<string, string> = {
  create_role: 'nav.createRole',
  create_monster: 'nav.createMonster',
  create_skill: 'nav.createSkill',
  create_equip: 'nav.createEquip',
  batch_create: 'nav.batchCreate',
  view_relations: 'nav.viewRelations',
  onboarding_library: 'nav.library',
  onboarding_types: 'nav.fieldEditor',
  onboarding_data: 'nav.dataDesign',
  onboarding_ceshu: 'nav.ceshu',
  onboarding_ai: 'nav.ai',
  stats: 'nav.stats'
}

export function defineOnboardingPlugin(host: PluginHost): PluginManifest {
  /** 派发本插件自己的命令（找不到 = 被禁用，静默：面板本来就在用，不该再弹提示） */
  const runCommand = (commandId: string): void => {
    const command = host.commands().find((capability) => capability.id === commandId)
    if (command !== undefined) void command.run()
  }

  function OnboardingPanelBound({ onClose }: PanelBindingProps) {
    const { types } = useAppContext()
    return (
      <OnboardingPanel
        types={types}
        onAction={(actionId: string) => {
          const commandId = COMMAND_BY_ACTION[actionId]
          if (commandId !== undefined) runCommand(commandId)
          // 卡片点了就离开引导面板（原 App 侧每个分支都带 setPanel(null)）
          onClose()
        }}
        onClose={onClose}
      />
    )
  }

  registerReactBinding('onboarding.panel', OnboardingPanelBound)

  const quickCreateFor = (type: string) => () => openPanel('quickCreate.panel', { type })

  return {
    id: 'onboarding',
    name: 'onboarding',
    version: '0.1.0',
    description: '快速入门引导 + 引导动作命令（12 个 nav.* command）',
    meta: {
      label: '快速入门',
      icon: '🚀',
      description: '按现有 schema 生成引导卡，点击后由 nav.* 命令完成导航'
    },
    capabilities: [
      {
        kind: 'command',
        id: 'onboarding.open',
        label: '快速入门',
        run: () => host.openPanel('onboarding.panel')
      },
      {
        kind: 'panel',
        id: 'onboarding.panel',
        title: '快速入门',
        ui: { type: 'text', text: '五步引导：建条目 / 设计数据 / 写策划书 / 用 AI' }
      },
      // —— 引导动作：全部是导航，故统一 nav.* 前缀 ——
      { kind: 'command', id: 'nav.createRole', label: '创建角色', run: quickCreateFor('role') },
      { kind: 'command', id: 'nav.createMonster', label: '创建怪物', run: quickCreateFor('monster') },
      { kind: 'command', id: 'nav.createSkill', label: '创建技能', run: quickCreateFor('skill') },
      { kind: 'command', id: 'nav.createEquip', label: '创建装备', run: quickCreateFor('equip') },
      {
        kind: 'command',
        id: 'nav.batchCreate',
        label: '批量创建',
        // 守卫（schema 为空时只提示、不开空面板）在 App 的 openPanel 里，桥接过去即可
        run: () => openPanel('batch.panel')
      },
      {
        kind: 'command',
        id: 'nav.viewRelations',
        label: '查看关联',
        run: () => openPanel('relationGraph.panel')
      },
      {
        kind: 'command',
        id: 'nav.fieldEditor',
        label: '字段结构编辑器',
        run: () => openPanel('typeEditor.panel')
      },
      {
        kind: 'command',
        id: 'nav.stats',
        label: '数据统计',
        run: () => openPanel('statistics.panel')
      },
      {
        kind: 'command',
        id: 'nav.library',
        label: '切换游戏库',
        run: () => notify('在界面右上角「当前库」处可切换或新建游戏库')
      },
      {
        kind: 'command',
        id: 'nav.ai',
        label: '智能体',
        run: () => notify('智能体在界面右侧常驻栏，直接输入即可')
      },
      {
        kind: 'command',
        id: 'nav.dataDesign',
        label: '去设计游戏数据',
        run: () => {
          // 没有打开的策划书就没数据可设计：提示并回首页（原 App 分支的同一语义）
          if (getActiveCeshuId() === null) {
            notify('请先打开一本策划书…')
            setHomeVisible(true)
            return
          }
          setHomeVisible(false)
        }
      },
      {
        kind: 'command',
        id: 'nav.ceshu',
        label: '去写策划书',
        run: () => setHomeVisible(true)
      }
    ]
  }
}
