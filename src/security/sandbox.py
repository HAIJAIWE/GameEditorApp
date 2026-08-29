"""Agent OS §11 — 代码沙箱：隔离执行 LLM 生成的代码

安全机制:
  1. 工作目录隔离 — 所有操作限定在沙箱目录内
  2. 危险命令拦截 — 黑名单 + 模式匹配（eval/exec/os.system/subprocess/open 等）
  3. 环境变量白名单 — 仅传递安全的环境变量，过滤敏感信息
  4. 资源限制 — 超时 + 输出截断
  5. shell=False — 命令通过 shlex 拆分为参数列表执行，天然防止命令注入
  6. 多命令分隔符检查 — 检测 ;/|/&&/|| 后的每个子命令，防止 "; rm -rf /" 绕过
  7. 路径边界检查 — 拦截绝对路径和 .. 遍历，限制文件操作在沙箱目录内
"""
from __future__ import annotations

import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
from typing import Optional

from common.logger import get_logger

logger = get_logger()


class CodeSandbox:
    """安全沙箱 — 隔离执行 LLM 生成的代码

    严禁在生产环境直接 eval/subprocess 执行未过滤的 LLM 输出。
    """

    # Python 危险模式（正则，忽略大小写）
    DANGEROUS_PATTERNS = [
        re.compile(p, re.IGNORECASE)
        for p in [
            r'rm\s+(-rf?\b|--recursive)',
            r'>\s*/dev/(sd|nvme|hd|mmcblk)',
            r'(mkfs|fdisk|dd|parted)\b',
            r'(chmod\s+777|chmod\s+-R\s+777)',
            r'wget\s+.*\|?\s*(sh|bash)',
            r'curl\s+.*\|?\s*(sh|bash)',
            r'eval\b',
            r'__import__\s*\(',
            r'(exec|compile)\s*\(',
            r'os\.(system|popen|exec|spawn)',
            r'subprocess\.(call|Popen|run)\s*\(.*shell\s*=\s*True',
            r'shutil\.rmtree',
            r'importlib',
            r'globals\s*\(\)',
            r'__builtins__',
            r'lambda\s+.*__',
            r'\bopen\s*\(',
        ]
    ]

    # Shell 危险命令首词（含命令注入后可能出现的子命令）
    DANGEROUS_COMMANDS = {
        # 破坏性
        'rm', 'rmdir', 'sudo', 'su', 'chown', 'chmod', 'mkfs', 'fdisk', 'dd',
        'parted', 'reboot', 'shutdown', 'halt', 'init', 'systemctl',
        'service', 'killall', 'pkill', 'kill',
        # 网络下载/传输（可能引入恶意内容或泄露数据）
        'wget', 'curl', 'scp', 'rsync', 'ftp', 'sftp', 'nc', 'netcat', 'telnet',
        # 包管理（可能安装恶意包）
        'pip', 'pip3', 'npm', 'yarn', 'gem', 'conda',
        # 定时任务/持久化
        'crontab', 'at', 'batch',
        # 系统信息泄露
        'env', 'export', 'passwd', 'useradd', 'userdel', 'usermod', 'adduser',
    }

    # 命令分隔符正则 — 用于拆分多命令并检查每个子命令
    _CMD_SEPARATORS = re.compile(r'[;|&]|\|\||&&|&&')

    # 环境变量白名单 — 仅这些变量会传递给沙箱子进程
    ENV_WHITELIST = {
        # 跨平台基础
        "PATH", "PATHEXT", "TEMP", "TMP",
        # Windows
        "SYSTEMROOT", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "PROGRAMDATA",
        "NUMBER_OF_PROCESSORS", "OS", "PROCESSOR_ARCHITECTURE", "PROCESSOR_IDENTIFIER",
        "COMSPEC", "WINDIR",
        # Unix
        "HOME", "USER", "LANG", "LC_ALL", "LC_CTYPE", "SHELL", "TERM",
        # Python
        "PYTHONPATH", "PYTHONIOENCODING", "PYTHONUTF8", "PYTHONHOME",
    }

    def __init__(self, workspace_dir: str = "",
                 max_timeout: float = 30.0, max_output: int = 50_000):
        """
        Args:
            workspace_dir: 沙箱工作目录，空则自动创建临时目录
            max_timeout: 最大允许超时秒数
            max_output: 输出最大字符数（超出截断）
        """
        self._logger = get_logger()
        self._max_timeout = max_timeout
        self._max_output = max_output
        self._workspace = Path(workspace_dir) if workspace_dir else Path(tempfile.mkdtemp(prefix="sandbox_"))
        self._workspace.mkdir(parents=True, exist_ok=True)

    @property
    def workspace(self) -> Path:
        """沙箱工作目录"""
        return self._workspace

    def execute(self, code: str, language: str = "python",
                timeout: float = None, env: dict = None) -> dict:
        """在沙箱中执行代码

        Args:
            code: 代码字符串
            language: 语言（python/shell/bash 等）
            timeout: 超时秒数，不超过 max_timeout
            env: 额外环境变量

        Returns:
            {"success": bool, "stdout": str, "stderr": str, "exit_code": int}
        """
        if timeout is None:
            timeout = min(self._max_timeout, 30.0)
        else:
            timeout = min(timeout, self._max_timeout)

        if language in ("python", "py"):
            return self._execute_python(code, timeout, env)
        elif language in ("shell", "sh", "bash", "cmd", "ps1", "powershell"):
            return self._execute_shell(code, timeout, env)
        else:
            return {"success": False, "stdout": "",
                    "stderr": f"不支持的语言: {language}", "exit_code": -1}

    def _build_sandbox_env(self, custom: dict = None) -> dict:
        """构建沙箱环境变量（白名单过滤 + 自定义覆盖）

        Args:
            custom: 自定义环境变量，可覆盖白名单变量

        Returns:
            过滤后的环境变量字典，始终包含 SANDBOX_WORKSPACE
        """
        env: dict[str, str] = {}
        for key in self.ENV_WHITELIST:
            if key in os.environ:
                env[key] = os.environ[key]
        env["SANDBOX_WORKSPACE"] = str(self._workspace)
        if custom:
            env.update(custom)
        return env

    def _execute_python(self, code: str, timeout: float, env: dict = None) -> dict:
        if self._scan_dangerous(code, "python"):
            return {"success": False, "stdout": "",
                    "stderr": "安全拦截: 代码包含危险操作 (eval/exec/os.system/subprocess/open 等)",
                    "exit_code": -1}

        script_file = self._workspace / f"_sandbox_{os.getpid()}.py"
        try:
            script_file.write_text(code, encoding="utf-8")
            merged_env = self._build_sandbox_env(env)

            result = subprocess.run(
                [sys.executable, str(script_file)],
                capture_output=True, text=True,
                timeout=timeout,
                cwd=str(self._workspace),
                env=merged_env,
            )
            stdout = result.stdout[:self._max_output]
            stderr = result.stderr[:self._max_output]
            success = result.returncode == 0
            return {"success": success, "stdout": stdout, "stderr": stderr,
                    "exit_code": result.returncode,
                    "truncated": len(result.stdout) > self._max_output or len(result.stderr) > self._max_output}
        except subprocess.TimeoutExpired:
            return {"success": False, "stdout": "", "stderr": f"执行超时 ({timeout}s)", "exit_code": -1}
        except Exception as e:
            return {"success": False, "stdout": "", "stderr": str(e), "exit_code": -1}
        finally:
            if script_file.exists():
                script_file.unlink(missing_ok=True)

    def _execute_shell(self, code: str, timeout: float, env: dict = None) -> dict:
        if self._scan_dangerous(code, "shell"):
            return {"success": False, "stdout": "",
                    "stderr": "安全拦截: 命令包含危险操作 (rm -rf / sudo / mkfs / dd 等)",
                    "exit_code": -1}

        merged_env = self._build_sandbox_env(env)

        # shell=False + shlex 拆分：天然防止命令注入（; | && 等被当作参数而非分隔符）
        try:
            args = shlex.split(code)
        except ValueError as e:
            return {"success": False, "stdout": "",
                    "stderr": f"命令解析失败: {e}", "exit_code": -1}

        if not args:
            return {"success": False, "stdout": "",
                    "stderr": "空命令", "exit_code": -1}

        # Windows 下需要用 cmd.exe /c 包装以支持内置命令（如 echo/dir）
        if sys.platform == "win32":
            cmd_list = ["cmd", "/c"] + args
        else:
            cmd_list = args

        try:
            result = subprocess.run(
                cmd_list, shell=False,
                capture_output=True, text=True,
                timeout=timeout,
                cwd=str(self._workspace),
                env=merged_env,
            )
            stdout = result.stdout[:self._max_output]
            stderr = result.stderr[:self._max_output]
            success = result.returncode == 0
            return {"success": success, "stdout": stdout, "stderr": stderr,
                    "exit_code": result.returncode,
                    "truncated": len(result.stdout) > self._max_output or len(result.stderr) > self._max_output}
        except subprocess.TimeoutExpired:
            return {"success": False, "stdout": "", "stderr": f"执行超时 ({timeout}s)", "exit_code": -1}
        except FileNotFoundError as e:
            return {"success": False, "stdout": "", "stderr": f"命令未找到: {e}", "exit_code": -1}
        except Exception as e:
            return {"success": False, "stdout": "", "stderr": str(e), "exit_code": -1}

    def _scan_dangerous(self, code: str, language: str) -> bool:
        """扫描代码是否包含危险模式

        Args:
            code: 代码字符串
            language: 语言（python/shell）

        Returns:
            True 表示检测到危险模式
        """
        for pattern in self.DANGEROUS_PATTERNS:
            if pattern.search(code):
                self._logger.warning(f"沙箱拦截: 危险模式匹配 [{pattern.pattern}]")
                return True

        if language == "shell":
            # 多命令分隔符检查：拆分 ;/|/&&/|| 后的每个子命令，防止 "; rm -rf /" 绕过
            sub_commands = self._CMD_SEPARATORS.split(code)
            for sub in sub_commands:
                sub = sub.strip()
                if not sub:
                    continue
                first_word = sub.split()[0] if sub.split() else ""
                first_word = first_word.lower().lstrip("./")
                if first_word in self.DANGEROUS_COMMANDS:
                    self._logger.warning(f"沙箱拦截: 危险命令 [{first_word}]")
                    return True

            # 路径边界检查：拦截绝对路径和 .. 遍历，限制文件操作在沙箱目录内
            if self._check_path_boundary(code):
                return True

        return False

    def _check_path_boundary(self, code: str) -> bool:
        """检查 shell 命令是否访问沙箱外的路径

        拦截：
          - Unix 绝对路径（/etc/passwd, /root）
          - Windows 绝对路径（C:\\Windows, D:\\）
          - 路径遍历（../../../etc/passwd）

        Returns:
            True 表示检测到越界路径访问
        """
        # Unix 绝对路径（排除 /tmp 这类允许的路径前缀）
        unix_abs = re.findall(r'(?<!\w)/[a-zA-Z][\w\-/.]*', code)
        ws_str = str(self._workspace).replace('\\', '/')
        for path in unix_abs:
            # 允许沙箱目录内的路径
            if path.startswith(ws_str):
                continue
            self._logger.warning(f"沙箱拦截: 越界绝对路径 [{path}]")
            return True

        # Windows 绝对路径（C:\\, D:\\ 等）
        win_abs = re.findall(r'[A-Za-z]:[\\/][\w\\\-/.]*', code)
        for path in win_abs:
            normalized = path.replace('\\', '/')
            if normalized.lower().startswith(ws_str.lower()):
                continue
            self._logger.warning(f"沙箱拦截: 越界绝对路径 [{path}]")
            return True

        # 路径遍历（..）
        if '..' in code:
            # 排除纯文本中合法的 .. 使用（如版本号 1..2），只匹配路径遍历模式
            if re.search(r'\.\.[\\/]', code) or re.search(r'[\\/]\.\.', code):
                self._logger.warning("沙箱拦截: 路径遍历 [..]")
                return True

        return False

    def cleanup(self):
        """清理沙箱工作目录"""
        try:
            if self._workspace.exists():
                shutil.rmtree(str(self._workspace), ignore_errors=True)
        except Exception as e:
            logger.warning(f"操作失败: {e}")


_sandbox: Optional[CodeSandbox] = None


def get_sandbox(workspace_dir: str = "") -> CodeSandbox:
    """获取全局沙箱实例（单例）"""
    global _sandbox
    if _sandbox is None or workspace_dir:
        if _sandbox:
            _sandbox.cleanup()
        _sandbox = CodeSandbox(workspace_dir=workspace_dir)
    return _sandbox
