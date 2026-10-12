import type { ChapterTemplate } from '../../../ceshu/ceshuTemplates'

export const economyTemplates: ChapterTemplate[] = [
    {
      "name": "F2P 三货币体系",
      "description": "F2P 游戏标准三货币经济体系",
      "tags": [
        "F2P",
        "货币",
        "经济"
      ],
      "data": {
        "currency_types": [
          {
            "name": "金币",
            "source": "任务/副本/卖出",
            "sink": "强化/消耗品",
            "exchange_rate": "不可兑换"
          },
          {
            "name": "钻石",
            "source": "充值/活动",
            "sink": "抽卡/外观",
            "exchange_rate": "1元=10钻石"
          },
          {
            "name": "友情点",
            "source": "好友互动",
            "sink": "友情抽卡",
            "exchange_rate": "不可兑换"
          }
        ],
        "source_sink": "产出：主线 40% + 副本 30% + 任务 20% + 活动 10%；回收：强化 50% + 消耗品 30% + 外观 20%",
        "drop_tables": [
          {
            "item": "金币袋(小)",
            "rate": "50%",
            "value": "100"
          },
          {
            "item": "金币袋(大)",
            "rate": "5%",
            "value": "1000"
          },
          {
            "item": "钻石",
            "rate": "1%",
            "value": "10"
          }
        ],
        "production_chain": "材料 → 装备 → 强化 → 高级装备（多级合成链）",
        "market_design": "玩家交易行（限制可交易物品）+ 拍卖行（稀有物品）",
        "inflation_control": "1) 等级锁定金币产出上限\n2) 强化失败回收金币\n3) 限时活动大额回收",
        "economic_goals": "免费玩家：可获取全部内容；付费玩家：加速进度；运营：ARPU 8元",
        "metrics_tracking": [
          "金币产出/回收比",
          "钻石消耗率",
          "留存与付费相关性"
        ],
        "seasonal_adjustment": "新赛季引入新消耗品（外观/通行证），回收上季囤积"
      }
    }
  ]
