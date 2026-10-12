import type { ChapterTemplate } from '../ceshuTemplates'

export const resourcesTemplates: ChapterTemplate[] = [
    {
      "name": "中型项目资源规划",
      "description": "中型 RPG 项目的资源、预算与风险规划",
      "tags": [
        "资源",
        "预算",
        "风险"
      ],
      "data": {
        "art_assets": [
          {
            "type": "角色",
            "count": 50,
            "outsource": "30%"
          },
          {
            "type": "场景",
            "count": 20,
            "outsource": "20%"
          },
          {
            "type": "道具",
            "count": 500,
            "outsource": "50%"
          },
          {
            "type": "特效",
            "count": 200,
            "outsource": "40%"
          }
        ],
        "audio_assets": [
          {
            "type": "BGM",
            "count": 30,
            "duration_min": 90
          },
          {
            "type": "SFX",
            "count": 500,
            "duration_min": 30
          },
          {
            "type": "配音",
            "count": 1000,
            "duration_min": 300
          }
        ],
        "localization": [
          "zh-CN",
          "zh-TW",
          "en",
          "ja"
        ],
        "outsourcing": [
          {
            "item": "场景美术",
            "vendor": "待定",
            "budget": "50万"
          },
          {
            "item": "动作捕捉",
            "vendor": "待定",
            "budget": "20万"
          }
        ],
        "budget": {
          "人力": "1500万（18个月）",
          "美术外包": "300万",
          "音频": "100万",
          "服务器": "50万",
          "营销": "200万",
          "总计": "2150万"
        },
        "risk_matrix": [
          {
            "risk": "核心人员流失",
            "probability": "中",
            "impact": "高",
            "mitigation": "股权激励 + 知识沉淀"
          },
          {
            "risk": "美术外包延期",
            "probability": "高",
            "impact": "中",
            "mitigation": "多供应商 + 提前启动"
          },
          {
            "risk": "技术风险（性能）",
            "probability": "中",
            "impact": "高",
            "mitigation": "早期性能基线"
          }
        ],
        "contingency_plan": "若 T+12M 未达 Beta：1) 削减支线内容 30%；2) 推迟上线 3 个月；3) 增派 QA 资源",
        "ip": "全部资产自有 IP，外包合同明确转让条款",
        "appendix": "供应商清单、合同模板、资产清单详见附件"
      }
    }
  ]
