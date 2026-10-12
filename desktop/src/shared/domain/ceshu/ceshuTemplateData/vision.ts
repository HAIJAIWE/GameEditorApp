import type { ChapterTemplate } from '../../../ceshu/ceshuTemplates'

export const visionTemplates: ChapterTemplate[] = [
    {
      "name": "仙侠沉浸式愿景",
      "description": "强调东方美学与剧情沉浸的设计愿景",
      "tags": [
        "仙侠",
        "剧情",
        "美学"
      ],
      "data": {
        "design_vision": "以东方仙侠美学为核心，构建一个有温度、有诗意的修真世界。玩家在云海、剑阁、幽谷间体验修仙者的修行、情劫与抉择，用现代游戏语言重新讲述中国古典文化中的'道'与'人'。",
        "user_personas": {
          "primary": "25-35 岁，偏好剧情向 RPG 的国产单机/MMO 玩家，对仙侠文化有认同感",
          "secondary": "18-24 岁，受动漫/网文影响接触仙侠题材的年轻玩家",
          "potential": "海外对中国文化感兴趣的玩家（需本地化适配）"
        },
        "differentiation": "1) 独创'剑心'系统：玩家抉择影响剑道走向\n2) 国风美术：实机渲染 + 水墨滤镜\n3) 剧情分支：双主角多结局，重玩价值高",
        "business_model": "F2P + 外观付费 + 季票，避免 P2W"
      }
    },
    {
      "name": "竞技 PVP 愿景",
      "description": "公平竞技为核心的产品愿景",
      "tags": [
        "PVP",
        "竞技",
        "公平"
      ],
      "data": {
        "design_vision": "打造 5v5 战术竞技场，强调团队配合与战术深度。通过严格的平衡性设计与反外挂机制，提供公平、深度的竞技体验。",
        "user_personas": {
          "primary": "20-30 岁竞技游戏爱好者，追求操作与策略深度",
          "secondary": "电竞观众转化玩家",
          "potential": "职业电竞选手与战队"
        },
        "differentiation": "1) 全英雄免费，仅外观付费\n2) Ban/Pick 阶段加入地形可变机制\n3) 赛季制排名 + 俱乐部联赛",
        "business_model": "F2P + 战令 + 外观 + 赛事赞助"
      }
    },
    {
      "name": "休闲治愈愿景",
      "description": "面向女性向与轻度玩家的治愈系愿景",
      "tags": [
        "休闲",
        "治愈",
        "女性向"
      ],
      "data": {
        "design_vision": "用柔和色彩与治愈音效，营造一个可以慢下来的小镇世界。玩家经营店铺、结交 NPC、收集故事，体验'慢生活'的温度。",
        "user_personas": {
          "primary": "20-35 岁女性玩家，偏好模拟经营与社交",
          "secondary": "学生党，碎片化时间游玩",
          "potential": "海外治愈系游戏爱好者"
        },
        "differentiation": "1) 真实季节系统，节日活动持续全年\n2) NPC 自主生活 AI，每天有不同故事\n3) 跨平台同步，手机/PC 进度互通",
        "business_model": "F2P + 月卡 + 限定外观 + DLC"
      }
    }
  ]
