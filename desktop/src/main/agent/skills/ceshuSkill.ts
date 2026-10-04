/**
 * `system.ceshu` 内置技能（对应 Python `core/agent/skills/ceshu_skill.py` 的子集）。
 *
 * A1-1 只做只读（`list` / `get`）；**A1-5 补齐写操作**（`create` / `update`），
 * 把已有的策划书能力接进统一协议。
 *
 * **未移植**（各有更合适的归属）：
 *  - `delete` / `export` / `import`：UI 侧已有完整入口（首页卡片删除、导出面板），
 *    再经 Agent 暴露会与既有交互重复且更难确认；如需再立项。
 *  - 全部 `ai_*` 动作：已在 `shared/ceshuAi.ts` / `shared/ceshuDataGen.ts` 以纯函数存在，
 *    按 §2.5「只注册进协议、不搬家」处理——但它们的返回是「待应用字段」而非落盘结果，
 *    需要一层「应用」语义，故同样留到后续立项。
 */

import {
  CHAPTER_KEYS,
  CHAPTER_LABELS,
  isChapterKey,
  isGddScope,
  type CeshuDocument,
  type ChapterKey,
  type GddScope
} from '../../../shared/ceshuConstants'
import type { SkillExecutionContext, SkillProtocol, SkillResult } from '../../../shared/agent/protocol'
import type { CeshuManager } from '../../ceshu/manager'

const ACTIONS = ['list', 'get', 'create', 'update'] as const

const DEFAULT_SCOPE: GddScope = 'full'

export function createCeshuSkill(deps: { ceshuManager: CeshuManager }): SkillProtocol {
  const { ceshuManager } = deps

  function fail(error: string): SkillResult {
    return { success: false, error, message: '' }
  }

  /** 空名回退「未命名」（与首页卡片一致） */
  function withFallback(gameName: string): string {
    return gameName === '' ? '未命名' : gameName
  }

  function gameNameOf(doc: CeshuDocument): string {
    const raw = doc.meta.game_name
    return withFallback(typeof raw === 'string' ? raw : '')
  }

  function scopeLabel(scope: GddScope): string {
    return scope === 'lite' ? '基础' : '工业级'
  }

  /** 统一兜住 manager 抛出的中文错误（如「策划书不存在，可能已被删除」） */
  async function guard(task: () => Promise<SkillResult> | SkillResult): Promise<SkillResult> {
    try {
      return await task()
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error))
    }
  }

  function listCeshu(params: Record<string, unknown>): SkillResult {
    const rawKeyword = params.keyword
    const keyword = typeof rawKeyword === 'string' ? rawKeyword.trim().toLowerCase() : ''
    const all = ceshuManager.list()
    const matched =
      keyword === ''
        ? all
        : all.filter((summary) => withFallback(summary.gameName).toLowerCase().includes(keyword))
    return {
      success: true,
      message:
        keyword === ''
          ? `共 ${matched.length} 份策划书`
          : `找到 ${matched.length} 份匹配「${rawKeyword as string}」的策划书`,
      data: matched
    }
  }

  function getCeshu(params: Record<string, unknown>): SkillResult {
    const id = typeof params.ceshu_id === 'string' ? params.ceshu_id.trim() : ''
    if (id === '') return fail('缺少 ceshu_id 参数')
    try {
      const doc = ceshuManager.get(id)
      return {
        success: true,
        message: `已获取策划书「${gameNameOf(doc)}」（${doc.version_label}）`,
        data: doc
      }
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error))
    }
  }

  function createCeshu(params: Record<string, unknown>): Promise<SkillResult> {
    return guard(async () => {
      const rawScope = params.scope
      const scope: GddScope = isGddScope(rawScope) ? rawScope : DEFAULT_SCOPE
      const rawName = typeof params.name === 'string' ? params.name.trim() : ''
      const created = await ceshuManager.create({ scope, ...(rawName !== '' ? { name: rawName } : {}) })

      const meta = params.meta
      if (meta === null || typeof meta !== 'object' || Array.isArray(meta)) {
        return {
          success: true,
          message: `已创建策划书（${created.version_label}，${scopeLabel(scope)}档位，id=${created.ceshu_id}）`,
          data: created
        }
      }
      // 带 meta 时先建再合并写入（未提交字段随既有 meta 保留）
      const merged = { ...created.meta, ...(meta as Record<string, unknown>) }
      const updated = await ceshuManager.saveChapter(created.ceshu_id, 'meta', merged)
      return {
        success: true,
        message: `已创建策划书「${gameNameOf(updated)}」（${updated.version_label}，${scopeLabel(scope)}档位，id=${updated.ceshu_id}）`,
        data: updated
      }
    })
  }

  function updateCeshu(params: Record<string, unknown>): Promise<SkillResult> {
    return guard(async () => {
      const id = typeof params.ceshu_id === 'string' ? params.ceshu_id.trim() : ''
      if (id === '') return fail('缺少 ceshu_id 参数')

      const rawChapter = typeof params.chapter === 'string' && params.chapter !== '' ? params.chapter : 'meta'
      if (!isChapterKey(rawChapter)) {
        return fail(`未知章节: ${rawChapter}。可用章节: ${CHAPTER_KEYS.join(', ')}`)
      }
      const data = params.data
      if (data === null || typeof data !== 'object' || Array.isArray(data)) {
        return fail('缺少 data 对象（要写入该章节的字段）')
      }

      const chapter: ChapterKey = rawChapter
      const updated = await ceshuManager.saveChapter(id, chapter, data as Record<string, unknown>)
      return {
        success: true,
        message: `已更新策划书「${gameNameOf(updated)}」的「${CHAPTER_LABELS[chapter]}」`,
        data: updated
      }
    })
  }

  function run(params: Record<string, unknown>, _ctx: SkillExecutionContext): Promise<SkillResult> {
    const action = typeof params.action === 'string' ? params.action : ''
    switch (action) {
      case 'list':
        return Promise.resolve(listCeshu(params))
      case 'get':
        return Promise.resolve(getCeshu(params))
      case 'create':
        return createCeshu(params)
      case 'update':
        return updateCeshu(params)
      default:
        return Promise.resolve(fail(`未知动作: ${action}`))
    }
  }

  return {
    id: 'system.ceshu',
    description: '策划书管理: list=列表, get=获取详情, create=创建, update=更新章节。',
    version: '1.0.0',
    parametersSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ACTIONS,
          description: '操作类型: list=列表, get=详情, create=创建, update=更新章节'
        },
        ceshu_id: { type: 'string', description: '策划书 ID（get/update 时必填）' },
        keyword: { type: 'string', description: '按名称过滤的关键词（list 时使用）' },
        name: { type: 'string', description: '游戏名称（create 时使用，可留空）' },
        scope: {
          type: 'string',
          enum: ['full', 'lite'],
          description: '章节档位（create 时使用）: full=工业级 18 章, lite=基础 9 章',
          default: DEFAULT_SCOPE
        },
        meta: { type: 'object', description: '项目元信息对象（create 时使用，写入 meta 章）' },
        chapter: {
          type: 'string',
          enum: CHAPTER_KEYS,
          description: '章节键名（update 时使用）',
          default: 'meta'
        },
        data: { type: 'object', description: '要写入该章节的字段对象（update 时使用）' }
      },
      required: ['action']
    },
    execute: run
  }
}
