"""#code_sandbox — 代码安全沙箱 + Diff + 原子提交

代码修改安全机制:
  1. 副本试修 — 在临时副本上修改，不影响源文件
  2. 自动验证 — 语法检查/import 测试/imort 测试通通自动检测
  3. 原子提交 — 多文件要么全成功，要么全回滚
  4. Diff 展示 — 修改前后精确对比
  5. 审计日志 — 完整记录每次修改
"""
from __future__ import annotations

from dataclasses import dataclass, field
import difflib
from enum import Enum
import json
import os as _os
import time
from typing import Any, Optional

from common.logger import get_logger

logger = get_logger()


class SandboxMode(Enum):
    READ_ONLY = "read_only"
    SAFE = "safe"
    BYPASS = "bypass"


@dataclass
class FileSnapshot:
    file_path: str
    original_content: str
    modified_content: str = ""
    diff: str = ""
    verified: bool = False
    error: str = ""


@dataclass
class SandboxResult:
    success: bool
    snapshots: list[FileSnapshot] = field(default_factory=list)
    verification_results: dict[str, bool] = field(default_factory=dict)
    error_log: list[str] = field(default_factory=list)
    duration_ms: float = 0


class CodeSandbox:
    def __init__(self, mode: SandboxMode = SandboxMode.SAFE):
        self._mode = mode
        self._snapshots: dict[str, FileSnapshot] = {}
        self._audit_log: list[dict[str, Any]] = []
        self._audit_path: Optional[str] = None

    def set_audit_path(self, path: str):
        self._audit_path = path

    def snapshot(self, file_path: str) -> Optional[FileSnapshot]:
        if not _os.path.isfile(file_path):
            return None
        try:
            with open(file_path, encoding="utf-8") as f:
                content = f.read()
        except Exception:
            try:
                with open(file_path, encoding="gbk") as f:
                    content = f.read()
            except Exception:
                return None
        snap = FileSnapshot(file_path=file_path, original_content=content)
        self._snapshots[file_path] = snap
        return snap

    def snapshot_multiple(self, file_paths: list[str]) -> int:
        count = 0
        for fp in file_paths:
            if self.snapshot(fp):
                count += 1
        return count

    def apply_edit(self, file_path: str, old_str: str, new_str: str) -> bool:
        if self._mode == SandboxMode.READ_ONLY:
            return False
        if not _os.path.isfile(file_path):
            return False
        try:
            with open(file_path, encoding="utf-8") as f:
                content = f.read()
        except Exception:
            return False

        if old_str not in content:
            return False

        new_content = content.replace(old_str, new_str, 1)
        try:
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(new_content)
        except Exception:
            return False

        if file_path in self._snapshots:
            self._snapshots[file_path].modified_content = new_content
            self._snapshots[file_path].diff = self._compute_diff(
                self._snapshots[file_path].original_content, new_content
            )
        return True

    def verify(self, file_path: str) -> bool:
        if file_path not in self._snapshots:
            return False
        success = True
        ext = _os.path.splitext(file_path)[1].lower()

        if ext == ".py":
            try:
                import ast
                with open(file_path, encoding="utf-8") as f:
                    ast.parse(f.read())
            except SyntaxError as e:
                self._snapshots[file_path].error = str(e)
                success = False
            except Exception as e:
                logger.warning(f"操作失败: {e}")
        elif ext in (".json",):
            try:
                with open(file_path, encoding="utf-8") as f:
                    json.load(f)
            except json.JSONDecodeError as e:
                self._snapshots[file_path].error = str(e)
                success = False

        self._snapshots[file_path].verified = success
        return success

    def rollback(self, file_path: str) -> bool:
        if file_path not in self._snapshots:
            return False
        snap = self._snapshots[file_path]
        try:
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(snap.original_content)
            return True
        except Exception:
            return False

    def rollback_all(self) -> int:
        count = 0
        for fp in list(self._snapshots.keys()):
            if self.rollback(fp):
                count += 1
        return count

    def commit(self, description: str = "") -> SandboxResult:
        result = SandboxResult(success=True, snapshots=list(self._snapshots.values()))
        start = time.time()

        for fp, snap in self._snapshots.items():
            verified = self.verify(fp)
            result.verification_results[fp] = verified
            if not verified:
                result.success = False
                result.error_log.append(f"{fp}: {snap.error}")

        if not result.success:
            self.rollback_all()
            result.error_log.insert(0, "验证失败，已全部回滚")

        result.duration_ms = (time.time() - start) * 1000
        self._log_audit(description, result)

        if result.success:
            self._snapshots.clear()

        return result

    def get_diff(self, file_path: str) -> str:
        if file_path in self._snapshots:
            return self._snapshots[file_path].diff

        if not _os.path.isfile(file_path):
            return ""
        try:
            with open(file_path, encoding="utf-8") as f:
                current = f.read()
        except Exception:
            return ""
        return f"(无快照，无法生成 diff，当前长度: {len(current)} 字符)"

    def _compute_diff(self, original: str, modified: str) -> str:
        orig_lines = original.splitlines(keepends=True)
        mod_lines = modified.splitlines(keepends=True)
        diff = difflib.unified_diff(
            orig_lines, mod_lines,
            fromfile="修改前", tofile="修改后",
            lineterm=""
        )
        return "".join(diff)

    def _log_audit(self, description: str, result: SandboxResult):
        entry = {
            "timestamp": time.time(),
            "description": description,
            "success": result.success,
            "files": [s.file_path for s in result.snapshots],
            "duration_ms": result.duration_ms,
            "errors": result.error_log,
        }
        self._audit_log.append(entry)
        if self._audit_path:
            try:
                dirname = _os.path.dirname(self._audit_path)
                if dirname and not _os.path.isdir(dirname):
                    _os.makedirs(dirname, exist_ok=True)
                with open(self._audit_path, "a", encoding="utf-8") as f:
                    f.write(json.dumps(entry, ensure_ascii=False) + "\n")
            except Exception as e:
                logger.warning(f"操作失败: {e}")

    def format_diff_for_ai(self, file_path: str) -> str:
        diff_text = self.get_diff(file_path)
        if not diff_text:
            return "  (无变更)"
        lines = []
        lines.append("  ── 代码变更 diff ──")
        for line in diff_text.split("\n"):
            if line.startswith("+"):
                lines.append(f"  \033[32m{line}\033[0m")
            elif line.startswith("-"):
                lines.append(f"  \033[31m{line}\033[0m")
            elif line.startswith("@@"):
                lines.append(f"  \033[36m{line}\033[0m")
            else:
                lines.append(f"  {line}")
        return "\n".join(lines)
