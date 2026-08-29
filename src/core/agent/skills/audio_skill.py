from __future__ import annotations

import os
from pathlib import Path
import tempfile

from common.logger import get_logger
from core.agent.skill_protocol import BaseSkill
from core.agent.skills.common import normalize_params


class AudioSkill(BaseSkill):
    name = "tool.audio"
    description = "音频处理: 语音合成(TTS)/语音输入/音频转录"
    version = "1.1.0"
    parameters = [
        {"name": "action", "required": True, "type": "string",
         "enum": ["synthesize", "preview", "voices", "info",
                  "listen", "listen_background", "transcribe", "record", "record_transcribe"],
         "description": "synthesize=合成语音, preview=试听, voices=声音列表, info=API信息, "
                        "listen=监听识别, listen_background=后台监听, transcribe=转录音频, "
                        "record=录音保存, record_transcribe=录音+识别"},
        {"name": "text", "required": False, "type": "string", "description": "要合成的文本(synthesize/preview)"},
        {"name": "voice", "required": False, "type": "string",
         "enum": ["xiaoxiao", "yunyang", "xiaoyi", "yunjian", "yunxi", "xiaobei",
                  "alloy", "echo", "fable", "onyx", "nova", "shimmer"],
         "description": "声音选择"},
        {"name": "speed", "required": False, "type": "number", "description": "语速 (0.5-2.0)"},
        {"name": "pitch", "required": False, "type": "number", "description": "音调 (-20到20)"},
        {"name": "output_path", "required": False, "type": "string", "description": "输出文件路径(可选)"},
        {"name": "format", "required": False, "type": "string",
         "enum": ["mp3", "wav", "ogg"],
         "description": "输出格式"},
        {"name": "duration", "required": False, "type": "integer", "description": "监听秒数(默认5)"},
        {"name": "language", "required": False, "type": "string",
         "enum": ["zh-CN", "en-US"],
         "description": "语言代码(默认 zh-CN)"},
        {"name": "filepath", "required": False, "type": "string", "description": "音频文件路径(transcribe)"},
    ]
    tags = ["tts", "voice", "audio", "speech", "microphone", "narration"]

    VOICE_DESCRIPTIONS = {
        "xiaoxiao": "小晓 - 年轻女性，活泼（中文）",
        "yunyang": "云扬 - 成熟男性，稳重（中文）",
        "xiaoyi": "小艺 - 年轻女性，可爱（中文）",
        "yunjian": "云建 - 成熟男性，专业（中文）",
        "yunxi": "云希 - 年轻男性（中文）",
        "xiaobei": "小贝 - 年轻女性（中文）",
        "alloy": "Alloy - 中性英文",
        "echo": "Echo - 男性英文",
        "fable": "Fable - 英式英文",
        "onyx": "Onyx - 深沉男性英文",
        "nova": "Nova - 女性英文",
        "shimmer": "Shimmer - 明亮女性英文",
    }

    def execute(self, params: dict, context: dict) -> dict:
        params = normalize_params(params)
        self._logger = get_logger()
        action = params.get("action", "info")

        try:
            # === TTS 相关 ===
            if action == "info":
                return self._show_tts_info()
            elif action == "voices":
                return self._list_voices()
            elif action == "synthesize":
                return self._synthesize(params)
            elif action == "preview":
                return self._preview_tts(params)

            # === 语音输入相关 ===
            elif action == "listen":
                return self._speech_listen(params)
            elif action == "listen_background":
                return self._speech_listen_background(params)
            elif action == "transcribe":
                return self._speech_transcribe(params)
            elif action == "record":
                return self._speech_record(params)
            elif action == "record_transcribe":
                return self._speech_record_transcribe(params)

            else:
                return {"success": False, "error": f"未知 action: {action}", "message": ""}
        except Exception as e:
            self._logger.error(f"AudioSkill 异常: {e}", exc_info=True)
            return {"success": False, "error": str(e), "message": ""}

    # ========== TTS 语音合成 (原 TTSSkill) ==========

    def _show_tts_info(self) -> dict:
        info = (
            "语音合成支持以下方式:\n"
            "1. Edge-TTS (微软): 免费中文语音，pip install edge-tts\n"
            "2. OpenAI TTS: 高质量英文语音，需API密钥\n"
            "3. Azure Speech: 企业级多语言，需Azure订阅\n"
            "4. 本地 pyttsx3: 离线引擎，pip install pyttsx3\n\n"
            "Edge-TTS 为默认引擎（免费），自动降级到 pyttsx3。"
        )
        return {"success": True, "message": info, "data": {"engines": ["edge-tts", "openai", "azure", "pyttsx3"]}}

    def _list_voices(self) -> dict:
        voices = [{"id": k, "description": v} for k, v in self.VOICE_DESCRIPTIONS.items()]
        return {"success": True, "message": f"共 {len(voices)} 个声音", "data": {"voices": voices}}

    def _synthesize(self, params: dict) -> dict:
        text = params.get("text", params.get("prompt", ""))
        if not text:
            return {"success": False, "error": "缺少 text 参数", "message": ""}

        voice = params.get("voice", "xiaoxiao")
        speed = float(params.get("speed", 1.0))
        pitch = int(params.get("pitch", 0))
        fmt = params.get("format", "mp3")
        output = params.get("output_path", "")

        if not (0.5 <= speed <= 2.0):
            speed = 1.0
        if not (-20 <= pitch <= 20):
            pitch = 0

        if not output:
            out_dir = Path.cwd() / "exports" / "audio"
            out_dir.mkdir(parents=True, exist_ok=True)
            safe_name = text[:30].replace("/", "_").replace("\\", "_").replace(":", "_")
            output = str(out_dir / f"tts_{safe_name}_{voice}.{fmt}")

        result = self._try_edge_tts(text, voice, speed, pitch, output, fmt)
        if not result.get("success"):
            result = self._try_pyttsx3(text, output, fmt)

        return result

    def _try_edge_tts(self, text, voice, speed, pitch, output, fmt):
        """Edge-TTS 合成 — 修复:
        1. pitch 参数透传（之前硬编码 +0Hz）
        2. rate 拼接逻辑：speed=1.0 不带 + 前缀
        3. ImportError 不会触发（edge_tts 是子进程模块），改为 FileNotFoundError 兜底
        """
        import subprocess
        import sys
        # rate 格式: edge-tts 接受 "+50%" / "-50%" / "0%"
        rate_pct = int((speed - 1) * 100)
        rate = f"{'+' if rate_pct > 0 else ''}{rate_pct}%"
        # pitch 格式: edge-tts 接受 "+10Hz" / "-10Hz" / "+0Hz"
        pitch_hz = max(-20, min(20, int(pitch)))
        pitch_arg = f"{'+' if pitch_hz >= 0 else ''}{pitch_hz}Hz"

        voices_dir = Path(tempfile.gettempdir()) / "tts_voices"
        voices_dir.mkdir(exist_ok=True)

        try:
            r = subprocess.run(
                [sys.executable, "-m", "edge_tts", "--voice", f"zh-CN-{voice.capitalize()}Neural",
                 "--text", text, "--write-media", output,
                 "--rate", rate, "--pitch", pitch_arg],
                capture_output=True, text=True, timeout=120
            )
            if r.returncode == 0 and os.path.exists(output):
                size = os.path.getsize(output)
                return {"success": True,
                        "message": f"语音已生成: {output} ({size} bytes)",
                        "data": {"path": output, "size": size, "rate": rate, "pitch": pitch_arg}}
            raise Exception(r.stderr or "edge-tts failed")
        except FileNotFoundError:
            # edge_tts 模块未安装时会以 FileNotFoundError (python -m edge_tts 找不到) 或 exit code 1 形式失败
            return {"success": False, "error": "未安装 edge-tts, pip install edge-tts", "message": ""}
        except subprocess.TimeoutExpired:
            return {"success": False, "error": "edge-tts 执行超时(120s)", "message": ""}
        except Exception as e:
            # 检查 stderr 是否包含 ModuleNotFoundError 提示
            err_msg = str(e)
            if "No module named" in err_msg or "edge_tts" in err_msg.lower():
                return {"success": False, "error": "未安装 edge-tts, pip install edge-tts", "message": ""}
            return {"success": False, "error": err_msg, "message": ""}

    def _try_pyttsx3(self, text, output, fmt):
        try:
            import pyttsx3
            engine = pyttsx3.init()
            engine.save_to_file(text, output)
            engine.runAndWait()
            engine.stop()
            if os.path.exists(output):
                size = os.path.getsize(output)
                return {"success": True,
                        "message": f"语音已生成(pyttsx3): {output} ({size} bytes)", "data": {"path": output, "size": size}}
            raise Exception("文件未生成")
        except ImportError:
            return {"success": False, "error": "未安装 pyttsx3, pip install pyttsx3", "message": ""}
        except Exception as e:
            return {"success": False, "error": str(e), "message": ""}

    def _preview_tts(self, params: dict) -> dict:
        text = params.get("text", "这是一段语音试听")
        import webbrowser
        text_short = text[:100]
        webbrowser.open("https://ttsmp3.com/")
        return {"success": True,
                "message": f"已打开在线TTS工具，请粘贴文本试听: {text_short}",
                "data": {"text": text_short}}

    # ========== 语音输入 (原 SpeechInputSkill) ==========

    def _speech_listen(self, params) -> dict:
        from core.agent.speech_service import SpeechService
        ss = SpeechService.get_instance()
        duration = int(params.get("duration", 5))
        language = params.get("language", "zh-CN")
        return ss.listen(duration=duration, language=language)

    def _speech_listen_background(self, params) -> dict:
        from core.agent.speech_service import SpeechService
        ss = SpeechService.get_instance()
        duration = int(params.get("duration", 5))
        language = params.get("language", "zh-CN")

        def _on_result(text: str):
            self._logger.info(f"[AudioSkill] 后台识别: {text}")

        return ss.listen_background(_on_result, duration=duration, language=language)

    def _speech_transcribe(self, params) -> dict:
        from core.agent.speech_service import SpeechService
        ss = SpeechService.get_instance()
        filepath = params.get("filepath", "")
        if not filepath:
            return {"success": False, "error": "缺少 filepath", "message": "", "text": ""}
        language = params.get("language", "zh-CN")
        return ss.transcribe_file(filepath, language=language)

    def _speech_record(self, params) -> dict:
        from core.agent.speech_service import SpeechService
        ss = SpeechService.get_instance()
        duration = int(params.get("duration", 5))
        filepath = params.get("filepath", "")
        return ss.record_and_save(duration=duration, filepath=filepath)

    def _speech_record_transcribe(self, params) -> dict:
        from core.agent.speech_service import SpeechService
        ss = SpeechService.get_instance()
        duration = int(params.get("duration", 5))
        language = params.get("language", "zh-CN")
        return ss.record_and_transcribe(duration=duration, language=language)
