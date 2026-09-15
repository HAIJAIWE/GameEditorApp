from __future__ import annotations

import os
import platform
import re
import shlex
import subprocess
import threading

from common.logger import get_logger
from core.agent.skill_protocol import BaseSkill
from core.agent.skills.common import normalize_params

_SAFE_COMMANDS = frozenset({
    "dir", "type", "echo", "cd", "copy", "move", "ren",
    "find", "findstr", "where", "whoami", "hostname",
    "systeminfo", "tasklist", "ver", "date", "time",
    "tree", "more", "sort", "fc", "set", "path",
    "python", "node", "npm", "git",
    "ls", "cat", "pwd", "cp", "mv", "head", "tail",
    "grep", "wc", "du", "df", "which", "env", "uname",
})

_BLOCKED_PATTERNS = [
    r"\bdangerous_process_remover\b", r"\bformat\b", r"\bdel\s+/[fsq]",
    r"\brm\s+-rf\b", r">\s*[/\\].*system32", r"rd\s+/s",
]


def _validate_command(command: str) -> tuple:
    if not command or not command.strip():
        return False, "命令不能为空"
    cmd_lower = command.strip().lower()
    for pattern in _BLOCKED_PATTERNS:
        if re.search(pattern, cmd_lower):
            return False, f"命令被安全策略拦截: 匹配危险模式 '{pattern}'"
    try:
        parts = shlex.split(command, posix=(platform.system() != "Windows"))
    except ValueError as e:
        return False, f"命令解析失败: {e}"
    if not parts:
        return False, "命令解析为空"
    executable = parts[0].lower()
    base = os.path.splitext(os.path.basename(executable).lower())[0]
    if base not in _SAFE_COMMANDS:
        return False, f"命令 '{base}' 不在安全白名单中。允许的命令: {', '.join(sorted(_SAFE_COMMANDS))[:200]}"
    return True, parts


