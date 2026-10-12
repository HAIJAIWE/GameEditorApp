import type { ChapterTemplate } from '../../../ceshu/ceshuTemplates'

export const audioTemplates: ChapterTemplate[] = [
    {
      "name": "国风音乐设计",
      "description": "国风乐器 + 现代编曲的音频设计",
      "tags": [
        "国风",
        "音乐",
        "音效"
      ],
      "data": {
        "music_style": "国风 + 现代管弦编曲；古琴、箫、二胡为主，配合弦乐与合成器",
        "sfx_count": 500,
        "music_tracks": [
          {
            "scene": "主菜单",
            "style": "古琴独奏",
            "duration": "3min"
          },
          {
            "scene": "战斗",
            "style": "快速鼓点 + 琵琶",
            "duration": "2min"
          },
          {
            "scene": "剧情",
            "style": "箫 + 弦乐",
            "duration": "5min"
          }
        ],
        "voice_count": 1000,
        "audio_engine": "Wwise",
        "adaptive_music": "战斗音乐根据战斗强度动态切换层（探索/接触/激战）",
        "sfx_design": "剑招音效参考真实剑鸣；法术音效结合自然元素（雷、火、水）",
        "localization_audio": [
          "zh-CN 配音",
          "ja 配音",
          "en 字幕"
        ]
      }
    },
    {
      "name": "电子音乐设计",
      "description": "电子 + 合成器的赛博朋克音频设计",
      "tags": [
        "电子",
        "赛博",
        "音效"
      ],
      "data": {
        "music_style": "合成器电子 + 工业噪音；营造赛博朋克冷峻氛围",
        "sfx_count": 800,
        "music_tracks": [
          {
            "scene": "都市",
            "style": "Synthwave",
            "duration": "4min"
          },
          {
            "scene": "战斗",
            "style": "Industrial",
            "duration": "3min"
          }
        ],
        "voice_count": 1500,
        "audio_engine": "Wwise",
        "adaptive_music": "根据地区切换音轨层（穹顶/都市/废弃区）",
        "sfx_design": "枪械音效参考真实武器；UI 音效采用故障音 + 数字音",
        "localization_audio": [
          "en 配音",
          "ja 配音",
          "zh-CN 配音"
        ]
      }
    }
  ]
