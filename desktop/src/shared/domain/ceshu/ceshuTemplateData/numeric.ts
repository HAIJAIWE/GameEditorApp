import type { ChapterTemplate } from '../../../ceschu/ceshuTemplates'

export const numericTemplates: ChapterTemplate[] = [
    {
      "name": "RPG 经典数值公式",
      "description": "等级 + 攻防 + 暴击的经典 RPG 数值体系",
      "tags": [
        "RPG",
        "公式",
        "平衡"
      ],
      "data": {
        "core_formulas": "伤害 = (攻击力 - 防御力 × 0.6) × 技能倍率 × (1 + 暴击伤害 × 暴击率)\n经验需求 = 80 × 等级 ^ 1.5\n属性成长 = 基础值 × (1 + 等级 × 成长系数)",
        "growth_curves": [
          {
            "name": "等级-属性",
            "curve": "线性 + 软上限"
          },
          {
            "name": "经验-等级",
            "curve": "幂函数 1.5"
          },
          {
            "name": "金币-产出",
            "curve": "对数增长"
          }
        ],
        "drop_tables": [
          {
            "item": "普通装备",
            "rate": "30%",
            "tier": "白"
          },
          {
            "item": "稀有装备",
            "rate": "5%",
            "tier": "蓝"
          },
          {
            "item": "传说装备",
            "rate": "0.5%",
            "tier": "橙"
          }
        ],
        "economic_model": "金币产出 = 主线(40%) + 副本(30%) + 任务(20%) + 其他(10%)；金币回收 = 装备强化(50%) + 消耗品(30%) + 外观(20%)",
        "balance_principles": "1) PVE 数值宽松，玩家体验优先\n2) PVP 数值严格控制，避免 P2W\n3) 长尾成长：满级后属性缓慢增长，避免数值膨胀"
      }
    },
    {
      "name": "抽卡概率设计",
      "description": "抽卡游戏的概率与保底数值设计",
      "tags": [
        "抽卡",
        "概率",
        "保底"
      ],
      "data": {
        "core_formulas": "SSR 概率 = 1%（基础）+ 累计 90 抽保底\nUP 角色 = 50% 大保底（180 抽必出）\n武器池 = 0.7% + 80 抽保底",
        "growth_curves": [
          {
            "name": "玩家留存-概率",
            "curve": "前 50 抽高体验，后段回归基础概率"
          }
        ],
        "drop_tables": [
          {
            "item": "SSR 角色",
            "rate": "1%",
            "tier": "金"
          },
          {
            "item": "SR 武器",
            "rate": "8%",
            "tier": "紫"
          },
          {
            "item": "R 材料",
            "rate": "91%",
            "tier": "蓝"
          }
        ],
        "economic_model": "免费玩家月均获取 30 抽；付费玩家月均 100 抽；鲸鱼玩家月均 500+ 抽",
        "balance_principles": "1) 保底机制透明公示\n2) 免费玩家可获取全部核心内容\n3) 付费仅加速进度，不锁定内容"
      }
    }
  ]
