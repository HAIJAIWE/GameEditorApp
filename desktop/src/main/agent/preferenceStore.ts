/**
 * 偏好 / 反馈的持久化存储（主进程侧，文件落盘）。
 *
 * 与 `AgentMemoryStore`（vectra 语义检索）职责分离：本模块管「用户显式/从反馈提炼的偏好」
 * 这类**确定性键值**，不进向量库。消费点在 `brainService.ts` —— 把偏好注入系统提示词。
 *
 * 生产者接缝是 `agent:feedback` IPC（见 main/ipc.ts）：UI 评分时调用，提取偏好写入
 * `PreferenceStore`。未收到反馈前偏好为空（与 Python Learner 冷启动一致的空语义）。
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { extractPreferences, type FeedbackRecord } from '../../shared/agent/personalization'

/**
 * 原子写 JSON（tmp + rename，与仓库其余 store 同一约定）。
 *
 * ⚠️ 父目录一律用 `dirname()` 求——**不要**用 `file.slice(0, file.lastIndexOf('/'))`：
 * Windows 下 `join()` 产出的是反斜杠路径，`lastIndexOf('/')` 返回 -1，
 * 会把路径**砍掉最后一个字符**并在 userData 里建出一个垃圾目录
 * （回归测试见 `personalization.test.ts`）。
 */
function writeJsonAtomic(file: string, value: unknown): void {
  const dir = dirname(file)
  if (dir !== '' && !existsSync(dir)) mkdirSync(dir, { recursive: true })
  const temp = `${file}.tmp`
  writeFileSync(temp, JSON.stringify(value, null, 2), 'utf-8')
  renameSync(temp, file)
}

/** 偏好键值存储（JSON 文件持久化） */
export class PreferenceStore {
  private data: Record<string, string> = {}

  constructor(private readonly file: string) {}

  /** 从磁盘加载（文件不存在时保持空，不报错） */
  load(): void {
    try {
      if (existsSync(this.file)) {
        const parsed = JSON.parse(readFileSync(this.file, 'utf-8')) as Record<string, string>
        if (parsed && typeof parsed === 'object') this.data = parsed
      }
    } catch {
      // 损坏的偏好文件：忽略，从空开始（不阻塞启动）
      this.data = {}
    }
  }

  private persist(): void {
    try {
      writeJsonAtomic(this.file, this.data)
    } catch {
      // 落盘失败：内存态仍可用，不影响本进程运行
    }
  }

  set(key: string, value: string): void {
    this.data[key] = value
    this.persist()
  }

  get(key: string): string | undefined {
    return this.data[key]
  }

  getAll(): Record<string, string> {
    return { ...this.data }
  }

  delete(key: string): void {
    if (key in this.data) {
      delete this.data[key]
      this.persist()
    }
  }
}

/** 反馈记录存储（JSON 文件持久化）；评分 ≥4 且带评论时，自动提炼偏好进传入的 PreferenceStore */
export class FeedbackStore {
  private records: FeedbackRecord[] = []

  constructor(
    private readonly file: string,
    private readonly preferences: PreferenceStore
  ) {}

  load(): void {
    try {
      if (existsSync(this.file)) {
        const parsed = JSON.parse(readFileSync(this.file, 'utf-8')) as FeedbackRecord[]
        if (Array.isArray(parsed)) this.records = parsed
      }
    } catch {
      this.records = []
    }
  }

  /**
   * 记录一条反馈。rating ≥ 4 且 comment 非空时，提炼偏好写入偏好库。
   * 负评（≤2）仅留存记录供后续分析，不提炼（对齐 Python `Learner.record_feedback` 的取舍）。
   */
  record(rating: number, comment: string): void {
    const record: FeedbackRecord = {
      rating,
      comment,
      timestamp: new Date().toISOString()
    }
    this.records.push(record)
    if (rating >= 4 && comment.trim() !== '') {
      const extracted = extractPreferences(comment)
      for (const [key, value] of Object.entries(extracted)) {
        this.preferences.set(key, value)
      }
    }
    this.persist()
  }

  getAll(): FeedbackRecord[] {
    return [...this.records]
  }

  private persist(): void {
    try {
      writeJsonAtomic(this.file, this.records)
    } catch {
      /* 落盘失败不阻塞 */
    }
  }
}

/** 在指定目录下构造一组偏好/反馈 store（供 stores.ts 调用） */
export function createPersonalizationStores(agentDir: string): {
  preferences: PreferenceStore
  feedback: FeedbackStore
} {
  const preferences = new PreferenceStore(join(agentDir, 'preferences.json'))
  const feedback = new FeedbackStore(join(agentDir, 'feedback.json'), preferences)
  preferences.load()
  feedback.load()
  return { preferences, feedback }
}
