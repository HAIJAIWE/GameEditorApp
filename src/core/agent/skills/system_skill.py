from __future__ import annotations

import os

from common.logger import get_logger
from core.agent.skill_protocol import BaseSkill
from core.agent.skills.common import normalize_params

logger = get_logger()


class SystemSkill(BaseSkill):
    name = "system.file_ops"
    description = "文件与系统操作: 读写、编辑、删除、搜索、列目录、新建文件夹、系统信息"
    version = "1.1.0"
    parameters: list = []

    PARAMS_SCHEMA = {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["read", "write", "list", "grep", "fstat", "organize", "organize_by_date",
                         "delete", "mkdir", "glob", "edit", "notify", "exists", "chat", "time", "info", "help"],
                "description": "操作类型: read(读取文件)/write(写入文件)/list(列出目录)/grep(搜索内容)/fstat(文件信息)/organize(整理文件)/organize_by_date(按日期整理)/delete(删除)/mkdir(创建目录)/glob(通配搜索)/edit(替换文本)/notify(通知)/chat(对话)/time(时间)/info(系统信息)/help(帮助)"
            },
            "path": {
                "type": "string",
                "description": "文件或目录路径"
            },
            "content": {
                "type": "string",
                "description": "要写入的文件内容(write动作)"
            },
            "keyword": {
                "type": "string",
                "description": "搜索/过滤关键词(grep/organize)"
            },
            "pattern": {
                "type": "string",
                "description": "搜索模式或glob模式(grep/glob)"
            },
            "target": {
                "type": "string",
                "description": "目标目录(organize动作)"
            },
            "old_str": {
                "type": "string",
                "description": "要替换的旧文本(edit动作)"
            },
            "new_str": {
                "type": "string",
                "description": "替换为新文本(edit动作)"
            },
            "granularity": {
                "type": "string",
                "enum": ["day", "month", "year"],
                "description": "整理粒度(organize_by_date)"
            },
            "message": {
                "type": "string",
                "description": "通知消息(notify动作)"
            }
        },
        "required": ["action"]
    }

    _ACTIONS = {
        "read": "file_read",
        "write": "file_write",
        "organize": "file_organize",
        "organize_by_date": "file_organize_by_date",
        "list": "list_files",
        "grep": "grep_content",
        "fstat": "file_info",
        "help": "show_help",
        "notify": "notify",
    }

    def execute(self, params: dict, context: dict) -> dict:
        params = normalize_params(params)
        action = params.get("action", "")
        self._logger = get_logger()

        try:
            if action == "read":
                return self._read_file(params)
            elif action == "write":
                return self._write_file(params, context)
            elif action == "organize":
                return self._organize_files(params)
            elif action == "organize_by_date":
                return self._organize_by_date(params)
            elif action == "list":
                return self._list_files(params)
            elif action == "grep":
                return self._grep_content(params)
            elif action == "fstat":
                return self._file_info(params)
            elif action == "help":
                return self._show_help()
            elif action == "notify":
                return self._notify(params)
            elif action == "chat":
                return {"success": True, "message": params.get("message", ""), "data": None}
            elif action == "time":
                return self._get_time()
            elif action == "info":
                return self._system_info()
            elif action == "delete":
                return self._delete_path(params)
            elif action == "exists":
                return self._check_exists(params)
            elif action == "mkdir":
                return self._make_dir(params)
            elif action == "glob":
                return self._glob_files(params)
            elif action == "edit":
                return self._edit_file(params)
            else:
                # 修复 P3-36: 未知 action 静默返回 OK 会让 LLM 误以为操作成功
                # 改为返回 error，并列出可用 action 帮助 LLM 自纠
                known = ["read", "write", "list", "grep", "exec", "help", "notify",
                         "chat", "time", "info", "delete", "exists", "mkdir",
                         "glob", "edit"]
                return {
                    "success": False,
                    "error": f"未知 action: {action}。可用: {', '.join(known)}",
                    "message": "",
                }
        except Exception as e:
            self._logger.error(f"SystemSkill execute failed: {e}")
            return {"success": False, "error": str(e), "message": ""}

    def _read_file(self, params: dict) -> dict:
        path = params.get("path", "")
        resolved = self._resolve_path(path)
        safe, reason = self._is_path_safe(resolved, write=False)
        if not safe:
            logger.warning(f"[Security] 拒绝读取: {resolved} ({reason})")
            return {"success": False, "error": f"安全拦截: {reason}", "message": ""}
        if not os.path.exists(resolved):
            return {"success": False, "error": f"文件不存在: {path}", "message": ""}
        try:
            with open(resolved, encoding="utf-8") as f:
                content = f.read()
            stat = os.stat(resolved)
            return {"success": True, "message": "", "data": {
                "content": content,
                "path": resolved,
                "size": stat.st_size,
                "lines": content.count('\n') + 1,
                "encoding": "utf-8",
            }}
        except UnicodeDecodeError:
            with open(resolved, "rb") as f:
                binary_content = f.read()
            return {"success": True, "message": "", "data": {
                "content": f"[二进制文件，{len(binary_content)} 字节]",
                "path": resolved,
                "size": len(binary_content),
                "encoding": "binary",
            }}
        except Exception as e:
            return {"success": False, "error": str(e), "message": ""}

    def _resolve_path(self, path: str) -> str:
        if not path:
            return ""
        if os.path.isabs(path) or path.startswith(('/', '\\', '~')):
            return os.path.expanduser(path)
        # 仅在当前工作区内解析，禁止 .. 父目录遍历（防止越权访问）
        candidate = os.path.normpath(os.path.join(os.getcwd(), path))
        return candidate

    def _grep_content(self, params: dict) -> dict:
        path = params.get("path", params.get("keyword", ""))
        pattern = params.get("pattern", params.get("content", params.get("keyword", "")))
        if not pattern:
            return {"success": False, "error": "缺少搜索关键词", "message": ""}
        try:
            resolved = self._resolve_path(path)
            safe, reason = self._is_path_safe(resolved, write=False)
            if not safe:
                logger.warning(f"[Security] 拒绝搜索: {resolved} ({reason})")
                return {"success": False, "error": f"安全拦截: {reason}", "message": ""}
            if os.path.isdir(resolved):
                results = []
                for root, _, files in os.walk(resolved):
                    for fname in files[:50]:
                        fpath = os.path.join(root, fname)
                        try:
                            with open(fpath, encoding="utf-8", errors="replace") as f:
                                for i, line in enumerate(f, 1):
                                    if pattern.lower() in line.lower():
                                        results.append({"file": fpath, "line": i, "content": line.strip()[:120]})
                                        if len(results) > 20:
                                            break
                        except Exception:
                            continue
                return {"success": True, "message": "", "data": {"matches": results, "count": len(results), "pattern": pattern}}
            elif os.path.isfile(resolved):
                with open(resolved, encoding="utf-8", errors="replace") as f:
                    lines = f.readlines()
                matches = [{"line": i, "content": line.strip()[:120]} for i, line in enumerate(lines, 1) if pattern.lower() in line.lower()]
                return {"success": True, "message": "", "data": {"matches": matches, "count": len(matches), "pattern": pattern}}
            else:
                return {"success": False, "error": f"路径不存在: {path}", "message": ""}
        except Exception as e:
            return {"success": False, "error": str(e), "message": ""}

    def _file_info(self, params: dict) -> dict:
        path = params.get("path", ".")
        resolved = self._resolve_path(path)
        safe, reason = self._is_path_safe(resolved, write=False)
        if not safe:
            logger.warning(f"[Security] 拒绝 fstat: {resolved} ({reason})")
            return {"success": False, "error": f"安全拦截: {reason}", "message": ""}
        if not os.path.exists(resolved):
            return {"success": False, "error": f"路径不存在: {path}", "message": ""}
        stat = os.stat(resolved)
        info = {
            "path": resolved,
            "size": stat.st_size,
            "size_human": self._human_size(stat.st_size),
            "modified": self._format_time(stat.st_mtime),
            "created": self._format_time(stat.st_ctime),
            "is_dir": os.path.isdir(resolved),
            "is_file": os.path.isfile(resolved),
        }
        if os.path.isdir(resolved):
            items = os.listdir(resolved)
            info["child_count"] = len(items)
            info["children"] = sorted(items)[:20]
        return {"success": True, "message": "", "data": info}

    @staticmethod
    def _human_size(size: int) -> str:
        value: float = size
        for unit in ('B', 'KB', 'MB', 'GB'):
            if value < 1024:
                return f"{value:.1f}{unit}"
            value /= 1024
        return f"{value:.1f}TB"

    @staticmethod
    def _format_time(timestamp: float) -> str:
        from datetime import datetime
        return datetime.fromtimestamp(timestamp).strftime("%Y-%m-%d %H:%M:%S")

    def _write_file(self, params: dict, context: dict) -> dict:
        path = params.get("path", "")
        content = params.get("content", params.get("keyword", ""))
        if not path:
            return {"success": False, "error": "No path specified", "message": ""}
        resolved = self._resolve_path(path)
        safe, reason = self._is_path_safe(resolved, write=True)
        if not safe:
            logger.warning(f"[Security] 拒绝写入: {resolved} ({reason})")
            return {"success": False, "error": f"安全拦截: {reason}", "message": ""}
        try:
            os.makedirs(os.path.dirname(os.path.abspath(resolved)), exist_ok=True)
            with open(resolved, "w", encoding="utf-8") as f:
                f.write(str(content))
            return {"success": True, "message": "", "data": {"path": resolved, "written": True}}
        except Exception as e:
            return {"success": False, "error": str(e), "message": ""}

    def _organize_files(self, params: dict) -> dict:
        path = params.get("path", "") or params.get("source", "")
        if not path or path.startswith("$"):
            path = os.path.expanduser("~\\Desktop")
        target = params.get("target", "")
        keyword = params.get("keyword", "")
        moved = 0
        failed = 0
        skipped = 0
        if not os.path.exists(path):
            return {"success": False, "error": f"Source not found: {path}", "message": ""}
        if target:
            os.makedirs(target, exist_ok=True)
        for item in os.listdir(path):
            if keyword and keyword.lower() not in item.lower():
                skipped += 1
                continue
            src = os.path.join(path, item)
            if not os.path.isfile(src) or not target:
                skipped += 1
                continue
            dst = os.path.join(target, item)
            counter = 1
            while os.path.exists(dst):
                name, ext = os.path.splitext(item)
                dst = os.path.join(target, f"{name}_{counter}{ext}")
                counter += 1
            try:
                os.rename(src, dst)
                moved += 1
            except Exception as e:
                failed += 1
                self._logger.warning(f"整理文件失败: {src} -> {dst} ({e})")
        return {"success": True, "message": "", "data": {
            "source": path, "target": target, "moved": moved, "failed": failed, "skipped": skipped,
        }}

    def _organize_by_date(self, params: dict) -> dict:
        path = params.get("path", "") or params.get("source", "")
        if not path or path.startswith("$"):
            path = os.path.expanduser("~\\Desktop")
        target = params.get("target", path)
        granularity = params.get("granularity", "month")
        extensions = params.get("extensions", "")
        moved = 0
        skipped = 0

        if not os.path.exists(path):
            return {"success": False, "error": f"源路径不存在: {path}", "message": ""}

        ext_filter = [e.strip().lower() for e in extensions.split(",") if e.strip()] if extensions else []

        os.makedirs(target, exist_ok=True)

        for item in os.listdir(path):
            src = os.path.join(path, item)
            if not os.path.isfile(src):
                continue
            if ext_filter:
                _, ext = os.path.splitext(item)
                if ext.lower() not in ext_filter and f".{ext.lower()}" not in ext_filter:
                    continue

            try:
                stat = os.stat(src)
                from datetime import datetime
                mtime = datetime.fromtimestamp(stat.st_mtime)
                if granularity == "day":
                    subdir = mtime.strftime("%Y-%m-%d")
                elif granularity == "year":
                    subdir = mtime.strftime("%Y")
                else:
                    subdir = mtime.strftime("%Y-%m")

                dest_dir = os.path.join(target, subdir)
                os.makedirs(dest_dir, exist_ok=True)
                dst = os.path.join(dest_dir, item)
                counter = 1
                while os.path.exists(dst):
                    name_part, ext_part = os.path.splitext(item)
                    dst = os.path.join(dest_dir, f"{name_part}_{counter}{ext_part}")
                    counter += 1
                os.rename(src, dst)
                moved += 1
            except Exception:
                skipped += 1

        return {"success": True, "message": "", "data": {
            "source": path, "target": target, "granularity": granularity,
            "moved": moved, "skipped": skipped,
        }}

    def _list_files(self, params: dict) -> dict:
        path = params.get("path", ".")
        if not os.path.exists(path):
            return {"success": False, "error": f"Path not found: {path}", "message": ""}
        items = os.listdir(path)
        return {"success": True, "message": "", "data": {"path": path, "items": items, "count": len(items)}}

    def _show_help(self) -> dict:
        help_text = (
            "墨白助手可以帮你：\n"
            "- 整理/移动/搜索文件\n"
            "- 打开网页、联网搜索\n"
            "- 执行命令行操作\n"
            "- 生成代码片段\n"
            "- 读取/写入文件\n"
            "- 启动应用程序\n"
            "- 设置定时提醒\n\n"
            "直接告诉我你想做什么就行！"
        )
        return {"success": True, "message": "", "data": {"help": help_text}}

    def _notify(self, params: dict) -> dict:
        message = params.get("message", "任务完成")
        self._logger.info(f"[NOTIFY] {message}")
        return {"success": True, "message": "", "data": {"notified": message}}

    def _get_time(self) -> dict:
        from datetime import datetime
        now = datetime.now()
        return {"success": True, "message": "", "data": {
            "iso": now.isoformat(),
            "local": now.strftime("%Y/%m/%d %H:%M:%S"),
            "timezone": str(datetime.now().astimezone().tzinfo),
            "timestamp": now.timestamp(),
        }}

    def _system_info(self) -> dict:
        import platform
        info = {
            "platform": platform.platform(),
            "system": platform.system(),
            "release": platform.release(),
            "machine": platform.machine(),
            "python": platform.python_version(),
        }
        try:
            import psutil
            info["cpu_percent"] = psutil.cpu_percent(interval=0.1)
            mem = psutil.virtual_memory()
            info["memory_total_gb"] = round(mem.total / (1024**3), 1)
            info["memory_used_pct"] = mem.percent
        except ImportError as e:
            logger.debug(f"操作失败: {e}")
        return {"success": True, "message": "", "data": info}
    # 系统关键路径：永不允许删除（即便在白名单下）
    _PROTECTED_PATHS = {
        os.path.expanduser("~"),           # 用户主目录
        os.path.expanduser("~\\Desktop"),
        os.path.expanduser("~\\Documents"),
        os.path.expanduser("~\\Downloads"),
        os.getcwd(),                       # 项目根目录
        os.path.dirname(os.getcwd()),      # 项目父目录
        "C:\\", "C:\\Windows", "C:\\Program Files", "C:\\Program Files (x86)",
        "C:\\ProgramData", "C:\\Users", "C:\\System Volume Information",
        "/", "/usr", "/etc", "/var", "/bin", "/sbin", "/root", "/home",
    }

    # 允许删除的工作区子目录白名单（项目内可写区域）
    _ALLOWED_DELETE_SUBDIRS = (
        "exports", "exports\\images", "exports/audio", "exports/docs",
        "data", "data\\libraries", "data\\ceshu",
        "logs", "日志", "temp", "tmp", "cache", ".cache",
        "策划书",
    )

    # 敏感路径模式：读写均禁止（防止 AI 提示注入窃取凭证或篡改 shell 配置）
    _SENSITIVE_PATH_PATTERNS = tuple(
        os.path.normpath(os.path.expanduser(p)) for p in (
            "~/.ssh", "~/.aws", "~/.gnupg", "~/.config/gh", "~/.docker",
            "~/.bashrc", "~/.bash_profile", "~/.zshrc", "~/.profile",
            "~/.netrc", "~/.gitconfig", "~/.kubectl", "~/.kube",
        )
    )

    # 系统关键目录：读写均禁止
    _SYSTEM_PATHS = tuple(
        os.path.normpath(p) for p in (
            "C:\\Windows", "C:\\Program Files", "C:\\Program Files (x86)",
            "C:\\ProgramData", "C:\\System Volume Information",
            "/etc", "/usr", "/bin", "/sbin", "/boot", "/sys", "/proc",
        )
    )

    @classmethod
    def _is_path_safe(cls, resolved: str, *, write: bool) -> tuple[bool, str]:
        """检查路径是否在安全边界内。

        Args:
            resolved: 已解析的绝对路径
            write: True=写/编辑/创建目录，False=读/搜索/列目录

        Returns:
            (is_safe, reason) — reason 为 "OK" 表示通过
        """
        if not resolved:
            return False, "路径为空"

        norm = os.path.normpath(os.path.abspath(resolved))

        # 1. 拒绝系统关键目录及其子目录
        for sysp in cls._SYSTEM_PATHS:
            if norm == sysp or norm.startswith(sysp + os.sep):
                return False, f"系统关键目录禁止访问: {norm}"

        # 2. 拒绝敏感凭证路径及其子目录（~/.ssh, ~/.aws 等）
        for sp in cls._SENSITIVE_PATH_PATTERNS:
            if norm == sp or norm.startswith(sp + os.sep):
                return False, f"敏感凭证路径禁止访问: {norm}"

        # 3. 写操作必须限制在项目工作区内
        if write:
            workspace = os.path.normpath(os.path.abspath(os.getcwd()))
            try:
                rel = os.path.relpath(norm, workspace)
            except ValueError:
                return False, f"跨盘路径超出工作区: {norm}"
            if rel == "." or rel.startswith(".."):
                return False, f"写操作超出工作区: {norm}（工作区: {workspace}）"

        return True, "OK"

    def _is_safe_to_delete(self, path: str) -> tuple[bool, str]:
        """检查路径是否安全删除"""
        if not path:
            return False, "路径为空"
        norm = os.path.normpath(os.path.abspath(path))
        # 1. 拒绝系统保护路径
        for protected in self._PROTECTED_PATHS:
            if norm == os.path.normpath(os.path.abspath(protected)):
                return False, f"系统保护路径禁止删除: {norm}"
        # 2. 拒绝跨盘根（如 D:\, E:\）
        drive = os.path.splitdrive(norm)[0]
        if norm == os.path.join(drive, os.sep) if drive else norm == os.sep:
            return False, f"盘根目录禁止删除: {norm}"
        # 3. 必须位于项目目录内
        cwd_abs = os.path.abspath(os.getcwd())
        try:
            rel = os.path.relpath(norm, cwd_abs)
        except ValueError:
            return False, f"路径超出工作区: {norm}"
        if rel.startswith(".."):
            return False, f"路径超出工作区: {norm}"
        # 4. 项目根目录自身禁止删除（rel == "."）
        if rel == ".":
            return False, "项目根目录禁止删除"
        # 5. 一级子目录必须在白名单内
        first_seg = rel.split(os.sep)[0].lower()
        allowed_first = {s.split(os.sep)[0].lower() for s in self._ALLOWED_DELETE_SUBDIRS}
        if first_seg not in allowed_first:
            return False, f"目录 '{first_seg}' 不在删除白名单内（允许: {sorted(allowed_first)}）"
        return True, "OK"

    def _delete_path(self, params: dict) -> dict:
        import shutil
        path = self._resolve_path(params.get("path", ""))
        if not path:
            return {"success": False, "error": "路径不能为空", "message": ""}
        if not os.path.exists(path):
            return {"success": False, "error": f"路径不存在: {path}", "message": ""}

        # 安全检查
        safe, reason = self._is_safe_to_delete(path)
        if not safe:
            logger.warning(f"[Security] 拒绝删除: {path} ({reason})")
            return {"success": False, "error": f"安全拦截: {reason}", "message": ""}

        # 危险目录（>50 个文件）需显式 confirm=true
        force = str(params.get("force", params.get("confirm", ""))).lower() in ("true", "1", "yes", "ok")
        if os.path.isdir(path):
            try:
                file_count = sum(len(files) for _, _, files in os.walk(path))
            except Exception:
                file_count = 0
            if file_count > 50 and not force:
                return {
                    "success": False,
                    "error": f"目录包含 {file_count} 个文件，需显式 force=true 才能删除: {path}",
                    "message": ""
                }

        try:
            if os.path.isdir(path):
                try:
                    shutil.rmtree(path)
                except PermissionError as e:
                    return {"success": False, "error": f"无权限删除目录: {path} ({e})", "message": ""}
            else:
                os.remove(path)
            logger.info(f"[Security] 已删除: {path}")
            return {"success": True, "message": f"已删除: {path}", "data": None}
        except Exception as e:
            return {"success": False, "error": str(e), "message": ""}

    def _check_exists(self, params: dict) -> dict:
        path = self._resolve_path(params.get("path", ""))
        return {"success": True, "message": "", "data": {"exists": os.path.exists(path), "path": path}}

    def _make_dir(self, params: dict) -> dict:
        path = self._resolve_path(params.get("path", ""))
        if not path:
            return {"success": False, "error": "路径不能为空", "message": ""}
        safe, reason = self._is_path_safe(path, write=True)
        if not safe:
            logger.warning(f"[Security] 拒绝创建目录: {path} ({reason})")
            return {"success": False, "error": f"安全拦截: {reason}", "message": ""}
        if os.path.isfile(path):
            return {"success": False, "error": f"路径已存在且为文件: {path}", "message": ""}
        os.makedirs(path, exist_ok=True)
        return {"success": True, "message": f"目录已创建: {path}", "data": None}

    def _glob_files(self, params: dict) -> dict:
        import glob
        pattern = self._resolve_path(params.get("pattern", params.get("path", "*")))
        safe, reason = self._is_path_safe(pattern, write=False)
        if not safe:
            logger.warning(f"[Security] 拒绝 glob: {pattern} ({reason})")
            return {"success": False, "error": f"安全拦截: {reason}", "message": ""}
        matches = glob.glob(pattern, recursive=True)[:50]
        return {"success": True, "message": f"找到 {len(matches)} 个文件", "data": {"files": matches}}

    def _edit_file(self, params: dict) -> dict:
        path = self._resolve_path(params.get("path", ""))
        old_str = params.get("old_str", "")
        new_str = params.get("new_str", "")
        safe, reason = self._is_path_safe(path, write=True)
        if not safe:
            logger.warning(f"[Security] 拒绝编辑: {path} ({reason})")
            return {"success": False, "error": f"安全拦截: {reason}", "message": ""}
        if not os.path.exists(path):
            return {"success": False, "error": f"文件不存在: {path}", "message": ""}
        try:
            with open(path, encoding="utf-8") as f:
                content = f.read()
        except Exception as e:
            return {"success": False, "error": f"读取文件失败: {e}", "message": ""}
        if old_str not in content:
            return {"success": False, "error": "未找到匹配文本", "message": ""}
        content = content.replace(old_str, new_str)
        try:
            with open(path, "w", encoding="utf-8") as f:
                f.write(content)
        except Exception as e:
            return {"success": False, "error": f"写入文件失败: {e}", "message": ""}
        return {"success": True, "message": f"已修改: {path}", "data": None}
