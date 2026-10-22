/**
 * 字段级局部重生成（AI 停靠栏 ↔ 中间编辑器协作）的动作词表。
 *
 * ## 为什么是这四个动作
 * 策划书的工作流是「AI 起草 → 人审核」。人审一个字段时的常见诉求只有四类：
 * 说得不清楚（改写）、说得不够（展开）、说得太啰嗦（精简）、说得看不懂（通俗化）。
 * 它们都是**对单个字段的定向重生成**，走 `ceshu:aiGenerateField` 同一条链路，
 * 只是往提示词里注入不同的任务指令（见 `buildFieldActionInstruction`）。
 *
 * ## 不变量
 * - `FIELD_ACTIONS` 是唯一事实来源：IPC schema 的枚举、UI 按钮、测试都从它派生，
 *   避免「schema 收了一个动作但 UI 没有」这类漂移（单测锁定）。
 */

export const FIELD_ACTIONS = ['rewrite', 'expand', 'condense', 'explain'] as const

export type FieldAction = (typeof FIELD_ACTIONS)[number]

/** 按钮短标签（停靠栏空间有限，两个字优先） */
export const FIELD_ACTION_LABELS: Record<FieldAction, string> = {
  rewrite: '改写',
  expand: '展开',
  condense: '精简',
  explain: '通俗化'
}

/** 按钮悬浮说明：把「点了之后 AI 会干什么」说清楚，避免用户猜 */
export const FIELD_ACTION_TITLES: Record<FieldAction, string> = {
  rewrite: '保持信息不变，重新组织语言，更清晰易读',
  expand: '补充具体细节、例子或数字，内容更完整',
  condense: '压缩篇幅，只保留核心结论与必要依据',
  explain: '用通俗语言重写，术语附白话解释，非专业读者也能看懂'
}

/** 每个动作注入提示词的任务指令（模型照此重写该字段） */
export const FIELD_ACTION_INSTRUCTIONS: Record<FieldAction, string> = {
  rewrite:
    '【本次任务：改写】保持原文的事实与信息量不变，重新组织语言，使之更清晰、易读；' +
    '不要新增或删除要点，不要改变结论。',
  expand:
    '【本次任务：展开】在原文基础上补充具体的细节、例子或数字，使内容更完整、可执行；' +
    '不要改变原有结论，不要引入与上下文矛盾的新设定。',
  condense:
    '【本次任务：精简】把内容压缩到原来的一半篇幅以内，只保留核心结论与必要依据；' +
    '删除重复、客套与空泛表述。',
  explain:
    '【本次任务：通俗化】用通俗语言重写全文，专业术语首次出现时用括号附一句白话解释，' +
    '让没有策划背景的读者也能看懂；不要损失关键信息。'
}

/** 注入单字段生成提示词的任务指令（无动作时返回空串，调用方按需拼接） */
export function buildFieldActionInstruction(action: FieldAction | undefined): string {
  if (action === undefined) return ''
  return FIELD_ACTION_INSTRUCTIONS[action]
}
