import type { ChapterTemplate } from '../../../ceshu/ceshuTemplates'

export const mvpTemplates: ChapterTemplate[] = [
    {
      "name": "RPG MVP 三月规划",
      "description": "3 个月 RPG MVP 原型规划",
      "tags": [
        "MVP",
        "RPG",
        "原型"
      ],
      "data": {
        "mvp_scope": "核心战斗系统 + 1 个完整关卡 + 角色养成基础 + 主线第一章",
        "mvp_timeline": "T+0 至 T+3M：原型 Demo；T+3M 完成可玩 Demo 内部测试",
        "core_features": [
          "核心战斗循环",
          "角色升级",
          "1 个完整关卡",
          "基础 UI",
          "存档系统"
        ],
        "cut_features": [
          "多人联机",
          "PVP",
          "外观系统",
          "成就系统",
          "多语言"
        ],
        "prototype_features": [
          "战斗手感",
          "关卡流程",
          "数值平衡"
        ],
        "milestones": [
          {
            "name": "M1 战斗原型",
            "date": "T+1M",
            "deliverables": "可玩战斗 Demo",
            "acceptance": "手感达标"
          },
          {
            "name": "M2 关卡原型",
            "date": "T+2M",
            "deliverables": "1 关卡完整",
            "acceptance": "流程顺畅"
          },
          {
            "name": "M3 MVP 完成",
            "date": "T+3M",
            "deliverables": "可玩 Demo",
            "acceptance": "通过试玩评审"
          }
        ],
        "success_criteria": "1) 战斗手感评分 ≥ 4/5\n2) 关卡流程 ≤ 30min\n3) 试玩留存意愿 ≥ 60%",
        "team_size": 8,
        "budget_estimate": "150万（3 个月）",
        "risk_assessment": "中风险：核心战斗手感是关键，需多次迭代",
        "prototype_plan": "白盒关卡 + 占位美术，重点验证战斗与流程",
        "playtest_plan": "每周内部试玩 + T+3M 外部小范围测试（50 人）"
      }
    }
  ]
