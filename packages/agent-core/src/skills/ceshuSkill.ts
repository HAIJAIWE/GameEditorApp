/**
 * `system.ceshu` 内置技能。
 *
 * A1-1 只做只读（`list` / `get`）；**A1-5 补齐写操作**（`create` / `update`），
 * 把已有的策划书能力接进统一协议。
 *
 * **未移植**（各有更合适的归属）：
 *  - `delete` / `export` / `import`：UI 侧已有完整入口（首页卡片删除、导出面板），
 *    再经 Agent 暴露会与既有交互重复且更难确认；如需再立项。
 *  - 全部 `ai_*` 动作：已在 `shared/ceshu/prompts/ceshuAi.ts` / `shared/ceshu/data/ceshuDataGen.ts` 以纯函数存在，
 *    按 §2.5「只注册进协议、不搬家」处理——但它们的返回是「待应用字段」而非落盘结果，
 *    需要一层「应用」语义，故同样留到后续立项。
 */

import { isAbsolute, join, relative, resolve, sep } from 'node:path'

import {
  CESHU_EXPORT_FORMATS,
  CHAPTER_KEYS,
  CHAPTER_LABELS,
  contentChapterCount,
  isChapterKey,
  isGddScope,
  type CeshuDocument,
  type CeshuExportFormat,
  type ChapterKey,
  type GddScope
} from '@mobai/shared/ceshu/reference'
import type { SkillExecutionContext, SkillProtocol, SkillResult } from '@mobai/shared/agent/config'
import type { CeshuStorePort } from '../ports'

const ACTIONS = ['list', 'get', 'create', 'update', 'delete', 'export'] as const

const DEFAULT_SCOPE: GddScope = 'full'

/** 默认导出格式 */
const DEFAULT_EXPORT_FORMAT: CeshuExportFormat = 'markdown'

export interface CeshuSkillDeps {
  /**
   * 策划书服务（宿主实现：`CeshuManager`）。
   *
   * 只声明技能用到的 5 个方法（见 `ports.ts`），故宿主类无需任何改造即可满足。
   */
  ceshuManager: CeshuStorePort
  /** 导出管道（不注入则 `export` 动作不可用）；由 `main/index.ts` 注入以避免技能直接依赖导出模块 */
  exportDocument?: (
    doc: CeshuDocument,
    format: CeshuExportFormat,
    targetPath: string
  ) => Promise<{ filePath: string; format: string; bytes: number }>
  /** 默认导出目录（Agent 场景无人点「另存为」，故导出到默认目录并回报路径） */
  exportDir?: string
}

/** 文件名安全化（去掉路径分隔符与 Windows 非法字符） */
function safeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/gu, '_').trim()
  return cleaned === '' ? '策划书' : cleaned.slice(0, 60)
}

/**
 * 把 Agent 传入的导出路径收拢到 `exportDir` 内（路径沙箱）：
 * - 相对路径 → 相对 `exportDir` 解析（允许子目录）；
 * - 绝对路径 / `..` 越界 / 指向目录本身 → 返回 `null`，由调用方拒绝。
 * 返回解析后的绝对路径（扩展名仍由导出管道补全）。
 */
function resolveExportTarget(exportDir: string, rawPath: string): string | null {
  const base = resolve(exportDir)
  const candidate = resolve(base, rawPath)
  const rel = relative(base, candidate)
  // `rel === ''`（正好是目录本身）也拒绝：补扩展名后会落到目录的兄弟位置，等于越界。
  const escapes = rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)
  return escapes ? null : candidate
}

