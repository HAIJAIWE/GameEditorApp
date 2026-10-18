/*
 * 忠实 mbApi 桩（对照 preload/index.ts + shared/service/api.ts 的契约）。
 * 用途：在**纯浏览器**（非 Electron）里静态托管 desktop/out/renderer/ 时，
 * 由 serve-preview.mjs 把本文件以 <script src="/stub.js"> 注入 index.html，
 * 在 bundle(module, 延迟执行) 之前同步执行，给 window.mbApi 赋值。
 *
 * ⚠️ 这不是生产代码，是**预览/回退**桩：返回的是**示例/兜底数据**，不是真实库。
 * 真实的 IPC 通道由 Electron 主进程实现。这里只保证渲染层不崩、可点击、可看效果。
 * 字段形状尽量对齐真值（data.listAll 3 条、app.info 版本 9.9.9 故意≠硬编码 1.0.0、
 * agent.listTools 返回真实 5 个已注册技能）。
 */
(function installMbApiStub() {
  // 与 shared/ceshuConstants.ts 的 CHAPTER_KEYS 同构（文档信息 + 16 章，5 个区展开）
  const CHAPTER_KEYS = [
    'meta', 'vision', 'story', 'gameplay',
    'systems', 'combat', 'economy', 'numeric',
    'art', 'audio',
    'tech',
    'resources', 'mvp', 'risk_handling', 'market_analysis', 'monetization', 'accessibility'
  ]
  const DOC = {
    version: '5', ceshu_id: 'abc12345', created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z', parent_id: '', version_label: 'v1.0',
    is_active: true, version_note: '', style: '', module_type: 'game_design',
    enabled_editors: [], editor_configs: {}
  }
  for (const k of CHAPTER_KEYS) DOC[k] = {}
  DOC.meta = { game_name: '验证用策划书', game_type: 'RPG', status: 'draft' }
  // 造 @data[...] 引用（对齐 shared/dataRef.ts 语法），用于验证「数据引用概览」面板
  DOC.meta.battle_power = '战士攻击力 @data[role.r1.atk]、法力 @data[role.r1.mp]；不带 id 取首条 @data[role.atk]'
  DOC.combat = { monster_note: '哥布林血量 @data[monster.m1.hp]；不存在的条目 @data[role.no_such_id.atk]；不存在的类型 @data[nope.x]；中文段 @data[角色.攻击]（语法不支持，应被忽略）' }

  const SUMMARY = {
    id: 'abc12345', gameName: '验证用策划书', scope: 'full', versionLabel: 'v1.0',
    updatedAt: '2026-01-01T00:00:00.000Z', progress: 0.4, parentId: '', isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z', versionNote: '', gameType: 'RPG', status: 'draft'
  }
  const item = (id, type, name, extra) => ({
    id, type, data: extra ? { name, ...extra } : { name }, createdAt: '', updatedAt: ''
  })
  const ok = async () => ({ ok: true })
  const emptyUndo = { applied: 0, failed: [], skipped: [] }
  const undoState = { canUndo: false, canRedo: false, nextUndo: null, nextRedo: null }
  const noopSub = () => () => {}

  // 给「智能体编辑器」面板喂真实 5 个技能（对照 src/main/agent/skills/*）
  const TOOLS = [
    {
      name: 'system.game_data',
      description: '游戏数据增删改查：list=列表, get=详情, create=创建, update=更新或创建, delete=删除（需确认）, batchUpdate=批量更新。',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', description: '操作类型' },
          type: { type: 'string', description: '数据类型 id' },
          id: { type: 'string', description: '条目 id（get/update/delete 必填）' },
          data: { type: 'object', description: '条目 data（create/update 必填）' },
          name: { type: 'string', description: '条目名称（create 时若缺则取 data.name）' }
        },
        required: ['action']
      }
    },
    {
      name: 'system.ceshu',
      description: '策划书管理: list=列表, get=获取详情, create=创建, update=更新章节, delete=删除（需用户确认）, export=导出文件。',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', description: '操作类型: list|get|create|update|delete|export' },
          ceshu_id: { type: 'string', description: '策划书 ID（get/update 时必填）' },
          name: { type: 'string', description: '策划书名称（create 时可选）' }
        },
        required: ['action']
      }
    },
    {
      name: 'system.code',
      description: '在隔离沙箱中执行 JavaScript 片段（无宿主能力，用于计算/数据整理等）。',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['execute'], description: '操作类型: execute=执行代码' },
          code: { type: 'string', description: '要执行的 JS 片段，需 return 一个可 JSON 序列化的值' },
          timeout_ms: { type: 'integer', description: '超时毫秒数' },
          memory_limit_mb: { type: 'integer', description: '内存上限 MB' }
        },
        required: ['action', 'code']
      }
    },
    {
      name: 'tool.ask_user',
      description: '向用户提问: 单问题用 question(+options)，多问题用 questions 数组（可带候选与多选）。',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['ask'], description: '操作类型: ask=提问' },
          question: { type: 'string', description: '单个问题（未提供 questions 时使用）' },
          options: { type: 'array', description: '单问题候选选项', items: { type: 'string' } },
          questions: { type: 'array', description: '多问题数组', items: { type: 'object' } }
        },
        required: ['action']
      }
    },
    {
      name: 'tool.rollback_ai_changes',
      description: '撤销本次对话里 AI 对数据表做的全部改动（需用户确认）。',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['rollback'], description: '操作类型: rollback=回滚' }
        },
        required: ['action']
      }
    }
  ]

  // 记录 clearAll / deleteMany 调用，便于自检（无害）
  window.__clearAllCalls = []
  window.__deleteManyCalls = []

  window.mbApi = {
    app: {
      info: async () => ({ name: '墨白可视化编辑器', version: '9.9.9', platform: 'win32', dbPath: '(预览桩)' }),
      log: ok, setWindowMode: ok
    },
    schema: {
      list: async () => [
        { id: 'skill', name: '技能', formFields: [{ name: 'id' }, { name: 'name' }], listFields: ['name'] },
        { id: 'role', name: '职业', pluralKey: 'roles', color: '#0EA5E9',
          formFields: [
            { name: 'id', type: 'text' }, { name: 'name', type: 'text' },
            { name: 'hp', type: 'spinbox' }, { name: 'mp', type: 'spinbox' },
            { name: 'atk', type: 'spinbox' }, { name: 'def', type: 'spinbox' }
          ], listFields: ['name', 'hp', 'mp', 'atk', 'def'] },
        { id: 'monster', name: '怪物', pluralKey: 'monsters', color: '#EF4444',
          formFields: [
            { name: 'id', type: 'text' }, { name: 'name', type: 'text' },
            { name: 'level', type: 'spinbox' }, { name: 'hp', type: 'spinbox' },
            { name: 'atk', type: 'spinbox' }
          ], listFields: ['name', 'level', 'hp', 'atk'] },
        { id: 'item', name: '物品', formFields: [{ name: 'id' }, { name: 'name' }], listFields: ['name'] }
      ],
      save: async (req) => (req && req.types) || [],
      suggestFieldIds: async () => ({ suggestions: [] }),
      listFieldTemplates: async () => ({ builtin: [], custom: [] }), getFieldTemplate: async () => ({ fields: [] }),
      saveFieldTemplate: ok, deleteFieldTemplate: async () => ({ deleted: true })
    },
    agent: {
      listTools: async () => ({ description: '（预览桩）技能清单', tools: TOOLS }),
      executeTool: async () => ({ ok: true, result: {} }),
      chat: async () => ({ text: '（预览桩）AI 回复占位' }),
      respondApproval: ok, respondInteraction: ok,
      sessionInfo: async () => ({ hasSession: false, messageCount: 0, savedAt: '' }),
      sessionRestore: async () => ({ messages: [] }),
      sessionClear: async () => ({ cleared: true }),
      feedback: ok, onEvent: noopSub
    },
    attrSystem: {
      get: async () => ({ attributes: [], formulas: [] }), save: ok,
      exportGameConfig: async () => ({}), exportJson: async () => ({}), importJson: async () => ({})
    },
    data: {
      listItems: async () => [item('i1', 'skill', '示例技能A'), item('i2', 'role', '示例职业B'), item('i3', 'item', '示例物品C')],
      listAll: async () => [
        item('i1', 'skill', '示例技能A'),
        item('i2', 'item', '示例物品B'),
        item('m1', 'monster', '哥布林', { level: 3, hp: 45, atk: 8 }),
        item('m2', 'monster', '兽人战士', { level: 12, hp: 180, atk: 34 }),
        item('m3', 'monster', '亡灵法师', { level: 25, hp: 320, atk: 71 }),
        item('m4', 'monster', '巨龙', { level: 60, hp: 4200, atk: 260 }),
        item('m5', 'monster', '史莱姆', { level: 1, hp: 12, atk: 2 }),
        item('m6', 'monster', '暗影狼', { level: 8, hp: 96, atk: 21 }),
        item('r1', 'role', '战士', { hp: 320, mp: 80, atk: 45, def: 30 }),
        item('r2', 'role', '法师', { hp: 180, mp: 400, atk: 62, def: 12 })
      ],
      createItem: async (req) => ({ id: 'new-' + Date.now(), type: req.type, data: req.data, createdAt: '', updatedAt: '' }),
      updateItem: async (req) => req.item,
      deleteItem: ok,
      batchUpdate: async () => ({ affected: 0, skipped: 0, missing: 0 }),
      deleteMany: async () => { window.__deleteManyCalls.push(1); return { deleted: 3, missing: 0 } },
      clearAll: async (req) => { window.__clearAllCalls.push(req); return { deleted: 3 } },
      undo: async () => emptyUndo, redo: async () => emptyUndo,
      undoState: async () => undoState,
      references: async () => ({ referencedBy: [], references: [], similar: [] }),
      importLegacy: async () => ({ filePath: '', totalItems: 0, imported: 0, updated: 0, skipped: 0, byType: {}, unknownTypes: {} }),
      exportLegacy: async () => ({ filePath: '', totalItems: 0, byType: {} }),
      exportCsv: async () => ({ dir: '', files: [], totalItems: 0, byType: {} }),
      importCsv: async () => ({ filePath: '', totalItems: 0, imported: 0, updated: 0, skipped: 0, byType: {}, unknownTypes: {} }),
      exportExcel: async () => ({ filePath: '', totalItems: 0, byType: {} }),
      importExcel: async () => ({ filePath: '', totalItems: 0, imported: 0, updated: 0, skipped: 0, byType: {}, unknownTypes: {} })
    },
    engine: { exportData: async () => ({ filePath: '', engine: 'lua', bytes: 0 }) },
    images: {
      listLibraryImages: async () => ({ dir: '(预览桩)/images', files: ['goblin.png', 'hero.png'] }),
      // 按已保存路径回显预览（对齐 PyQt LazyImageLabel.load_image）。
      // 桩：返回一张有效 1x1 PNG 的 data URL —— 目的是让预览桩能验证「打开已保存图片
      // 路径的条目也能看到图」这条修复（真实路径在沙箱里读不到，故桩直接给成功响应）。
      readByPath: async (req) => {
        window.__imageReadCalls = window.__imageReadCalls || []
        window.__imageReadCalls.push(req && req.path)
        const PNG_1X1 =
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC'
        return { path: (req && req.path) || 'stub.png', dataUrl: PNG_1X1, bytes: 95, reason: null }
      },
      deleteImages: ok
    },
    settings: { hasSecret: async () => false, setSecret: ok, deleteSecret: ok },
    llm: {
      generate: async () => ({ model: 'stub-model', content: '（预览桩）AI 回复占位' }),
      // 记录渲染层推来的配置镜像，便于浏览器实测自检「配置真的推给了主进程」
      configure: async (req) => {
        window.__llmConfigureCalls = window.__llmConfigureCalls || []
        window.__llmConfigureCalls.push(req && req.config)
        return { ok: true }
      },
      status: async () => ({
        available: true,
        models: ['qwen2.5:7b', 'qwen2.5:14b', 'qwen3:8b'],
        message: '（预览桩）本地模型 3 个',
        provider: 'ollama'
      })
    },
    backup: { list: async () => [], create: async () => ({ name: 'snap' }), restore: async () => ({ restored: true }), remove: ok },
    dialog: {
      chooseJsonFile: async () => ({ path: null }), chooseEngineExportFile: async () => ({ path: null }),
      chooseSaveJsonFile: async () => ({ path: null }), chooseExportDir: async () => ({ path: null }),
      chooseCsvFile: async () => ({ path: null }), chooseExcelFile: async () => ({ path: null }),
      chooseImageSaveDir: async () => ({ path: null }), chooseCeshuExportFile: async () => ({ path: null }),
      chooseAttrSystemJsonFile: async () => ({ path: null }), chooseTemplateJsonFile: async () => ({ path: null })
    },
    ceshu: {
      list: async () => [SUMMARY], create: async () => DOC, get: async () => DOC,
      saveChapter: async () => DOC, export: async () => ({ filePath: '', format: 'markdown' }),
      versions: async () => [SUMMARY], derive: async () => DOC, applyPreset: async () => DOC,
      confirmSystems: async () => DOC, syncData: async () => DOC, rename: ok,
      remove: async () => ({ deleted: true }), duplicate: async () => DOC, setActive: async () => DOC,
      changelog: async () => ({ entries: [] }), validate: async () => [], score: async () => ({}),
      aiGenerateChapter: async () => ({ fields: { name: '测试章节', summary: '预览桩占位内容' }, quality: undefined, usage: { promptTokens: 800, completionTokens: 400, totalTokens: 1200 } }), aiReview: async () => ({ usage: { promptTokens: 500, completionTokens: 200, totalTokens: 700 } }),
      // 预览桩：返回带确定性质量门的候选包（证明 DD-19 数据半边的 UI 渲染块接线正确；
      // 真实计算已在 tests/unit/agentQualityGate.test.ts 用真值 findCountConstraint/assessBalance 覆盖）。
      aiGenerateData: async () => ({
        model: 'stub-model',
        candidates: { roles: [{ hp: 100 }, { hp: 1000 }] },
        generatedCounts: { roles: 2 },
        total: 2,
        summary: '2 条候选通过数量约束，但有 1 个数值字段离散度偏高，建议复核后再导入',
        usage: { promptTokens: 600, completionTokens: 300, totalTokens: 900 },
        quality: {
          total: 2,
          counts: { roles: 2 },
          issues: [
            { type: 'roles', typeName: '角色', kind: 'balance', message: '「角色」的生命值离散度偏高（均值 550.0、标准差 450.0），建议复核数值平衡' }
          ],
          balance: [
            { type: 'roles', typeName: '角色', field: 'hp', label: '生命值', count: 2, avg: 550, std: 450, verdict: 'needs_adjust' }
          ],
          hasIssues: true,
          summary: '2 条候选通过数量约束，但有 1 个数值字段离散度偏高，建议复核后再导入'
        }
      }),
      exportReviewReport: async () => ({ filePath: '' }),
      checklist: async () => ({ items: [] }), autoFill: async () => ({ filled: 0 }),
      exportChecklistReport: async () => ({ filePath: '' }), diff: async () => ({}),
      exportDiffReport: async () => ({ filePath: '' }), wordStats: async () => ({ total: 0 }),
      fieldDeps: async () => ({ issues: [] })
    },
    library: {
      list: async () => [{ name: '初始库', createdAt: '', description: '', isInitial: true }],
      create: async (req) => ({ name: req.name, createdAt: '', description: '', isInitial: false }),
      rename: ok, remove: async () => ({ switchedTo: null }), switch: ok, onChanged: noopSub
    }
  }
})()
