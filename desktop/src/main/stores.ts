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

import { AgentApprovalBroker } from './agent/approvalBroker'
import { AgentBrainService, createDispatcherToolRunner } from './agent/brainService'
import { OperationLogStore } from './agent/operationLogStore'
import { createRecordingToolRunner } from './agent/operationRecorder'
import { createRollbackSkill } from './agent/skills/rollbackSkill'
import { AgentMemoryStore } from './agent/memoryStore'
import { createPersonalizationStores } from './agent/preferenceStore'
import type { FeedbackStore, PreferenceStore } from './agent/preferenceStore'
import { AgentSessionStore } from './agent/sessionStore'
import { SkillDispatcher } from './agent/dispatcher'
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
import { SqliteItemsRepository } from './data/sqliteRepo'
import { LlmClient } from './llm/client'
import { TypeSchemaStore } from './schema/store'

/** 一套随活跃库重建的 store 组合 */
export interface AppStores {
  dbPath: string
  dataService: DataService
  ceshuManager: CeshuManager
  typeSchemaStore: TypeSchemaStore
  ceshuNotesStore: CeshuNotesStore
  ceshuTemplateStore: CeshuTemplateStore
  attrSystemStore: AttrSystemStore
  dataSync: CeshuDataSync
  agentDispatcher: SkillDispatcher
  agentBrain: AgentBrainService
  agentSessionStore: AgentSessionStore
  agentPreferences: PreferenceStore
  agentFeedback: FeedbackStore
  approvalBroker: AgentApprovalBroker
  llmClient: LlmClient
}

/** 由活跃库目录构造全部 store（切换库时整体重建） */
export function buildStores(libDir: string): AppStores {
  const dbPath = join(libDir, 'mb-editor.db')
  const data = new DataService(new SqliteItemsRepository(dbPath))
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
  dispatcher.register(createRollbackSkill({ operationLog, dataService: data }))
  const runner = createRecordingToolRunner(createDispatcherToolRunner(dispatcher), {
    operationLog,
    listItems: () => data.listAllItems()
  })

  // Agent 会话与记忆随库隔离（A2-1 起落在 <库>/agent 下）
  const agentDir = join(libDir, 'agent')
  const sessionStore = new AgentSessionStore(agentDir)
  // 用户偏好 / 反馈：随库隔离，构造时即从磁盘加载；偏好注入系统提示词（见 brainService）
  const personalization = createPersonalizationStores(agentDir)

  return {
    dbPath,
    dataService: data,
    ceshuManager: ceshu,
    typeSchemaStore: schema,
    ceshuNotesStore: new CeshuNotesStore(join(libDir, 'ceshu_notes')),
    ceshuTemplateStore: new CeshuTemplateStore(join(libDir, 'ceshu_templates')),
    attrSystemStore: new AttrSystemStore(join(libDir, 'attr_system.json')),
    dataSync: new CeshuDataSync(ceshu, data, schema),
    agentDispatcher: dispatcher,
    agentBrain: new AgentBrainService({
      dispatcher,
      sessionStore,
      memoryStore: new AgentMemoryStore(agentDir),
      preferences: personalization.preferences,
      runner
    }),
    agentSessionStore: sessionStore,
    agentPreferences: personalization.preferences,
    agentFeedback: personalization.feedback,
    approvalBroker: new AgentApprovalBroker(),
    llmClient: new LlmClient()
  }
}
