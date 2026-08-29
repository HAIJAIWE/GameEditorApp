"""Agent OS §10 — 版本管理：Git语义版本 + 变更日志 + 发布检查清单"""
from datetime import datetime
from pathlib import Path
import subprocess

from common.logger import get_logger


class VersionManager:
    """Agent OS — 版本管理器"""

    VERSION_FILE = "VERSION"
    CHANGELOG_FILE = "CHANGELOG.md"

    def __init__(self, project_root: str = ""):
        self._root = Path(project_root or Path(__file__).parent.parent.parent)
        self._logger = get_logger()

    def current_version(self) -> str:
        vf = self._root / self.VERSION_FILE
        if vf.exists():
            return vf.read_text(encoding="utf-8").strip()
        return "0.0.0"

    def bump(self, level: str = "patch", message: str = "") -> str:
        major, minor, patch = map(int, self.current_version().split("."))
        if level == "major":
            major += 1; minor = 0; patch = 0
        elif level == "minor":
            minor += 1; patch = 0
        else:
            patch += 1
        new_ver = f"{major}.{minor}.{patch}"

        vf = self._root / self.VERSION_FILE
        vf.write_text(new_ver + "\n", encoding="utf-8")
        self._append_changelog(new_ver, message)
        self._logger.info(f"版本升至 {new_ver} ({level}): {message}")
        return new_ver

    def _append_changelog(self, version: str, message: str):
        cf = self._root / self.CHANGELOG_FILE
        entry = f"\n## [{version}] - {datetime.now().strftime('%Y-%m-%d')}\n- {message}\n"
        if cf.exists():
            content = cf.read_text(encoding="utf-8")
            idx = content.find("\n## [")
            if idx > 0:
                content = content[:idx] + entry + content[idx:]
            else:
                content = content.rstrip() + "\n" + entry
            cf.write_text(content, encoding="utf-8")
        else:
            cf.write_text(f"# Changelog\n\n{entry}", encoding="utf-8")

    def git_info(self) -> dict:
        try:
            branch = subprocess.check_output(
                ["git", "rev-parse", "--abbrev-ref", "HEAD"],
                cwd=str(self._root), stderr=subprocess.DEVNULL, text=True
            ).strip()
            commit = subprocess.check_output(
                ["git", "rev-parse", "--short", "HEAD"],
                cwd=str(self._root), stderr=subprocess.DEVNULL, text=True
            ).strip()
            dirty = subprocess.run(
                ["git", "diff", "--quiet"],
                cwd=str(self._root), stderr=subprocess.DEVNULL
            ).returncode != 0
            return {"branch": branch, "commit": commit, "dirty": dirty, "git": True}
        except Exception:
            return {"branch": "unknown", "commit": "unknown", "dirty": False, "git": False}

    def release_checklist(self) -> dict:
        ver = self.current_version()
        git = self.git_info()
        vf = (self._root / self.VERSION_FILE).exists()
        cf = (self._root / self.CHANGELOG_FILE).exists()
        return {
            "version": ver,
            "git": git,
            "checks": {
                "version_file": vf,
                "changelog": cf,
                "clean_tree": not git.get("dirty", True),
            },
            "ready": all([vf, cf, not git.get("dirty", True)]),
        }
