/*
 * E51 渲染层交互验证的「桩上桩」（非生产代码，仅验证脚手架）。
 *
 * 用法：由 serve-e51.mjs 在 /stub.js 里**紧接** preview-stub.js 之后拼接下发，
 * 因此本文件运行于 preview-stub.js 之后、渲染层 module bundle 之前。
 *
 * 目的：preview-stub.js 的 `data.listItems` 是**恒定 3 条**、`ceshu.get` 的 DOC
 * `systems` 为空——无法驱动 E51 的「数量约束 / 右键重命名」交互。本文件在不改动
 * preview-stub.js 的前提下：
 *   1. 读取 `window.__E51_SEED`（由 Playwright addInitScript 在本脚本之前种下，
 *      addInitScript 先于所有页面脚本执行）——决定 systems 配置与各类型条目；
 *   2. 把 `data.*` 换成**有状态内存库**（create/update/delete 真改库、追加记录调用）；
 *   3. 让 `ceshu.get` 回写种子 systems（并置 meta.system_confirmed=true，避免自动弹
 *      「确认游戏系统」打断流程）。
 *
 * 调用记录挂在 window.__calls，供验证脚本回读（`data:updateItem` 是否被调用等）。
 */
;(function installE51Seed() {
  const api = window.mbApi
  if (!api) {
    console.error('[e51-stub] window.mbApi 缺失：本脚本必须排在 preview-stub.js 之后')
    return
  }

  /** 调用记录（验证脚本据此断言「桩方法是否被调用 / 参数为何」） */
  const calls = { createItem: [], updateItem: [], deleteItem: [], listItems: [] }
  window.__calls = calls

  const seed = window.__E51_SEED || {}
  const seedData = seed.data || {}

  /** type -> ItemRecord[]（有状态内存库，深拷贝进/出以免渲染层改到桩内部对象） */
  const store = {}
  for (const type of Object.keys(seedData)) {
    store[type] = (seedData[type] || []).map((entry) => ({
      id: String(entry.id),
      type,
      data: { ...(entry.data || {}) },
      createdAt: '',
      updatedAt: ''
    }))
  }

  const clone = (record) => ({ ...record, data: { ...record.data } })

  api.data.listItems = async (req) => {
    const type = req && req.type
    calls.listItems.push(type)
    return (store[type] || []).map(clone)
  }

  api.data.createItem = async (req) => {
    calls.createItem.push(req)
    const type = req && req.type ? req.type : ''
    const list = store[type] || (store[type] = [])
    const record = {
      id: 'new-' + type + '-' + (list.length + 1) + '-' + Date.now(),
      type,
      data: { ...(req && req.data) },
      createdAt: '',
      updatedAt: ''
    }
    list.push(record)
    return clone(record)
  }

  // 契约：渲染层以 { id, data } 调用（DataEditorTab.commitRename / ItemForm.save）；
  // 兼容 { item: { id } } 形式（对齐 preview-stub.js 原实现）。
  api.data.updateItem = async (req) => {
    calls.updateItem.push(req)
    const id = (req && req.id) || (req && req.item && req.item.id)
    const type = req && req.type ? req.type : (req && req.item && req.item.type)
    // 找不到指定 type 时就全库搜 id（验证脚本只种一个类型，容错无妨）
    const types = type ? [type] : Object.keys(store)
    for (const t of types) {
      const list = store[t] || []
      const idx = list.findIndex((it) => it.id === id)
      if (idx >= 0) {
        const data = (req && req.data) || (req && req.item && req.item.data) || {}
        list[idx] = { ...list[idx], data: { ...data } }
        return clone(list[idx])
      }
    }
    return (req && req.item) || { id, type, data: (req && req.data) || {} }
  }

  api.data.deleteItem = async (req) => {
    calls.deleteItem.push(req)
    const id = req && req.id
    for (const t of Object.keys(store)) {
      store[t] = (store[t] || []).filter((it) => it.id !== id)
    }
    return { ok: true }
  }

  // 让 ceshu.get 回写种子 systems（preview-stub.js 的 DOC 是空 systems）
  const origCeshuGet = api.ceshu.get
  api.ceshu.get = async (req) => {
    const doc = await origCeshuGet(req)
    doc.systems = seed.systems || {}
    doc.meta = {
      ...(doc.meta || {}),
      game_name: seed.title || (doc.meta && doc.meta.game_name) || '验证用策划书',
      system_confirmed: true,
      gdd_scope: 'full'
    }
    return doc
  }
})()
