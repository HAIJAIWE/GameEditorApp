from __future__ import annotations

import base64
from datetime import datetime
import io
import os
from pathlib import Path
import threading
from typing import Optional
import uuid

from common.logger import get_logger

logger = get_logger()


class VisionCapture:
    _instance: Optional[VisionCapture] = None
    _lock = threading.Lock()

    def __init__(self):
        self._logger = get_logger()
        self._capture_dir = Path.cwd() / "exports" / "screenshots"
        self._capture_dir.mkdir(parents=True, exist_ok=True)
        self._region_cache: dict[str, dict] = {}
        self._active_capture: Optional[str] = None
        self._has_mss = False
        self._has_tesseract = False
        self._check_dependencies()

    @classmethod
    def get_instance(cls) -> VisionCapture:
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def _check_dependencies(self):
        try:
            import mss
            self._has_mss = True
            self._logger.info("[Vision] MSS 屏幕捕获已就绪")
        except ImportError:
            self._logger.info("[Vision] MSS 未安装，pip install mss 获得更快的屏幕捕获")

        try:
            import pytesseract
            self._has_tesseract = True
            self._logger.info("[Vision] Tesseract OCR 已就绪")
        except ImportError:
            self._logger.info("[Vision] Tesseract 未安装，pip install pytesseract 获得 OCR 能力")

    @property
    def has_screen_capture(self) -> bool:
        try:
            import mss
            return True
        except ImportError:
            return False

    @property
    def has_ocr(self) -> bool:
        return self._has_tesseract

    def capture_fullscreen(self, save: bool = True) -> dict:
        return self._capture(monitor_id=0, save=save, label="fullscreen")

    def capture_region(self, x: int, y: int, width: int, height: int,
                       label: str = "region", save: bool = True) -> dict:
        return self._capture(
            monitor_id=0, region={"left": x, "top": y, "width": width, "height": height},
            save=save, label=label
        )

    def capture_active_window(self, save: bool = True) -> dict:
        try:
            import mss
            with mss.mss() as sct:
                monitors = sct.monitors
                if len(monitors) > 0:
                    m = monitors[0]
                    return self._capture(
                        monitor_id=0,
                        region={"left": m.get("left", 0) + 100, "top": m.get("top", 0) + 100,
                                "width": m.get("width", 1920) - 200, "height": m.get("height", 1080) - 200},
                        save=save, label="active_window"
                    )
        except ImportError as e:
            logger.debug(f"操作失败: {e}")
        return self.capture_fullscreen(save=save)

    def _capture(self, monitor_id: int = 0, region: dict = None,
                 save: bool = True, label: str = "capture") -> dict:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{label}_{timestamp}_{uuid.uuid4().hex[:4]}.png"
        filepath = self._capture_dir / filename

        screenshot_data = None
        width, height = 0, 0

        try:
            import mss
            with mss.mss() as sct:
                if region:
                    monitor = region
                else:
                    monitors = sct.monitors
                    monitor = monitors[monitor_id] if monitor_id < len(monitors) else monitors[0]

                img = sct.grab(monitor)
                width, height = img.width, img.height

                if save:
                    import mss.tools
                    mss.tools.to_png(img.rgb, img.size, output=str(filepath))

                img_bytes = mss.tools.to_png(img.rgb, img.size)
                screenshot_data = base64.b64encode(img_bytes).decode("utf-8")
        except ImportError:
            try:
                import tkinter as tk
                root = tk.Tk()
                root.withdraw()
                width = root.winfo_screenwidth()
                height = root.winfo_screenheight()
                root.destroy()
            except Exception:
                width, height = 1920, 1080

            try:
                from PIL import ImageGrab
                img = ImageGrab.grab(bbox=(region["left"], region["top"],
                                          region["left"] + region["width"],
                                          region["top"] + region["height"]) if region else None)
                width, height = img.size
                if save:
                    img.save(str(filepath))

                buf = io.BytesIO()
                img.save(buf, format="PNG")
                screenshot_data = base64.b64encode(buf.getvalue()).decode("utf-8")
            except ImportError:
                self._logger.warning("[Vision] PIL 未安装，无法截图")
                return {"success": False, "error": "需要安装 mss 或 Pillow 进行屏幕捕获",
                        "message": "", "filepath": None, "screenshot": None, "width": 0, "height": 0}

        ocr_text = self._ocr_from_path(filepath) if save and filepath.exists() else ""

        result = {
            "success": True,
            "message": f"截图: {filename} ({width}×{height})",
            "filepath": str(filepath) if save else None,
            "screenshot": screenshot_data,
            "width": width,
            "height": height,
            "ocr_text": ocr_text,
            "label": label,
            "timestamp": timestamp,
        }
        self._active_capture = str(filepath) if save else None
        return result

    def _ocr_from_path(self, filepath: Path) -> str:
        if not self._has_tesseract:
            return ""
        try:
            from PIL import Image
            import pytesseract
            img = Image.open(filepath)
            text = pytesseract.image_to_string(img, lang="chi_sim+eng")
            return text.strip()
        except Exception as e:
            self._logger.warning(f"[Vision] OCR 失败: {e}")
            return ""

    def ocr_image(self, image_path: str) -> dict:
        path = Path(image_path)
        if not path.exists():
            return {"success": False, "error": f"文件不存在: {image_path}", "message": "", "text": ""}

        if not self._has_tesseract:
            return {"success": False, "error": "Tesseract 未安装", "message": "", "text": ""}

        text = self._ocr_from_path(path)
        return {"success": True, "message": f"识别到 {len(text)} 个字符",
                "text": text, "lines": text.splitlines()}

    def analyze_ui_elements(self, image_path: str = None) -> dict:
        try:
            from PIL import Image
        except ImportError:
            return {"success": False, "error": "PIL 未安装", "message": ""}

        path = Path(image_path) if image_path else (
            Path(self._active_capture) if self._active_capture else None
        )
        if not path or not path.exists():
            return {"success": False, "error": "无可用截图", "message": ""}

        try:
            img = Image.open(path).convert("RGB")
            import numpy as np
            arr = np.array(img)
            h, w = arr.shape[:2]

            ocr_text = self._ocr_from_path(path) if self._has_tesseract else ""

            brightness = float(np.mean(arr))
            edges = np.abs(np.diff(arr.astype(np.int16), axis=1)).mean() + \
                    np.abs(np.diff(arr.astype(np.int16), axis=0)).mean()
            edge_score = float(edges)

            description = []
            if brightness > 180:
                description.append("明亮界面")
            elif brightness < 80:
                description.append("暗色界面")
            else:
                description.append("中等亮度")

            if edge_score > 30:
                description.append("高密度内容(可能有多窗口/大量UI元素)")
            elif edge_score > 15:
                description.append("中等密度内容")
            else:
                description.append("低密度/简洁界面")

            if ocr_text:
                keywords = []
                for line in ocr_text.splitlines()[:20]:
                    short = line.strip()[:40]
                    if short and len(short) > 2:
                        keywords.append(short)
                description.append(f"UI文字: {'; '.join(keywords[:10])}")

            return {
                "success": True,
                "message": " ".join(description),
                "data": {
                    "filepath": str(path),
                    "dimensions": f"{w}×{h}",
                    "brightness_level": round(brightness, 1),
                    "edge_density": round(edge_score, 1),
                    "ocr_text": ocr_text,
                    "ui_description": " ".join(description),
                    "suggested_elements": self._detect_ui_regions(arr, w, h),
                }
            }
        except Exception as e:
            self._logger.error(f"[Vision] UI 分析失败: {e}")
            return {"success": False, "error": str(e), "message": ""}

    def _detect_ui_regions(self, arr, w: int, h: int) -> list[dict]:
        try:
            import numpy as np
            gray = np.mean(arr, axis=2)
            regions = []

            for name, y_start, y_end in [("顶部区域", 0, int(h * 0.15)),
                                          ("中部内容区", int(h * 0.15), int(h * 0.85)),
                                          ("底部区域", int(h * 0.85), h)]:
                region = gray[y_start:y_end, :]
                avg_bright = float(np.mean(region))
                regions.append({"name": name, "y_range": f"{y_start}-{y_end}",
                                "avg_brightness": round(avg_bright, 1)})

            for name, x_start, x_end in [("左侧区域", 0, int(w * 0.3)),
                                          ("右侧区域", int(w * 0.7), w)]:
                region = gray[:, x_start:x_end]
                avg_bright = float(np.mean(region))
                regions.append({"name": name, "x_range": f"{x_start}-{x_end}",
                                "avg_brightness": round(avg_bright, 1)})

            return regions
        except ImportError:
            return []

    def capture_and_analyze(self, region: dict = None, label: str = "analyze") -> dict:
        if region:
            cap = self.capture_region(**region, label=label, save=True)
        else:
            cap = self.capture_fullscreen(save=True)

        if not cap.get("success"):
            return cap

        filepath = cap.get("filepath")
        if filepath:
            analysis = self.analyze_ui_elements(filepath)
            cap["analysis"] = analysis.get("data", {})
            cap["ui_description"] = analysis.get("message", "")

        return cap

    def record_region(self, name: str, x: int, y: int, width: int, height: int):
        self._region_cache[name] = {"left": x, "top": y, "width": width, "height": height}

    def list_regions(self) -> dict:
        return {"success": True, "message": f"{len(self._region_cache)} 个区域",
                "data": {"regions": self._region_cache}}

    def list_screenshots(self, limit: int = 20) -> dict:
        files = sorted(self._capture_dir.glob("*.png"), key=os.path.getmtime, reverse=True)[:limit]
        items = [{"name": f.name, "size": f.stat().st_size,
                  "time": datetime.fromtimestamp(f.stat().st_mtime).isoformat()}
                 for f in files]
        return {"success": True, "message": f"共 {len(files)} 张截图",
                "data": {"screenshots": items, "dir": str(self._capture_dir)}}
