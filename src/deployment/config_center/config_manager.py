"""Agent OS §10 — 配置中心：集中管理所有模块配置，支持运行时热更新"""
from dataclasses import asdict, dataclass, field
import json
from pathlib import Path
from typing import Any

from common.logger import get_logger

logger = get_logger()

try:
    import yaml
    _HAS_YAML = True
except ImportError:
    _HAS_YAML = False


@dataclass
class AgentConfig:
    max_steps: int = 50
    max_retries: int = 2
    token_limit: int = 8000
    temperature: float = 0.7
    auto_reflect: bool = True
    confirm_dangerous: bool = True

@dataclass
class MemoryConfig:
    short_term_max: int = 200
    conversation_max: int = 500
    vector_dim: int = 128
    warmup_chunks: int = 5
    dedup_threshold: float = 0.92

@dataclass
class ToolConfig:
    max_parallel: int = 4
    timeout_seconds: int = 30
    sandbox_enabled: bool = True

@dataclass
class AppConfig:
    agent: AgentConfig = field(default_factory=AgentConfig)
    memory: MemoryConfig = field(default_factory=MemoryConfig)
    tools: ToolConfig = field(default_factory=ToolConfig)
    log_level: str = "INFO"
    data_dir: str = "data"


class ConfigCenter:
    """Agent OS — 配置中心单例，支持 JSON/YAML 持久化 + 运行时热更新"""

    _instance = None
    _config: AppConfig = None
    _filepath: Path = None
    _subscribers: dict[str, list] = {}

    def __new__(cls, config_dir: str = ""):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self, config_dir: str = ""):
        if self._config is not None:
            return
        self._logger = get_logger()
        self._config_dir = Path(config_dir or "data/config")
        self._config_dir.mkdir(parents=True, exist_ok=True)
        self._filepath = self._config_dir / "agent_os.yaml"
        self._config = self._load()

    @property
    def config(self) -> AppConfig:
        return self._config

    @property
    def agent(self) -> AgentConfig:
        return self._config.agent

    @property
    def memory(self) -> MemoryConfig:
        return self._config.memory

    @property
    def tools(self) -> ToolConfig:
        return self._config.tools

    def get(self, key: str, default: Any = None) -> Any:
        parts = key.split(".")
        current = asdict(self._config) if hasattr(self._config, '__dataclass_fields__') else {}
        for p in parts:
            if isinstance(current, dict):
                current = current.get(p, default)
            else:
                current = getattr(current, p, default)
            if current is None:
                return default
        return current

    def update(self, updates: dict, persist: bool = True):
        self._apply_updates(asdict(self._config) if hasattr(self._config, '__dataclass_fields__') else {}, updates)
        if persist:
            self._save()
        self._notify("config_updated", updates)

    def reload(self) -> AppConfig:
        self._config = self._load()
        self._notify("config_reloaded", {})
        return self._config

    def subscribe(self, event: str, callback):
        self._subscribers.setdefault(event, []).append(callback)

    def export_json(self) -> str:
        return json.dumps(asdict(self._config) if hasattr(self._config, '__dataclass_fields__') else {}, ensure_ascii=False, indent=2)

    def _load(self) -> AppConfig:
        data = {}
        if self._filepath.exists():
            try:
                raw = self._filepath.read_text(encoding="utf-8")
                if _HAS_YAML:
                    data = yaml.safe_load(raw) or {}
                else:
                    data = json.loads(raw)
            except Exception as e:
                self._logger.warning(f"配置加载失败，使用默认配置: {e}")
        agent_data = data.get("agent", {})
        memory_data = data.get("memory", {})
        tools_data = data.get("tools", {})
        return AppConfig(
            agent=AgentConfig(**{k: v for k, v in agent_data.items() if k in AgentConfig.__dataclass_fields__}),
            memory=MemoryConfig(**{k: v for k, v in memory_data.items() if k in MemoryConfig.__dataclass_fields__}),
            tools=ToolConfig(**{k: v for k, v in tools_data.items() if k in ToolConfig.__dataclass_fields__}),
            log_level=data.get("log_level", "INFO"),
            data_dir=data.get("data_dir", "data"),
        )

    def _save(self):
        data = asdict(self._config)
        if _HAS_YAML:
            with open(self._filepath, "w", encoding="utf-8") as f:
                yaml.dump(data, f, allow_unicode=True, default_flow_style=False)
        else:
            self._filepath.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        self._logger.info(f"配置已保存: {self._filepath}")

    def _apply_updates(self, base: dict, updates: dict, prefix: str = ""):
        for key, value in updates.items():
            path = f"{prefix}.{key}" if prefix else key
            if isinstance(value, dict):
                self._apply_updates(base.get(key, {}), value, path)
            else:
                keys = key.split(".")
                target = self._config
                for k in keys[:-1]:
                    target = getattr(target, k, None)
                    if target is None:
                        break
                if target is not None and hasattr(target, keys[-1]):
                    setattr(target, keys[-1], value)

    def _notify(self, event: str, data: dict):
        for cb in self._subscribers.get(event, []):
            try:
                cb(data)
            except Exception as e:
                logger.warning(f"操作失败: {e}")
