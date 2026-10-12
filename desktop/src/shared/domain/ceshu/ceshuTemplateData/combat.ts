import type { ChapterTemplate } from '../../../ceshu/ceshuTemplates'

export const combatTemplates: ChapterTemplate[] = [
    {
      "name": "仙侠即时战斗",
      "description": "即时动作 + 仙侠技能 + 剑心系统的战斗设计",
      "tags": [
        "仙侠",
        "即时",
        "动作"
      ],
      "data": {
        "combat_mode": "realtime",
        "damage_formula": "伤害 = (攻击 × 技能倍率 - 防御 × 0.5) × (1 + 暴击率 × 暴击伤害) × 五行克制",
        "skill_system": "普攻 + 4 主动技能 + 1 大招 + 剑心技能（觉醒）；技能可通过修炼升级",
        "buff_debuff": "Buff：剑意、灵气护体；Debuff：中毒、灼烧、定身、心魔",
        "element_system": "五行（金木水火土）相生相克，克制关系造成 1.5x 伤害",
        "combat_pace": "中等节奏，平均战斗时长 30-60 秒（小怪）/ 3-5 分钟（Boss）",
        "team_formation": "主角 + 2 队友，可切换控制；队友 AI 自动战斗",
        "pvp_design": "1v1 竞技场 + 3v3 团战；公平模式（属性平衡）+ 开放模式（带装备）",
        "pve_design": "主线战斗 + 秘境副本 + Boss 战 + 挑战模式",
        "boss_mechanics": "多阶段 + 弱点机制 + QTE 处决；Boss 有独特 AI 行为模式",
        "combat_progression": "新手：教学战 → 简单；中期：组合技；后期：高难度 Boss 战",
        "balance_strategy": "PVE 数值宽松，PVP 严格平衡；定期根据数据调整"
      }
    },
    {
      "name": "回合制战棋",
      "description": "经典回合制战棋战斗设计",
      "tags": [
        "回合制",
        "战棋",
        "策略"
      ],
      "data": {
        "combat_mode": "turn_based",
        "damage_formula": "伤害 = 攻击 × 技能倍率 × (1 - 防御 / (防御 + 100)) × 地形加成",
        "skill_system": "主动技能 + 被动技能 + 必杀技；技能点(SP)系统",
        "buff_debuff": "Buff：攻击提升、防御提升；Debuff：中毒、沉默、眩晕",
        "element_system": "光暗水火土五系，相克 1.3x",
        "combat_pace": "慢节奏，每回合 30 秒决策；平均战斗 10-15 回合",
        "team_formation": "5 人小队，按速度排序行动；位置影响技能范围",
        "pvp_design": "异步对战 + 排位赛；同等级属性对战",
        "pve_design": "剧情战 + 挑战关卡 + 无尽模式",
        "boss_mechanics": "多阶段 + 召唤小弟 + 机制技能（如沉默全场）",
        "combat_progression": "教学：单角色 → 3 人队 → 5 人队 → 高难度挑战",
        "balance_strategy": "严格数值平衡；PVE/PVP 分离数值"
      }
    }
  ]