export function createCeshuSkill(deps: CeshuSkillDeps): SkillProtocol {
  const { ceshuManager, exportDocument, exportDir } = deps

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
    return scope === 'lite' ? '标准版' : '专业版'
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
        return fail(`未知小节: ${rawChapter}。可用小节: ${CHAPTER_KEYS.join(', ')}`)
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

  /**
   * 删除策划书：与 `system.game_data.delete` 同一取向——**未带 `confirm: true` 时返回 confirm 交互**，
   * 由 Brain 暂停询问；批准后带 `confirm: true` 重执行。
   */
  function deleteCeshu(params: Record<string, unknown>): Promise<SkillResult> {
    return guard(async () => {
      const id = typeof params.ceshu_id === 'string' ? params.ceshu_id.trim() : ''
      if (id === '') return fail('缺少 ceshu_id 参数')
      const doc = ceshuManager.get(id)
      const name = gameNameOf(doc)

      if (params.confirm !== true) {
        const prompt = `确认删除策划书「${name}」？此操作不可撤销。`
        return {
          success: false,
          message: '',
          error: `[WARN] ${prompt}`,
          interaction: { kind: 'confirm', prompt }
        }
      }

      const removed = await ceshuManager.remove(id)
      if (!removed) return fail(`策划书 ${id} 不存在，可能已被删除`)
      return { success: true, message: `已删除策划书「${name}」（id=${id}）`, data: { id } }
    })
  }

  /** 导出策划书到文件；未指定 path 时落到默认导出目录并回报绝对路径 */
  function exportCeshu(params: Record<string, unknown>): Promise<SkillResult> {
    return guard(async () => {
      if (exportDocument === undefined || exportDir === undefined) {
        return fail('导出功能未启用')
      }
      const id = typeof params.ceshu_id === 'string' ? params.ceshu_id.trim() : ''
      if (id === '') return fail('缺少 ceshu_id 参数')
      const doc = ceshuManager.get(id)

      const rawFormat = params.format
      const format: CeshuExportFormat =
        typeof rawFormat === 'string' && (CESHU_EXPORT_FORMATS as readonly string[]).includes(rawFormat)
          ? (rawFormat as CeshuExportFormat)
          : DEFAULT_EXPORT_FORMAT
      const rawPath = typeof params.path === 'string' ? params.path.trim() : ''
      // 不指定扩展名——导出管道会按格式补全
      const target =
        rawPath !== ''
          ? resolveExportTarget(exportDir, rawPath)
          : join(exportDir, `${safeFileName(gameNameOf(doc))}-${Date.now().toString(36)}`)
      if (target === null) {
        // 硬闸：Agent 只能写库内的 exports 目录。导出管道是 `mkdirSync + writeFileSync + renameSync`，
        // 放行任意路径 = 可覆盖磁盘上任意文件（文件系统级破坏），且 `system.ceshu` 风险档为 DATA_WRITE
        // （不会触发确认门）⇒ 必须在此按路径沙箱拒绝，不能依赖模型自觉或下游校验。
        return fail(`导出路径必须位于库的导出目录内（${resolve(exportDir)}）；收到: ${rawPath}`)
      }

      const result = await exportDocument(doc, format, target)
      return {
        success: true,
        message: `已导出「${gameNameOf(doc)}」到 ${result.filePath}（${format}，${result.bytes} 字节）`,
        data: result
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
      case 'delete':
        return deleteCeshu(params)
      case 'export':
        return exportCeshu(params)
      default:
        return Promise.resolve(fail(`未知动作: ${action}`))
    }
  }

  return {
    id: 'system.ceshu',
    description: '策划书管理: list=列表, get=获取详情, create=创建, update=更新章节, delete=删除（需用户确认）, export=导出文件。',
    version: '1.0.0',
    parametersSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ACTIONS,
          description: '操作类型: list=列表, get=详情, create=创建, update=更新章节, delete=删除, export=导出'
        },
        ceshu_id: { type: 'string', description: '策划书 ID（get/update 时必填）' },
        keyword: { type: 'string', description: '按名称过滤的关键词（list 时使用）' },
        name: { type: 'string', description: '游戏名称（create 时使用，可留空）' },
        scope: {
          type: 'string',
          enum: ['full', 'lite'],
          description: `章节档位（create 时使用）: full=专业版 ${contentChapterCount('full')} 章, lite=标准版 ${contentChapterCount('lite')} 章`,
          default: DEFAULT_SCOPE
        },
        meta: { type: 'object', description: '项目元信息对象（create 时使用，写入 meta 章）' },
        chapter: {
          type: 'string',
          enum: CHAPTER_KEYS,
          description: '章节键名（update 时使用）',
          default: 'meta'
        },
        data: { type: 'object', description: '要写入该章节的字段对象（update 时使用）' },
        confirm: { type: 'boolean', description: '删除确认标记（delete 时由系统在用户确认后置为 true）' },
        format: {
          type: 'string',
          enum: CESHU_EXPORT_FORMATS,
          description: '导出格式（export 时使用）',
          default: DEFAULT_EXPORT_FORMAT
        },
        path: { type: 'string', description: '导出目标路径（export 时可选；相对路径相对库导出目录解析，绝对路径或越界会被拒绝；缺省落到默认导出目录）' }
      },
      required: ['action']
    },
    execute: run
  }
}
