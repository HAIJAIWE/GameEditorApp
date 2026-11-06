/**
 * `schemasData` 拆分件：**策划书（GDD）文档本体**——新建 / 读写 / 版本 / 章节保存 /
 * 项目文件夹 / 系统确认 / 导出。
 *
 * AI 生成类（`ceshuAiGenerate*` / `ceshuDataGen`）见 `schemasDataCeshuAi.ts`，
 * 报告与对比导出见 `schemasDataCeshuReports.ts`。
 * 原 `schemasData.ts` 的 113 个 schema 按业务域拆开，导出名一字未改；
 * 消费者请直接指向本文件（不再经 `core/schemas` 桶）。
 */

import { z } from 'zod'

import { CESHU_EXPORT_FORMATS } from '../../ceshu/reference'

export const ceshuCreateInputSchema = z.object({
  name: z.string().max(200).default(''),
  scope: z.enum(['full', 'lite']).default('full')
})

/** 复刻拆解：给参考游戏名 + 可选品类，AI 拆成「立项一页」并新建文档 */
export const ceshuCloneDecomposeInputSchema = z.object({
  gameName: z.string().min(1).max(200),
  gameType: z.string().max(100).optional()
})

export const ceshuGetInputSchema = z.object({
  id: z.string().min(1),
  /** 云端档超预算确认标志（v0.6 M5，同 `ceshuAiGenerateInputSchema.confirmed`） */
  confirmed: z.boolean().optional()
})

/** 字段拆分迁移（幂等、非破坏）：只需要策划书 id */
export const ceshuMigrateFieldSplitsInputSchema = z.object({
  id: z.string().min(1)
})

/** 导出项目文件夹：策划书 id + 目标目录（config.json + design/*.md + tasks/*.md） */
export const ceshuExportProjectInputSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1)
})

/**
 * 打开项目文件夹（一个游戏一个文件夹）：源目录路径。
 * 主进程会校验 `config.json` 是否存在——不是项目文件夹就直接报错，避免误把任意目录导进来。
 */
export const ceshuOpenProjectInputSchema = z.object({
  path: z.string().min(1)
})

/** 岗位任务生成：策划书 id + 可选岗位子集（缺省 = 全部岗位） */
export const ceshuAiTasksInputSchema = z.object({
  id: z.string().min(1),
  // 应用档岗位 key（product/frontend/…）不属于游戏 5 岗枚举；
  // 改成字符串数组，合法性由 buildRoleTaskPrompt 按该文档档位白名单过滤。
  roles: z.array(z.string().min(1)).optional()
})

/** 设计 ↔ 数据表核对：读某份策划书的「所需数据表」并与数据编辑器实际表比对 */
export const ceshuCheckDataTablesInputSchema = z.object({
  id: z.string().min(1)
})

/** 设计契约体检：读某份策划书，投影出机读契约并做一次整体体检 */
export const ceshuCheckContractInputSchema = z.object({
  id: z.string().min(1)
})

/** 按声明补齐数据表结构（建类型 / 加字段）：同一份入参，plan 只算不写、apply 才落盘 */
export const ceshuScaffoldDataTablesInputSchema = z.object({
  id: z.string().min(1)
})

/**
 * 保存可玩原型：策划书 id + 单文件 HTML。
 * `html` 允许空串（= 清掉已存的原型），所以不设 `.min(1)`。
 * 上限 2MB：正常原型 30-150KB，超过基本是模型吐了重复内容。
 */
export const ceshuSaveDemoInputSchema = z.object({
  id: z.string().min(1),
  html: z.string().max(2_000_000)
})

