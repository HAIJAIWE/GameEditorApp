import { SYSTEM_LABELS, type ChapterData, type ChapterKey } from './ceshuConstants'
import { SYSTEM_CONFIG_SCHEMA } from './systemConfigSchema'

/** 文档信息 + 16 章默认数据（自 Python ceshu_model.py _default_* 匹平迁移）；每次调用返回全新对象，避免共享可变引用 */

function today(): string {
  const d = new Date()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

/** 按 SYSTEM_CONFIG_SCHEMA 生成某系统的空 config（键顺序与 schema 一致，值全为 ''） */
function emptyConfig(systemKey: string): Record<string, unknown> {
  const config: Record<string, unknown> = {}
  for (const fieldName of Object.keys(SYSTEM_CONFIG_SCHEMA[systemKey])) {
    config[fieldName] = ''
  }
  return config
}

/** 13 个系统均默认 disabled，config 带标准字段（值为空字符串） */
function createDefaultSystems(): Record<string, unknown> {
  const systems: Record<string, unknown> = {}
  for (const [key, label] of Object.entries(SYSTEM_LABELS)) {
    systems[key] = { enabled: false, name: label, config: emptyConfig(key) }
  }
  return systems
}

export function createDefaultChapters(): Record<ChapterKey, ChapterData> {
  return {
    meta: {
      game_name: '',
      game_type: '',
      platform: [],
      positioning: '',
      tags: [],
      version: '0.1.0',
      date: today(),
      confidentiality: 'internal',
      status: 'draft'
    },
    vision: {
      design_vision: '',
      // potential 是匹平迁移的残留键：schema 无此字段、无任何代码引用，2026-10-23 清理
      user_personas: { primary: '', secondary: '' },
      competitive_analysis: [],
      differentiation: '',
      business_model: ''
    },
    // 原 worldview + characters 两章合并为 story（字段取并集）
    story: {
      architecture: '',
      history_eras: [],
      factions: [],
      geography: '',
      main_plot: '',
      branch_endings: [],
      character_network: [],
      protagonist: '',
      main_npc_count: 0,
      npc_list: [],
      antagonists: [],
      boss_design: [],
      enemy_types: [],
      companion_system: '',
      character_arcs: [],
      voice_cast: [],
      character_relationships: []
    },
    gameplay: {
      core_loop: '',
      control_scheme: '',
      first_30_min: '',
      game_modes: [],
      win_lose_conditions: '',
      tutorial_design: ''
    },
    systems: createDefaultSystems(),
    numeric: {
      core_formulas: '',
      growth_curves: [],
      drop_tables: [],
      economic_model: '',
      balance_principles: ''
    },
    art: {
      art_style: '',
      character_design: '',
      environment_design: '',
      ui_design_language: '',
      color_system: '',
      typography: '',
      vfx: '',
      animation: '',
      multi_resolution: ''
    },
    tech: {
      engine: '',
      core_architecture: '',
      third_party_deps: [],
      performance_targets: '',
      milestones: [],
      team_structure: '',
      qa_plan: ''
    },
    resources: {
      art_assets: [],
      audio_assets: [],
      localization: [],
      outsourcing: [],
      budget: {},
      risk_matrix: [],
      contingency_plan: '',
      ip: '',
      appendix: ''
    },
    market_analysis: {
      target_market: '',
      market_size: '',
      user_demographics: '',
      competitors: [],
      market_positioning: '',
      entry_barriers: '',
      market_trends: [],
      kpi_forecast: {}
    },
    combat: {
      combat_mode: '',
      damage_formula: '',
      skill_system: '',
      buff_debuff: '',
      element_system: '',
      combat_pace: '',
      team_formation: '',
      pvp_design: '',
      pve_design: '',
      boss_mechanics: '',
      combat_progression: '',
      balance_strategy: ''
    },
    economy: {
      currency_types: [],
      source_sink: '',
      drop_tables: [],
      production_chain: '',
      market_design: '',
      inflation_control: '',
      economic_goals: '',
      metrics_tracking: [],
      seasonal_adjustment: ''
    },
    monetization: {
      payment_model: '',
      pricing_tiers: [],
      iap_design: [],
      ad_strategy: '',
      subscription_design: '',
      season_pass: '',
      vip_system: '',
      limited_offers: '',
      whale_strategy: '',
      f2p_experience: '',
      revenue_forecast: {},
      arpu_target: ''
    },
    mvp: {
      mvp_scope: '',
      mvp_timeline: '',
      core_features: [],
      cut_features: [],
      prototype_features: [],
      milestones: [],
      success_criteria: '',
      team_size: 0,
      budget_estimate: '',
      risk_assessment: '',
      prototype_plan: '',
      playtest_plan: ''
    },
    risk_handling: {
      risk_matrix: [],
      contingency_plan: '',
      technical_risks: [],
      market_risks: [],
      team_risks: [],
      legal_risks: [],
      schedule_risks: [],
      risk_monitoring: '',
      escalation_path: '',
      crisis_management: ''
    },
    audio: {
      music_style: '',
      sfx_count: 0,
      soundtrack_list: [],
      sfx_list: [],
      voice_acting: '',
      audio_engine: '',
      dynamic_audio: '',
      audio_localization: '',
      audio_budget: '',
      audio_milestones: []
    },
    accessibility: {
      language_list: [],
      localization_strategy: '',
      cultural_adaptation: '',
      accessibility_features: [],
      subtitle_design: '',
      color_blind_support: '',
      motor_accessibility: '',
      cognitive_accessibility: '',
      rating_certification: [],
      compliance_notes: ''
    }
  }
}