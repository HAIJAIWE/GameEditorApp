/**
 * 文案表（中 / 英）。
 *
 * ## 键的命名
 * `<域>.<语义>`，域用**英文小写**、语义用 camelCase：`common.cancel`、`settings.language`、
 * `agent.stop`。不按界面位置命名（`panel.left.title`）——位置会改，语义不会。
 *
 * ## 为什么要 `Record<MessageKey, string>` 而不是两份独立对象
 * `en` 的类型写成 `Record<keyof typeof zh, string>`，**少一个键就编译不过**。
 * 这比"写个测试比对两个对象的键集合"更早、更硬：tsc 阶段就拦住。
 * （运行期再补一条用例，防 `as any` 绕过。）
 *
 * ## 迁移约定
 * 只放**已经迁走**的文案。界面里还硬编码的中文**不要**先塞进来——那会造出
 * "表里有、界面没用到"的假进度。迁移一个文件时同步加它的键。
 *
 * ## 参数插值
 * 用 `{name}` 占位，见 `translate.ts`。**不要**用模板字符串拼好再传进来，
 * 否则英文语序调整时又得改代码。
 */

/** 中文文案（**基准表**：键集合以它为准） */
export const zh = {
  // —— 通用动作 ——
  'common.ok': '确定',
  'common.cancel': '取消',
  'common.save': '保存',
  'common.delete': '删除',
  'common.close': '关闭',
  'common.search': '搜索',
  'common.loading': '加载中…',
  'common.retry': '重试',
  'common.copy': '复制',
  'common.copied': '已复制',
  'common.more': '更多',
  'common.back': '返回',
  'common.empty': '暂无内容',
  'common.failed': '失败',
  'common.done': '完成',

  // —— 设置 ——
  'settings.title': '设置',
  'settings.language': '语言',
  'settings.languageHint': '界面语言。切换后立即生效，无需重启。',
  'settings.theme': '主题',
  'settings.fontSize': '字号',

  // —— 智能体面板（右栏） ——
  'agent.title': '智能体',
  'agent.send': '发送',
  'agent.stop': '停止',
  'agent.stopping': '正在停止…',
  'agent.newChat': '新建对话',
  'agent.thinking': '思考中…',
  'agent.placeholder': '说说你想做什么…',
  'agent.tokens': '{count} tokens',
  'agent.steps': '{count} 步',
  'agent.failedWith': '失败：{reason}'
} as const

/** 全部文案键（以中文表为准） */
export type MessageKey = keyof typeof zh

/**
 * 英文文案。类型是 `Record<MessageKey, string>` ⇒ **缺键编译不过**。
 */
export const en: Record<MessageKey, string> = {
  'common.ok': 'OK',
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.delete': 'Delete',
  'common.close': 'Close',
  'common.search': 'Search',
  'common.loading': 'Loading…',
  'common.retry': 'Retry',
  'common.copy': 'Copy',
  'common.copied': 'Copied',
  'common.more': 'More',
  'common.back': 'Back',
  'common.empty': 'Nothing here yet',
  'common.failed': 'Failed',
  'common.done': 'Done',

  'settings.title': 'Settings',
  'settings.language': 'Language',
  'settings.languageHint': 'Interface language. Applies immediately, no restart needed.',
  'settings.theme': 'Theme',
  'settings.fontSize': 'Font size',

  'agent.title': 'Agent',
  'agent.send': 'Send',
  'agent.stop': 'Stop',
  'agent.stopping': 'Stopping…',
  'agent.newChat': 'New chat',
  'agent.thinking': 'Thinking…',
  'agent.placeholder': 'What would you like to do?',
  'agent.tokens': '{count} tokens',
  'agent.steps': '{count} steps',
  'agent.failedWith': 'Failed: {reason}'
}

/** 按语言取表 */
export const CATALOGS: Record<'zh' | 'en', Record<MessageKey, string>> = { zh, en }
