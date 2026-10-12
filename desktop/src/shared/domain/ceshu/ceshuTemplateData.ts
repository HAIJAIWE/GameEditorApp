/**
 * 章节模板数据池（由 Python src/data/chapter_templates_data.py 机械转换，勿手改）：
 * 17 章 / 34 个内置范例模板，字段与 CeshuModel.get_chapter(key) 对齐。
 * 数据本体按顶层 key 拆分到 ./ceshuTemplateData/ 子模块，本文件仅做组合。
 * 查询/合并逻辑见 shared/ceshu/ceshuTemplates.ts。
 *
 * ⚠️ 类型是 `Record<ChapterKey, …>`（**不是** `Record<string, …>`）：本表原本用宽类型，
 * 于是「worldview/characters 已合并为 story、本表却仍留旧键」时 **tsc 与测试全绿**，
 * 只有用户新建策划书取模板时才表现为「story 章没有范例」——静默降级。
 * 收紧后：任何章节增删/改名而漏配模板都会被 tsc 直接拦下。
 */
import type { ChapterTemplate } from '../../ceshu/ceshuTemplates'
import type { ChapterKey } from '../../ceshuConstants'
import { metaTemplates } from './ceshuTemplateData/meta'
import { visionTemplates } from './ceshuTemplateData/vision'
import { worldviewTemplates } from './ceshuTemplateData/worldview'
import { gameplayTemplates } from './ceshuTemplateData/gameplay'
import { systemsTemplates } from './ceshuTemplateData/systems'
import { numericTemplates } from './ceshuTemplateData/numeric'
import { artTemplates } from './ceshuTemplateData/art'
import { techTemplates } from './ceshuTemplateData/tech'
import { resourcesTemplates } from './ceshuTemplateData/resources'
import { marketAnalysisTemplates } from './ceshuTemplateData/market_analysis'
import { charactersTemplates } from './ceshuTemplateData/characters'
import { combatTemplates } from './ceshuTemplateData/combat'
import { economyTemplates } from './ceshuTemplateData/economy'
import { monetizationTemplates } from './ceshuTemplateData/monetization'
import { mvpTemplates } from './ceshuTemplateData/mvp'
import { riskHandlingTemplates } from './ceshuTemplateData/risk_handling'
import { audioTemplates } from './ceshuTemplateData/audio'
import { accessibilityTemplates } from './ceshuTemplateData/accessibility'

export const CHAPTER_TEMPLATES: Record<ChapterKey, ChapterTemplate[]> = {
  meta: metaTemplates,
  vision: visionTemplates,
  // 原 worldview + characters 两章已合并为 story ⇒ 模板池合并（两套范例都保留，模板总数不变）
  story: [...worldviewTemplates, ...charactersTemplates],
  gameplay: gameplayTemplates,
  systems: systemsTemplates,
  combat: combatTemplates,
  economy: economyTemplates,
  numeric: numericTemplates,
  art: artTemplates,
  audio: audioTemplates,
  tech: techTemplates,
  resources: resourcesTemplates,
  market_analysis: marketAnalysisTemplates,
  risk_handling: riskHandlingTemplates,
  monetization: monetizationTemplates,
  mvp: mvpTemplates,
  accessibility: accessibilityTemplates
}