class ShellSkill(BaseSkill):
    name = "system.shell"
    description = "命令行执行: exec/bg/status/stop/list/sandbox/python"
    version = "2.2.0"
    parameters: list = []

    PARAMS_SCHEMA = {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["exec", "bg", "status", "stop", "list", "sandbox", "python"],
                "description": "操作: exec(执行命令)/bg(后台执行)/status(查看状态)/stop(停止)/list(列出进程)/sandbox(沙箱)/python(运行Python)"
            },
            "command": {
                "type": "string",
                "description": "要执行的命令"
            },
            "cwd": {
                "type": "string",
                "description": "工作目录"
            },
            "script": {
                "type": "string",
                "description": "Python脚本(python动作)"
            },
            "code": {
                "type": "string",
                "description": "Python代码(sandbox/python动作)"
            },
            "pid": {
                "type": "integer",
                "description": "后台进程ID(stop动作)"
            }
        },
        "required": ["action"]
    }

    tags = ["shell", "terminal", "command", "background", "process", "sandbox", "python"]

    _bg_processes: dict[int, dict] = {}
    _bg_lock = threading.Lock()
    _bg_counter = 0

    def execute(self, params: dict, context: dict) -> dict:
        params = normalize_params(params)
        self._logger = get_logger()
        action = params.get("action", "exec")

        try:
            if action == "exec":
                return self._exec_command(params, context)
            elif action == "sandbox":
                return self._sandbox_exec(params, context)
            elif action == "python":
                return self._sandbox_python(params, context)
            elif action == "bg":
                return self._bg_command(params, context)
            elif action == "status":
                return self._check_status(params)
            elif action == "stop":
                return self._stop_process(params)
            elif action == "list":
                return self._list_processes()
            else:
                return {"success": False, "error": f"未知 action: {action}", "message": ""}
        except Exception as e:
            self._logger.error(f"ShellSkill 异常: {e}", exc_info=True)
            return {"success": False, "error": str(e), "message": ""}

    def _exec_command(self, params: dict, context: dict) -> dict:
        command = params.get("command", "")
        cwd = params.get("cwd", os.getcwd())
        timeout = int(params.get("timeout", 60))

        if not command:
            return {"success": False, "error": "缺少 command 参数", "message": ""}

        valid, parts_or_error = _validate_command(command)
        if not valid:
            return {"success": False, "error": str(parts_or_error), "message": ""}

        try:
            result = subprocess.run(
                parts_or_error, shell=False, cwd=cwd,
                capture_output=True, text=True, timeout=timeout
            )
            stdout = (result.stdout.strip() or "")[:3000]
            stderr = (result.stderr.strip() or "")[:2000]
            output = stdout or stderr
            if result.returncode != 0 and not output:
                output = f"退出码: {result.returncode}"

            return {
                "success": result.returncode == 0,
                "message": output[:2000] or "(无输出)",
                "data": {
                    "exit_code": result.returncode,
                    "stdout": stdout,
                    "stderr": stderr,
                    "output": output,
                }
            }
        except subprocess.TimeoutExpired:
            return {"success": False, "error": f"命令超时 ({timeout}s)", "message": ""}
        except FileNotFoundError:
            return {"success": False, "error": f"命令未找到: {parts_or_error[0] if isinstance(parts_or_error, list) else command.split()[0]}", "message": ""}
        except Exception as e:
            self._logger.error(f"命令执行异常: {e}")
            return {"success": False, "error": f"命令执行失败: {e}", "message": ""}

    _MAX_BG_PROCESSES = 10

    def _bg_command(self, params: dict, context: dict) -> dict:
        command = params.get("command", "")
        cwd = params.get("cwd", os.getcwd())

        if not command:
            return {"success": False, "error": "缺少 command 参数", "message": ""}

        valid, parts_or_error = _validate_command(command)
        if not valid:
            return {"success": False, "error": str(parts_or_error), "message": ""}

        with self._bg_lock:
            if len(ShellSkill._bg_processes) >= ShellSkill._MAX_BG_PROCESSES:
                return {"success": False, "error": f"后台进程已达上限 ({ShellSkill._MAX_BG_PROCESSES}个)，请先停止部分进程", "message": ""}

        try:
            proc = subprocess.Popen(
                parts_or_error, shell=False, cwd=cwd,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                text=True
            )

            with self._bg_lock:
                ShellSkill._bg_counter += 1
                pid = ShellSkill._bg_counter
                object.__setattr__(proc, "pid_label", pid)  # Popen 无静态 pid_label 属性，动态附加
                ShellSkill._bg_processes[pid] = {
                    "process": proc, "command": command,
                    "cwd": cwd, "started": True
                }

            return {
                "success": True,
                "message": f"后台进程已启动 [pid={pid}]: {command[:80]}",
                "data": {"pid": pid, "command": command}
            }
        except Exception as e:
            return {"success": False, "error": f"后台启动失败: {e}", "message": ""}

    def _check_status(self, params: dict) -> dict:
        pid = params.get("pid", 0)
        with self._bg_lock:
            if pid and pid in ShellSkill._bg_processes:
                info = ShellSkill._bg_processes[pid]
                proc = info["process"]
                poll = proc.poll()
                status = "运行中" if poll is None else f"已退出 (code={poll})"
                return {
                    "success": True,
                    "message": f"进程 [pid={pid}] {status}: {info['command'][:60]}",
                    "data": {"pid": pid, "status": status, "exit_code": poll, "found": True}
                }

            msg = f"未找到进程 pid={pid}" if pid else "无后台进程"
            return {"success": True, "message": msg, "data": {"pid": pid, "found": False}}

    def _stop_process(self, params: dict) -> dict:
        pid = params.get("pid", 0)
        with self._bg_lock:
            if pid not in ShellSkill._bg_processes:
                return {"success": False, "error": f"未找到进程 pid={pid}", "message": ""}
            info = ShellSkill._bg_processes.pop(pid)
            proc = info["process"]
            try:
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
            except Exception as e:
                self._logger.error(f"终止进程 [pid={pid}] 失败: {e}")
                return {"success": False, "error": f"终止进程失败: {e}", "message": "", "data": {"pid": pid}}
            return {
                "success": True,
                "message": f"已终止进程 [pid={pid}]: {info['command'][:60]}",
                "data": {"pid": pid}
            }

    def _list_processes(self) -> dict:
        with self._bg_lock:
            if not ShellSkill._bg_processes:
                return {"success": True, "message": "无后台进程", "data": {"processes": {}}}
            lines = []
            for pid, info in ShellSkill._bg_processes.items():
                proc = info["process"]
                poll = proc.poll()
                status = "运行中" if poll is None else "已退出"
                lines.append(f"[pid={pid}] {status}: {info['command'][:60]}")
            return {
                "success": True,
                "message": "\n".join(lines),
                "data": {"processes": {str(k): v["command"] for k, v in ShellSkill._bg_processes.items()}}
            }

    def _sandbox_exec(self, params: dict, context: dict) -> dict:
        """沙箱执行 shell 命令 — 危险命令拦截 + 工作目录隔离 + 超时"""
        command = params.get("command", params.get("code", ""))
        timeout = int(params.get("timeout", 30))

        if not command:
            return {"success": False, "error": "缺少 command 参数", "message": ""}

        from security.sandbox import get_sandbox
        sandbox = get_sandbox()
        result = sandbox.execute(command, language="shell", timeout=timeout)
        output = result.get("stdout", "").strip() or result.get("stderr", "").strip()
        return {
            "success": result.get("success", False),
            "message": output[:2000] or "(无输出)",
            "data": {
                **result,
                "sandbox": True,
            }
        }

    def _sandbox_python(self, params: dict, context: dict) -> dict:
        """沙箱执行 Python 代码 — 拦截 eval/exec/os/system 等危险操作"""
        code = params.get("code", params.get("command", ""))
        timeout = int(params.get("timeout", 30))

        if not code:
            return {"success": False, "error": "缺少 code 参数", "message": ""}

        from security.sandbox import get_sandbox
        sandbox = get_sandbox()
        result = sandbox.execute(code, language="python", timeout=timeout)
        output = result.get("stdout", "").strip()
        return {
            "success": result.get("success", False),
            "message": output[:2000] or "(无输出)",
            "data": {
                **result,
                "sandbox": True,
            }
        }
