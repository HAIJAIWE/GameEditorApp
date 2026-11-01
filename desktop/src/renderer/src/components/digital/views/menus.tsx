import type { DigitalCommand } from '../../../../../shared/agent/tools'
import type { DigitalReference } from '../../../../../shared/agent/ui'

/**
 * 斜杠命令菜单（P2）：输入框以 `/` 开头时出现；键盘上下选择 + Enter 执行，点击亦可。
 * 纯展示组件——匹配逻辑在 `shared/agent/commands.ts`，激活索引由父组件维护。
 */
export function DigitalCommandMenu({
  commands,
  activeIndex,
  onRun
}: {
  commands: DigitalCommand[]
  activeIndex: number
  onRun: (id: string) => void
}) {
  if (commands.length === 0) return null
  return (
    <div className="digital-command-menu" data-testid="digital-command-menu" role="listbox">
      {commands.map((command, index) => (
        <button
          key={command.id}
          type="button"
          role="option"
          aria-selected={index === activeIndex}
          className={`digital-command-item${index === activeIndex ? ' active' : ''}`}
          data-testid="digital-command-item"
          data-command={command.id}
          onClick={() => onRun(command.id)}
        >
          <span className="digital-command-label">
            /{command.id} · {command.label}
          </span>
          <span className="item-meta">{command.hint}</span>
        </button>
      ))}
    </div>
  )
}

/**
 * `@` 引用菜单（P2）：输入以 `@` 开头且未以空格结束时出现，列出可引用的数据表；
 * 选中后由父组件插入 `@<name> `（带空格 ⇒ 菜单自动收起）。
 */
export function DigitalReferenceMenu({
  references,
  activeIndex,
  onPick
}: {
  references: DigitalReference[]
  activeIndex: number
  onPick: (name: string) => void
}) {
  if (references.length === 0) return null
  return (
    <div className="digital-command-menu" data-testid="digital-reference-menu" role="listbox">
      {references.map((reference, index) => (
        <button
          key={reference.id}
          type="button"
          role="option"
          aria-selected={index === activeIndex}
          className={`digital-command-item${index === activeIndex ? ' active' : ''}`}
          data-testid="digital-reference-item"
          data-reference={reference.id}
          onClick={() => onPick(reference.name)}
        >
          <span className="digital-command-label">@{reference.name}</span>
          <span className="item-meta">{reference.id}</span>
        </button>
      ))}
    </div>
  )
}
