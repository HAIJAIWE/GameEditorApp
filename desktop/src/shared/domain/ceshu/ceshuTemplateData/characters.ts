import type { ChapterTemplate } from '../../../ceschu/ceshuTemplates'

export const charactersTemplates: ChapterTemplate[] = [
    {
      "name": "仙侠角色设计",
      "description": "仙侠题材主角 + NPC + 反派角色设计",
      "tags": [
        "仙侠",
        "角色",
        "反派"
      ],
      "data": {
        "protagonist": "主角：青年剑修，剑眉星目，觉醒'剑心'。背景：剑阁弃徒之子，性格坚韧但内心柔软，配音采用青年男声/女声双版本。",
        "main_npc_count": 8,
        "npc_list": [
          {
            "name": "苏婉清",
            "role": "青梅竹马",
            "location": "剑阁",
            "personality": "温柔坚定",
            "quest_hook": "剑阁内乱"
          },
          {
            "name": "玄机子",
            "role": "导师",
            "location": "云游",
            "personality": "玩世不恭",
            "quest_hook": "上古秘辛"
          }
        ],
        "antagonists": [
          {
            "name": "魔尊",
            "motivation": "打破界门封印",
            "relation": "主角生父"
          }
        ],
        "boss_design": [
          {
            "name": "剑魔",
            "mechanics": "三阶段剑意",
            "phases": 3,
            "rewards": "剑心觉醒"
          },
          {
            "name": "天劫",
            "mechanics": "雷劫 QTE",
            "phases": 1,
            "rewards": "突破境界"
          }
        ],
        "enemy_types": [
          "魔修",
          "妖兽",
          "傀儡",
          "心魔"
        ],
        "companion_system": "可招募 2 名队友，提供不同战斗风格与剧情支线",
        "character_arcs": [
          {
            "name": "主角",
            "arc": "弃徒 → 剑修 → 觉醒 → 抉择"
          },
          {
            "name": "苏婉清",
            "arc": "剑阁弟子 → 内乱 → 觉醒 / 堕落"
          }
        ],
        "voice_cast": [
          {
            "role": "主角",
            "actor": "待定"
          },
          {
            "role": "苏婉清",
            "actor": "待定"
          }
        ],
        "character_relationships": [
          {
            "from": "主角",
            "to": "魔尊",
            "type": "父子 / 仇敌"
          },
          {
            "from": "主角",
            "to": "苏婉清",
            "type": "青梅"
          }
        ]
      }
    }
  ]
