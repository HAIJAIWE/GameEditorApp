"""MCP (Model Context Protocol) 最小实现
支持注册外部 MCP 服务、发现工具、代理调用。
协议格式参考: https://modelcontextprotocol.io
"""
from __future__ import annotations

import json
from pathlib import Path
import queue
import subprocess
import threading
import time
from typing import Optional

from common.common import is_test_env
from common.logger import get_logger
from core.agent.diagnostics.error_handler import ErrorResult

logger = get_logger()


class MCPServerConfig:
    """MCP 服务器配置"""
    def __init__(self, name: str, config: dict):
        self.name = name
        self.type = config.get("type", "http")  # http 或 stdio
        self.url = config.get("url", "")
        self.command = config.get("command", "")
        self.args = config.get("args", [])
        self.env = config.get("env", {})
        self.description = config.get("description", "")


class MCPTool:
    """MCP 工具定义"""
    def __init__(self, name: str, server: str, schema: dict = None):
        self.name = name
        self.server = server
        self.schema = schema or {}


class _StdioConnection:
    """管理单个 STDIO MCP 服务器的持久子进程连接（Windows 兼容）"""
    def __init__(self, server: MCPServerConfig):
        self.server = server
        self.proc: subprocess.Popen | None = None
        self.lock = threading.Lock()
        self._connected = False
        self._recv_queue: queue.Queue[dict | None] = queue.Queue()
        self._reader_thread: threading.Thread | None = None
        self._reader_active = False

    def _reader_loop(self):
        """后台线程：持续读取 stdout 并放入队列"""
        while self._reader_active and self.proc and self.proc.poll() is None:
            try:
                line = self.proc.stdout.readline()
                if not line:
                    break
                data = json.loads(line.strip())
                self._recv_queue.put(data)
            except (json.JSONDecodeError, ValueError):
                continue
            except Exception:
                break

    def ensure_connected(self):
        """确保进程已启动并完成 MCP 初始化握手"""
        if self._connected and self.proc and self.proc.poll() is None:
            return
        cmd = [self.server.command] + self.server.args
        self.proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        # 启动后台读取线程
        self._reader_active = True
        self._reader_thread = threading.Thread(target=self._reader_loop, daemon=True)
        self._reader_thread.start()

        # MCP 初始化握手
        self._send_recv({
            "jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                       "clientInfo": {"name": "game-editor", "version": "1.0"}},
        })
        # 发送 initialized 通知（不需要响应）
        self._send_raw({
            "jsonrpc": "2.0", "method": "notifications/initialized",
        })
        self._connected = True

    def _send_raw(self, msg: dict):
        """发送 JSON-RPC 消息到子进程 stdin"""
        line = json.dumps(msg) + "\n"
        self.proc.stdin.write(line)
        self.proc.stdin.flush()

    def _recv_raw(self, timeout: float = 10.0) -> dict | None:
        """从队列读取一行 JSON-RPC 响应"""
        try:
            return self._recv_queue.get(timeout=timeout)
        except queue.Empty:
            return None

    def _send_recv(self, msg: dict, timeout: float = 10.0) -> dict | None:
        """发送消息并等待响应"""
        self._send_raw(msg)
        return self._recv_raw(timeout)

    def send_tool_call(self, tool_name: str, params: dict, timeout: float = 30.0) -> dict:
        """发送 tools/call 请求并等待响应"""
        with self.lock:
            self.ensure_connected()
            msg = {
                "jsonrpc": "2.0", "id": 2, "method": "tools/call",
                "params": {"name": tool_name, "arguments": params},
            }
            resp = self._send_recv(msg, timeout)
            if resp is None:
                return {"error": "STDIO 调用超时或无响应"}
            if "error" in resp:
                return {"error": resp["error"].get("message", str(resp["error"]))}
            return resp.get("result", resp)

    def discover_tools(self, timeout: float = 15.0) -> list[dict]:
        """发送 tools/list 并返回工具列表"""
        with self.lock:
            self.ensure_connected()
            msg = {
                "jsonrpc": "2.0", "id": 3, "method": "tools/list",
            }
            resp = self._send_recv(msg, timeout)
            if resp is None:
                return []
            if "error" in resp:
                return []
            return resp.get("result", {}).get("tools", [])

    def close(self):
        """关闭子进程"""
        self._reader_active = False
        if self.proc:
            try:
                self.proc.terminate()
                self.proc.wait(timeout=5)
            except Exception:
                self.proc.kill()
            self.proc = None
            self._connected = False


