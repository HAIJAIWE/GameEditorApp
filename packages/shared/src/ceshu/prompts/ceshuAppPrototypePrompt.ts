import type { CeshuDocument } from '../reference'
import { chapterDataForDoc, chapterFieldsForDoc } from '../model'
import { displayFieldValue } from '../fields'
import { readText } from '../../util/io'

/**
 * 应用「试玩版」提示词：把应用 SDD → **单文件可点击的界面原型**。
 *
 * 与游戏 `buildDemoPrompt`（可玩 Demo）并列、互不复用：游戏要「可玩出来」（核心循环/状态机/
 * 数值 RULES/计时），应用要「可点出来」（多屏 + 导航 + 主流程 + 真实占位数据）。
 * 两者都把文档压成硬约束清单，避免模型自由发挥偏离文档。
 */
export interface AppPrototypePromptResult {
  system: string
  prompt: string
}

/** 应用档里对「界面原型」最有信息量的章（不塞架构/接口这类实现细节） */
const SECTIONS: ReadonlyArray<[chapter: string, title: string]> = [
  ['overview', '项目概述'],
  ['users', '目标用户与场景'],
  ['scope', '范围与非目标'],
  ['features', '功能清单'],
  ['flows', '核心流程'],
  ['interaction', '交互与界面']
]

/** 文档 → 界面原型提示词（无内容时也产出可用提示词，只是章节区为空） */
export function buildAppPrototypePrompt(doc: CeshuDocument): AppPrototypePromptResult {
  const meta = doc.meta as Record<string, unknown>
  const name =
    readText(meta.project_name) || readText(meta.game_name) || '未命名应用'
  const platform = Array.isArray(meta.platform)
    ? meta.platform.filter((item): item is string => typeof item === 'string').join('、')
    : ''
  const positioning = readText(meta.positioning) || ''

  const lines: string[] = []
  lines.push(`为「${name}」写一个**单文件、可点击的界面原型**（HTML）。`)
  if (positioning !== '') lines.push(`一句话定位：${positioning}`)
  if (platform !== '') lines.push(`目标平台：${platform}`)
  lines.push('')

  for (const [chapter, title] of SECTIONS) {
    const data = chapterDataForDoc(doc, chapter)
    const fields = chapterFieldsForDoc(doc, chapter)
    const rows: string[] = []
    for (const field of fields) {
      const value = displayFieldValue(field, data[field.key]).trim()
      if (value !== '') rows.push(`- ${field.label}：${value}`)
    }
    if (rows.length === 0) continue
    lines.push(`## ${title}`)
    lines.push(...rows)
    lines.push('')
  }

  lines.push(`## 硬约束（不满足即不可验收）
1. **单文件**：一个 .html，内联 CSS 与 JS，**零外部依赖**（不引 CDN / 框架 / 字体 / 图片），离线双击可用；
2. **多屏可点击**：至少 3 个页面，用顶部或侧边导航切换；不能只有一屏静态图；
3. **按文档走通主流程**：依据上面的「功能清单 / 核心流程 / 交互与界面」，把主要操作做成能点、能填、能切换；
4. **真实占位数据**：每屏用贴近真实业务的示例数据（如"张三 / 项目 A / 2026-11-07"），不要 lorem ipsum、不要空白；
5. **状态反馈**：按钮有禁用/加载态，表单有校验提示，至少覆盖「空 / 错 / 加载」中的一种状态；
6. **记忆**：当前页面与已填内容写 localStorage，刷新不丢；
7. **不发网络请求**：数据写死或本地模拟，不要 fetch/XHR；
8. **中文界面**，桌面 1280×900 内完整可用；
9. 页面必须有 **≥100 字可见文本** 与 **≥3 个可交互元素**（按钮 / 输入），否则验收判失败。`)

  return {
    system:
      '你是资深前端工程师与产品原型师。任务是把一份软件设计文档搭成**可直接点击体验**的单文件 HTML 界面原型。' +
      '严格遵守硬约束，不要解释、不要省略，只输出完整 HTML 源码（从 <!DOCTYPE html> 开始到 </html> 结束）。',
    prompt: lines.join('\n')
  }
}
