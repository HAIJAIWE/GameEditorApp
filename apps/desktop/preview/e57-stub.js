/*
 * E57 渲染层交互验证的「桩上桩 #2」（非生产代码，仅验证脚手架）。
 *
 * 用法：由 serve-e57.mjs 在 /stub.js 里**紧接** preview-stub.js + e51-stub.js 之后拼接下发。
 *
 * 目的：preview-stub.js 的 schema 只有 4 个类型（skill/role/monster/item），且 `role` 的
 * formFields **没有任何 refType 引用字段**、也**没有** `dialog` 类型 —— 两处都恰好卡住本轮要验的
 * 两个真缺口：① 关系图面板要靠「带 refType 的类型 + 全量条目」才出关联行；② `dialog` 字段控件
 * 要 `task.dialog_id` 这种真实存在的字段形态。另 `data.listAll` 在该桩里是恒定 9 条无引用版本。
 *
 * 本文件**不改动**前两个桩，只在其之上：
 *   1. 用同一份 `window.__E51_SEED.data` 重建 `data.listAll`（全量条目，供关系图按 id 解析 token）；
 *   2. 覆盖 `schema.list`，给出「带 refType 的 role + 带 dialog 字段的 task + dialog/skill/…」最小 schema
 *      （字段形状对齐 `shared/typeSchema.ts::field()`：name/label/type/editable）。
 */
;(function installE57Seed() {
  const api = window.mbApi
  if (!api) {
    console.error('[e57-stub] window.mbApi 缺失：本脚本必须排在 preview-stub.js 之后')
    return
  }

  const seed = window.__E51_SEED || {}
  const seedData = seed.data || {}

  // ---- 1) 全量条目（`type` 取存储键 = DataTypeDef 的单数 id） ----
  window.__e57AllItems = () =>
    Object.keys(seedData).flatMap((type) =>
      (seedData[type] || []).map((entry) => ({
        id: String(entry.id),
        type,
        data: { ...(entry.data || {}) },
        createdAt: '',
        updatedAt: ''
      }))
    )

  api.data.listAll = async () => window.__e57AllItems()

  // ---- 2) 最小但忠实字段形状的 schema ----
  const field = (name, label, type, extra) => ({ name, label, type, editable: true, ...(extra || {}) })
  const idField = () => field('id', 'ID:', 'entry', { editable: false })

  window.__e57Types = [
    {
      id: 'skill',
      name: '技能',
      pluralKey: 'skills',
      color: '#4CAF50',
      formFields: [idField(), field('name', '技能名称:', 'entry'), field('desc', '描述:', 'desc')]
    },
    {
      id: 'role',
      name: '角色',
      pluralKey: 'roles',
      color: '#2196F3',
      formFields: [
        idField(),
        field('name', '角色名称:', 'entry'),
        field('job', '职业:', 'combobox', { values: ['战士', '法师'] }),
        field('level', '等级:', 'spinbox', { from: 1, to: 100 }),
        field('skills', '技能列表:', 'multiselect', { refType: 'skills' }),
        field('talents', '天赋列表:', 'multiselect', { refType: 'talents' }),
        field('buffs', 'Buff列表:', 'multiselect', { refType: 'buffs' })
      ]
    },
    {
      id: 'dialog',
      name: '对话',
      pluralKey: 'dialogs',
      color: '#84CC16',
      formFields: [idField(), field('name', '对话名称:', 'entry'), field('next_dialog', '后续对话:', 'entry')]
    },
    {
      id: 'task',
      name: '任务',
      pluralKey: 'tasks',
      color: '#FF5722',
      formFields: [
        idField(),
        field('name', '任务名称:', 'entry'),
        field('dialog_id', '对话ID:', 'dialog'),
        field('desc', '描述:', 'desc')
      ]
    },
    {
      id: 'monster',
      name: '怪物',
      pluralKey: 'monsters',
      color: '#EF4444',
      formFields: [idField(), field('name', '怪物名称:', 'entry'), field('level', '等级:', 'spinbox', { from: 1, to: 100 })]
    },
    {
      id: 'item',
      name: '物品',
      pluralKey: 'items',
      color: '#10B981',
      formFields: [idField(), field('name', '物品名称:', 'entry')]
    }
  ]

  api.schema.list = async () => window.__e57Types
})()
