import type { ChapterTemplate } from '../ceshuTemplates'

export const riskHandlingTemplates: ChapterTemplate[] = [
    {
      "name": "全维度风险矩阵",
      "description": "技术/市场/团队/法律全维度风险矩阵",
      "tags": [
        "风险",
        "矩阵",
        "全维度"
      ],
      "data": {
        "risk_matrix": [
          {
            "risk": "核心人员流失",
            "probability": "中",
            "impact": "高",
            "mitigation": "股权激励 + 知识沉淀 + 双备份",
            "owner": "制作人"
          },
          {
            "risk": "美术外包延期",
            "probability": "高",
            "impact": "中",
            "mitigation": "多供应商 + 提前 2 个月启动",
            "owner": "美术总监"
          },
          {
            "risk": "性能不达标",
            "probability": "中",
            "impact": "高",
            "mitigation": "早期性能基线 + 持续监控",
            "owner": "技术总监"
          },
          {
            "risk": "市场风向变化",
            "probability": "中",
            "impact": "中",
            "mitigation": "敏捷调整 + 多版本预案",
            "owner": "制作人"
          },
          {
            "risk": "审核风险",
            "probability": "低",
            "impact": "高",
            "mitigation": "提前送审 + 内容合规",
            "owner": "运营"
          }
        ],
        "contingency_plan": "若 T+12M 未达 Beta：1) 削减支线 30%；2) 推迟上线 3 个月；3) 增派 QA",
        "technical_risks": [
          {
            "risk": "引擎性能瓶颈",
            "mitigation": "早期原型 + 性能基线"
          },
          {
            "risk": "联机架构不稳",
            "mitigation": "压力测试 + 弹性扩容"
          }
        ],
        "market_risks": [
          {
            "risk": "竞品提前上线",
            "mitigation": "差异化定位 + 快速迭代"
          },
          {
            "risk": "玩家偏好变化",
            "mitigation": "持续用户调研"
          }
        ],
        "team_risks": [
          {
            "risk": "核心人员流失",
            "mitigation": "股权 + 双备份"
          },
          {
            "risk": "团队扩张过快",
            "mitigation": "渐进式招聘 + 培训"
          }
        ],
        "legal_risks": [
          {
            "risk": "版权争议",
            "mitigation": "法务审查 + 自有 IP"
          },
          {
            "risk": "审核不通过",
            "mitigation": "内容合规 + 预审"
          }
        ],
        "monitoring": "1) 每周风险评审会\n2) 关键指标看板\n3) 月度风险报告"
      }
    }
  ]
