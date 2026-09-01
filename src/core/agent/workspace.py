from __future__ import annotations

from pathlib import Path
import shutil
import threading
from typing import Optional

from common.logger import get_logger


class WorkspaceManager:
    """
    多工作区管理器

    每个库 = 独立的身份(persona/identity) + 独立的记忆(memory/) + 独立的策划案(plans/)
    工作区数据嵌入库目录的 .workspace/ 子目录下
    切换库 → 自动切换工作区
    """

    _instance: Optional[WorkspaceManager] = None
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
        self._root = Path(__file__).resolve().parent.parent.parent.parent / "data" / "libraries"
        self._root.mkdir(parents=True, exist_ok=True)
        self._current: str = "default"
        self._ensure_default_workspace()

    @property
    def root(self) -> Path:
        return self._root

    @property
    def current(self) -> str:
        return self._current

    @property
    def workspace_dir(self) -> Path:
        return self._root / self._current / ".workspace"

    @property
    def memory_dir(self) -> Path:
        return self.workspace_dir / "memory"

    @property
    def persona_path(self) -> Path:
        return self.workspace_dir / "persona.md"

    @property
    def identity_path(self) -> Path:
        return self.workspace_dir / "identity.md"

    @property
    def user_path(self) -> Path:
        return self.workspace_dir / "user.md"

    def _ensure_default_workspace(self):
        ws = self.workspace_dir
        ws.mkdir(parents=True, exist_ok=True)
        (ws / "memory").mkdir(parents=True, exist_ok=True)
        (ws / "plans").mkdir(parents=True, exist_ok=True)
        (ws / "sessions").mkdir(parents=True, exist_ok=True)

        persona_file = ws / "persona.md"
        if not persona_file.exists():
            persona_file.write_text(
                "# 小墨\n"
                "你是墨白可视化编辑(MB KSHBJQ)的游戏助手，名字叫小墨。\n"
                "直接高效，像搭档不像客服。\n",
                encoding="utf-8"
            )

        identity_file = ws / "identity.md"
        if not identity_file.exists():
            identity_file.write_text(
                "# 核心身份\n"
                "游戏数据编辑助手\n\n"
                "# 核心职责\n"
                "帮助用户管理和编辑游戏数据、分析游戏平衡、生成策划方案\n\n"
                "# 绝对边界\n"
                "- 绝不删除用户的项目文件\n"
                "- 绝不执行未经确认的危险操作\n"
                "- 闲聊时绝不调用工具\n\n"
                "# 工作风格\n"
                "直接高效，像搭档不像客服\n\n"
                "# 输出格式\n"
                "工具调用结果或 Markdown 文本\n",
                encoding="utf-8"
            )

    def list_workspaces(self) -> list[dict[str, str]]:
        result = []
        for d in sorted(self._root.iterdir()):
            if d.is_dir() and (d / ".workspace").is_dir():
                persona = ""
                pf = d / ".workspace" / "persona.md"
                if pf.exists():
                    persona = pf.read_text(encoding="utf-8").split("\n")[0].lstrip("#").strip()
                result.append({
                    "id": d.name,
                    "name": persona or d.name,
                    "active": d.name == self._current,
                    "path": str(d),
                })
        return result

    def create_workspace(self, name: str, persona: str = "", identity: str = "") -> bool:
        name = name.strip().replace(" ", "_").replace("/", "_").replace("\\", "_")
        if not name:
            return False
        lib = self._root / name
        lib.mkdir(parents=True, exist_ok=True)
        ws = lib / ".workspace"
        if ws.exists():
            self._logger.warning(f"工作区 {name} 已存在")
            return False
        ws.mkdir(parents=True, exist_ok=True)
        (ws / "memory").mkdir(parents=True, exist_ok=True)
        (ws / "plans").mkdir(parents=True, exist_ok=True)
        (ws / "sessions").mkdir(parents=True, exist_ok=True)
        (ws / "persona.md").write_text(persona or f"# {name}\n", encoding="utf-8")
        (ws / "identity.md").write_text(identity or f"# {name} 身份\n", encoding="utf-8")
        (ws / "user.md").write_text("", encoding="utf-8")
        self._logger.info(f"创建工作区: {name}")
        return True

    def delete_workspace(self, name: str) -> bool:
        if name == "default":
            self._logger.warning("不能删除默认工作区")
            return False
        if name == self._current:
            self._logger.warning("不能删除当前活跃的工作区，请先切换")
            return False
        ws = self._root / name / ".workspace"
        if not ws.exists():
            return False
        shutil.rmtree(ws)
        self._logger.info(f"删除工作区: {name}")
        self._remove_empty_library(name)
        return True

    def _remove_empty_library(self, name: str) -> None:
        """删除工作区后回收空的库目录壳

        create_workspace 会同时创建「库目录/」和「库目录/.workspace/」，
        但删除时只移除 .workspace，导致库目录作为空壳永久残留在
        data/libraries/ 下（例如反复出现的 test_project 空目录）。

        仅在目录确认完全为空时才删除，仍含业务数据（如 ceshu/）的库不受影响。
        """
        lib = self._root / name
        try:
            if lib.is_dir() and not any(lib.iterdir()):
                lib.rmdir()
                self._logger.info(f"清理空库目录: {name}")
        except OSError as e:
            self._logger.warning(f"清理空库目录 {name} 失败: {e}")

    def switch_workspace(self, name: str) -> bool:
        lib = self._root / name
        if not lib.exists():
            self._logger.warning(f"库 {name} 不存在，创建中...")
            lib.mkdir(parents=True, exist_ok=True)
        old = self._current
        self._current = name
        ws = self.workspace_dir
        ws.mkdir(parents=True, exist_ok=True)
        (ws / "memory").mkdir(parents=True, exist_ok=True)
        (ws / "plans").mkdir(parents=True, exist_ok=True)
        (ws / "sessions").mkdir(parents=True, exist_ok=True)
        self._logger.info(f"切换工作区: {old} → {name}")
        self._logger.info(f"工作区目录: {self.workspace_dir}")
        return True

    def read_persona(self) -> str:
        pf = self.persona_path
        if pf.exists():
            return pf.read_text(encoding="utf-8").strip()
        idf = self.identity_path
        if idf.exists():
            return idf.read_text(encoding="utf-8").strip()
        return "你是墨白可视化编辑(MB KSHBJQ)的游戏助手，名字叫小墨。直接高效，像搭档不像客服。"

    def write_persona(self, content: str):
        self.persona_path.write_text(content, encoding="utf-8")

    def read_user_profile(self) -> str:
        uf = self.user_path
        if uf.exists():
            return uf.read_text(encoding="utf-8").strip()
        return ""

    def write_user_profile(self, content: str):
        self.user_path.write_text(content, encoding="utf-8")

    def get_stats(self) -> dict:
        ws = self.workspace_dir
        conv_log = ws / "memory" / "conversation_log.jsonl"
        conv_count = 0
        if conv_log.exists():
            conv_count = len(conv_log.read_text(encoding="utf-8").strip().split("\n")) if conv_log.stat().st_size > 0 else 0
        plans_dir = ws / "plans"
        plan_count = len(list(plans_dir.iterdir())) if plans_dir.exists() else 0
        return {
            "workspace": self._current,
            "path": str(ws),
            "conversations": conv_count,
            "plans": plan_count,
            "persona_size": self.persona_path.stat().st_size if self.persona_path.exists() else 0,
        }


def get_workspace() -> WorkspaceManager:
    return WorkspaceManager()
