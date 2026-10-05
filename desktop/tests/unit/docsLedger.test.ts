import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * 文档一致性守护测试。
 *
 * ## 为什么会有这个测试（真实事故，不是假想）
 * 本仓库的进度台账 `docs/ts-migration-roadmap.md` 是**迁移的单一事实源**，
 * 但它在 2026-10-04 一个会话里**被静默回退过两次**：
 * - 第一次：`e59ba0e` 提交时把「磁盘上被回退成旧版」的文件一并提交，删掉了 E5 台账 16 行；
 * - 第二次：`80a5f98` 提交后，工作区文件又退回上一个提交的内容，E7 台账整段消失。
 * 两次都表现为「工作区文件 = 上一个提交的内容 + 某处多一个空行」，像是被某个进程用旧快照重写；
 * 仓库**没有 git hooks**、也没有 husky/lint-staged，无法从外部定位该进程。
 *
 * 两次都是靠人工 `grep -c` 复核才发现的。这个测试把那一步**机械化**：
 * 只要台账条目、关键提交号、或审计数字对不上，`vitest` 立刻失败。
 *
 * 注意：本测试**只读**文件，不修改任何东西。
 */

function readDoc(name: string): string {
  const candidates = [
    resolve(process.cwd(), 'docs', name),
    resolve(process.cwd(), 'desktop', 'docs', name)
  ]
  const found = candidates.find((path) => existsSync(path))
  if (found === undefined) {
    throw new Error(`找不到文档 ${name}（尝试过：${candidates.join(' / ')}）`)
  }
  return readFileSync(found, 'utf-8')
}

/** 台账里必须一直存在的标记：提交号 + 条目头（回退会成片删掉它们） */
const REQUIRED_ROADMAP_MARKERS: readonly string[] = [
  'b7a2b9f', // E1 引擎代码导出（→ Lua）
  '8ff0b0d', // E3-1 会话级回滚核心
  '7478c43', // E3-2 会话级回滚接线
  '3988b92', // E4 系数公式编辑器
  'dbfe391', // E5 条目编辑器分区
  'e59ba0e', // E6 字段 ID 生成
  'ff08fc3', // E7 字段 ID 的 AI 候选
  'd0b923e', // E8 TS 文件日志
  'e273254', // E9 Agent 偏好/反馈
  'a744b27', // E10 快速创建向导
  '2f77c32', // E11 数据统计与平衡性分析
  'cf5cd51', // E12 自定义字段模板
  'a985b15', // E13 高级搜索
  '7ea64fa', // E14–E16 类型可见性 + 数据对比 + 数据备份（同批）
  '92b29ed', // E17–E18 引用表 + 掉落表字段编辑器（同批）
  'da320b6', // E19–E20 游戏数据 CSV + Excel 导入导出（同批）
  '82a59c9', // E21 术语风格（迁移 core/style_manager.py）
  '9294a8a', // E22 AI 生图子系统（补齐 §4 #7 能力缺口）
  '5e5b0b0', // E23 统一设置存储基座（#8 C 档外围第一项）
  'c11ed5f', // E24 收敛重复 storage 助手 + 窗口状态持久化（#8 第二项）
  '10887fa', // E25 API Key 迁 Electron safeStorage（修安全性退步）
  '3a0c469', // E26 shared/ 分层最小整理（方案 C）
  '581c64c', // E27 通用撤销/重做（undo/redo 安全子集）
  'de104be', // E28 顶层 IA 对齐 PyQt（去侧栏 + 角部件 + 策划书中心）
  '8502638', // E29 E2E 全量迁移——地基（helper + 收敛 51 文件门禁）
  '5471256', // E29 E2E 全量迁移——收尾（数字员工面板去 mode-digital，死引用归零）
  '1d96b0e', // E30 视觉与交互细节对齐 PyQt（配色/图标/首页AI卡/表单行/章节导航）
  'E4（2026-10-04）',
  'E5（2026-10-04）',
  'E6（2026-10-04）',
  'E7（2026-10-04）',
  'E8（2026-10-04）',
  'E9（2026-10-04）',
  'E10（2026-10-04）',
  'E11（2026-10-04）',
  'E12（2026-10-04）',
  'E13（2026-10-04）',
  'E14（2026-10-05）',
  'E15（2026-10-05）',
  'E16（2026-10-05）',
  'E17（2026-10-05）',
  'E18（2026-10-05）',
  'E19（2026-10-05）',
  'E20（2026-10-05）',
  'E21（2026-10-05）',
  'E22（2026-10-05）',
  'E23（2026-10-05）',
  'E24（2026-10-05）',
  'E25（2026-10-05）',
  'E26（2026-10-05）',
  'E27（2026-10-05）',
  'E28（2026-10-05）',
  'E29（2026-10-05）',
  'E30（2026-10-06）',
  '已由 E7 补齐', // E6 遗留项已被 E7 补齐的标记（回退会退回旧措辞）
  'migration-audit.md' // §2 必须指向文件级审计
]

