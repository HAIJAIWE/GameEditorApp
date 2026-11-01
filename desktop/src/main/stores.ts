/**
 * 按活跃库目录构造全部 store（A2-1 从 `main/index.ts` 抽出）。
 *
 * 为什么单独成文件：本模块**不依赖 electron**，因此可以用**真实 store（真 SQLite + 真目录）**
 * 在 Node 环境跑库间隔离的集成测试（`tests/integration/libraryIsolation.test.ts`），
 * 把 A2-1 原本只能靠单测覆盖的路径接线，升级为「真实存储行为已验证」。
 *
 * 各 store 不再自己算路径，统一由库服务给出的 `libDir` 派生。
 */

import { join } from 'node:path'

/**
 * 解析 CLI 子智能体的固定参数（Slice 31）：`MB_SUBAGENT_CLI_ARGS` 期望 JSON 字符串数组。
 * 解析失败/非数组 ⇒ 空数组（不因为配置写错就崩）。
 */
function parseCliArgs(raw: string | undefined): string[] {
  if (raw === undefined || raw.trim() === '') return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
  } catch {
    return []
  }
}

/**
 * 构造子智能体 provider（Slice 31/33/36）：优先级 **远程 URL > ACP > CLI > 进程内 spawn**。
 * 未配置任何 env ⇒ 返回空对象，循环沿用默认进程内 spawn。
 */
function buildSubAgentProvider(): { subAgentProvider?: SubAgentProvider } {
  const remoteUrl = process.env.MB_SUBAGENT_REMOTE_URL?.trim()
  if (remoteUrl !== undefined && remoteUrl !== '') {
    const token = process.env.MB_SUBAGENT_REMOTE_TOKEN?.trim()
    return {
      subAgentProvider: createRemoteSubAgentProvider({
        url: remoteUrl,
        ...(token !== undefined && token !== '' ? { headers: { authorization: `Bearer ${token}` } } : {})
      })
    }
  }
  const acp = process.env.MB_SUBAGENT_ACP?.trim()
  if (acp !== undefined && acp !== '') {
    return {
      subAgentProvider: createAcpSubAgentProvider({
        command: acp,
        args: parseCliArgs(process.env.MB_SUBAGENT_ACP_ARGS),
        ...(process.env.MB_SUBAGENT_ACP_PERMISSION === 'allow' ? { permission: 'allow' as const } : {})
      })
    }
  }
  const cli = process.env.MB_SUBAGENT_CLI?.trim()
  if (cli !== undefined && cli !== '') {
    return {
      subAgentProvider: createCliSubAgentProvider({
        command: cli,
        args: parseCliArgs(process.env.MB_SUBAGENT_CLI_ARGS),
        ...(process.env.MB_SUBAGENT_CLI_INPUT === 'stdin' ? { inputMode: 'stdin' as const } : {})
      })
    }
  }
  return {}
}

import { AgentApprovalBroker } from './agent/execution/approvalBroker'
import { AgentBrainService, createDispatcherToolRunner } from './agent/brain/brainService'
import { readProjectInstructions } from './agent/agentService/projectInstructions'
import { OperationLogStore } from './agent/store/operationLogStore'
import { DeliveryLogStore } from './agent/store/deliveryLogStore'
import { createRecordingToolRunner } from './agent/ops/operationRecorder'
import { createRollbackSkill } from './agent/skills/rollbackSkill'
import { createSessionSearchSkill } from './agent/skills/sessionSearchSkill'
import { createSubAgentSkill } from './agent/skills/subAgentSkill'
import { createTodoSkill } from './agent/skills/todoSkill'
import { createPresentPlanSkill } from './agent/skills/presentPlanSkill'
import { createGoalSkill } from './agent/skills/goalSkill'
import { createJobSkill } from './agent/skills/jobSkill'
import { createFileOpsSkill } from './agent/skills/fileOpsSkill'
import { createShellSkill } from './agent/skills/shellSkill'
import { getWorkspaceRoot, initWorkspace } from './agent/workspace/workspaceStore'
import { createLspSkill } from './agent/skills/lspSkill'
import { createLspServerResolver } from './agent/lsp/lspConfig'
import { createTechDocSkill } from './agent/skills/techDocSkill'
import { createWebSkill } from './agent/skills/webSkill'
import { createDocumentSkill } from './agent/skills/documentSkill'
import { createTerminalSkill } from './agent/skills/terminalSkill'
import { createCliSubAgentProvider } from './agent/subagent/subagentCli'
import { createRemoteSubAgentProvider } from './agent/subagent/subagentRemote'
import { createAcpSubAgentProvider } from './agent/subagent/subagentAcp'
import type { SubAgentProvider } from '../shared/agent/brain'
import { mcpManager } from './agent/mcp/manager'
import { AgentMemoryStore } from './agent/store/memoryStore'
import { createOllamaEmbeddingProvider } from './agent/brain/embedding'
import { createPersonalizationStores } from './agent/store/preferenceStore'
import type { FeedbackStore, PreferenceStore } from './agent/store/preferenceStore'
import { AgentSessionStore } from './agent/session/sessionStore'
import { SkillDispatcher } from './agent/execution/dispatcher'
import { createAskUserSkill } from './agent/skills/askUserSkill'
import { createCeshuSkill } from './agent/skills/ceshuSkill'
import { createCodeSkill } from './agent/skills/codeSkill'
import { createGameDataSkill } from './agent/skills/gameDataSkill'
import { AttrSystemStore } from './attr/attrSystemStore'
import { exportCeshuDocument } from './ceshu/export/exporter'
import { CeshuDataSync } from './ceshu/dataSync'
import { CeshuManager } from './ceshu/manager'
import { CeshuNotesStore } from './ceshu/notesStore'
import { CeshuStorage } from './ceshu/storage'
import { CeshuTemplateStore } from './ceshu/templateStore'
import { DataService } from './data/service'
import { UndoRecorder } from './data/undoRecorder'
import { SqliteItemsRepository } from './data/sqliteRepo'
import { LlmClient } from './llm/client'
import { TypeSchemaStore } from './schema/store'
import { FieldTemplateStore } from './schema/fieldTemplateStore'

