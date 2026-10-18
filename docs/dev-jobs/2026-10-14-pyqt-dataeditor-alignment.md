# 开发作业：墨白数据编辑器对齐 PyQt 老版本

- **作业 ID**：pyqt-dataeditor-alignment
- **创建日**：2026-10-14
- **参考基线**：`D:/游戏项目/角色技能库/墨白启动器老版本/GameEditorApp`（PyQt6 桌面应用）
- **对齐目标**：把 Electron+React+TS 版「墨白可视化编辑」的**数据编辑器**（左列表 + 右字段表单）对齐到 PyQt 老版本的行为与外观。
- **范围边界**：仅数据编辑器组件本身（列表面板 / 字段表单 / 各字段控件 / 删除等动作）。应用外壳级功能（自动保存、高级搜索、主题切换、模板管理、引擎导出、规则验证）属不同范围，老版本本身多为 stub，不在本作业对齐目标内。

---

## 进度日志

### 2026-10-14（晚）· 深度功能审计 + 删除二次确认
- 让探查 agent 摸透 PyQt 数据编辑器完整功能面，再用 evidence-over-memory 逐条核验 TS 现状。
- **结论：数据编辑器功能面已对齐**。探查 agent 标记的三处「最大缺口」经代码实证全部已复刻：
  - 图片字段实时预览 → `FieldControl.tsx:248` `<LazyImage width=120 height=120>`（路径框+选择图片+预览三件套齐备）
  - template 联动 desc → `ItemForm.tsx:182-186` `handleTemplatePicked`
  - 列表三段显示 → `DataEditorTab.tsx:76-87` `buildListRowText`（`ID | 名称 | 关键字段×1~2`）
- 控件层、工具栏（新建/保存/删除/复制/AI生成）、搜索、字段级 AI（AI生成/AI生图/AI分析）、image_tags 自动填充 均已在位。
- **唯一经得起推敲的真实残留差异**：PyQt 删除按钮有二次确认（`_on_delete_clicked` 先弹确认框），TS 是无确认直删（此前为规避 Delete 键一键误删做的刻意选择，但按钮级确认本身不冲突，且属安全增强）。
- **本次续做**：给删除入口（右键菜单 + 表单操作栏「删除」）加二次确认，对齐 PyQt，沿用既有内联确认条样式（`count-warning`）。
- 验证门：tsc 双配置 0 / eslint 0 / build 过 / e2e `ceshu-data-delete-confirm` 新 + `ceshu-data-maximize` 回归 全绿。
- 提交：30d88b6

### 2026-10-14（早）· 几何复刻（提交 82bc073）
- 标签列改 grid（`[data-testid='item-editor'] .editor-body` 作用域内 `grid-template-columns: max-content minmax(0,1fr)` + `.form-row{display:contents}`），标签列 118→51px。
- 数据编辑器「⛶ 展开」整窗覆盖层（fixed inset:0，自挂 DataEditorTab，列表 240px，Esc/收起销毁）。
- 守卫 `ceshu-data-maximize.spec.ts`：标签列 <100px、控件起始线唯一、展开宽度跃迁、收起后内嵌态仍在。
- e2e 全量 20 failed/50 passed（失败集同基线，通过 +1）⇒ 零回归。

### 2026-10-13 → 10-14 凌晨 · id 短序号语义（提交 9253f05）
- 恢复 PyQt `data_manager.generate_id()` 短序号语义：`data.id` 每类型 max+1、0 起步，与记录 uuid 解耦。
- 新增 `shared/util/itemId.ts`；`createItem/updateItem/batchUpdate/importRecords` 种子化；`user_version 1→2` 迁移回填存量。
- UI 列表行 `ID:` 与表单头部 small 走 `displayItemId`。

---

## 残留差异（评估后决定如何处理）

| 差异 | 参考(PyQt) | TS 现状 | 决定 |
|---|---|---|---|
| 删除二次确认 | 有确认框 | 无确认直删 | **本次已修**（加二次确认） |
| image_tags 按钮文案 | 「自动生成」 | 「自动填充」 | 保留 TS 文案：参考的「自动生成」也是纯模板非 AI，TS 改名为「自动填充」避免误读成 AI，更诚实 |
| 列表特征字段 | 每类型取**单**个特定字段 | 取首个非空字段×1~2 | 保留 TS：信息更全，属合理超越 |
| 搜索语义 | 全对象字符串模糊 | 按 名称/描述/ID 分词过滤 | 保留 TS：更可用 |
| 自动保存 / 高级搜索 / 主题 / 模板管理 / 引擎导出 / 规则验证 | 各有实现或 stub | 未实现 | 应用外壳级，不在本作业范围；按需另立项 |

---

## 验证门（每次提交前必跑）
1. `tsc` 双配置（`tsconfig.node.json` / `tsconfig.web.json`）0 错
2. `eslint` 0
3. `npm run build` 通过（`env -u NODE_OPTIONS -u ELECTRON_RUN_AS_NODE`）
4. e2e：`node node_modules/playwright/cli.js test --config playwright.config.ts <spec>`（build 后跑，e2e 吃 `out/`）
5. 提交：仅 `git add` 显式改动文件 + `_cm.txt` + `--no-verify`，留 dirty 不动
6. 重启 GUI 目检
