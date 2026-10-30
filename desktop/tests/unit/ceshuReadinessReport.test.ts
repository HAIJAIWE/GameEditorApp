import { describe, expect, it } from 'vitest'

import { buildReadinessReportMarkdown, type CeshuReadinessReport } from '../../src/shared/ceshu/ceshuReadiness'

/**
 * `buildReadinessReportMarkdown` 单测（2026-10-27）。
 *
 * 与旧评分报告的关键差异（本文件锁死）：
 * - **无**「总分 / 等级 S-D / 三维度 30+40+30」；
 * - 「同行业对比（编造的行业均值）」→「参照文档对比（有出处）」；
 * - 章节表从「评分」换成「必填 filled/total」。
 *
 * ⚠️ 夹具必须是**真实的 `CeshuReadinessReport` 形状**，不能喂展平对象 ——
 * 显式标注类型以锁死契约。
 */
function makeReport(overrides: Partial<CeshuReadinessReport> = {}): CeshuReadinessReport {
  return {
    concept: { stage: 'concept', required_total: 16, required_filled: 5, ratio: 0.31, missing_count: 11, chapter_count: 7 },
    production: { stage: 'production', required_total: 34, required_filled: 9, ratio: 0.26, missing_count: 25, chapter_count: 16 },
    release: { stage: 'release', required_total: 50, required_filled: 12, ratio: 0.24, missing_count: 38, chapter_count: 24 },
    chapters: [
      {
        chapter_key: 'meta',
        chapter_label: '文档信息',
        required_total: 4,
        required_filled: 4,
        missing_required: [],
        completion: 1,
        word_count: 120,
        quality_notes: [],
        empty: false
      },
      {
        chapter_key: 'vision',
        chapter_label: '产品愿景',
        required_total: 2,
        required_filled: 1,
        missing_required: ['differentiation'],
        completion: 0.5,
        word_count: 30,
        quality_notes: ['内容质量提示：产品愿景 缺少可验证的数字或实例'],
        empty: false
      }
    ],
    total_missing: 38,
    total_required: 50,
    total_ratio: 0.24,
    next_steps: ['先补齐立项阶段还差的 11 个必填字段：文档信息·game_type 等 11 项', '有 3 章完全未填写（产品愿景、核心玩法 等），按阶段推进即可'],
    references: [
      {
        id: 'DOOM',
        title: '《Doom Bible》',
        genre: '1992 FPS 设计圣经',
        kind: 'real-public',
        kindLabel: '真实公开文档',
        attribution: 'Tom Hall 撰写，id Software 1992 年公开分发',
        url: 'https://example.com/doomBible.pdf',
        total: 16,
        covered: 9,
        ratio: 0.56,
        docCovered: 5,
        delta: -4
      },
      {
        id: 'MERGE',
        title: '《喵岛邮差》',
        genre: '休闲合成（无战斗品类）',
        kind: 'project-sample',
        kindLabel: '本项目合成样例（非真实文档）',
        attribution: '本项目为对齐 schema 骨架合成的 5 页样例（best-case，非真实文档）',
        path: 'docs/gdd-samples/03-休闲合成-喵岛邮差.md',
        total: 14,
        covered: 11,
        ratio: 0.79,
        docCovered: 4,
        delta: -7
      }
    ],
    ...overrides
  }
}

