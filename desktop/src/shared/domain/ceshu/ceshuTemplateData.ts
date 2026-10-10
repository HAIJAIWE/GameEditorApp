/**
 * 章节模板数据池（由 Python src/data/chapter_templates_data.py 机械转换，勿手改）：
 * 18 章 / 34 个内置范例模板，字段与 CeshuModel.get_chapter(key) 对齐。
 * 数据本体按顶层 key 拆分到 ./ceshuTemplateData/ 子模块，本文件仅做组合。
 * 查询/合并逻辑见 shared/ceschu/ceshuTemplates.ts。
 */
import type { ChapterTemplate } from '../../ceschu/ceshuTemplates'
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

export const CHAPTER_TEMPLATES: Record<string, ChapterTemplate[]> = {
  meta: metaTemplates,
  vision: visionTemplates,
  worldview: worldviewTemplates,
  gameplay: gameplayTemplates,
  systems: systemsTemplates,
  numeric: numericTemplates,
  art: artTemplates,
  tech: techTemplates,
  resources: resourcesTemplates,
  market_analysis: marketAnalysisTemplates,
  characters: charactersTemplates,
  combat: combatTemplates,
  economy: economyTemplates,
  monetization: monetizationTemplates,
  mvp: mvpTemplates,
  risk_handling: riskHandlingTemplates,
  audio: audioTemplates,
  accessibility: accessibilityTemplates,
}
