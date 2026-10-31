import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

import { parseDigitalCommands, type DigitalCommand } from '../../../../shared/agent/tools'
import { parseDigitalReferences, type DigitalReference } from '../../../../shared/agent/ui'

/**
 * 输入框的两套前缀菜单：`/` 斜杠命令 与 `@` 数据表引用（互斥，共用同一个高亮索引）。
 *
 * 这里只做「解析 + 高亮 + 键盘导航 + 选中后回填输入框」；命令**做什么**由调用方以
 * `run()` 注入（新建对话、草稿管理这些动作属于面板本身）。`@` 候选首次触发时懒加载
 * 当前库的数据表类型，失败静默——输入框仍可用。
 */
export interface DigitalPanelCommands {
  commandMatches: DigitalCommand[]
  commandOpen: boolean
  activeCommandIndex: number
  referenceMatches: DigitalReference[]
  referenceOpen: boolean
  activeReferenceIndex: number
  runCommand: (id: string) => void
  pickReference: (name: string) => void
  /** 输入框内容变化：同步输入值并把高亮项复位 */
  onInputChange: (value: string) => void
  /** 输入框键盘：菜单导航 / Esc 收起 / Enter 发送 */
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
}

export function useDigitalPanelCommands({
  input,
  setInput,
  commands,
  onSend
}: {
  input: string
  setInput: (value: string) => void
  /** 斜杠命令清单（含执行体，由面板组装） */
  commands: Array<DigitalCommand & { run: () => void }>
  /** Enter 发送（菜单未展开时的兜底） */
  onSend: () => void
}): DigitalPanelCommands {
  /** 斜杠命令 / @ 引用菜单的当前高亮项（两者互斥，共用同一索引；输入变化时重置为 0） */
  const [commandIndex, setCommandIndex] = useState(0)
  /** `@` 引用候选：当前游戏库的数据表类型（首次输入 `@` 时懒加载） */
  const [dataTypes, setDataTypes] = useState<DigitalReference[]>([])
  const dataTypesLoaded = useRef(false)

  // `@` 引用候选：首次输入 `@` 时懒加载当前库的数据表类型（失败静默，输入框仍可用）
  useEffect(() => {
    if (!input.startsWith('@') || dataTypesLoaded.current) return
    dataTypesLoaded.current = true
    void window.mbApi.schema
      .list()
      .then((types) => setDataTypes(types.map((type) => ({ id: type.id, name: type.name }))))
      .catch(() => undefined)
  }, [input])

  const { matches: commandMatches } = parseDigitalCommands(commands, input)
  const commandOpen = commandMatches.length > 0
  const activeCommandIndex =
    commandMatches.length === 0 ? 0 : Math.min(commandIndex, commandMatches.length - 1)
  const runCommand = (id: string): void => {
    const command = commands.find((candidate) => candidate.id === id)
    if (command === undefined) return
    setInput('')
    setCommandIndex(0)
    command.run()
  }

  // `@` 引用：与 `/` 互斥（输入不可能同时以 / 和 @ 开头）；选中后插入 `@名称 `（空格 ⇒ 菜单收起）
  const { matches: referenceMatches } = parseDigitalReferences(dataTypes, input)
  const referenceOpen = referenceMatches.length > 0
  const activeReferenceIndex =
    referenceMatches.length === 0 ? 0 : Math.min(commandIndex, referenceMatches.length - 1)
  const pickReference = (name: string): void => {
    setInput(`@${name} `)
    setCommandIndex(0)
  }

  const onInputChange = (value: string): void => {
    setInput(value)
    setCommandIndex(0)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (commandOpen) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setCommandIndex((index) => (index + 1) % commandMatches.length)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setCommandIndex((index) => (index - 1 + commandMatches.length) % commandMatches.length)
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        const command = commandMatches[activeCommandIndex]
        if (command !== undefined) runCommand(command.id)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setInput('')
        setCommandIndex(0)
        return
      }
    }
    if (referenceOpen) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setCommandIndex((index) => (index + 1) % referenceMatches.length)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setCommandIndex((index) => (index - 1 + referenceMatches.length) % referenceMatches.length)
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        const reference = referenceMatches[activeReferenceIndex]
        if (reference !== undefined) pickReference(reference.name)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setInput('')
        setCommandIndex(0)
        return
      }
    }
    // 多行后 Enter 与换行冲突：沿用「Enter 发送」，换行让给 Shift+Enter
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      onSend()
    }
  }

  return {
    commandMatches,
    commandOpen,
    activeCommandIndex,
    referenceMatches,
    referenceOpen,
    activeReferenceIndex,
    runCommand,
    pickReference,
    onInputChange,
    onKeyDown
  }
}