describe('完备度报告 Markdown', () => {
  it('标题 + meta + 免责声明 + 阶段表 + 下一步 + 逐章 + 参照对比逐行对齐', () => {
    const md = buildReadinessReportMarkdown('测试游戏', 'RPG', makeReport(), '2026-10-27 12:00:00')

    // 标题与 meta
    expect(md).toContain('# 策划书完备度报告')
    expect(md).toContain('**游戏名称**: 测试游戏')
    expect(md).toContain('**游戏类型**: RPG')
    expect(md).toContain('**生成时间**: 2026-10-27 12:00:00')

    // 免责声明：明确「不给总分/等级」
    expect(md).toContain('不给出总分或等级')

    // 阶段完备度表
    expect(md).toContain('## 阶段完备度')
    expect(md).toContain('| 阶段 | 必填覆盖 | 缺口 | 适用章数 |')
    expect(md).toContain('| 立项 | 5/16（31%） | 11 | 7 |')
    expect(md).toContain('| 研发 | 9/34（26%） | 25 | 16 |')
    expect(md).toContain('| 发行 | 12/50（24%） | 38 | 24 |')
    expect(md).toContain('**全文**: 必填 12/50（24%），还差 38 项')

    // 下一步
    expect(md).toContain('## 下一步')
    expect(md).toContain('- 先补齐立项阶段还差的 11 个必填字段：文档信息·game_type 等 11 项')

    // 逐章缺口：缺的字段 join('、')，不缺失输出 —
    expect(md).toContain('## 逐章缺口')
    expect(md).toContain('| 章节 | 必填 | 字数 | 完成度 | 缺失必填 |')
    expect(md).toContain('| 文档信息 | 4/4 | 120 | 100% | — |')
    // 缺失字段写**中文标签**（2026-10-27）：报告是给人读的，`differentiation` 这种裸 key 得二次翻译
    expect(md).toContain('| 产品愿景 | 1/2 | 30 | 50% | 差异化优势 |')
    expect(md).not.toContain('| differentiation |')

    // 参照文档对比（有出处）
    expect(md).toContain('## 参照文档对比（有出处）')
    expect(md).toContain('| 参照文档 | 出处类型 | 覆盖 | 你的覆盖 | 差距 | 出处 |')
    expect(md).toContain(
      '| 《Doom Bible》 | 真实公开文档 | 9/16（56%） | 5/16 | -4 | https://example.com/doomBible.pdf |'
    )
    expect(md).toContain(
      '| 《喵岛邮差》 | 本项目合成样例（非真实文档） | 11/14（79%） | 4/14 | -7 | docs/gdd-samples/03-休闲合成-喵岛邮差.md |'
    )

    // 出处明细
    expect(md).toContain('出处明细：')
    expect(md).toContain('- **《Doom Bible》**（真实公开文档）：Tom Hall 撰写，id Software 1992 年公开分发 — https://example.com/doomBible.pdf')

    // 顺序：阶段表 → 下一步 → 逐章 → 参照对比；首行是标题
    expect(md.startsWith('# 策划书完备度报告\n')).toBe(true)
    expect(md.indexOf('## 阶段完备度')).toBeLessThan(md.indexOf('## 下一步'))
    expect(md.indexOf('## 下一步')).toBeLessThan(md.indexOf('## 逐章缺口'))
    expect(md.indexOf('## 逐章缺口')).toBeLessThan(md.indexOf('## 参照文档对比（有出处）'))
  })

  it('不再出现「总分 / 等级 / 同行业对比 / 行业均值」等旧评分报告字样', () => {
    const md = buildReadinessReportMarkdown('测试游戏', 'RPG', makeReport(), '2026-10-27 12:00:00')

    // 旧标题 / 旧章节 / 旧编造基准（注：免责声明里出现「总分」「等级」是**否定句**，故只断言旧格式本身）
    expect(md).not.toContain('工业级 GDD 评分报告')
    expect(md).not.toContain('## 同行业对比')
    expect(md).not.toContain('行业均值')
    expect(md).not.toContain('- **总分**:')
    expect(md).not.toContain('- **等级**:')
    expect(md).not.toContain('/ 100')
  })

  it('正数差距带 +、无 url/path 时表格回落到 attribution、无参照时不输出该段', () => {
    const md = buildReadinessReportMarkdown(
      '测试游戏',
      'RPG',
      makeReport({
        references: [
          {
            id: 'ABYSSAL',
            title: '《深潮灯塔》',
            genre: '单路塔防',
            kind: 'project-deliverable',
            kindLabel: '本项目已交付案例',
            attribution: '本项目用 game-designer-pro 交付',
            total: 16,
            covered: 13,
            ratio: 0.81,
            docCovered: 15,
            delta: 2
          }
        ]
      }),
      '2026-10-27 12:00:00'
    )

    expect(md).toContain('| 《深潮灯塔》 | 本项目已交付案例 | 13/16（81%） | 15/16 | +2 | 本项目用 game-designer-pro 交付 |')
    // 出处明细里无 url / path ⇒ 只有 attribution，不追加「 — 」
    expect(md).toContain('- **《深潮灯塔》**（本项目已交付案例）：本项目用 game-designer-pro 交付')

    const noRefs = buildReadinessReportMarkdown('测试游戏', 'RPG', makeReport({ references: [] }), '2026-10-27 12:00:00')
    expect(noRefs).not.toContain('## 参照文档对比')
  })

  it('无游戏名/类型时回退默认值', () => {
    const md = buildReadinessReportMarkdown('', '', makeReport(), '2026-10-27 12:00:00')
    expect(md).toContain('**游戏名称**: 未命名')
    expect(md).toContain('**游戏类型**: 未指定')
  })

  it('章节名/缺失字段中的竖线被转义，避免破坏表格', () => {
    const md = buildReadinessReportMarkdown(
      '测试游戏',
      'RPG',
      makeReport({
        chapters: [
          {
            chapter_key: 'meta',
            chapter_label: '文档 | 信息',
            required_total: 2,
            required_filled: 0,
            missing_required: ['a|b'],
            completion: 0,
            word_count: 0,
            quality_notes: [],
            empty: true
          }
        ]
      }),
      '2026-10-27 12:00:00'
    )
    expect(md).toContain('| 文档 \\| 信息 | 0/2 | 0 | 0% | a\\|b |')
    expect(md).not.toContain('文档 | 信息')
  })
})
