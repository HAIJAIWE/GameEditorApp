from __future__ import annotations

import platform
import socket
import subprocess
import webbrowser

from common.logger import get_logger
from core.agent.skill_protocol import BaseSkill

logger = get_logger()
from core.agent.skills.common import normalize_params


class UIPreviewSkill(BaseSkill):
    name = "tool.ui_preview"
    description = "前端预览: 检测运行中的HTTP服务并打开预览、分析界面布局"
    version = "2.0.0"
    parameters = [
        {"name": "action", "required": True, "description": "launch/analyze/check"},
        {"name": "port", "required": False, "description": "HTTP服务端口号"},
        {"name": "url", "required": False, "description": "预览URL (优先级高于port)"},
    ]
    tags = ["preview", "ui", "browser", "http", "web"]
    REQUIRES_MAIN_THREAD = True  # 修复 P2-29: 访问 main_window 启动预览

    _COMMON_PORTS = [3000, 3001, 5000, 5173, 8080, 8000, 4200, 9000]

    def execute(self, params: dict, context: dict) -> dict:
        params = normalize_params(params)
        logger = get_logger()
        action = params.get("action", "launch")

        try:
            if action == "launch":
                return self._launch_preview(params)
            elif action == "analyze":
                return self._analyze_ui(params, context)
            elif action == "check":
                return self._check_servers()
            else:
                return {"success": False, "error": f"未知 action: {action}", "message": ""}
        except Exception as e:
            logger.error(f"UIPreviewSkill 异常: {e}", exc_info=True)
            return {"success": False, "error": str(e), "message": ""}

    def _launch_preview(self, params: dict) -> dict:
        url = params.get("url", "")
        port = params.get("port", 0)

        if url:
            final_url = url
        elif port:
            final_url = f"http://localhost:{port}"
        else:
            servers = self._find_servers()
            if servers:
                final_url = servers[0]["url"]
            else:
                return {"success": False,
                        "error": "未检测到运行中的HTTP服务。请先启动开发服务器，然后指定 port 参数",
                        "message": ""}

        if not final_url.startswith("http"):
            final_url = f"http://{final_url}"

        webbrowser.open(final_url)
        return {"success": True,
                "message": f"已打开预览: {final_url}",
                "data": {"url": final_url, "opened": True}}

    def _check_servers(self) -> dict:
        servers = self._find_servers()
        if not servers:
            return {"success": True,
                    "message": "未检测到运行中的HTTP服务",
                    "data": {"servers": []}}

        lines = ["检测到以下HTTP服务:"]
        for s in servers:
            lines.append(f"  {s['url']} (pid={s.get('pid', '?')})")
        return {"success": True,
                "message": "\n".join(lines),
                "data": {"servers": servers}}

    def _find_servers(self) -> list:
        servers = []
        try:
            if platform.system() == "Windows":
                result = subprocess.run(
                    ["netstat", "-ano", "-p", "tcp"],
                    capture_output=True, text=True, timeout=10
                )
                for line in result.stdout.split("\n"):
                    for port in self._COMMON_PORTS:
                        if f":{port}" in line and "LISTENING" in line:
                            parts = line.split()
                            pid = parts[-1] if parts else "?"
                            servers.append({
                                "url": f"http://localhost:{port}",
                                "port": port, "pid": pid
                            })
        except Exception as e:
            logger.warning(f"操作失败: {e}")

        for port in self._COMMON_PORTS:
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(0.5)
                result = sock.connect_ex(("127.0.0.1", port))
                sock.close()
                if result == 0:
                    exist_url = f"http://localhost:{port}"
                    if not any(s["url"] == exist_url for s in servers):
                        servers.append({"url": exist_url, "port": port, "pid": "?"})
            except Exception:
                continue

        return servers

    def _analyze_ui(self, params: dict, context: dict) -> dict:
        main_win = context.get("main_window")
        if not main_win:
            return {"success": False, "error": "无法访问主窗口", "message": ""}

        try:
            info_parts = []
            title = getattr(main_win, "windowTitle", lambda: "Unknown")()
            info_parts.append(f"窗口: {title}")

            size = getattr(main_win, "size", lambda: None)()
            if size:
                info_parts.append(f"尺寸: {size.width()}x{size.height()}")

            children = getattr(main_win, "children", lambda: [])()
            if children:
                widgets = []
                for child in children:
                    try:
                        cls_name = child.__class__.__name__
                        obj_name = getattr(child, "objectName", lambda: "")()
                        visible = getattr(child, "isVisible", lambda: True)()
                        if visible:
                            widgets.append(f"{cls_name}" + (f"({obj_name})" if obj_name else ""))
                    except Exception:
                        continue
                info_parts.append(f"组件 ({len(widgets)}): " + ", ".join(widgets[:20]))

            return {"success": True,
                    "message": "\n".join(info_parts),
                    "data": {"widgets": len(widgets) if children else 0}}
        except RuntimeError as e:
            if "thread" in str(e).lower() or "timer" in str(e).lower():
                logger = get_logger()
                logger.warning("[UIPreview] Qt对象跨线程访问受限，跳过界面分析")
                return {"success": True,
                        "message": "界面分析因跨线程限制已跳过（可在主线程中手动查看）",
                        "data": {"skipped": True, "reason": "cross_thread"}}
            raise
        except Exception as e:
            return {"success": False, "error": f"分析失败: {e}", "message": ""}
