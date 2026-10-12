import type { ChapterTemplate } from '../ceshuTemplates'

export const accessibilityTemplates: ChapterTemplate[] = [
    {
      "name": "全平台可访问性",
      "description": "覆盖视觉/听觉/运动/认知的全维度可访问性",
      "tags": [
        "可访问性",
        "本地化",
        "无障碍"
      ],
      "data": {
        "language_list": [
          "zh-CN",
          "zh-TW",
          "en",
          "ja",
          "ko"
        ],
        "accessibility_features": [
          "字幕（对话/音效）",
          "色盲模式（红绿/蓝黄/全色盲）",
          "键位自定义",
          "手柄支持",
          "高对比度 UI",
          "字体大小调节",
          "语音朗读（菜单）",
          "震动反馈"
        ],
        "subtitle_design": "对话字幕：底部居中 + 说话人标识；音效字幕：右侧标注音效类型",
        "colorblind_support": "提供 3 种色盲模式，关键信息不依赖颜色区分",
        "input_customization": "全键位可重映射；支持手柄/键鼠/触屏",
        "difficulty_options": "故事/普通/困难/极难 4 档；可单独调整战斗/解谜难度",
        "motion_reduction": "可关闭镜头摇晃 + 闪烁特效 + 动态模糊",
        "text_to_speech": "菜单支持语音朗读（系统 TTS）",
        "regional_compliance": [
          "中国大陆：版号 + 内容合规",
          "欧盟：GDPR 数据合规",
          "日本：CERO 分级",
          "美国：ESRB 分级"
        ]
      }
    }
  ]
