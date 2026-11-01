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

  // —— 智能体面板：状态 / 档位 ——
  'agent.status.idle': '待命',
  'agent.status.waitingApproval': '等待确认',
  'agent.status.waitingInput': '等待回答',
  'agent.status.done': '已完成',
  'agent.status.error': '出错',
  'agent.tier.cloud': '云端',
  'agent.tier.local': '本地',
  'agent.tier.unconfigured': '未配置',
  'agent.thinkingWithTime': '深度求索中，用时 {time}…',
  'agent.wait.confirm': '等待你确认',
  'agent.wait.input': '等待你回答',
  'agent.done.analyzed': '已完成分析',
  'agent.done.analyzedWithTime': '已完成分析 · 用时 {time}',

  // —— 智能体面板：页签 / 轨迹 / 会话 ——
  'agent.tab.chat': '对话',
  'agent.tab.trajectory': '轨迹',
  'agent.tabs.aria': '对话视图',
  'agent.traj.turns': '{n} 轮',
  'agent.traj.steps': '{n} 步',
  'agent.traj.tools': '{n} 次工具',
  'agent.traj.empty': '这一轮还没有执行记录。',
  'agent.session.detected': '检测到上次会话（{count} 条消息，{savedAt}）',
  'agent.session.restore': '恢复',
  'agent.session.dismiss': '忽略',

  // —— 智能体面板：草稿 / 预设 / 空态 ——
  'agent.preset.select': '选择智能体预设',
  'agent.preset.chipTitle': '本对话的智能体预设：{label}（新建对话可更改）',
  'agent.preset.title': '智能体预设：{label}',
  'agent.draft.menu': '草稿管理（保存 / 恢复对话）',
  'agent.draft.save': '保存为草稿',
  'agent.draft.recent': '最近草稿',
  'agent.draft.empty': '暂无草稿',
  'agent.draft.entryMeta': '（{time} · {count} 条）',
  'agent.emptyHint': '描述你想做的事，我会调用工具完成（例如「列出所有角色数据」）。',

  // —— 智能体面板：能力 / 快捷键 / 新建对话 ——
  'agent.capabilities': '查看智能体能力清单（工具与风险等级）',
  'agent.shortcuts': '键盘快捷键',
  'agent.newChat.body': '当前对话记录将被清空且无法恢复。确定要开始新对话吗？',
  'agent.newChat.confirm': '清空并新建',
  'agent.newChat.hint': '新建对话（清空当前记录）',
  'agent.newChat.confirmAria': '确认新建对话',

  // —— 智能体面板：运行统计 / 档位提示 ——
  'agent.runStats.title': '本次消耗',
  'agent.runStats.tools': ' · {n} 次工具',
  'agent.tierHint.title': '提示',
  'agent.tierHint.body': '未配置云端模型，当前走本地 Ollama。到「设置 → AI 模型服务」选择服务商并填 Key，或保持本地（保密模式）。',

  // —— 智能体面板：交互（审批 / 提问） ——
  'agent.interaction.confirm': '操作确认',
  'agent.interaction.clarify': '需要你澄清',
  'agent.interaction.unspecified': '（未指定）',
  'agent.interaction.approve': '确认执行',
  'agent.interaction.cancel': '取消',
  'agent.interaction.multi': '（可多选）',
  'agent.interaction.inputPlaceholder': '输入你的回答…',
  'agent.interaction.submit': '提交',
  'agent.interaction.submitAll': '提交全部回答',

  // —— 智能体面板：输入区 ——
  'agent.composer.addContext': '添加上下文（引用数据表 / 斜杠命令）',
  'agent.composer.addContextLabel': '添加上下文',
  'agent.composer.goal': '本轮目标（可选，随对话一起发给智能体）',
  'agent.composer.input': '和智能体说点什么…（/ 命令，@ 引用数据表）',
  'agent.composer.reference': '引用数据表',
  'agent.composer.command': '斜杠命令',
  'agent.composer.upload': '上传文件',
  'agent.composer.fullPermission': '完全权限',
  'agent.composer.permTitle': '当前权限模式：完全权限（主智能体工具全开，后端无可切换开关）',
  'agent.composer.modelTitle': '当前模型：{model}（{provider}）',
  'agent.composer.noModel': '未选择模型',
  'agent.composer.noModels': '无可切换模型',
  'agent.composer.mic': '语音输入（未实现）',
  'agent.composer.stopArmed': '再点一次即可停止本轮',
  'agent.composer.stop': '停止本轮（已产出的结果会保留）',
  'agent.composer.stopConfirm': '确认停止',
  'agent.composer.send': '发送（Enter）',
  'agent.composer.stats': '{turns} 轮 · {steps} 步 · {tokens} tok · {ms} ms',

  // —— 智能体面板：斜杠命令菜单 ——
  'agent.cmd.new': '新建对话',
  'agent.cmd.newHint': '清空当前记录，开始新对话（可重新选择智能体预设）',
  'agent.cmd.drafts': '草稿管理',
  'agent.cmd.draftsHint': '保存 / 恢复对话草稿',
  'agent.cmd.capabilities': '能力清单',
  'agent.cmd.capabilitiesHint': '查看工具与风险等级',
  'agent.cmd.clear': '清空输入',
  'agent.cmd.clearHint': '只清空输入框，不发送',
  'agent.cmd.help': '帮助',
  'agent.cmd.helpHint': '斜杠命令与发送方式',
  'agent.cmd.helpText': '输入 / 打开命令；直接输入文字则发送给智能体。',

  // —— 智能体面板：本轮进度卡 ——
  'agent.plan.running': '进行中',
  'agent.plan.done': '已完成',
  'agent.plan.failed': '有失败',
  'agent.plan.title': '本轮进度',
  'agent.plan.current': '正在执行：',
  'agent.plan.failedHint': '{n} 步失败（展开执行步骤查看原因）',
  'agent.plan.viewSteps': '查看步骤',
  'agent.plan.aria': '本轮进度：{done}/{total} 步完成{failed}',
  'agent.plan.ariaFailed': '，{n} 步失败',

  // —— 智能体面板：步骤展开 / 预设 / 新建对话 ——
  'agent.steps.collapse': '收起执行步骤',
  'agent.steps.expand': '展开执行步骤（{n}）',

  // —— 智能体面板：步骤 / 轮次 ——
  'agent.step.thinking': '思考中…',
  'agent.step.parallel': '并行执行中…',
  'agent.step.running': '执行中',
  'agent.step.done': '完成',
  'agent.step.failed': '失败',
  'agent.step.argsLabel': '参数',
  'agent.step.outputLabel': '输出',
  'agent.step.imagesLabel': '图像',
  'agent.step.turn': '第 {n} 轮',
  'agent.step.turnMeta': '{n} 步{failed}',
  'agent.step.turnMetaFailed': ' · 有失败',
  'agent.step.toolImage': '工具返回的图像 {n}',

  // —— 智能体面板：子智能体 ——
  'agent.subagent.heading': '子智能体（{n}）',
  'agent.subagent.steerPlaceholder': '给子智能体插话…',
  'agent.subagent.steer': '插话',
  'agent.subagent.stop': '停止',
  'agent.subagent.running': '执行中…',

  // —— 智能体面板：审批卡 ——
  'agent.approval.title': '危险操作确认',
  'agent.approval.risk': '风险：{label}',
  'agent.approval.tool': '工具：{tool} · 操作：{action}',
  'agent.approval.params': '参数',
  'agent.approval.note': '批准后执行；拒绝会把「未确认」回灌给模型，让它换方案。',
  'agent.approval.allow': '允许执行',
  'agent.approval.reject': '拒绝',
  'agent.risk.readonly': '只读',
  'agent.risk.dataWrite': '写数据',
  'agent.risk.fileSystem': '文件系统',
  'agent.risk.network': '网络',
  'agent.risk.system': '系统级',

  // —— 智能体面板：工作区 / 后台任务 / 任务 ——
  'agent.workspace.title': '工作区',
  'agent.workspace.choose': '选择…',
  'agent.jobs.title': '后台任务（{inner}）',
  'agent.jobs.runningInner': '{running} 运行中 / 共 {total}',
  'agent.jobs.totalInner': '共 {total}',
  'agent.jobs.cancel': '取消',
  'agent.tasks.title': '任务',

  // —— 智能体面板：改动卡 / 交付卡 ——
  'agent.change.empty': '暂无改动记录（智能体尚未修改数据）',
  'agent.op.create': '新建',
  'agent.op.update': '修改',
  'agent.op.delete': '删除',
  'agent.change.one': '改动「{name}」',
  'agent.change.many': '改动 {n} 项',
  'agent.change.collapse': '收起',
  'agent.change.expand': '全部 {n} 项',
  'agent.change.cardTitle': '本次改动',
  'agent.change.viewAll': '查看全部',
  'agent.delivery.one': '交付 1 个文件',
  'agent.delivery.many': '交付 {n} 个文件',
  'agent.delivery.expand': '全部 {n} 个文件',

  // —— 智能体面板：消息 / 反馈 / 灯箱 ——
  'agent.msg.copied': '已复制',
  'agent.msg.copy': '复制消息',
  'agent.msg.helpful': '标记有帮助',
  'agent.msg.helpfulOn': '已标记有帮助',
  'agent.msg.unhelpful': '标记没帮助',
  'agent.msg.unhelpfulOn': '已标记没帮助',
  'agent.feedback.submit': '提交反馈',
  'agent.feedback.error': '反馈提交失败，请重试',
  'agent.feedback.placeholderHelpful': '哪里有帮助？（可选，会记成偏好）',
  'agent.feedback.placeholderUnhelpful': '哪里不对？（可选）',
  'agent.lightbox.close': '关闭（Esc）',
  'agent.lightbox.aria': '查看图片 {alt}',
  'agent.image.open': '打开图片 {name}',

  // —— 智能体面板：时间 / 上下文 ——
  'agent.elapsed.sec': '{n} 秒',
  'agent.elapsed.min': '{n} 分',
  'agent.elapsed.minSec': '{n} 分 {m} 秒',
  'agent.context.title': '上下文用量 {pct}% · {total} / {ctx} tok',
  'agent.context.total': '总用量',
  'agent.context.input': '输入',
  'agent.context.output': '输出',
  'agent.context.window': '上下文窗口',
  'agent.context.occupied': '占用',

  // —— 智能体面板：附件 / 拖放 ——
  'agent.attach.importing': '导入中…',
  'agent.attach.remove': '移除附件',
  'agent.drop.disabled': '智能体运行中，暂不能添加附件',
  'agent.drop.release': '松开以添加附件',
  'agent.drop.desc': '支持任意文件，会复制进当前库',

  // —— 智能体面板：快捷键 ——
  'agent.shortcuts.composer': '输入框',
  'agent.shortcuts.app': '全局',
  'agent.shortcuts.search': '搜索动作或按键…',
  'agent.shortcuts.searchAria': '搜索快捷键',
  'agent.shortcuts.empty': '没有匹配的快捷键',
  'agent.shortcuts.note': 'macOS 上 Ctrl 对应 ⌘。',
  'agent.shortcut.send': '发送消息',
  'agent.shortcut.newline': '输入换行',
  'agent.shortcut.close': '关闭菜单 / 弹层',
  'agent.shortcut.sidebar': '切换侧栏',
  'agent.shortcut.undo': '撤销',
  'agent.shortcut.redo': '重做（或 Ctrl + Y）',

  // —— 智能体面板：字段动作条 ——
  'agent.field.aiDraft': 'AI 草稿',
  'agent.field.humanEdited': '人改',
  'agent.field.approved': '已批准',
  'agent.field.emptyHint': '点击中间编辑器的任意字段，可在这里对它局部重生成',
  'agent.field.busy': '生成中…',

  // —— 智能体面板：草稿 / 停止回执 ——
  'agent.draft.saved': '草稿已保存：{name}',
  'agent.draft.restored': '已恢复草稿：{name}',
  'agent.stop.noop': '本轮已结束，无需停止',

  // —— 智能体面板：正文文件链接 ——
  'agent.chat.openInCode': '在代码面板打开 {path}',

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

  // —— Agent panel: status / tier ——
  'agent.status.idle': 'Idle',
  'agent.status.waitingApproval': 'Awaiting approval',
  'agent.status.waitingInput': 'Awaiting answer',
  'agent.status.done': 'Done',
  'agent.status.error': 'Error',
  'agent.tier.cloud': 'Cloud',
  'agent.tier.local': 'Local',
  'agent.tier.unconfigured': 'Unconfigured',
  'agent.thinkingWithTime': 'Thinking… ({time})',
  'agent.wait.confirm': 'Awaiting your confirmation',
  'agent.wait.input': 'Awaiting your answer',
  'agent.done.analyzed': 'Analysis complete',
  'agent.done.analyzedWithTime': 'Analysis complete · {time}',

  // —— Agent panel: tabs / trajectory / session ——
  'agent.tab.chat': 'Chat',
  'agent.tab.trajectory': 'Trajectory',
  'agent.tabs.aria': 'Conversation view',
  'agent.traj.turns': '{n} turns',
  'agent.traj.steps': '{n} steps',
  'agent.traj.tools': '{n} tool calls',
  'agent.traj.empty': 'No execution records this run yet.',
  'agent.session.detected': 'Found previous session ({count} messages, {savedAt})',
  'agent.session.restore': 'Restore',
  'agent.session.dismiss': 'Dismiss',

  // —— Agent panel: drafts / preset / empty state ——
  'agent.preset.select': 'Select agent preset',
  'agent.preset.chipTitle': 'Agent preset for this chat: {label} (change via New chat)',
  'agent.preset.title': 'Agent preset: {label}',
  'agent.draft.menu': 'Drafts (save / restore chat)',
  'agent.draft.save': 'Save as draft',
  'agent.draft.recent': 'Recent drafts',
  'agent.draft.empty': 'No drafts',
  'agent.draft.entryMeta': '({time} · {count} messages)',
  'agent.emptyHint': 'Describe what you want to do and I will call tools to do it (e.g. “list all character data”).',

  // —— Agent panel: capabilities / shortcuts / new chat ——
  'agent.capabilities': 'View agent capabilities (tools & risk levels)',
  'agent.shortcuts': 'Keyboard shortcuts',
  'agent.newChat.body': 'The current chat will be cleared and cannot be recovered. Start a new chat?',
  'agent.newChat.confirm': 'Clear & new',
  'agent.newChat.hint': 'New chat (clears current record)',
  'agent.newChat.confirmAria': 'Confirm new chat',

  // —— Agent panel: run stats / tier hint ——
  'agent.runStats.title': 'This run',
  'agent.runStats.tools': ' · {n} tool calls',
  'agent.tierHint.title': 'Tip',
  'agent.tierHint.body': 'No cloud model configured — currently using local Ollama. Go to “Settings → AI Model Service” to pick a provider and enter a key, or stay local (confidential mode).',

  // —— Agent panel: interaction (approval / questions) ——
  'agent.interaction.confirm': 'Confirm action',
  'agent.interaction.clarify': 'Needs clarification',
  'agent.interaction.unspecified': '(unspecified)',
  'agent.interaction.approve': 'Confirm execution',
  'agent.interaction.cancel': 'Cancel',
  'agent.interaction.multi': '(multi-select)',
  'agent.interaction.inputPlaceholder': 'Type your answer…',
  'agent.interaction.submit': 'Submit',
  'agent.interaction.submitAll': 'Submit all answers',

  // —— Agent panel: composer ——
  'agent.composer.addContext': 'Add context (reference tables / slash commands)',
  'agent.composer.addContextLabel': 'Add context',
  'agent.composer.goal': 'Goal for this run (optional, sent with chat)',
  'agent.composer.input': 'Say something to the agent… (/ commands, @ reference tables)',
  'agent.composer.reference': 'Reference table',
  'agent.composer.command': 'Slash command',
  'agent.composer.upload': 'Upload file',
  'agent.composer.fullPermission': 'Full access',
  'agent.composer.permTitle': 'Permission mode: Full access (all main-agent tools enabled; backend has no toggle)',
  'agent.composer.modelTitle': 'Current model: {model} ({provider})',
  'agent.composer.noModel': 'No model selected',
  'agent.composer.noModels': 'No switchable models',
  'agent.composer.mic': 'Voice input (not implemented)',
  'agent.composer.stopArmed': 'Click again to stop this run',
  'agent.composer.stop': 'Stop this run (results kept)',
  'agent.composer.stopConfirm': 'Confirm stop',
  'agent.composer.send': 'Send (Enter)',
  'agent.composer.stats': '{turns} turns · {steps} steps · {tokens} tok · {ms} ms',

  // —— Agent panel: slash command menu ——
  'agent.cmd.new': 'New chat',
  'agent.cmd.newHint': 'Clear the current record and start a new chat (choose a preset)',
  'agent.cmd.drafts': 'Drafts',
  'agent.cmd.draftsHint': 'Save / restore chat drafts',
  'agent.cmd.capabilities': 'Capabilities',
  'agent.cmd.capabilitiesHint': 'View tools and risk levels',
  'agent.cmd.clear': 'Clear input',
  'agent.cmd.clearHint': 'Clear the input box only, do not send',
  'agent.cmd.help': 'Help',
  'agent.cmd.helpHint': 'Slash commands and how to send',
  'agent.cmd.helpText': 'Type / for commands; type text to send to the agent.',

  // —— Agent panel: run progress card ——
  'agent.plan.running': 'In progress',
  'agent.plan.done': 'Done',
  'agent.plan.failed': 'Has failures',
  'agent.plan.title': 'This run',
  'agent.plan.current': 'Running: ',
  'agent.plan.failedHint': '{n} step(s) failed (expand steps to see why)',
  'agent.plan.viewSteps': 'View steps',
  'agent.plan.aria': 'This run: {done}/{total} steps done{failed}',
  'agent.plan.ariaFailed': ', {n} failed',

  // —— Agent panel: step expand / preset / new chat ——
  'agent.steps.collapse': 'Collapse steps',
  'agent.steps.expand': 'Expand steps ({n})',

  // —— Agent panel: steps / turns ——
  'agent.step.thinking': 'Thinking…',
  'agent.step.parallel': 'Running in parallel…',
  'agent.step.running': 'Running',
  'agent.step.done': 'Done',
  'agent.step.failed': 'Failed',
  'agent.step.argsLabel': 'Parameters',
  'agent.step.outputLabel': 'Output',
  'agent.step.imagesLabel': 'Images',
  'agent.step.turn': 'Turn {n}',
  'agent.step.turnMeta': '{n} steps{failed}',
  'agent.step.turnMetaFailed': ' · has failures',
  'agent.step.toolImage': 'Tool image {n}',

  // —— Agent panel: sub-agents ——
  'agent.subagent.heading': 'Sub-agents ({n})',
  'agent.subagent.steerPlaceholder': 'Message sub-agent…',
  'agent.subagent.steer': 'Steer',
  'agent.subagent.stop': 'Stop',
  'agent.subagent.running': 'Running…',

  // —— Agent panel: approval card ——
  'agent.approval.title': 'Confirm risky action',
  'agent.approval.risk': 'Risk: {label}',
  'agent.approval.tool': 'Tool: {tool} · Action: {action}',
  'agent.approval.params': 'Parameters',
  'agent.approval.note': 'After approval it executes; rejection feeds “unconfirmed” back to the model so it can switch plans.',
  'agent.approval.allow': 'Allow',
  'agent.approval.reject': 'Reject',
  'agent.risk.readonly': 'Read-only',
  'agent.risk.dataWrite': 'Data write',
  'agent.risk.fileSystem': 'File system',
  'agent.risk.network': 'Network',
  'agent.risk.system': 'System',

  // —— Agent panel: workspace / background jobs / tasks ——
  'agent.workspace.title': 'Workspace',
  'agent.workspace.choose': 'Choose…',
  'agent.jobs.title': 'Background jobs ({inner})',
  'agent.jobs.runningInner': '{running} running / total {total}',
  'agent.jobs.totalInner': 'total {total}',
  'agent.jobs.cancel': 'Cancel',
  'agent.tasks.title': 'Tasks',

  // —— Agent panel: change card / delivery card ——
  'agent.change.empty': 'No change records yet (the agent has not modified data)',
  'agent.op.create': 'Create',
  'agent.op.update': 'Update',
  'agent.op.delete': 'Delete',
  'agent.change.one': 'Changed “{name}”',
  'agent.change.many': 'Changed {n} items',
  'agent.change.collapse': 'Collapse',
  'agent.change.expand': 'All {n} items',
  'agent.change.cardTitle': 'Changes this run',
  'agent.change.viewAll': 'View all',
  'agent.delivery.one': 'Delivered 1 file',
  'agent.delivery.many': 'Delivered {n} files',
  'agent.delivery.expand': 'All {n} files',

  // —— Agent panel: messages / feedback / lightbox ——
  'agent.msg.copied': 'Copied',
  'agent.msg.copy': 'Copy message',
  'agent.msg.helpful': 'Mark helpful',
  'agent.msg.helpfulOn': 'Marked helpful',
  'agent.msg.unhelpful': 'Mark unhelpful',
  'agent.msg.unhelpfulOn': 'Marked unhelpful',
  'agent.feedback.submit': 'Submit feedback',
  'agent.feedback.error': 'Feedback failed, please retry',
  'agent.feedback.placeholderHelpful': 'What was helpful? (optional, saved as preference)',
  'agent.feedback.placeholderUnhelpful': 'What was wrong? (optional)',
  'agent.lightbox.close': 'Close (Esc)',
  'agent.lightbox.aria': 'View image {alt}',
  'agent.image.open': 'Open image {name}',

  // —— Agent panel: time / context ——
  'agent.elapsed.sec': '{n}s',
  'agent.elapsed.min': '{n}m',
  'agent.elapsed.minSec': '{n}m {m}s',
  'agent.context.title': 'Context {pct}% · {total} / {ctx} tok',
  'agent.context.total': 'Total',
  'agent.context.input': 'Input',
  'agent.context.output': 'Output',
  'agent.context.window': 'Context window',
  'agent.context.occupied': 'Used',

  // —— Agent panel: attachments / drag & drop ——
  'agent.attach.importing': 'Importing…',
  'agent.attach.remove': 'Remove attachment',
  'agent.drop.disabled': 'The agent is running — cannot add attachments now',
  'agent.drop.release': 'Release to add attachment',
  'agent.drop.desc': 'Any file is supported; it will be copied into the current library',

  // —— Agent panel: shortcuts ——
  'agent.shortcuts.composer': 'Composer',
  'agent.shortcuts.app': 'Global',
  'agent.shortcuts.search': 'Search actions or keys…',
  'agent.shortcuts.searchAria': 'Search shortcuts',
  'agent.shortcuts.empty': 'No matching shortcuts',
  'agent.shortcuts.note': 'On macOS, Ctrl maps to ⌘.',
  'agent.shortcut.send': 'Send message',
  'agent.shortcut.newline': 'Insert newline',
  'agent.shortcut.close': 'Close menu / popover',
  'agent.shortcut.sidebar': 'Toggle sidebar',
  'agent.shortcut.undo': 'Undo',
  'agent.shortcut.redo': 'Redo (or Ctrl + Y)',

  // —— Agent panel: field action strip ——
  'agent.field.aiDraft': 'AI draft',
  'agent.field.humanEdited': 'Edited',
  'agent.field.approved': 'Approved',
  'agent.field.emptyHint': 'Click any field in the middle editor to regenerate it here',
  'agent.field.busy': 'Generating…',

  // —— Agent panel: draft / stop receipts ——
  'agent.draft.saved': 'Draft saved: {name}',
  'agent.draft.restored': 'Draft restored: {name}',
  'agent.stop.noop': 'This run already ended — nothing to stop',

  // —— Agent panel: chat file link ——
  'agent.chat.openInCode': 'Open {path} in the code panel',

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
