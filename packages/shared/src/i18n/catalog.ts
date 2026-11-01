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
  'agent.failedWith': '失败：{reason}',

  // —— 设置：通用 ——
  'settings.subtitle': '偏好即时生效并自动保存，无需点确定',
  'settings.sectionGeneral': '通用设置',
  'settings.themeCurrent': '当前：{name}',
  'settings.themeLight': '浅色',
  'settings.themeDark': '深色',
  'settings.fontSizeHint': '范围 {min}–{max}px，默认 {def}px。',
  'settings.immediate': '立即生效',
  'settings.fontSizeHintTail': '（改的是全站 CSS 缩放系数，无需重启）。',
  'settings.confirmDelete': '确认删除',
  'settings.confirmDeleteLabel': '删除时确认',
  'settings.confirmDeleteOn': '已开启：批量删除会先出现「确认删除 / 取消」两个按钮，点错还有退路。',
  'settings.confirmDeleteOffPrefix': '已关闭：批量删除将',
  'settings.confirmDeleteOffStrong': '直接执行且不再二次确认',
  'settings.confirmDeleteOffSuffix': '，点错无法撤回。',
  'settings.blockExport': '导出阻断',
  'settings.blockExportLabel': '导出时图片缺失则阻断',
  'settings.blockExportOn': '已开启：导出引擎数据前若发现引用的库内图片缺失，会直接报错、不写文件，避免导出错漏的半成品。',
  'settings.blockExportOff': '已关闭：拷得到的图片照常带出，找不到的只告警不阻断（保持旧行为）。',

  // —— 设置：AI 模型服务 ——
  'settings.llmSection': 'AI 模型服务',
  'settings.llmEnable': '启用 API',
  'settings.llmConfidential': '🔒 保密模式（数据不出本机）',
  'settings.llmConfidentialNoticePrefix': '已开启保密模式：所有 AI 调用强制走本地 Ollama，',
  'settings.llmConfidentialNoticeStrong': '数据不出本机',
  'settings.llmConfidentialNoticeSuffix': '，不会向任何云端服务商发送数据。',
  'settings.llmProvider': 'API 服务',
  'settings.llmKeyPlaceholderSaved': '已存入钥匙串（不回显）',
  'settings.llmKeyPlaceholderEmpty': '请输入 API Key',
  'settings.llmSaveKey': '保存到钥匙串',
  'settings.llmKeyHint': '密钥经 Electron safeStorage 加密落盘，不写入浏览器存储，渲染层也不回显。',
  'settings.llmBaseUrl': '接口地址',
  'settings.llmBaseUrlEffective': '实际生效：{url}',
  'settings.llmModel': '模型',
  'settings.llmVision': '视觉输入',
  'settings.llmVisionAuto': '自动（按模型名判断）',
  'settings.llmVisionOn': '强制发送图片',
  'settings.llmVisionOff': '不发送图片',
  'settings.llmVisionYes': '当前判定：会把图片附件发给模型（受 4 张 / 20MB 上限约束）。',
  'settings.llmVisionNo': '当前判定：不发送图片，仅把附件路径告诉智能体（需要时它自己按路径读）。',
  'settings.llmTemperature': '温度',
  'settings.llmMaxTokens': '最大令牌',
  'settings.llmTest': '测试连接',
  'settings.llmTesting': '测试中…',
  'settings.llmClaudeUnsupported': 'Claude 走 Anthropic Messages API，与 OpenAI 协议不兼容，本版暂未接入调用。',
  'settings.llmEnableConfidential': '🔒 一键启用保密模式',
  'settings.outOfScope':
    '本版未提供：自动保存（本应用无自动保存）、界面布局（已固定为单栏工作区）、'
    + '视觉模型配置（TS 侧无视觉模型消费者）、技能生成模板偏好（属策划内容域）。',

  // —— 设置：语言（i18n 自举） ——
  'settings.languageBeta': '英文界面仍在迁移中，部分面板暂时仍显示中文。',

  // —— 设置：即时提示（notices） ——
  'settings.noticeUnknownReason': '未知原因',
  'settings.noticeSaveFailed': '配置保存失败：浏览器存储不可用',
  'settings.noticePushFailed': '已保存到本地，但推送给主进程失败，AI 调用可能仍用旧配置',
  'settings.noticeKeyRequired': '请先填写 API Key',
  'settings.noticeKeySaveFailed': 'API Key 保存失败：{reason}',
  'settings.noticeKeySaved': 'API Key 已存入系统钥匙串（加密落盘，不写入浏览器存储）',
  'settings.noticeLocalAvailable': '本地可用（{count} 个模型）',
  'settings.noticeOllamaNotRunning': '本地 Ollama 未启动',
  'settings.noticeNoModel': '已开启保密模式，但本地还没有模型，请先在命令行执行 ollama pull qwen3:8b 拉取模型',
  'settings.noticeOllamaUnreachable': '已保存配置，但无法连接本地 Ollama：{reason}，请确认已启动（ollama serve）',
  'settings.noticeTestOk': '连接成功',
  'settings.noticeTestFail': '连接失败',
  'settings.noticeTestResult': '{status}：{message}',
  'settings.noticeTestError': '测试连接异常：{reason}'
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
  'agent.failedWith': 'Failed: {reason}',

  'settings.subtitle': 'Changes apply and save automatically — no OK button',
  'settings.sectionGeneral': 'General',
  'settings.themeCurrent': 'Current: {name}',
  'settings.themeLight': 'Light',
  'settings.themeDark': 'Dark',
  'settings.fontSizeHint': 'Range {min}–{max}px, default {def}px. ',
  'settings.immediate': 'Applies immediately',
  'settings.fontSizeHintTail': ' (adjusts the global CSS scale — no restart).',
  'settings.confirmDelete': 'Confirm delete',
  'settings.confirmDeleteLabel': 'Ask before deleting',
  'settings.confirmDeleteOn':
    'On: bulk delete shows “Confirm / Cancel” first, so a misclick is recoverable.',
  'settings.confirmDeleteOffPrefix': 'Off: bulk delete runs ',
  'settings.confirmDeleteOffStrong': 'immediately with no confirmation',
  'settings.confirmDeleteOffSuffix': ', and cannot be undone.',
  'settings.blockExport': 'Export guard',
  'settings.blockExportLabel': 'Block export when images are missing',
  'settings.blockExportOn':
    'On: exporting engine data fails with an error (no file written) when a referenced library image is missing — avoids shipping a half-broken export.',
  'settings.blockExportOff':
    'Off: images that can be found are still exported; missing ones only warn (previous behaviour).',

  'settings.llmSection': 'AI model service',
  'settings.llmEnable': 'Enable API',
  'settings.llmConfidential': '🔒 Confidential mode (data stays local)',
  'settings.llmConfidentialNoticePrefix': 'Confidential mode is on: all AI calls go to local Ollama, ',
  'settings.llmConfidentialNoticeStrong': 'data never leaves this machine',
  'settings.llmConfidentialNoticeSuffix': ', and nothing is sent to any cloud provider.',
  'settings.llmProvider': 'Provider',
  'settings.llmKeyPlaceholderSaved': 'Stored in keychain (not shown)',
  'settings.llmKeyPlaceholderEmpty': 'Enter API key',
  'settings.llmSaveKey': 'Save to keychain',
  'settings.llmKeyHint':
    'The key is encrypted at rest via Electron safeStorage — never written to browser storage, never echoed back.',
  'settings.llmBaseUrl': 'Base URL',
  'settings.llmBaseUrlEffective': 'Effective: {url}',
  'settings.llmModel': 'Model',
  'settings.llmVision': 'Image input',
  'settings.llmVisionAuto': 'Auto (infer from model name)',
  'settings.llmVisionOn': 'Always send images',
  'settings.llmVisionOff': 'Never send images',
  'settings.llmVisionYes': 'Current: image attachments are sent to the model (max 4 images / 20MB).',
  'settings.llmVisionNo':
    'Current: images are not sent; the agent only gets the attachment path and reads it on demand.',
  'settings.llmTemperature': 'Temperature',
  'settings.llmMaxTokens': 'Max tokens',
  'settings.llmTest': 'Test connection',
  'settings.llmTesting': 'Testing…',
  'settings.llmClaudeUnsupported':
    'Claude uses the Anthropic Messages API, which is not OpenAI-compatible — not wired up in this version.',
  'settings.llmEnableConfidential': '🔒 Enable confidential mode',
  'settings.outOfScope':
    'Not in this version: autosave (this app has none), layout (fixed single-column workspace), '
    + 'vision-model config (no consumer yet), skill prompt templates (belongs to the design domain).',

  'settings.languageBeta': 'The English UI is still being migrated — some panels remain in Chinese.',

  'settings.noticeUnknownReason': 'unknown reason',
  'settings.noticeSaveFailed': 'Failed to save: browser storage unavailable',
  'settings.noticePushFailed': 'Saved locally, but pushing to the main process failed — AI calls may still use the old config',
  'settings.noticeKeyRequired': 'Enter an API key first',
  'settings.noticeKeySaveFailed': 'Failed to save API key: {reason}',
  'settings.noticeKeySaved': 'API key stored in the system keychain (encrypted, never in browser storage)',
  'settings.noticeLocalAvailable': 'Local model available ({count} models)',
  'settings.noticeOllamaNotRunning': 'Local Ollama is not running',
  'settings.noticeNoModel': 'Confidential mode is on, but no local model yet — run ollama pull qwen3:8b first',
  'settings.noticeOllamaUnreachable': 'Config saved, but cannot reach local Ollama: {reason}. Make sure it is running (ollama serve)',
  'settings.noticeTestOk': 'Connected',
  'settings.noticeTestFail': 'Connection failed',
  'settings.noticeTestResult': '{status}: {message}',
  'settings.noticeTestError': 'Connection test error: {reason}'
}

/** 按语言取表 */
export const CATALOGS: Record<'zh' | 'en', Record<MessageKey, string>> = { zh, en }
