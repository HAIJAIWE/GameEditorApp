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
    guidance: '核心实体、字段、关系、持久化形态；与 GDD 数据表/策划书章节的映射。'
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

/** 把章节渲染成 markdown 大纲（供模型照着写） */
export function techDocOutline(): string {
  const lines: string[] = ['# 技术设计文档大纲', '']
  TECH_DOC_SECTIONS.forEach((section, index) => {
    lines.push(`## ${index + 1}. ${section.title}`)
    lines.push(`> ${section.guidance}`)
    lines.push('')
  })
  lines.push('按以上章节写作，每章给出可执行的实现细节（不是复述 GDD）。')
  return lines.join('\n').trimEnd()
}
