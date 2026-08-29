from __future__ import annotations

import base64
import os
from pathlib import Path

from common.logger import get_logger
from core.agent.skill_protocol import BaseSkill

logger = get_logger()
from core.agent.skills.common import normalize_params


class ImageSkill(BaseSkill):
    name = "tool.image"
    description = "图像处理: 截图/UI分析/图片分析/OCR/图片生成/Vision描述"
    version = "1.1.0"
    parameters = [
        {"name": "action", "required": True, "type": "string",
         "enum": ["screenshot", "ui_analyze", "look", "ocr", "region_list", "region_add",
                  "meta", "analyze", "generate", "describe"],
         "description": "screenshot=截图, ui_analyze=UI分析, look=截图+分析+Vision, ocr=文字识别, "
                        "region_list/region_add=区域管理, meta=图片元信息, analyze=色彩分析, "
                        "generate=AI生成图片, describe=Vision描述图片"},
        {"name": "path", "required": False, "type": "string", "description": "图片文件路径(meta/analyze/describe/ocr)"},
        {"name": "prompt", "required": False, "type": "string",
         "description": "描述提示词(describe/generate/look)"},
        {"name": "style", "required": False, "type": "string",
         "enum": ["pixel", "realistic", "anime", "fantasy"],
         "description": "生成风格 (generate)"},
        {"name": "save_path", "required": False, "type": "string", "description": "保存路径 (generate)"},
        {"name": "x", "required": False, "type": "integer", "description": "区域X坐标"},
        {"name": "y", "required": False, "type": "integer", "description": "区域Y坐标"},
        {"name": "width", "required": False, "type": "integer", "description": "区域宽度"},
        {"name": "height", "required": False, "type": "integer", "description": "区域高度"},
        {"name": "region_name", "required": False, "type": "string", "description": "区域名称(region_add)"},
        {"name": "image_path", "required": False, "type": "string", "description": "已有图片路径(ocr/describe)"},
    ]
    REQUIRES_MAIN_THREAD = True  # 修复 P2-29: screenshot/ui_analyze 调用 QApplication 截屏
    tags = ["vision", "image", "screenshot", "ocr", "generation", "analyze", "ui", "art"]

    SUPPORTED_FORMATS = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".tiff"}

    def execute(self, params: dict, context: dict) -> dict:
        params = normalize_params(params)
        self._logger = get_logger()
        action = params.get("action", "screenshot")

        try:
            # === 视觉截图相关 ===
            if action == "screenshot":
                return self._do_screenshot(params)
            elif action == "ui_analyze":
                return self._do_ui_analyze(params)
            elif action == "look":
                return self._do_look(params, context)
            elif action == "ocr":
                return self._do_ocr(params)
            elif action == "region_list":
                from core.agent.vision_capture import VisionCapture
                return VisionCapture.get_instance().list_regions()
            elif action == "region_add":
                return self._do_region_add(params)

            # === 图片元信息 & 色彩分析 ===
            elif action == "meta":
                return self._do_image_meta(params)
            elif action == "analyze":
                return self._do_image_analyze(params)

            # === 图片生成 ===
            elif action == "generate":
                return self._do_generate(params, context)

            # === Vision描述 ===
            elif action == "describe":
                return self._do_vision_describe(params, context)

            else:
                return {"success": False, "error": f"未知 action: {action}", "message": ""}
        except Exception as e:
            self._logger.error(f"ImageSkill 异常: {e}", exc_info=True)
            return {"success": False, "error": str(e), "message": ""}

    # ========== 截图相关 (原 VisionSkill) ==========

    def _do_screenshot(self, params) -> dict:
        from core.agent.vision_capture import VisionCapture
        vc = VisionCapture.get_instance()
        x = params.get("x")
        y = params.get("y")
        w = params.get("width")
        h = params.get("height")
        if all(v is not None for v in (x, y, w, h)):
            result = vc.capture_region(x, y, w, h, save=True)
        else:
            result = vc.capture_fullscreen(save=True)

        if not result.get("success"):
            return result

        msg = f"截图完成: {result['width']}×{result['height']}"
        if result.get("ocr_text"):
            msg += f", OCR识别到 {len(result['ocr_text'])} 个字符"

        return {"success": True, "message": msg, "data": {
            "filepath": result.get("filepath"),
            "width": result["width"],
            "height": result["height"],
            "ocr_preview": (result.get("ocr_text") or "")[:300],
        }}

    def _do_ui_analyze(self, params) -> dict:
        from core.agent.vision_capture import VisionCapture
        vc = VisionCapture.get_instance()
        image_path = params.get("image_path", "")
        if image_path:
            result = vc.analyze_ui_elements(image_path)
        else:
            cap = vc.capture_fullscreen(save=True)
            if not cap.get("success"):
                return cap
            result = vc.analyze_ui_elements(cap["filepath"])

        if not result.get("success"):
            return result

        data = result.get("data", {})
        return {"success": True,
                "message": (
                    f"UI分析: {data.get('ui_description', '')}\n"
                    f"尺寸: {data.get('dimensions', '?')}\n"
                    f"OCR文本: {(data.get('ocr_text', '') or '无')[:500]}"
                ),
                "data": data}

    def _do_look(self, params, context) -> dict:
        from core.agent.vision_capture import VisionCapture
        vc = VisionCapture.get_instance()
        prompt = params.get("prompt", "请详细描述这个屏幕截图的内容：有哪些UI元素(按钮、文本框、列表、菜单等)、上面显示的文字内容、当前可能是什么程序或页面。")

        cap = vc.capture_fullscreen(save=True)
        if not cap.get("success"):
            return cap

        analysis = vc.analyze_ui_elements(cap["filepath"])
        ui_info = ""
        if analysis.get("success"):
            d = analysis.get("data", {})
            ui_info = (
                f"[UI基础分析] {d.get('ui_description', '')}\n"
                f"尺寸: {d.get('dimensions', '?')}\n"
                f"OCR识别文本片段:\n{(d.get('ocr_text', '') or '无')[:800]}\n\n"
            )

        screenshot_b64 = cap.get("screenshot", "")
        if not screenshot_b64:
            return {"success": True,
                    "message": f"截图完成 {cap['width']}×{cap['height']}\n{ui_info}",
                    "data": {"filepath": cap["filepath"], "ui_analysis": analysis.get("data", {})}}

        config = context.get("config")
        if config and getattr(config, "enabled", False):
            from common.ai_client import generate_vision
            success, desc = generate_vision(config, prompt, screenshot_b64, "image/png")
            if success and desc:
                full = f"## 屏幕视觉分析\n\n{desc[:2000]}\n\n---\n{ui_info}"
                return {"success": True, "message": full, "data": {
                    "filepath": cap["filepath"],
                    "vision_description": desc[:2000],
                    "ui_analysis": analysis.get("data", {}),
                    "width": cap["width"],
                    "height": cap["height"],
                }}

        return {"success": True,
                "message": f"## 屏幕截图分析\n\n{ui_info}",
                "data": {"filepath": cap["filepath"], "ui_analysis": analysis.get("data", {})}}

    def _do_ocr(self, params) -> dict:
        from core.agent.vision_capture import VisionCapture
        vc = VisionCapture.get_instance()
        image_path = params.get("image_path", "")
        if image_path:
            return vc.ocr_image(image_path)
        else:
            cap = vc.capture_fullscreen(save=True)
            if not cap.get("success"):
                return cap
            return vc.ocr_image(cap["filepath"])

    def _do_region_add(self, params) -> dict:
        from core.agent.vision_capture import VisionCapture
        vc = VisionCapture.get_instance()
        try:
            name = params.get("region_name", "")
            x, y, w, h = int(params.get("x", 0)), int(params.get("y", 0)), \
                         int(params.get("width", 200)), int(params.get("height", 200))
            if not name:
                return {"success": False, "error": "缺少 region_name", "message": ""}
            vc.record_region(name, x, y, w, h)
            return {"success": True, "message": f"已记录区域: {name} ({x},{y} {w}×{h})",
                    "data": {"name": name, "x": x, "y": y, "width": w, "height": h}}
        except (ValueError, TypeError):
            return {"success": False, "error": "坐标/尺寸必须为整数", "message": ""}

    # ========== 图片元信息 (原 ImageAnalyzeSkill) ==========

    def _do_image_meta(self, params) -> dict:
        resolved = self._resolve_path(params.get("path", ""))
        if not resolved or not resolved.exists():
            return {"success": False, "error": f"文件不存在: {params.get('path')}", "message": ""}

        suffix = resolved.suffix.lower()
        if suffix not in self.SUPPORTED_FORMATS:
            return {"success": False, "error": f"不支持的图片格式: {suffix}", "message": ""}

        size_kb = resolved.stat().st_size / 1024
        lines = [f"# {resolved.name} 图片信息", ""]
        lines.append(f"- **文件大小**: {size_kb:.1f} KB")
        lines.append(f"- **格式**: {suffix.upper()}")

        try:
            from PIL import Image
            with Image.open(resolved) as img:
                w, h = img.size
                mode = img.mode
                lines.append(f"- **尺寸**: {w} × {h} 像素")
                lines.append(f"- **色彩模式**: {mode}")
                if mode == "RGBA" or (hasattr(img, "info") and img.info.get("transparency")):
                    lines.append("- **透明通道**: 有")
                dpi = img.info.get("dpi")
                if dpi:
                    lines.append(f"- **DPI**: {dpi}")

                hist = img.histogram()
                if hist and len(hist) >= 768:
                    r_avg = sum(hist[:256]) / max(sum(hist[:256]), 1) if sum(hist[:256]) > 0 else 0
                    g_avg = sum(hist[256:512]) / max(sum(hist[256:512]), 1) if sum(hist[256:512]) > 0 else 0
                    b_avg = sum(hist[512:768]) / max(sum(hist[512:768]), 1) if sum(hist[512:768]) > 0 else 0
                    lines.append(f"- **色调分析**: 平均RGB({r_avg:.0f},{g_avg:.0f},{b_avg:.0f})")

                lines.append(f"- **宽高比**: {w/h:.2f}")
                lines.append(f"- **方向**: {'横版' if w > h else '竖版' if h > w else '正方形'}")

                return {"success": True, "message": "\n".join(lines),
                        "data": {"width": w, "height": h, "mode": mode, "size_kb": round(size_kb, 1),
                                 "format": suffix.replace(".", ""), "path": str(resolved)}}
        except ImportError:
            self._logger.info("PIL/Pillow 未安装，使用基本信息")
        except Exception as e:
            self._logger.warning(f"PIL 读取失败: {e}")

        lines.append("- **尺寸**: 需要 Pillow 库获取")
        return {"success": True, "message": "\n".join(lines),
                "data": {"size_kb": round(size_kb, 1), "format": suffix.replace(".", ""), "path": str(resolved)}}

    def _do_image_analyze(self, params) -> dict:
        resolved = self._resolve_path(params.get("path", ""))
        if not resolved or not resolved.exists():
            return {"success": False, "error": f"文件不存在: {params.get('path')}", "message": ""}

        meta_result = self._do_image_meta_internal(resolved)
        meta_text = meta_result.get("message", "")

        try:
            import numpy as np
            from PIL import Image
            with Image.open(resolved) as img:
                img_array = np.array(img.convert("RGB"))
                h, w = img_array.shape[:2]

                brightness = float(np.mean(img_array))
                std_dev = float(np.std(img_array))

                blocks_h, blocks_w = 4, 4
                bh, bw = h // blocks_h, w // blocks_w
                color_blocks = []
                for i in range(blocks_h):
                    row = []
                    for j in range(blocks_w):
                        block = img_array[i*bh:(i+1)*bh, j*bw:(j+1)*bw]
                        avg_color = tuple(int(x) for x in np.mean(block, axis=(0,1)))
                        row.append(f"rgb({avg_color[0]},{avg_color[1]},{avg_color[2]})")
                    color_blocks.append(row)

                detail_level = "高细节" if std_dev > 60 else "中等细节" if std_dev > 30 else "低细节/简约"
                brightness_desc = "明亮" if brightness > 160 else "偏暗" if brightness < 80 else "适中"

                lines = meta_text.split("\n")
                lines.append("")
                lines.append(f"- **亮度**: {brightness:.0f}/255 ({brightness_desc})")
                lines.append(f"- **细节丰富度**: {detail_level} (标准差={std_dev:.0f})")
                lines.append("- **色彩网格** (4×4):")
                for row in color_blocks:
                    lines.append(f"  {' '.join(row)}")

                return {"success": True, "message": "\n".join(lines),
                        "data": {"brightness": round(brightness, 1), "std_dev": round(std_dev, 1),
                                 "brightness_desc": brightness_desc, "detail_level": detail_level,
                                 "color_grid": color_blocks}}
        except ImportError:
            self._logger.info("numpy 未安装，无法进行色彩分析")
        except Exception as e:
            self._logger.warning(f"色彩分析失败: {e}")

        return meta_result

    def _do_image_meta_internal(self, path: Path) -> dict:
        """内部用的元信息获取，不重复路径解析"""
        size_kb = path.stat().st_size / 1024
        suffix = path.suffix.lower()
        lines = [f"# {path.name} 图片信息", ""]
        lines.append(f"- **文件大小**: {size_kb:.1f} KB")
        lines.append(f"- **格式**: {suffix.upper()}")
        try:
            from PIL import Image
            with Image.open(path) as img:
                w, h = img.size
                mode = img.mode
                lines.append(f"- **尺寸**: {w} × {h} 像素")
                lines.append(f"- **色彩模式**: {mode}")
                return {"success": True, "message": "\n".join(lines),
                        "data": {"width": w, "height": h, "mode": mode, "size_kb": round(size_kb, 1),
                                 "format": suffix.replace(".", ""), "path": str(path)}}
        except ImportError as e:
            logger.debug(f"操作失败: {e}")
        except Exception as e:
            self._logger.warning(f"PIL 读取失败: {e}")
        lines.append("- **尺寸**: 需要 Pillow 库获取")
        return {"success": True, "message": "\n".join(lines),
                "data": {"size_kb": round(size_kb, 1), "format": suffix.replace(".", ""), "path": str(path)}}

    # ========== 图片生成 (原 ImageGenSkill) ==========

    def _do_generate(self, params, context) -> dict:
        prompt = params.get("prompt", "")
        style = params.get("style", "fantasy")

        if not prompt:
            return {"success": False, "error": "缺少 prompt", "message": ""}

        style_hints = {
            "pixel": "pixel art style, 16-bit era game graphics",
            "realistic": "photorealistic, 8K, highly detailed, realistic lighting",
            "anime": "anime style, Studio Ghibli inspired, cel shading",
            "fantasy": "fantasy game art, concept art style, dramatic lighting",
        }
        full_prompt = f"{prompt}, {style_hints.get(style, style_hints['fantasy'])}"

        from common.ai_client import generate_image
        config = context.get("config") or context.get("ai_config")
        if not config:
            main_win = context.get("main_window")
            if main_win:
                config = getattr(main_win, 'config', None)
        if not config or not getattr(config, 'api_key', ''):
            return {"success": False, "error": "AI未配置", "message": ""}

        success, result = generate_image(config, full_prompt)
        if success:
            save_path = params.get("save_path", "")
            if save_path:
                safe_path = self._safe_save_path(save_path)
                if not safe_path:
                    return {"success": False,
                            "error": f"save_path 必须位于 exports/images/ 下: {save_path}",
                            "message": ""}
                # URL 安全校验：仅允许 http/https，拒绝 file:// 和内网地址
                if not self._is_safe_url(result):
                    return {"success": False,
                            "error": f"图片 URL 非法或指向内网: {result[:80]}",
                            "message": ""}
                import urllib.request
                try:
                    urllib.request.urlretrieve(result, safe_path)  # nosec B310
                    save_path = safe_path
                except Exception as e:
                    logger.warning(f"图片下载失败: {e}")
                    return {"success": False, "error": f"图片下载失败: {e}", "message": ""}
            return {"success": True, "message": f"图片已生成: {prompt[:40]}...",
                    "data": {"image_url": result, "save_path": save_path}}
        return {"success": False, "error": result, "message": ""}

    @staticmethod
    def _safe_save_path(raw: str) -> str | None:
        """约束保存路径到 exports/images/ 下，防止任意文件覆盖"""
        from pathlib import Path
        if not raw:
            return None
        base = Path(os.getcwd()) / "exports" / "images"
        base.mkdir(parents=True, exist_ok=True)
        # 仅取 basename，拒绝路径穿越
        name = os.path.basename(raw.replace("\\", "/"))
        if not name or name in (".", ".."):
            name = f"img_{int(__import__('time').time())}.png"
        # 确保扩展名
        if not any(name.lower().endswith(ext) for ext in (".png", ".jpg", ".jpeg", ".webp", ".gif")):
            name += ".png"
        target = (base / name).resolve()
        # 二次校验：必须仍位于 base 之下
        try:
            target.relative_to(base.resolve())
        except ValueError:
            return None
        return str(target)

    @staticmethod
    def _is_safe_url(url: str) -> bool:
        """URL 安全校验：仅允许 http/https 且非内网地址（基础 SSRF 防护）"""
        if not url or not isinstance(url, str):
            return False
        low = url.lower()
        if not low.startswith(("http://", "https://")):
            return False
        try:
            from urllib.parse import urlparse
            parsed = urlparse(url)
            host = parsed.hostname or ""
            if not host:
                return False
            # 拒绝明显的内网地址
            # nosec B104 — "0.0.0.0" 是黑名单字符串，不是绑定地址
            internal_prefixes = ("localhost", "127.", "10.", "192.168.", "172.16.", "172.17.",
                                 "172.18.", "172.19.", "172.20.", "172.21.", "172.22.",
                                 "172.23.", "172.24.", "172.25.", "172.26.", "172.27.", "172.30.",
                                 "172.31.", "169.254.", "0.0.0.0", "::1", "fe80::")  # nosec B104
            if any(host.lower() == p or host.lower().startswith(p) for p in internal_prefixes):
                return False
            return True
        except Exception:
            return False

    # ========== Vision描述 (合并原 VisionSkill.describe + ImageAnalyzeSkill.describe) ==========

    def _do_vision_describe(self, params, context) -> dict:
        image_path = params.get("image_path", "") or params.get("path", "")
        prompt = params.get("prompt", "请描述这张图片的内容")

        # 如果没给路径，截屏
        if not image_path:
            from core.agent.vision_capture import VisionCapture
            vc = VisionCapture.get_instance()
            cap = vc.capture_fullscreen(save=True)
            if not cap.get("success"):
                return cap
            img_b64 = cap["screenshot"]
            mime = "image/png"
        else:
            resolved = self._resolve_path(image_path)
            if not resolved or not resolved.exists():
                return {"success": False, "error": f"文件不存在: {image_path}", "message": ""}
            with open(resolved, "rb") as f:
                img_b64 = base64.b64encode(f.read()).decode("utf-8")
            suffix = resolved.suffix.lower().replace(".", "")
            mime = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
                    "gif": "image/gif", "webp": "image/webp"}.get(suffix, f"image/{suffix}")

        config = context.get("config") or (context.get("main_window") and getattr(context["main_window"], "config", None))
        if not config or not getattr(config, "enabled", False):
            return {"success": False,
                    "error": "Vision 分析需要配置 AI API (支持视觉的模型如 gpt-4-vision/qwen-vl)",
                    "message": ""}

        from common.ai_client import generate_vision
        success, desc = generate_vision(config, prompt, img_b64, mime)
        if success and desc:
            name = image_path or "屏幕截图"
            return {"success": True,
                    "message": f"## 图片分析: {name}\n\n{desc[:2000]}",
                    "data": {"description": desc[:2000], "prompt": prompt, "file": name}}
        return {"success": False, "error": desc or "Vision 分析失败", "message": ""}

    # ========== 工具方法 ==========

    def _resolve_path(self, raw: str) -> Path | None:
        if not raw:
            return None
        p = Path(raw)
        if p.is_absolute():
            return p if p.exists() else None
        cwd = Path.cwd()
        candidates = [cwd / p, cwd / "data" / p, cwd / "assets" / p, cwd / "exports" / p]
        for c in candidates:
            if c.exists():
                return c
        return cwd / p if (cwd / p).exists() else None
