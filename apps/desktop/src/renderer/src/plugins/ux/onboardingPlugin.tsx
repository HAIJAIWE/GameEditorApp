import type { PluginHost } from '@mobai/shared/plugin/host'
import type { PluginManifest } from '@mobai/shared/plugin/types'
import { translate } from '@mobai/shared/i18n'
import { getLocalePreference } from '../../localePreference'
import { OnboardingPanel } from '../../components/common'
import { useAppContext } from '../host'
import { getActiveCeshuId, notify, openPanel, setHomeVisible } from '../host'
import { registerReactBinding, type PanelBindingProps } from '../host'

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
    description: 'Quick start guide + guide action commands (12 nav.* commands)',
    meta: {
      labelKey: 'onboarding.metaLabel',
      icon: '🚀',
      descriptionKey: 'onboarding.metaDescription'
    },
    capabilities: [
      {
        kind: 'command',
        id: 'onboarding.open',
        label: 'Quick start',
        labelKey: 'onboarding.metaLabel',
        run: () => host.openPanel('onboarding.panel')
      },
      {
        kind: 'panel',
        id: 'onboarding.panel',
        title: 'Quick start',
        titleKey: 'onboarding.metaLabel',
        ui: { type: 'text', text: translate(getLocalePreference(), 'onboarding.panelText') }
      },
      // —— 引导动作：全部是导航，故统一 nav.* 前缀 ——
      {
        kind: 'command',
        id: 'nav.createRole',
        label: 'Create role',
        labelKey: 'onboarding.cmd.createRole',
        run: quickCreateFor('role')
      },
      {
        kind: 'command',
        id: 'nav.createMonster',
        label: 'Create monster',
        labelKey: 'onboarding.cmd.createMonster',
        run: quickCreateFor('monster')
      },
      {
        kind: 'command',
        id: 'nav.createSkill',
        label: 'Create skill',
        labelKey: 'onboarding.cmd.createSkill',
        run: quickCreateFor('skill')
      },
      {
        kind: 'command',
        id: 'nav.createEquip',
        label: 'Create equipment',
        labelKey: 'onboarding.cmd.createEquip',
        run: quickCreateFor('equip')
      },
      {
        kind: 'command',
        id: 'nav.batchCreate',
        label: 'Batch create',
        labelKey: 'onboarding.cmd.batchCreate',
        // 守卫（schema 为空时只提示、不开空面板）在 App 的 openPanel 里，桥接过去即可
        run: () => openPanel('batch.panel')
      },
      {
        kind: 'command',
        id: 'nav.viewRelations',
        label: 'View relations',
        labelKey: 'onboarding.cmd.viewRelations',
        run: () => openPanel('relationGraph.panel')
      },
      {
        kind: 'command',
        id: 'nav.fieldEditor',
        label: 'Field structure editor',
        labelKey: 'onboarding.cmd.fieldEditor',
        run: () => openPanel('typeEditor.panel')
      },
      {
        kind: 'command',
        id: 'nav.stats',
        label: 'Data statistics',
        labelKey: 'onboarding.cmd.stats',
        run: () => openPanel('statistics.panel')
      },
      {
        kind: 'command',
        id: 'nav.library',
        label: 'Switch game library',
        labelKey: 'onboarding.cmd.library',
        run: () => notify(translate(getLocalePreference(), 'onboarding.notify.library'))
      },
      {
        kind: 'command',
        id: 'nav.ai',
        label: 'Agent',
        labelKey: 'onboarding.cmd.ai',
        run: () => notify(translate(getLocalePreference(), 'onboarding.notify.ai'))
      },
      {
        kind: 'command',
        id: 'nav.dataDesign',
        label: 'Design game data',
        labelKey: 'onboarding.cmd.dataDesign',
        run: () => {
          // 没有打开的策划书就没数据可设计：提示并回首页（原 App 分支的同一语义）
          if (getActiveCeshuId() === null) {
            notify(translate(getLocalePreference(), 'onboarding.notify.noCeshu'))
            setHomeVisible(true)
            return
          }
          setHomeVisible(false)
        }
      },
      {
        kind: 'command',
        id: 'nav.ceshu',
        label: 'Write design docs',
        labelKey: 'onboarding.cmd.ceshu',
        run: () => setHomeVisible(true)
      }
    ]
  }
}