describe('文档守护：迁移台账不得被静默截断', () => {
  const roadmap = readDoc('ts-migration-roadmap.md')

  it('台账条目与关键提交号全部在场', () => {
    const missing = REQUIRED_ROADMAP_MARKERS.filter((marker) => !roadmap.includes(marker))
    expect(missing, `台账缺失标记：${missing.join('、')}`).toEqual([])
  })

  it('章节结构完好（6 个一级章节）', () => {
    const sections = roadmap.match(/^## /gm) ?? []
    expect(sections).toHaveLength(6)
  })

  it('§2 的审计结论块在场（真实剩余量的唯一入口）', () => {
    expect(roadmap).toContain('真实剩余量已被**文件级审计**确定')
    expect(roadmap).toContain('真实剩余 ≈ 2.4–2.8 万行（26–31%）')
  })
})

describe('文档守护：审计数字必须自洽且两处一致', () => {
  const roadmap = readDoc('ts-migration-roadmap.md')
  const audit = readDoc('migration-audit.md')

  /** 从审计文档的结论表里取出四类（文件数/行数），避免在测试里硬编码同一份数字 */
  const parseRow = (text: string, label: string): { files: number; lines: number } => {
    const match = text.match(new RegExp(`\\|\\s*${label}[^|]*\\|\\s*(\\d+)\\s*\\|\\s*([\\d,]+)\\s*\\|`))
    if (match === null) throw new Error(`审计文档里找不到「${label}」行`)
    return { files: Number(match[1]), lines: Number(match[2].replace(/,/g, '')) }
  }

  const migrated = parseRow(audit, '✅ 已迁')
  const partial = parseRow(audit, '◐ 部分已迁')
  const skipped = parseRow(audit, '⛔ 有意不迁')
  // 允许可选的 `**`：两处表格的加粗风格可能不同（审计文档 §1 未加粗、roadmap §2 加粗）
  const todo = parseRow(audit, '⚠️ \\*{0,2}未迁')

  it('四类合计 = 299 文件 / 91,164 行（对账）', () => {
    expect([migrated, partial, skipped, todo].reduce((sum, row) => sum + row.files, 0)).toBe(299)
    expect([migrated, partial, skipped, todo].reduce((sum, row) => sum + row.lines, 0)).toBe(91_164)
  })

  it('roadmap §2 引用的四类数字与审计文档一致（防两处漂移）', () => {
    for (const row of [migrated, partial, skipped, todo]) {
      expect(roadmap, `roadmap 缺文件数 ${row.files}`).toContain(String(row.files))
      expect(roadmap, `roadmap 缺行数 ${row.lines}`).toContain(row.lines.toLocaleString('en-US'))
    }
  })

  it('审计文档写明它推翻了早前的 4–5% 估算（保留纠错痕迹）', () => {
    expect(audit).toContain('4–5%')
    expect(roadmap).toContain('4–5%')
  })
})
