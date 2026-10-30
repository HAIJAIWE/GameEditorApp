/**
 * 命令面板的打开通道（模块级最小事件源）。
 *
 * 为什么需要它：打开请求有两个来源——⌘K（面板组件自己的键盘监听）和
 * `palette.open` 命令（`command.run`，纯逻辑、没有组件上下文，菜单/斜杠菜单/别的插件都可能触发）。
 * 两边唯一的公共点就是模块作用域，所以用一个 Set 订阅表当通道，不引入 context / 状态库。
 *
 * 只负责「请求打开」：关闭、输入框、高亮全归面板自己管，避免出现两个真相源。
 */
const listeners = new Set<() => void>()

/** 请求打开命令面板（面板已打开时再调一次只是重复置 true，无副作用） */
export function openPalette(): void {
  for (const listener of listeners) listener()
}

/** 订阅打开请求；返回取消订阅函数（组件卸载时调用） */
export function subscribePalette(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
