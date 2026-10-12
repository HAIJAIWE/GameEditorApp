import type { ChapterTemplate } from '../../../ceshu/ceshuTemplates'

export const marketAnalysisTemplates: ChapterTemplate[] = [
    {
      "name": "国产仙侠市场分析",
      "description": "国产仙侠 RPG 市场容量与竞品分析",
      "tags": [
        "仙侠",
        "市场",
        "国产"
      ],
      "data": {
        "target_market": "中国大陆为主（PC + 移动），港澳台同步上线；海外以日韩东南亚为主",
        "market_size": "国产仙侠 RPG 市场 2024 年规模约 80 亿，年增长率 8%；F2P 模式占比 70%，买断制 30%",
        "user_demographics": "年龄 18-35 岁（占 65%）；男性 60% / 女性 40%；一二线城市 55%，下沉市场增长迅速",
        "competitors": [
          {
            "name": "原神",
            "type": "开放世界",
            "strengths": "全球化运营",
            "weaknesses": "氪金重",
            "market_share": "30%"
          },
          {
            "name": "古剑奇谭",
            "type": "单机 RPG",
            "strengths": "剧情深厚",
            "weaknesses": "节奏慢",
            "market_share": "5%"
          },
          {
            "name": "鬼谷八荒",
            "type": "修真沙盒",
            "strengths": "创意",
            "weaknesses": "美术粗",
            "market_share": "3%"
          }
        ],
        "market_positioning": "差异化定位：剧情向 + 国风美术，避开开放世界红海，主打单机/轻网游体验",
        "entry_barriers": "1) 美术资产投入门槛高\n2) 仙侠 IP 用户忠诚度高\n3) 渠道发行资源集中",
        "market_trends": [
          {
            "trend": "国风美学复兴",
            "direction": "利好"
          },
          {
            "trend": "F2P 主导",
            "direction": "需适配"
          },
          {
            "trend": "短内容偏好",
            "direction": "需调整"
          }
        ],
        "kpi_forecast": {
          "dau": "20万",
          "mau": "100万",
          "retention_d1": "45%",
          "retention_d7": "20%",
          "arpu": "8元",
          "ltv": "120元"
        }
      }
    },
    {
      "name": "竞技 PVP 市场分析",
      "description": "5v5 竞技游戏市场分析",
      "tags": [
        "PVP",
        "竞技",
        "市场"
      ],
      "data": {
        "target_market": "全球市场（PC + 主机 + 移动）",
        "market_size": "全球竞技 PVP 市场 2024 年 200 亿美元，年增长 5%；MOBA + 战术竞技占 60%",
        "user_demographics": "年龄 16-30 岁（占 70%）；男性 75% / 女性 25%；电竞观众转化潜力大",
        "competitors": [
          {
            "name": "英雄联盟",
            "type": "MOBA",
            "strengths": "生态成熟",
            "weaknesses": "玩家老化",
            "market_share": "35%"
          },
          {
            "name": "瓦罗兰特",
            "type": "战术射击",
            "strengths": "新作红利",
            "weaknesses": "地区不平衡",
            "market_share": "8%"
          }
        ],
        "market_positioning": "差异化：地形可变机制 + 全英雄免费，主打公平竞技与战术深度",
        "entry_barriers": "1) 电竞生态门槛高\n2) 反外挂投入大\n3) 玩家社区运营复杂",
        "market_trends": [
          {
            "trend": "移动电竞增长",
            "direction": "机会"
          },
          {
            "trend": "跨界联动",
            "direction": "可借力"
          }
        ],
        "kpi_forecast": {
          "dau": "50万",
          "mau": "300万",
          "retention_d1": "50%",
          "retention_d7": "25%",
          "arpu": "5元",
          "ltv": "80元"
        }
      }
    }
  ]
