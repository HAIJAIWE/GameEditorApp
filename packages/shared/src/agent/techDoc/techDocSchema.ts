/**
 * 技术设计文档（Technical Design Document）的**标准章节**。
 *
 * 与 GDD（策划书，描述「游戏是什么」）不同，技术设计文档描述「**怎么实现**」——
 * 架构、模块、数据模型、接口、时序、风险、里程碑。它是 GDD → 代码之间的桥。
 *
 * 这里只定义**章节结构与写作指引**（单源），供 `system.tech_doc` 技能的 `outline` 返回，
 * 让模型产出结构一致、可评审的工程文档。存储形态是 markdown（`<库>/tech/<name>.md`）。
 */

/** 一个章节：id + 标题 + 写作指引 */
export interface TechDocSection {
  id: string
  title: string
  guidance: string
}

/** 技术设计文档的标准章节（工程视角，按实现顺序） */
export const TECH_DOC_SECTIONS: readonly TechDocSection[] = [
  {
    id: 'overview',
    title: '概述与目标',
    guidance: '一段话说明这个系统做什么、为谁解决什么问题；明确**非目标**（不做什么）。'
  },
  {
    id: 'architecture',
    title: '架构总览',
    guidance: '分层/组件划分、数据流方向、关键取舍（文字或 ASCII 图即可）。'
  },
  {
    id: 'modules',
    title: '模块划分',
    guidance: '每个模块的职责、边界、对外接口；标出可独立测试的单元。'
  },
  {
    id: 'data-model',
    title: '数据模型',
    guidance: '核心实体、字段、关系、持久化形态；与 GDD 数据表/策划书小节的映射。'
  },
  {
    id: 'interfaces',
    title: '接口与协议',
    guidance: '对外 API / 事件 / IPC / 消息格式；错误码、幂等性与兼容策略。'
  },
  {
    id: 'flows',
    title: '关键流程与时序',
    guidance: '主成功路径 + 失败路径的步骤序列：谁调谁、何时回滚、如何重试。'
  },
  {
    id: 'dependencies',
    title: '依赖与运行环境',
    guidance: '运行时、第三方库、平台限制、构建与部署方式。'
  },
  {
    id: 'risks',
    title: '风险与权衡',
    guidance: '已知风险、被否决的方案及原因、性能/安全边界。'
  },
  {
    id: 'milestones',
    title: '里程碑与验收',
    guidance: '分阶段交付物 + 每阶段可测的验收标准。'
  }
]

/**
 * 与策划书（GDD）的**输入映射**：TDD 回答「怎么实现」，素材来自 GDD 的哪些章。
 *
 * 依据 docs/game-doc-corpus-2026.md：gamedesigning.org 明确 GDD=what / TDD=how，
 * 机核 2026 三分 GDD/TDD/SDD，B 站《通关游戏设计之道》书摘写「技术需求很多内容会放在 TDD 里」。
 * 本项目已有独立 TDD 技能，此前 `techDocOutline` 只说「别复述 GDD」却没说从哪几章取输入，
 * 导致 GDD 与 TDD 在信息层是断开的。这段映射把两者串起来，不改任何数据结构。
 */
export const TECH_DOC_GDD_INPUTS: readonly { section: string; chapters: string }[] = [
  { section: '概述与目标', chapters: '产品愿景、范围界定（目标与非目标）' },
  { section: '架构总览', chapters: '游戏系统设计、技术规格（引擎/核心架构）' },
  { section: '模块划分', chapters: '游戏系统设计、功能/系统清单' },
  { section: '数据模型', chapters: '技术规格（数据表）、数值设计、经济系统设计' },
  { section: '接口与协议', chapters: '技术规格（联机模式/网络协议/存档格式）' },
  { section: '关键流程与时序', chapters: '核心玩法（核心循环）、游戏系统设计' },
  { section: '依赖与运行环境', chapters: '技术规格（第三方依赖/性能目标/目标设备）' },
  { section: '风险与权衡', chapters: '风险控制、技术规格（生产风险）' },
  { section: '里程碑与验收', chapters: '技术规格（开发里程碑）、MVP 规划（首个可玩版本验收节点）' }
]

/** 把章节渲染成 markdown 大纲（供模型照着写） */
export function techDocOutline(): string {
  const lines: string[] = ['# 技术设计文档大纲', '']
  lines.push('## 输入：先读策划书（GDD），不要凭空设计', '')
  lines.push('TDD 回答「怎么实现」，素材取自当前策划书的对应小节：', '')
  lines.push('| TDD 小节 | 对应 GDD 小节 |')
  lines.push('|---|---|')
  for (const item of TECH_DOC_GDD_INPUTS) lines.push(`| ${item.section} | ${item.chapters} |`)
  lines.push('')
  lines.push('写作要求：', '')
  lines.push('- 每章给出**可执行的实现细节**，不是复述 GDD 的设计描述；GDD 已写清的只引用、不重抄。')
  lines.push('- 发现 GDD 与实现冲突或 GDD 缺关键信息时，在「风险与权衡」里列出，并注明需要回写 GDD 的小节。')
  lines.push('- 在文档末尾写「来源小节」回链：逐条列出引用过的 GDD 小节名，方便双向追溯。')
  lines.push('')
  TECH_DOC_SECTIONS.forEach((section, index) => {
    lines.push(`## ${index + 1}. ${section.title}`)
    lines.push(`> ${section.guidance}`)
    lines.push('')
  })
  lines.push('按以上小节写作，每节给出可执行的实现细节（不是复述 GDD）。')
  return lines.join('\n').trimEnd()
}
