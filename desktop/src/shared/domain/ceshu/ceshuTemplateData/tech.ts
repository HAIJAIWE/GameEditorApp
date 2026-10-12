import type { ChapterTemplate } from '../../../ceshu/ceshuTemplates'

export const techTemplates: ChapterTemplate[] = [
    {
      "name": "UE5 大型项目技术栈",
      "description": "虚幻引擎 5 的大型 RPG 项目技术规格",
      "tags": [
        "UE5",
        "RPG",
        "大型"
      ],
      "data": {
        "engine": "Unreal Engine 5.3",
        "core_architecture": "Gameplay Ability System + Lyra 项目结构 + 数据驱动配置（DataTable）",
        "third_party_deps": [
          "Wwise（音频）",
          "Apollo（热更新）",
          "Sentinel（监控）",
          "Protobuf（网络协议）"
        ],
        "performance_targets": "PC：2K 60fps；主机：4K 30fps / 1440p 60fps；移动端：1080p 30fps",
        "milestones": [
          {
            "name": "原型 Demo",
            "date": "T+3M",
            "deliverables": "核心战斗 + 1 关卡"
          },
          {
            "name": "Alpha",
            "date": "T+9M",
            "deliverables": "全部系统 + 5 关卡"
          },
          {
            "name": "Beta",
            "date": "T+15M",
            "deliverables": "全部内容 + 联机"
          },
          {
            "name": "正式上线",
            "date": "T+18M",
            "deliverables": "全平台发布"
          }
        ],
        "team_structure": "程序 15 / 美术 25 / 策划 10 / QA 5 / 运营 3，总 58 人",
        "qa_plan": "单元测试（核心系统）+ 自动化冒烟测试 + 每日构建 + 性能基线监控"
      }
    },
    {
      "name": "Unity 手游技术栈",
      "description": "Unity 引擎的手游项目技术规格",
      "tags": [
        "Unity",
        "手游",
        "中型"
      ],
      "data": {
        "engine": "Unity 2022 LTS",
        "core_architecture": "ECS + DOTS（核心战斗）+ Mono（UI/逻辑）+ YooAsset（热更新）",
        "third_party_deps": [
          "HybridCLR（热更）",
          "YooAsset（资源）",
          "Photon（联机）",
          "Bugly（崩溃）"
        ],
        "performance_targets": "中端机型：720p 30fps；高端机型：1080p 60fps；包体 < 500MB",
        "milestones": [
          {
            "name": "原型",
            "date": "T+2M",
            "deliverables": "核心循环 Demo"
          },
          {
            "name": "Alpha",
            "date": "T+6M",
            "deliverables": "全部系统 + 10 关卡"
          },
          {
            "name": "Beta",
            "date": "T+10M",
            "deliverables": "全内容 + 软启动"
          },
          {
            "name": "上线",
            "date": "T+12M",
            "deliverables": "全平台发布"
          }
        ],
        "team_structure": "程序 8 / 美术 12 / 策划 6 / QA 3，总 29 人",
        "qa_plan": "自动化 UI 测试 + 真机云测（50+ 机型）+ 性能分析报告"
      }
    }
  ]
