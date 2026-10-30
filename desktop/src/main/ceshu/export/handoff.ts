import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { CeshuDocument } from '../../../shared/ceshu/reference/ceshuConstants'
import { buildContract } from '../../../shared/ceshu/validation/ceshuContract'
import {
  HANDOFF_VOLUMES,
  buildHandoffPlan,
  handoffVolumeIndexPath,
  planHandoffDocs,
  renderHandoffDoc,
  renderHandoffIndex,
  renderHandoffManifest,
  renderHandoffRouteMarkdown,
  renderHandoffVolumeIndex,
  type HandoffRenderContext
} from '../../../shared/ceshu/workflow/ceshuHandoff'
import type { DataTypeDef, ItemRecord } from '../../../shared/types'
import { buildJsonSnapshot } from '../../data/snapshotExport'

import { renderCeshuBundleJson } from './bundle'
import { renderCeshuMarkdown } from './markdown'

/**
 * **开发交接包**（handoff）导出。
 *
 * ## 为什么不是「再导一份 Markdown」
 * 策划书全文 1.3 万字，直接丢给编码智能体会平均用力：把「市场分析」和「伤害公式」
 * 当同等输入。交接包把同一份文档**重排成 6 卷施工图**（架构 → 核心玩法 → 内容 →
 * 系统 → 界面 → 打磨），每卷自带门禁与验收，可以一卷一卷派工。
 *
 * ## 包内结构（一个游戏一个文件夹 → 卷文件夹 → 编号文档）
 * ```
 * <游戏名>-交接包/
 *   README.md            # 施工总纲：目录树 / 门禁 / 横切关注点 / 全局约束
 *   开发路线.md          # 进引擎前的精简导航：施工顺序 + 门禁 + 并行
 *   index.json           # 机读清单：文档/依赖/门禁/最小上下文/验收 id（给 agent 调度）
 *   00-架构/README.md     # 卷内目录（打开文件夹先看它）
 *   00-架构/01-范围与平台.md
 *   00-架构/02-引擎与技术栈.md
 *   01-核心玩法/01-核心循环.md …
 *   gdd.md               # 完整策划书（人读）
 *   bundle.json          # 机读字段 + 契约（给 AI 读）
 *   contract.json        # 规则集 / 参数 / 断言 / 验收旅程（机器可判）
 *   schema.json          # 数据表结构（字段/类型/枚举/上下限）
 *   data/snapshot.json   # 数据表全部行（唯一内容源）
 *   prototype/demo.html  # 可玩原型（若已生成）
 * ```
 *
 * ⚠️ 这里**不发明新数据**：快照复用 `buildJsonSnapshot`（与数据编辑器导出同一实现）、
 * 契约复用 `buildContract`、机读包复用 `renderCeshuBundleJson` —— 交接包只是装箱。
 */

export interface HandoffExtras {
  /** 生成时间（注入而非读系统时间，便于测试与复现） */
  generatedAt: string
  /** 数据表类型定义（来自 `typeSchemaStore`）；缺省则跳过 schema/snapshot */
  types?: DataTypeDef[]
  /** 数据表全部行（来自 `dataService`）；缺省则跳过 snapshot */
  items?: ItemRecord[]
}

/** 组装包内全部文件：`相对路径 → 内容`（纯函数，不落盘，便于单测） */
export function buildHandoffFiles(doc: CeshuDocument, extras: HandoffExtras): Record<string, string> {
  const files: Record<string, string> = {}

  // 预算一次：全量校验 + 文档规划，传给每份渲染（否则 N 份文档各跑一遍 = O(N²)）
  const planned = planHandoffDocs(doc)
  const context: HandoffRenderContext = { plan: buildHandoffPlan(doc), planned }

  files['README.md'] = renderHandoffIndex(doc, extras.generatedAt, context)
  // 机读清单：与 README 同源派生（同一份 plan + planned），README 给人、清单给机器
  files['index.json'] = renderHandoffManifest(doc, extras.generatedAt, context)
  // 开发路线：进引擎前的精简导航（顺序 + 门禁 + 并行），与 README/清单同源派生
  files['开发路线.md'] = renderHandoffRouteMarkdown(doc, context)
  // 卷目录（空卷不写：避免留下只有 README、没有文档的空文件夹）
  for (const volume of HANDOFF_VOLUMES) {
    if (!planned.some((item) => item.volume.id === volume.id)) continue
    files[handoffVolumeIndexPath(volume)] = renderHandoffVolumeIndex(doc, volume, extras.generatedAt, context)
  }
  // 按品类裁剪 + 重排编号后的文档（组合品类会多出对应系统的文档）
  for (const item of planned) {
    files[item.path] = renderHandoffDoc(doc, item, extras.generatedAt, context)
  }

  files['gdd.md'] =
    '> 本文件是**完整策划书**（人读 / 检索）。**实现请看分卷文档**（00-架构 … 06-研发），按编号顺序做。\n\n' +
    renderCeshuMarkdown(doc)
  files['bundle.json'] = renderCeshuBundleJson(doc)
  files['contract.json'] = `${JSON.stringify(buildContract(doc), null, 2)}\n`

  // 数据侧：只有拿到类型/行数据时才写（避免产出空文件让实现方以为「没有数据」）
  if (extras.types !== undefined && extras.types.length > 0) {
    files['schema.json'] = `${JSON.stringify({ schema: 'mb-type-schema/v1', types: extras.types }, null, 2)}\n`
  }
  if (extras.types !== undefined && extras.items !== undefined) {
    files['data/snapshot.json'] = buildJsonSnapshot(extras.items, extras.types)
  }

  const demo = doc.demo_html
  if (typeof demo === 'string' && demo.trim() !== '') {
    files['prototype/demo.html'] = demo
  }

  return files
}

/** 目录名：`<游戏名>-交接包`（去掉文件名非法字符，空名回退） */
export function handoffFolderName(doc: CeshuDocument): string {
  const name = String(doc.meta.game_name ?? '').trim() || '未命名游戏'
  return `${name.replace(/[\\/:*?"<>|]/g, '_')}-交接包`
}

/**
 * 落盘：写到 `<targetDir>/<游戏名>-交接包/`，返回目录与相对文件清单。
 * 与「项目文件夹」导出同构（一个游戏一个目录，不把文件摊在用户选的目录里）。
 */
export function exportHandoff(
  doc: CeshuDocument,
  targetDir: string,
  extras: HandoffExtras
): { dir: string; files: string[] } {
  const files = buildHandoffFiles(doc, extras)
  const dir = join(targetDir, handoffFolderName(doc))
  const written: string[] = []
  for (const [relative, content] of Object.entries(files)) {
    const full = join(dir, relative)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, content, 'utf-8')
    written.push(relative)
  }
  return { dir, files: written }
}
