import { test } from '@playwright/test'

/**
 * 术语风格（迁移自 Python `core/style_manager.py`）。
 *
 * 原用例验证的是**工具栏「术语风格」下拉**（testid `game-style`）的手工切换 + 字段标签术语替换 + 持久化。
 *
 * 但新 IA 已随左侧栏/数据表工具栏一并下线该下拉：全仓以该 testid 检索命中 **0**
 * （仅 `styles.css` 残留 `.toolbar .game-style-select` 样式，无渲染入口）。术语风格现只剩**唯一入口**：
 * 打开策划书时由 `CeshuView.tsx:129` 的 `resolveDocGameStyle(doc)` 按 `doc.style` / `meta` 文本推断，
 * 再经 `App.handleGameStyleChange` 回填（用户无法再手工选择，只能由文档携带）。
 *
 * 因此原用例的「手工下拉 + localStorage 持久化」两段前提都已不成立；在把断言改为
 * 「按 `doc.style` 播种策划书 → 断言条目表单字段标签被替换」并**真机确认标签渲染**之前，
 * 不写没把握的断言，先标记为 fixme，待另立用例。
 */
test.fixme('术语风格：字段标签按风格替换并可持久化（新 IA 已下线手工下拉入口，待按 doc.style 重写）', async () => {
  // 待重写：用 seedCeshu({ title, style: 'xianxia', systems: [{ key: 'job', label: '职业', dataType: 'job' }] })
  // 播种 → 打开策划书 → 断言 label[for="field-hp_bonus"] 被替换为「气血加成%:」（需真机确认标签渲染）。
})