class MCPRegistry:
    """MCP 服务注册中心 — 支持 HTTP/STDIO 两种协议，内置自检工具"""

    BUILTIN_TOOLS = {
        "mcp.echo": {
            "description": "回显输入参数，用于 MCP 连通性测试",
            "params_schema": {"text": {"type": "string", "description": "要回显的文本"}},
        },
        "mcp.time": {
            "description": "返回当前 UTC 时间戳和 ISO 格式时间",
            "params_schema": {},
        },
    }

    _instance: Optional[MCPRegistry] = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self._logger = get_logger()
        self._servers: dict[str, MCPServerConfig] = {}
        self._tools: dict[str, MCPTool] = {}
        self._stdio_connections: dict[str, _StdioConnection] = {}
        self._client = None
        self._register_builtins()
        self._load_config()

    def _register_builtins(self):
        for name, meta in self.BUILTIN_TOOLS.items():
            tool = MCPTool(name, "_builtin", meta.get("params_schema", {}))
            self._tools[name] = tool
        self._logger.info(f"MCP: 注册了 {len(self.BUILTIN_TOOLS)} 个内置工具")

    def _load_config(self):
        """从配置文件加载 MCP 服务"""
        config_paths = [
            Path.home() / ".workbuddy" / "mcp.json",
            Path.home() / ".workbuddy" / ".mcp.json",
            Path(".mobai") / "mcp.json",
            Path("config") / "mcp.json",
        ]
        for cp in config_paths:
            if cp.exists():
                try:
                    data = json.loads(cp.read_text(encoding="utf-8"))
                    servers = data.get("mcpServers", {})
                    for name, cfg in servers.items():
                        self.register_server(name, cfg)
                    self._logger.info(f"MCP: 从 {cp} 加载了 {len(servers)} 个服务")
                except Exception as e:
                    self._logger.warning(f"MCP: 加载配置失败 {cp}: {e}")

    def register_server(self, name: str, config: dict):
        """注册 MCP 服务器，并自动发现其工具"""
        server = MCPServerConfig(name, config)
        self._servers[name] = server
        self._logger.info(f"MCP: 注册服务 {name} ({server.type})")
        if server.type == "stdio" and server.command:
            self._discover_stdio_tools(server)

    def register_tool(self, name: str, server: str, schema: dict = None):
        """注册 MCP 工具"""
        tool = MCPTool(name, server, schema)
        self._tools[name] = tool

    def _get_stdio_connection(self, server: MCPServerConfig) -> _StdioConnection:
        """获取或创建 STDIO 连接"""
        if server.name not in self._stdio_connections:
            self._stdio_connections[server.name] = _StdioConnection(server)
        return self._stdio_connections[server.name]

    def _discover_stdio_tools(self, server: MCPServerConfig):
        """自动发现 STDIO 类型 MCP 服务器的工具列表"""
        # 测试环境：跳过子进程启动与阻塞握手，避免阻塞/挂起 GUI 集成测试
        if is_test_env():
            self._logger.info(f"MCP: 测试环境，跳过 {server.name} stdio 连接")
            return
        try:
            conn = self._get_stdio_connection(server)
            tools = conn.discover_tools()
            for t in tools:
                self.register_tool(t["name"], server.name, t.get("inputSchema", {}))
            self._logger.info(f"MCP: 从 {server.name} 发现 {len(tools)} 个工具")
        except Exception as e:
            self._logger.warning(f"MCP: {server.name} 工具发现异常: {e}")

    def list_tools(self) -> list[dict]:
        """列出所有已注册的 MCP 工具"""
        return [
            {"name": t.name, "server": t.server, "schema": t.schema}
            for t in self._tools.values()
        ]

    def call_tool(self, tool_name: str, params: dict) -> dict:
        """调用 MCP 工具，代理到对应服务（支持自动重试）"""
        if tool_name in self.BUILTIN_TOOLS:
            return self._call_builtin(tool_name, params)

        tool = self._tools.get(tool_name)
        if not tool:
            return {"error": f"未知 MCP 工具: {tool_name}"}

        server = self._servers.get(tool.server)
        if not server:
            return {"error": f"MCP 服务未注册: {tool.server}"}

        return self._call_with_retry(server, tool, params)

    def _call_with_retry(self, server, tool, params, max_retries=2):
        result = None
        for attempt in range(max_retries + 1):
            try:
                if server.type == "http":
                    result = self._call_http(server, tool, params)
                elif server.type == "stdio":
                    result = self._call_stdio(server, tool, params)
                else:
                    return {"error": f"不支持的协议: {server.type}"}

                if "error" not in result:
                    return result

                error_msg = result.get("error", "")
                err = ErrorResult.classify(error_msg, tool.name)
                if not err.can_retry or attempt >= max_retries:
                    return result

                delay = (attempt + 1) * 1.5
                logger.info(f"MCP {tool.name} 重试 {attempt+1}/{max_retries}，{delay:.0f}s 后执行")
                time.sleep(delay)

            except Exception as e:
                result = {"error": str(e)}
                if attempt >= max_retries:
                    return result
                time.sleep(1.5)

        return result or {"error": "MCP 调用重试后仍失败"}

    @staticmethod
    def _call_builtin(tool_name: str, params: dict) -> dict:
        import time as _time
        if tool_name == "mcp.echo":
            text = params.get("text", "")
            return {"success": True, "echo": text, "message": f"Echo: {text}"}
        elif tool_name == "mcp.time":
            now = _time.time()
            return {
                "success": True,
                "timestamp": now,
                "iso": _time.strftime("%Y-%m-%dT%H:%M:%SZ", _time.gmtime(now)),
                "message": f"当前时间: {_time.strftime('%Y-%m-%d %H:%M:%S UTC', _time.gmtime(now))}",
            }
        return {"error": f"未知内置工具: {tool_name}"}

    def _call_stdio(self, server: MCPServerConfig, tool: MCPTool, params: dict) -> dict:
        """STDIO 方式调用 MCP 工具（复用持久连接）"""
        if not server.command:
            return {"error": f"MCP 服务 {server.name} 没有配置 command"}
        try:
            conn = self._get_stdio_connection(server)
            return conn.send_tool_call(tool.name, params)
        except Exception as e:
            self._logger.warning(f"MCP STDIO 调用失败 {tool.name}: {e}")
            return {"error": str(e)}

    def _call_http(self, server: MCPServerConfig, tool: MCPTool, params: dict) -> dict:
        """HTTP 方式调用 MCP 工具"""
        try:
            import requests
        except ImportError:
            return {"error": "需要安装 requests 库"}

        if not server.url:
            return {"error": f"MCP 服务 {server.name} 没有配置 URL"}

        try:
            url = server.url.rstrip("/")
            payload = {
                "jsonrpc": "2.0",
                "method": "tools/call",
                "params": {
                    "name": tool.name,
                    "arguments": params,
                },
                "id": 1,
            }
            self._logger.info(f"MCP: 调用 {tool.name} → {url}")
            resp = requests.post(url, json=payload, timeout=30)
            resp.raise_for_status()
            data = resp.json()
            if "error" in data:
                return {"error": data["error"].get("message", str(data["error"]))}
            return data.get("result", data)
        except Exception as e:
            self._logger.warning(f"MCP: 调用失败 {tool.name}: {e}")
            return {"error": str(e)}

    def is_available(self) -> bool:
        """是否有可用的 MCP 服务（含内置工具）"""
        return len(self._tools) > 0

    def get_tools_description(self) -> str:
        """获取 MCP 工具描述（给 LLM）"""
        if not self._tools:
            return ""
        lines = ["=== MCP 外部工具 ==="]
        for t in self._tools.values():
            desc = t.schema.get("description", "") if t.schema else ""
            lines.append(f"  - {t.name}: {desc}")
        return "\n".join(lines)

    def shutdown(self):
        """关闭所有 STDIO 连接"""
        for name, conn in self._stdio_connections.items():
            self._logger.info(f"MCP: 关闭 STDIO 连接 {name}")
            conn.close()
        self._stdio_connections.clear()


def get_mcp_registry() -> MCPRegistry:
    """获取 MCP 注册中心单例"""
    return MCPRegistry()
