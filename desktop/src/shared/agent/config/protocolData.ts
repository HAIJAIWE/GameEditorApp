/**
 * `protocol.ts` 的纯定义层：风险等级 / 权限映射 / 别名表等常量数据。
 * 由 `protocol.ts` 再导出，外部 `import { ... } from './protocol'` 站点保持不变。
 */

/* ---- 风险等级与权限（对齐 security/acl） ---- */

/** 风险等级 */
export const RISK_LEVEL = {
  READ_ONLY: 0,
  DATA_WRITE: 1,
  FILE_SYSTEM: 2,
  NETWORK: 3,
  SYSTEM: 4
} as const

export type RiskLevel = (typeof RISK_LEVEL)[keyof typeof RISK_LEVEL]

/** 工具 → 风险等级（或 工具 → {action: 风险}）；对齐 旧版 `TOOL_RISK_MAP` */
export const TOOL_RISK_MAP: Record<string, RiskLevel | Record<string, RiskLevel>> = {
  'system.game_data': {
    query: RISK_LEVEL.READ_ONLY,
    list: RISK_LEVEL.READ_ONLY,
    search: RISK_LEVEL.READ_ONLY,
    summary: RISK_LEVEL.READ_ONLY,
    list_types: RISK_LEVEL.READ_ONLY,
    create: RISK_LEVEL.DATA_WRITE,
    update: RISK_LEVEL.DATA_WRITE,
    delete: RISK_LEVEL.DATA_WRITE,
    batch: RISK_LEVEL.DATA_WRITE,
    import: RISK_LEVEL.DATA_WRITE,
    export: RISK_LEVEL.DATA_WRITE
  },
  'system.file_ops': {
    read: RISK_LEVEL.READ_ONLY,
    list: RISK_LEVEL.READ_ONLY,
    write: RISK_LEVEL.FILE_SYSTEM,
    delete: RISK_LEVEL.FILE_SYSTEM,
    edit: RISK_LEVEL.FILE_SYSTEM,
    mkdir: RISK_LEVEL.FILE_SYSTEM,
    copy: RISK_LEVEL.FILE_SYSTEM,
    move: RISK_LEVEL.FILE_SYSTEM
  },
  'system.shell': RISK_LEVEL.SYSTEM,
  'system.terminal': RISK_LEVEL.SYSTEM,
  'system.lsp': RISK_LEVEL.READ_ONLY,
  'system.code': RISK_LEVEL.SYSTEM,
  'system.scheduler': RISK_LEVEL.SYSTEM,
  'system.web_search': RISK_LEVEL.NETWORK,
  'system.web_fetch': RISK_LEVEL.NETWORK,
  'system.browser': RISK_LEVEL.NETWORK,
  'system.vision': RISK_LEVEL.NETWORK,
  'system.tts': RISK_LEVEL.NETWORK,
  'system.speech_input': RISK_LEVEL.NETWORK,
  'system.image_analyze': RISK_LEVEL.NETWORK,
  'system.image_gen': RISK_LEVEL.NETWORK,
  'system.ceshu': RISK_LEVEL.DATA_WRITE,
  'system.tech_doc': {
    outline: RISK_LEVEL.READ_ONLY,
    read: RISK_LEVEL.READ_ONLY,
    list: RISK_LEVEL.READ_ONLY,
    write: RISK_LEVEL.DATA_WRITE,
    delete: RISK_LEVEL.DATA_WRITE
  },
  'system.document': {
    read: RISK_LEVEL.READ_ONLY
  },
  'system.workflow': RISK_LEVEL.DATA_WRITE,
  'system.visualization': RISK_LEVEL.DATA_WRITE,
  'system.ui_preview': RISK_LEVEL.DATA_WRITE,
  'system.export_doc': RISK_LEVEL.DATA_WRITE,
  'system.schema_edit': RISK_LEVEL.DATA_WRITE,
  'system.game_balance': RISK_LEVEL.DATA_WRITE,
  'system.todo': RISK_LEVEL.DATA_WRITE,
  'system.model': RISK_LEVEL.DATA_WRITE,
  'system.batch_data': RISK_LEVEL.DATA_WRITE,
  'system.pdf_parse': RISK_LEVEL.FILE_SYSTEM,
  'system.git': RISK_LEVEL.FILE_SYSTEM,
  'system.ask_user': RISK_LEVEL.READ_ONLY,
  'tool.ask_user': RISK_LEVEL.READ_ONLY
}

/** 未在表中登记的工具默认风险 */
export const DEFAULT_TOOL_RISK: RiskLevel = RISK_LEVEL.DATA_WRITE

/** 全局允许的最大风险 */
export const DEFAULT_MAX_ALLOWED_RISK: RiskLevel = RISK_LEVEL.FILE_SYSTEM

/** 批量生成的条目数阈值（`ceshuDataGenInputSchema.count` 上限 20 的一半） */
export const LLM_BULK_COUNT_THRESHOLD = 10

/** action 别名表 */
export const ACTION_ALIASES: Record<string, string> = {
  add: 'create',
  add_item: 'create',
  create_item: 'create',
  new: 'create',
  新增: 'create',
  创建: 'create',
  添加: 'create',
  edit: 'update',
  modify: 'update',
  change: 'update',
  update_item: 'update',
  修改: 'update',
  更新: 'update',
  编辑: 'update',
  remove: 'delete',
  delete_item: 'delete',
  del: 'delete',
  删除: 'delete',
  移除: 'delete',
  search: 'query',
  find: 'query',
  query_items: 'query',
  查询: 'query',
  搜索: 'query',
  查找: 'query',
  list_all: 'list',
  list_items: 'list',
  ls: 'list',
  列表: 'list',
  全部: 'list',
  info: 'get',
  show: 'get',
  get_info: 'get',
  view: 'get',
  详情: 'get',
  查看: 'get',
  run: 'execute',
  exec: 'execute',
  执行: 'execute'
}