export type CeshuCreateInput = z.infer<typeof ceshuCreateInputSchema>
export type CeshuCloneDecomposeInput = z.infer<typeof ceshuCloneDecomposeInputSchema>
export type CeshuMigrateFieldSplitsInput = z.infer<typeof ceshuMigrateFieldSplitsInputSchema>
export type CeshuExportProjectInput = z.infer<typeof ceshuExportProjectInputSchema>
export type CeshuOpenProjectInput = z.infer<typeof ceshuOpenProjectInputSchema>
export type CeshuAiTasksInput = z.infer<typeof ceshuAiTasksInputSchema>
export type CeshuCheckDataTablesInput = z.infer<typeof ceshuCheckDataTablesInputSchema>
export type CeshuCheckContractInput = z.infer<typeof ceshuCheckContractInputSchema>
export type CeshuScaffoldDataTablesInput = z.infer<typeof ceshuScaffoldDataTablesInputSchema>
export type CeshuSaveDemoInput = z.infer<typeof ceshuSaveDemoInputSchema>

/**
 * 删除策划书：`confirm` 是**必填的显式确认标志**（与 `clearAllInputSchema` 同一约定）。
 *
 * 渲染层 `CeshuHomePanel` 的「确认删除」二次确认框是 **UX 层**防护；这里是**契约层**防护
 * ——主进程只接受 `confirm: true`，将来任何新调用点（agent skill / CLI / 测试）都绕不过。
 * 此前本通道复用 `ceshuGetInputSchema`，而它的 `confirmed` 是**云端超预算**标志、与删除无关
 * ⇒ 等于删除操作在主进程侧零守卫。
 */
export const ceshuDeleteInputSchema = z.object({
  id: z.string().min(1),
  confirm: z.boolean()
})

export type CeshuDeleteInput = z.infer<typeof ceshuDeleteInputSchema>

/** 首页卡片：重命名策划书 */
export const ceshuRenameInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200)
})

export const ceshuSaveChapterInputSchema = z.object({
  id: z.string().min(1),
  chapter: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
  /** 同时写回的文档级字段（一键生成应用时写入风格/类型 key） */
  style: z.string().max(50).optional(),
  moduleType: z.string().max(50).optional()
})

export const ceshuExportInputSchema = z.object({
  id: z.string().min(1),
  format: z.enum(CESHU_EXPORT_FORMATS),
  path: z.string().min(1)
})

export const ceshuChooseExportFileInputSchema = z.object({
  format: z.enum(CESHU_EXPORT_FORMATS),
  defaultName: z.string().max(200).default('策划书')
})

export const ceshuDeriveInputSchema = z.object({
  id: z.string().min(1),
  note: z.string().max(500).default('')
})

/** 混合玩法预设市场：应用某个预设到当前策划书 */
export const ceshuApplyPresetInputSchema = z.object({
  id: z.string().min(1),
  presetKey: z.string().min(1).max(50)
})

/** 系统确认：确认/调整游戏系统 */
export const ceshuConfirmSystemsInputSchema = z.object({
  id: z.string().min(1),
  enabledKeys: z.array(z.string().min(1).max(64)).max(200),
  customSystems: z
    .array(z.object({ key: z.string().min(1).max(64), name: z.string().min(1).max(120) }))
    .max(200)
    .default([])
})

/** 数据同步：双向同步策划书 systems ↔ 游戏数据 */
export const ceshuSyncDataInputSchema = z.object({
  id: z.string().min(1)
})

export type CeshuRenameInput = z.infer<typeof ceshuRenameInputSchema>
export type CeshuSaveChapterInput = z.infer<typeof ceshuSaveChapterInputSchema>
export type CeshuExportInput = z.infer<typeof ceshuExportInputSchema>
export type CeshuChooseExportFileInput = z.infer<typeof ceshuChooseExportFileInputSchema>
export type CeshuDeriveInput = z.infer<typeof ceshuDeriveInputSchema>
export type CeshuApplyPresetInput = z.infer<typeof ceshuApplyPresetInputSchema>
export type CeshuConfirmSystemsInput = z.infer<typeof ceshuConfirmSystemsInputSchema>
export type CeshuSyncDataInput = z.infer<typeof ceshuSyncDataInputSchema>
