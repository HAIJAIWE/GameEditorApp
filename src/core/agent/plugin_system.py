from __future__ import annotations

from collections.abc import Callable
import importlib
import json
import os
from pathlib import Path
import sys
from typing import Any, Optional

from common.logger import get_logger


class Plugin:
    def __init__(self, name: str, version: str, description: str = "",
                 author: str = "", entry: str = "", skills: list = None,
                 agents: list = None, commands: list = None):
        self.name = name
        self.version = version
        self.description = description
        self.author = author
        self.entry = entry
        self.skills = skills or []
        self.agents = agents or []
        self.commands = commands or []
        self._module: Optional[Any] = None  # 加载成功后被赋值为模块对象
        self.loaded = False

    def to_dict(self) -> dict:
        return {
            "name": self.name, "version": self.version,
            "description": self.description, "author": self.author,
            "loaded": self.loaded,
            "skills": len(self.skills), "agents": len(self.agents),
            "commands": len(self.commands),
        }


class PluginSystem:
    def __init__(self, plugin_dir: str = ""):
        self._logger = get_logger()
        self._plugin_dir = Path(plugin_dir) if plugin_dir else (
            Path(os.environ.get("APPDATA", os.path.expanduser("~"))) /
            "GameEditorApp" / "plugins"
        )
        self._plugin_dir.mkdir(parents=True, exist_ok=True)
        self._plugins: dict[str, Plugin] = {}
        self._hooks: dict[str, list[Callable]] = {}

    @property
    def plugin_dir(self) -> str:
        return str(self._plugin_dir)

    def discover(self) -> int:
        if not self._plugin_dir.exists():
            return 0
        count = 0
        for item in self._plugin_dir.iterdir():
            if item.is_dir() and (item / "plugin.json").exists():
                try:
                    manifest = json.loads((item / "plugin.json").read_text(encoding="utf-8"))
                    plugin = Plugin(
                        name=manifest.get("name", item.name),
                        version=manifest.get("version", "0.1.0"),
                        description=manifest.get("description", ""),
                        author=manifest.get("author", ""),
                        entry=manifest.get("entry", ""),
                        skills=manifest.get("skills", []),
                        agents=manifest.get("agents", []),
                        commands=manifest.get("commands", []),
                    )
                    self._plugins[plugin.name] = plugin
                    count += 1
                except Exception as e:
                    self._logger.warning(f"[Plugin] 加载 {item.name} 失败: {e}")
        self._logger.info(f"[Plugin] 发现 {count} 个插件")
        return count

    def load(self, name: str) -> bool:
        plugin = self._plugins.get(name)
        if not plugin:
            self._logger.warning(f"[Plugin] 插件不存在: {name}")
            return False
        if plugin.loaded:
            return True
        try:
            plugin_dir = self._plugin_dir / name
            if str(plugin_dir) not in sys.path:
                sys.path.insert(0, str(plugin_dir))
            if plugin.entry:
                mod = importlib.import_module(plugin.entry)
                plugin._module = mod
                if hasattr(mod, "register"):
                    hooks = mod.register()
                    for hook_name, callback in hooks.items():
                        self._hooks.setdefault(hook_name, []).append(callback)
            plugin.loaded = True
            self._logger.info(f"[Plugin] 加载成功: {name} v{plugin.version}")
            return True
        except Exception as e:
            self._logger.error(f"[Plugin] 加载失败 {name}: {e}")
            return False

    def load_all(self) -> int:
        loaded = 0
        for name in self._plugins:
            if self.load(name):
                loaded += 1
        return loaded

    def unload(self, name: str) -> bool:
        plugin = self._plugins.get(name)
        if not plugin or not plugin.loaded:
            return False
        plugin_dir = self._plugin_dir / name
        if str(plugin_dir) in sys.path:
            sys.path.remove(str(plugin_dir))
        plugin.loaded = False
        plugin._module = None
        self._logger.info(f"[Plugin] 卸载: {name}")
        return True

    def trigger_hook(self, hook_name: str, *args, **kwargs):
        for callback in self._hooks.get(hook_name, []):
            try:
                callback(*args, **kwargs)
            except Exception as e:
                self._logger.warning(f"[Plugin] Hook {hook_name} 异常: {e}")

    def list_plugins(self) -> list[dict]:
        return [p.to_dict() for p in self._plugins.values()]

    def get_plugin(self, name: str) -> Optional[Plugin]:
        return self._plugins.get(name)

    def install_from_json(self, json_path: str) -> bool:
        try:
            data = json.loads(Path(json_path).read_text(encoding="utf-8"))
            name = data.get("name", "")
            if not name:
                return False
            dest = self._plugin_dir / name
            dest.mkdir(parents=True, exist_ok=True)
            import shutil
            shutil.copy2(json_path, str(dest / "plugin.json"))
            self._plugins[name] = Plugin(
                name=name,
                version=data.get("version", "0.1.0"),
                description=data.get("description", ""),
                author=data.get("author", ""),
                entry=data.get("entry", ""),
                skills=data.get("skills", []),
                agents=data.get("agents", []),
                commands=data.get("commands", []),
            )
            self._logger.info(f"[Plugin] 安装: {name}")
            return True
        except Exception as e:
            self._logger.error(f"[Plugin] 安装失败: {e}")
            return False

    def generate_template(self, name: str, dest_dir: str = "") -> str:
        template = {
            "name": name,
            "version": "0.1.0",
            "description": f"{name} 插件",
            "author": "",
            "entry": "main",
            "skills": [],
            "agents": [],
            "commands": [],
            "hooks": ["on_agent_start", "on_tool_call", "on_agent_finish"],
        }
        output = Path(dest_dir or self._plugin_dir) / name / "plugin.json"
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(template, ensure_ascii=False, indent=2), encoding="utf-8")
        return str(output)
