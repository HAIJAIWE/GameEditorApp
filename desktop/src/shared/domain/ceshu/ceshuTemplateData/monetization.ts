import type { ChapterTemplate } from '../../../ceschu/ceshuTemplates'

export const monetizationTemplates: ChapterTemplate[] = [
    {
      "name": "F2P + 战令 + 外观",
      "description": "F2P 主流商业化设计",
      "tags": [
        "F2P",
        "战令",
        "外观"
      ],
      "data": {
        "payment_model": "f2p",
        "pricing_tiers": [
          "6",
          "30",
          "68",
          "128",
          "328",
          "648"
        ],
        "iap_design": [
          {
            "item": "月卡",
            "price": "30",
            "value": "每日钻石 + 即时钻石",
            "target": "稳定付费玩家"
          },
          {
            "item": "战令",
            "price": "68",
            "value": "赛季奖励",
            "target": "中端玩家"
          },
          {
            "item": "外观礼包",
            "price": "128",
            "value": "限定皮肤",
            "target": "外观党"
          }
        ],
        "ad_strategy": "无广告（F2P 主流方向）",
        "subscription_design": "月卡：30元，每日领取 + 即时钻石；季卡：88元，3个月",
        "season_pass": "战令：68元，100级奖励；免费线 30 级；付费线 100 级 + 隐藏奖励",
        "vip_system": "VIP 1-15，按累计充值升级；提供永久特权（不提供数值）",
        "limited_offers": "节日限定外观 + 周年庆礼包 + 联动礼包",
        "whale_strategy": "648 档位礼包 + 限定收集品 + 排行榜荣誉",
        "f2p_experience": "免费玩家可获取全部核心内容；付费仅加速 + 外观；无 P2W",
        "revenue_forecast": {
          "首月": "500万",
          "首年": "3000万",
          "arpu": "8元"
        },
        "arpu_target": "8元/月"
      }
    },
    {
      "name": "买断 + DLC",
      "description": "买断制 + DLC 商业化设计",
      "tags": [
        "买断",
        "DLC"
      ],
      "data": {
        "payment_model": "b2p",
        "pricing_tiers": [
          "标准版 198",
          "豪华版 298",
          "典藏版 498"
        ],
        "iap_design": [
          {
            "item": "DLC1",
            "price": "68",
            "value": "新章节 + 新角色",
            "target": "全玩家"
          },
          {
            "item": "DLC2",
            "price": "88",
            "value": "新剧情 + 新结局",
            "target": "剧情党"
          }
        ],
        "ad_strategy": "无广告",
        "subscription_design": "无订阅",
        "season_pass": "无战令",
        "vip_system": "无 VIP",
        "limited_offers": "周年庆折扣 + 联动礼包",
        "whale_strategy": "典藏版 + 实体周边",
        "f2p_experience": "无免费体验，提供试玩 Demo",
        "revenue_forecast": {
          "首月": "2000万（10万套）",
          "首年": "5000万"
        },
        "arpu_target": "198元（首购）+ 100元（DLC）"
      }
    }
  ]