/** 一套随活跃库重建的 store 组合 */
export interface AppStores {
  dbPath: string
  dataService: DataService
  /** 撤销记录器（随活跃库重建；切换库即清空栈，见 activateLibrary 的结构性保证） */
  undoRecorder: UndoRecorder
  ceshuManager: CeshuManager
  typeSchemaStore: TypeSchemaStore
  fieldTemplates: FieldTemplateStore
  ceshuNotesStore: CeshuNotesStore
  ceshuTemplateStore: CeshuTemplateStore
  attrSystemStore: AttrSystemStore
  dataSync: CeshuDataSync
  agentDispatcher: SkillDispatcher
  agentBrain: AgentBrainService
  agentSessionStore: AgentSessionStore
  agentPreferences: PreferenceStore
  agentFeedback: FeedbackStore
  /** 操作日志（AI 数据变更记录，供「最近改动」面板与回滚） */
  agentOperationLog: OperationLogStore
  /** 交付日志（Agent 显式交付的文件，供对话内联交付卡） */
  agentDeliveryLog: DeliveryLogStore
  approvalBroker: AgentApprovalBroker
  llmClient: LlmClient
}

/** 由活跃库目录构造全部 store（切换库时整体重建） */
export function buildStores(libDir: string): AppStores {
  const dbPath = join(libDir, 'mb-editor.db')
  const data = new DataService(new SqliteItemsRepository(dbPath))
  // 撤销记录器随活跃库重建；库切换时 buildStores 重新执行 → 旧栈随对象丢弃而清空（E7）
  const undoRecorder = new UndoRecorder(data)
  data.attachUndoRecorder(undoRecorder)
  const ceshu = new CeshuManager(new CeshuStorage(join(libDir, 'ceshu')))
  const schema = new TypeSchemaStore(join(libDir, 'type_schema.json'))

  // Agent 技能调度器：注册内置技能，服务在构造时注入
  const dispatcher = new SkillDispatcher()
  dispatcher.register(createGameDataSkill({ dataService: data, typeSchemaStore: schema }))
  dispatcher.register(
    createCeshuSkill({
      ceshuManager: ceshu,
      exportDocument: exportCeshuDocument,
      exportDir: join(libDir, 'exports')
    })
  )
  dispatcher.register(createAskUserSkill())
  // 沙箱代码技能：SYSTEM 级风险，每次调用都需用户确认
  dispatcher.register(createCodeSkill())

  // 会话级回滚（E3）：日志 + 回滚技能，记录器包在 runner 上（Agent 改数据的唯一漏斗）
  const operationLog = new OperationLogStore()
  // 交付日志（ui-deliverables 交付卡）：与操作日志分开存（交付不可回滚）
  const deliveryLog = new DeliveryLogStore()
  dispatcher.register(createRollbackSkill({ operationLog, dataService: data }))
  // 子智能体（Slice 19）：标记技能，实际由 Brain 循环按名拦截并递归跑子循环
  dispatcher.register(createSubAgentSkill())
  // MCP 工具（若已连接）：注册进本库的 dispatcher。连接是应用级的，注册是库级的。
  mcpManager.attach(dispatcher)
  const runner = createRecordingToolRunner(createDispatcherToolRunner(dispatcher), {
    operationLog,
    deliveryLog,
    listItems: () => data.listAllItems()
  })

  // Agent 会话与记忆随库隔离（A2-1 起落在 <库>/agent 下）
  const agentDir = join(libDir, 'agent')
  const sessionStore = new AgentSessionStore(agentDir)
  // #25 会话检索（对齐 dsh session-search）：给智能体的只读历史检索工具（SQLite FTS5）。
  // 依赖 sessionStore（按库隔离），故在它之后注册；工具面按 chat 时 `dispatcher.list()` 现算，晚注册无碍。
  dispatcher.register(createSessionSearchSkill({ sessionStore }))
  // 任务清单（对齐 dsh tool-todo）：多步任务先列计划、逐条推进，工具结果里即清单，模型下一轮可见
  dispatcher.register(createTodoSkill())
  // 计划审阅（对齐 dsh plan-mode 的 exit_plan_mode）：动手前把完整计划交用户批准
  dispatcher.register(createPresentPlanSkill())
  // 目标生命周期（对齐 dsh goal）：长任务维护明确目标 + 阶段 + 轮次上限
  dispatcher.register(createGoalSkill())
  // 后台任务观测/取消（对齐 dsh tool-jobs）：list/status/cancel 异步子智能体
  dispatcher.register(createJobSkill())
  // 编程能力（对齐 dsh fs-sandbox + shell）：工作区默认 <库>/code，可在面板改选
  // （持久化 <库>/workspace.json）；受沙箱策略约束（MB_SANDBOX_POLICY=read-only 时只读/禁命令）。
  initWorkspace(libDir)
  const workspacePolicy = process.env.MB_SANDBOX_POLICY === 'read-only' ? 'read-only' : 'workspace-write'
  dispatcher.register(createFileOpsSkill({ root: getWorkspaceRoot, policy: workspacePolicy }))
  dispatcher.register(
    createShellSkill({ root: getWorkspaceRoot, policy: workspacePolicy, libraryDir: () => libDir })
  )
  // LSP 代码导航（对齐 dsh tool-lsp）：语言服务器由用户经 <库>/lsp.json 自备
  dispatcher.register(createLspSkill({ root: getWorkspaceRoot, resolveServer: createLspServerResolver(libDir) }))
  // 技术设计文档（GDD 之外的工程文档）：存 <库>/tech/<name>.md
  dispatcher.register(createTechDocSkill({ root: () => join(libDir, 'tech') }))
  // 网页抓取（对齐 dsh web-fetch-http）：SSRF 防护 + HTML→文本 + 超时/体积上限
  dispatcher.register(createWebSkill())
  // 文档解析（对齐 dsh document）：docx/pptx/xlsx/文本 → 纯文本（工作区内）
  dispatcher.register(createDocumentSkill({ root: getWorkspaceRoot }))
  // 持久终端（对齐 dsh terminal）：start/send/read/stop 的常驻 shell 会话
  dispatcher.register(createTerminalSkill({ root: getWorkspaceRoot }))
  // 用户偏好 / 反馈：随库隔离，构造时即从磁盘加载；偏好注入系统提示词（见 brainService）
  const personalization = createPersonalizationStores(agentDir)

  return {
    dbPath,
    dataService: data,
    undoRecorder,
    ceshuManager: ceshu,
    typeSchemaStore: schema,
    fieldTemplates: new FieldTemplateStore(join(libDir, 'field_templates.json')),
    ceshuNotesStore: new CeshuNotesStore(join(libDir, 'ceshu_notes')),
    ceshuTemplateStore: new CeshuTemplateStore(join(libDir, 'ceshu_templates')),
    attrSystemStore: new AttrSystemStore(join(libDir, 'attr_system.json')),
    dataSync: new CeshuDataSync(ceshu, data, schema),
    agentDispatcher: dispatcher,
    agentBrain: new AgentBrainService({
      dispatcher,
      sessionStore,
      // 附件只存叶子名；提示词里给绝对路径时按活跃库目录解析
      resolveAttachmentPath: (name) => join(libDir, 'attachments', name),
      // F3：显式配置 MB_MEMORY_EMBED_MODEL 时走真实 embedding；否则回落到确定性哈希
      memoryStore: new AgentMemoryStore(agentDir, { embedder: createOllamaEmbeddingProvider() }),
      preferences: personalization.preferences,
      // 项目约定（对齐 dsh agent-instructions）：库级 AGENTS.md 常驻注入
      projectInstructions: () => readProjectInstructions(libDir),
      runner,
      // Slice 31/33：子智能体 provider（远程 URL > CLI > 进程内 spawn，见 buildSubAgentProvider）
      ...buildSubAgentProvider(),
      // Slice 32：沙箱策略（MB_SANDBOX_POLICY=read-only 时拒绝外部 CLI 子智能体）
      ...(process.env.MB_SANDBOX_POLICY === 'read-only' ? { sandboxPolicy: 'read-only' as const } : {})
    }),
    agentSessionStore: sessionStore,
    agentPreferences: personalization.preferences,
    agentFeedback: personalization.feedback,
    agentOperationLog: operationLog,
    agentDeliveryLog: deliveryLog,
    approvalBroker: new AgentApprovalBroker(),
    llmClient: new LlmClient()
  }
}
