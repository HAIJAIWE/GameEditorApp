/**
 * 宿主端口：`agent-core` 对 app 的**唯一**反向依赖面。
 *
 * ## 为什么需要这一层（A3 的结论，不是洁癖）
 * 把 `main/agent` 搬进 `packages/agent-core` 后，包内还剩 5 处 `@app/*` 反向 import
 * （`runTask` 的取消表、`qualityJudge` 的 LLM 客户端、两个技能的业务服务类型）。
 * 只要有一处 `@app/*`，包与 app 就构成**循环包依赖**——"包"只是换了个目录名，
 * 边界仍然是假的：包内任何文件都能顺手拿到宿主的一切，腐化无声无息。
 *
 * 本文件把这条边收敛成**一份可读的清单**：端口形状 + 两个装配点。
 * 包内代码只认这里的接口；具体实现由 `apps/desktop/src/main/stores.ts` 注入。
 *
 * ## 为什么用「窄结构接口」而不是搬类型
 * 端口**只声明被用到的那几个方法**，不复刻 `CeshuManager` / `DataService` 的完整类。
 * TypeScript 是结构化类型，app 侧的真实类只要签名对得上就自动满足端口——
 * 装配处一行不改（`createCeshuSkill({ ceshuManager: ceshu })` 原样可用）。
 * 反过来若把 `CeshuManager` 整个搬进包，就会把 `CeshuStorage`、写队列、迁移逻辑
 * 一起拖进来，那才是真正的级联。
 *
 * ## 为什么不把端口做成函数参数
 * 两个装配点（取消表、LLM 客户端）在**每个调用点**都要传，而它们都是进程级单例
 * （一张取消表、一个 HTTP 客户端）。做成参数会让 `runSingleShotTask` / `runLlmJudge`
 * 的签名多一个"几乎总是同一个值"的参数，且漏传时**静默失效**（停止按钮失灵）。
 * 故沿用仓库既有的单例约定（`taskRegistry()` / `sharedRateLimiter()` 同款）：
 * 模块级持有 + 显式 `configure*` 装配，未装配时**行为退化为"没有该能力"**并在此写清。
 */

import type { CeshuDocument, CeshuSummary, ChapterData, ChapterKey, GddScope } from '@mobai/shared/ceshu/reference'
import type { LlmCallOptions } from '@mobai/shared/config/llm'
import type { BatchUpdateSummary, DataTypeDef, ItemRecord } from '@mobai/shared/types'
import type { BatchUpdateInput, CreateItemInput } from '@mobai/shared/schema/adapters'

// ─────────────────────────────────────────────────────────────────────────────
// 1. 取消登记口（实现方：`apps/desktop/src/main/task/taskRegistry.ts`）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 一次登记的句柄。与 app 侧 `TaskTicket` 同形（结构化兼容，不需要 import）。
 */
export interface TaskTicket {
  taskId: string
  signal: AbortSignal
}

/**
 * 「可取消任务」登记表。
 *
 * 单发 AI（章节生成 / 数据生成 / 审校）都要向它登记，才能被面板的「停止」经
 * `task:cancel` 打断。`end` 必须带 `signal`（按 controller 身份比对），
 * 否则同一窗口连发时旧任务的收尾会注销掉新任务——表现为「点了停止没反应」。
 */
export interface TaskTicketPort {
  begin(senderId: number, taskId?: string): TaskTicket
  end(taskId: string, signal?: AbortSignal): void
}

let tickets: TaskTicketPort | undefined

/**
 * 装配取消登记口（app 启动时调用一次）。
 *
 * 未装配（或传 `undefined` 复位）时 `runSingleShotTask` **不登记也不传 signal**：
 * 任务照常跑完，只是不可取消。这个退化是刻意的——单测里跑 harness 不该被迫构造
 * 一张取消表；但 app 漏调会让「停止」静默失灵，故 `stores.ts` 的装配点必须与
 * `taskRegistry()` 同处一块。传 `undefined` 仅供测试复位。
 */
export function configureTaskTickets(port: TaskTicketPort | undefined): void {
  tickets = port
}

/** 当前登记的取消表（未装配 = `undefined`，调用方按「不可取消」处理） */
export function taskTickets(): TaskTicketPort | undefined {
  return tickets
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. LLM 生成口（实现方：`apps/desktop/src/main/llm/client.ts`）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LLM 生成口。只声明 judge 用得到的那一个方法（`generate` 的返回值只取 `content`，
 * 但真实实现返回更宽的对象，结构化赋值自动成立）。
 *
 * 入参用 shared 的 `LlmCallOptions`（与 `LlmClient` 同一份类型，不复制、不漂移）。
 */
export interface LlmJudgePort {
  generate(system: string, prompt: string, options: LlmCallOptions): Promise<{ content: string }>
}

let judge: LlmJudgePort | undefined

/**
 * 装配 judge 用的 LLM 客户端（app 启动时调用一次）。
 *
 * 未装配（或传 `undefined` 复位）时 `runLlmJudge` **直接降级为 `null`**
 * （等同「judge 不可用」），与「业务失败降级」同一条路径，不会阻断正文生成。
 * 传 `undefined` 仅供测试复位。
 */
export function configureLlmJudge(port: LlmJudgePort | undefined): void {
  judge = port
}

/** 当前 judge 客户端（未装配 = `undefined`） */
export function llmJudge(): LlmJudgePort | undefined {
  return judge
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. 策划书服务口（实现方：`apps/desktop/src/main/ceshu/manager.ts`）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `ceshu` 技能用到的那 5 个方法。
 *
 * 刻意**不含** `duplicate` / `repair` / `setActive` 等——技能没用到就不进端口，
 * 端口越窄，宿主替换成本越低（这也是"窄结构接口"的意义）。
 *
 * ⚠️ `get` 在宿主侧**找不到就抛错**（不是返回 `undefined`），
 * 技能侧已用 try/catch 转成 `找不到策划书` 的业务错误。
 */
export interface CeshuStorePort {
  /** 列表摘要：按更新时间倒序 */
  list(): CeshuSummary[]
  /** 读单篇（不存在时**抛错**） */
  get(id: string): CeshuDocument
  /** 新建（写队列串行，返回落盘后的文档） */
  create(options: { scope: GddScope; name?: string }): Promise<CeshuDocument>
  /** 保存单章：读最新文件 → 合并章节 → 原子写回 */
  saveChapter(id: string, chapter: ChapterKey, data: ChapterData): Promise<CeshuDocument>
  /** 删除，返回是否真的删掉了一篇 */
  remove(id: string): Promise<boolean>
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. 数据表口（实现方：`data/service.ts` + `schema/store.ts`）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 条目读写口（`gameData` 技能用）。
 *
 * 返回的都是 `ItemRecord`（**shared 类型**），所以端口本身不含任何 app 类型——
 * 这是 `DataService` 能被结构化的前提。
 */
export interface ItemStorePort {
  listItems(type: string): ItemRecord[]
  listAllItems(): ItemRecord[]
  createItem(input: CreateItemInput): Promise<ItemRecord>
  updateItem(id: string, data: Record<string, unknown>): Promise<ItemRecord>
  deleteItem(id: string): Promise<boolean>
  /** 整批一次写队列（批量改字段的性能路径） */
  batchUpdate(input: BatchUpdateInput): Promise<BatchUpdateSummary>
}

/** 类型表口：技能只读，不写 schema */
export interface TypeSchemaPort {
  getTypes(): DataTypeDef[]
}
