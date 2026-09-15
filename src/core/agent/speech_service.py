from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
import threading
from typing import Any, Optional

from common.logger import get_logger

logger = get_logger()


class SpeechService:
    _instance: Optional[SpeechService] = None
    _lock = threading.Lock()

    def __init__(self):
        self._logger = get_logger()
        self._listening = False
        self._audio_buffer: list[bytes] = []
        self._has_sr = False
        self._has_pyaudio = False
        self._check_dependencies()

    @classmethod
    def get_instance(cls) -> SpeechService:
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def _check_dependencies(self):
        import importlib.util

        if importlib.util.find_spec("speech_recognition"):
            self._has_sr = True
            self._logger.info("[Speech] SpeechRecognition 已就绪")
        else:
            self._logger.info("[Speech] SpeechRecognition 未安装, pip install SpeechRecognition")

        if importlib.util.find_spec("pyaudio"):
            self._has_pyaudio = True
            self._logger.info("[Speech] PyAudio 已就绪")
        else:
            self._logger.info("[Speech] PyAudio 未安装, pip install pyaudio")

    @property
    def is_available(self) -> bool:
        return self._has_sr

    def listen(self, duration: int = 5, language: str = "zh-CN") -> dict:
        if not self._has_sr:
            return {"success": False, "error": "需要安装 SpeechRecognition: pip install SpeechRecognition", "message": "", "text": ""}

        import speech_recognition as sr
        recognizer = sr.Recognizer()
        recognizer.energy_threshold = 300
        recognizer.dynamic_energy_threshold = True

        text = ""
        method = ""

        try:
            with sr.Microphone() as source:
                self._logger.info("[Speech] 正在校准麦克风...")
                recognizer.adjust_for_ambient_noise(source, duration=1)
                self._logger.info(f"[Speech] 正在监听 ({duration}s)...")

                try:
                    audio = recognizer.listen(source, timeout=duration, phrase_time_limit=duration)
                    self._logger.info("[Speech] 录音完成，正在识别...")
                except sr.WaitTimeoutError:
                    return {"success": False, "error": f"超时: {duration}秒内未检测到语音", "message": "", "text": ""}

            try:
                text = recognizer.recognize_google(audio, language=language)
                method = "google"
            except sr.UnknownValueError as e:
                logger.debug(f"操作失败: {e}")
            except sr.RequestError:
                self._logger.warning("[Speech] Google STT 请求失败，尝试本地 Whisper")

            if not text:
                text = self._try_whisper(audio, recognizer)
                method = "whisper" if text else method

            if not text:
                text = self._try_sphinx(audio, recognizer)
                method = "sphinx" if text else method

            if text:
                self._logger.info(f"[Speech] 识别结果 ({method}): {text[:100]}")
                return {"success": True, "message": text, "text": text,
                        "data": {"text": text, "method": method, "duration": duration}}
            else:
                return {"success": False, "error": "未能识别语音内容", "message": "", "text": "", "data": {"method": method}}

        except OSError as e:
            return {"success": False, "error": f"麦克风不可用: {e}", "message": "", "text": ""}
        except Exception as e:
            self._logger.error(f"[Speech] 监听异常: {e}")
            return {"success": False, "error": str(e), "message": "", "text": ""}

    def listen_background(self, callback: Callable[[str], Any], duration: int = 5,
                          language: str = "zh-CN") -> dict:
        if self._listening:
            return {"success": False, "error": "已有后台监听在进行中", "message": ""}

        self._listening = True

        def _listen_thread():
            result = self.listen(duration=duration, language=language)
            self._listening = False
            if result.get("success"):
                try:
                    callback(result["text"])
                except Exception as e:
                    self._logger.error(f"[Speech] 回调异常: {e}")

        thread = threading.Thread(target=_listen_thread, daemon=True)
        thread.start()
        return {"success": True, "message": f"后台监听已启动 ({duration}s)", "data": {"listening": True}}

    def transcribe_file(self, filepath: str, language: str = "zh-CN") -> dict:
        if not self._has_sr:
            return {"success": False, "error": "需要安装 SpeechRecognition", "message": "", "text": ""}

        import speech_recognition as sr
        recognizer = sr.Recognizer()

        path = Path(filepath)
        if not path.exists():
            return {"success": False, "error": f"文件不存在: {filepath}", "message": "", "text": ""}

        text = ""
        method = ""

        try:
            with sr.AudioFile(str(path)) as source:
                audio = recognizer.record(source)

            try:
                text = recognizer.recognize_google(audio, language=language)
                method = "google"
            except Exception:
                text = self._try_whisper(audio, recognizer)
                method = "whisper" if text else method

                if not text:
                    text = self._try_sphinx(audio, recognizer)
                    method = "sphinx" if text else method

            if text:
                return {"success": True, "message": text, "text": text,
                        "data": {"text": text, "method": method, "file": filepath}}
            else:
                return {"success": False, "error": "未能识别音频内容", "message": "", "text": ""}
        except Exception as e:
            return {"success": False, "error": str(e), "message": "", "text": ""}

    def record_and_save(self, duration: int = 5, filepath: str = "") -> dict:
        try:
            import pyaudio
        except ImportError:
            return {"success": False, "error": "需要安装 PyAudio: pip install pyaudio"}

        if not filepath:
            out_dir = Path.cwd() / "exports" / "audio"
            out_dir.mkdir(parents=True, exist_ok=True)
            import time as _time
            filepath = str(out_dir / f"recording_{_time.strftime('%Y%m%d_%H%M%S')}.wav")

        try:
            CHUNK = 1024
            FORMAT = pyaudio.paInt16
            CHANNELS = 1
            RATE = 16000

            p = pyaudio.PyAudio()
            stream = p.open(format=FORMAT, channels=CHANNELS, rate=RATE,
                            input=True, frames_per_buffer=CHUNK)

            self._logger.info(f"[Speech] 正在录音 ({duration}s)...")
            frames = []
            for _ in range(0, int(RATE / CHUNK * duration)):
                data = stream.read(CHUNK, exception_on_overflow=False)
                frames.append(data)

            stream.stop_stream()
            stream.close()
            p.terminate()

            import wave
            wf = wave.open(filepath, "wb")
            wf.setnchannels(CHANNELS)
            wf.setsampwidth(p.get_sample_size(FORMAT))
            wf.setframerate(RATE)
            wf.writeframes(b"".join(frames))
            wf.close()

            size = Path(filepath).stat().st_size
            self._logger.info(f"[Speech] 录音已保存: {filepath} ({size} bytes)")
            return {"success": True, "message": f"录音已保存: {filepath} ({size / 1024:.1f} KB)",
                    "data": {"filepath": filepath, "size": size, "duration": duration}}
        except Exception as e:
            self._logger.error(f"[Speech] 录音失败: {e}")
            return {"success": False, "error": str(e), "message": ""}

    def record_and_transcribe(self, duration: int = 5, language: str = "zh-CN") -> dict:
        record_result = self.record_and_save(duration=duration)
        if not record_result.get("success"):
            return record_result

        filepath = record_result["data"]["filepath"]
        transcribe_result = self.transcribe_file(filepath, language=language)
        if transcribe_result.get("success"):
            return {"success": True, "message": transcribe_result["text"], "text": transcribe_result["text"],
                    "data": {"text": transcribe_result["text"], "filepath": filepath, "duration": duration,
                             "method": transcribe_result["data"].get("method", "")}}
        else:
            return {"success": False, "error": transcribe_result.get("error", "识别失败"),
                    "message": "", "text": "", "data": {"filepath": filepath}}

    def _try_whisper(self, audio, recognizer) -> str:
        try:
            return recognizer.recognize_whisper(audio, language="chinese")
        except Exception:
            return ""

    def _try_sphinx(self, audio, recognizer) -> str:
        try:
            return recognizer.recognize_sphinx(audio)
        except Exception:
            return ""
