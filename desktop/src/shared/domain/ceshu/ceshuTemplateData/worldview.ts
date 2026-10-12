import type { ChapterTemplate } from '../../../ceshu/ceshuTemplates'

export const worldviewTemplates: ChapterTemplate[] = [
    {
      "name": "九重天世界观",
      "description": "经典仙侠九重天架构，含势力划分与主线",
      "tags": [
        "仙侠",
        "九重天",
        "势力"
      ],
      "data": {
        "architecture": "九重天架构：凡界、修真界、灵界、仙界、神界，每界有独立法则与生态。界与界之间以'界门'相通，受天道法则约束。",
        "history_eras": [
          {
            "name": "太古纪元",
            "desc": "神魔大战，天道初立"
          },
          {
            "name": "上古纪元",
            "desc": "人族崛起，修真界成形"
          },
          {
            "name": "近世纪元",
            "desc": "界门封印渐松，主角登场"
          }
        ],
        "factions": [
          {
            "name": "剑阁",
            "type": "正道",
            "goal": "守护界门"
          },
          {
            "name": "幽冥宗",
            "type": "魔道",
            "goal": "打破封印"
          },
          {
            "name": "云游散修",
            "type": "中立",
            "goal": "各自修行"
          }
        ],
        "geography": "凡界：九州大陆；修真界：五大仙山；灵界：灵脉汇聚之地；仙界：仙宫与仙山",
        "main_plot": "主角意外觉醒'剑心'，被卷入界门封印之争，在双主角视角下逐步揭开天道真相，最终抉择：维护旧序 / 重立新规。",
        "branch_endings": [
          "正道结局：剑斩天道",
          "魔道结局：以魔证道",
          "隐世结局：归隐云海"
        ],
        "character_network": [
          {
            "name": "主角",
            "camp": "可选",
            "relation": "玩家"
          },
          {
            "name": "苏婉清",
            "camp": "剑阁",
            "relation": "青梅竹马"
          },
          {
            "name": "魔尊",
            "camp": "幽冥宗",
            "relation": "宿敌 / 父亲"
          }
        ]
      }
    },
    {
      "name": "近未来赛博世界观",
      "description": "近未来都市赛博朋克世界观",
      "tags": [
        "科幻",
        "赛博",
        "都市"
      ],
      "data": {
        "architecture": "三层都市结构：上层穹顶区（权贵）、中层都市带（平民）、下层废弃区（流民与黑帮）。",
        "history_eras": [
          {
            "name": "黄金时代",
            "desc": "AI 与人类共荣"
          },
          {
            "name": "大崩溃",
            "desc": "AI 觉醒事件，技术断层"
          },
          {
            "name": "新秩序",
            "desc": "巨型企业接管，主角时代"
          }
        ],
        "factions": [
          {
            "name": "穹顶议会",
            "type": "统治",
            "goal": "维持秩序"
          },
          {
            "name": "夜行者",
            "type": "反抗",
            "goal": "推翻议会"
          },
          {
            "name": "黑市同盟",
            "type": "中立",
            "goal": "利益至上"
          }
        ],
        "geography": "新东京都：穹顶区 + 都市带 + 废弃区 + 周边荒野",
        "main_plot": "主角作为'记忆猎人'调查一起涉及穹顶议会的阴谋，逐步揭开自己被植入的虚假记忆，最终抉择真相与秩序。",
        "branch_endings": [
          "真相结局：揭露阴谋",
          "秩序结局：维护现状",
          "复仇结局：焚毁穹顶"
        ],
        "character_network": [
          {
            "name": "主角 K",
            "camp": "夜行者",
            "relation": "玩家"
          },
          {
            "name": "艾娃",
            "camp": "黑市",
            "relation": "搭档"
          },
          {
            "name": "议会议长",
            "camp": "穹顶",
            "relation": "最终 BOSS"
          }
        ]
      }
    },
    {
      "name": "架空中世纪世界观",
      "description": "架空中世纪奇幻世界观，含王国纷争",
      "tags": [
        "奇幻",
        "中世纪",
        "王国"
      ],
      "data": {
        "architecture": "三大陆架结构：北境王国、中央帝国、南域联邦，由龙脊山脉分隔。",
        "history_eras": [
          {
            "name": "神话时代",
            "desc": "巨龙与神祇共治"
          },
          {
            "name": "建国时代",
            "desc": "人类王国并立"
          },
          {
            "name": "战乱时代",
            "desc": "王权更迭，主角时代"
          }
        ],
        "factions": [
          {
            "name": "银盾王国",
            "type": "正面",
            "goal": "恢复统一"
          },
          {
            "name": "黑鹰帝国",
            "type": "反派",
            "goal": "征服大陆"
          },
          {
            "name": "法师议会",
            "type": "中立",
            "goal": "守护魔法"
          }
        ],
        "geography": "北境冰原、中央平原、南域森林与群岛、龙脊山脉",
        "main_plot": "主角作为银盾王国遗孤，召集同伴对抗黑鹰帝国，途中揭开自己身世与古代龙之契约的真相。",
        "branch_endings": [
          "王者结局：复国称王",
          "龙裔结局：契约觉醒",
          "游侠结局：归隐山林"
        ],
        "character_network": [
          {
            "name": "主角",
            "camp": "银盾",
            "relation": "玩家"
          },
          {
            "name": "法师艾琳",
            "camp": "议会",
            "relation": "导师"
          },
          {
            "name": "黑鹰王",
            "camp": "黑鹰",
            "relation": "宿敌"
          }
        ]
      }
    }
  ]
