import type { ChapterTemplate } from '../ceshuTemplates'

export const gameplayTemplates: ChapterTemplate[] = [
    {
      "name": "仙侠开放世界玩法",
      "description": "开放世界 + 修真养成 + 剧情分支的核心循环",
      "tags": [
        "仙侠",
        "开放世界",
        "养成"
      ],
      "data": {
        "core_loop": "探索地图 → 完成剧情/支线 → 获取资源 → 修炼突破 → 解锁新区域 → 循环",
        "control_scheme": "键鼠：WASD 移动 + 鼠标视角 + 数字键技能；手柄：左摇杆移动 + 右摇杆视角 + ABXY 技能",
        "first_30_min": "1) 开场 CG（5min）2) 角色创建（5min）3) 新手村教学（15min）4) 第一个剧情分支（5min）",
        "game_modes": [
          "主线剧情",
          "支线任务",
          "秘境副本",
          "PVP 竞技场",
          "师门系统"
        ],
        "win_lose_conditions": "无传统胜负，以剧情结局为目标；PVP 模式以击杀/积分判胜",
        "tutorial_design": "情境式教学：融入新手村日常任务，玩家在'采药→炼丹→御剑'中自然学习操作"
      }
    },
    {
      "name": "竞技场 5v5 玩法",
      "description": "5v5 战术竞技场核心循环",
      "tags": [
        "PVP",
        "竞技",
        "5v5"
      ],
      "data": {
        "core_loop": "匹配 → Ban/Pick → 对线 → 团战 → 推塔 → 胜负判定 → 结算 → 循环",
        "control_scheme": "鼠标右键移动 + QWER 技能 + D/F 召唤师技能；视角锁定可切换",
        "first_30_min": "1) 新手教程（10min）2) 人机对战（15min）3) 解锁排位赛（5min）",
        "game_modes": [
          "快速匹配",
          "排位赛",
          "自定义房间",
          "训练模式",
          "观战模式"
        ],
        "win_lose_conditions": "摧毁对方核心水晶判胜；投降或时间到按积分判胜",
        "tutorial_design": "互动式教学：每个英雄有专属教程关卡，玩家操作中学习技能连招"
      }
    },
    {
      "name": "模拟经营玩法",
      "description": "店铺经营 + NPC 社交的核心循环",
      "tags": [
        "模拟经营",
        "休闲",
        "社交"
      ],
      "data": {
        "core_loop": "开店营业 → 接待 NPC → 收集故事 → 升级店铺 → 解锁新商品 → 循环",
        "control_scheme": "纯点击操作，移动端单手可玩；PC 端支持鼠标拖拽",
        "first_30_min": "1) 故事开场（5min）2) 店铺教学（10min）3) 第一位 NPC 故事（10min）4) 解锁第二件商品（5min）",
        "game_modes": [
          "经营模式",
          "故事模式",
          "节日活动",
          "好友互访"
        ],
        "win_lose_conditions": "无传统胜负，以收集度与故事进度为目标",
        "tutorial_design": "引导式教学：NPC 对话中提示操作，玩家自然学习经营机制"
      }
    }
  ]
