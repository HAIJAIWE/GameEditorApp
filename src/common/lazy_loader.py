import importlib
import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)


class LazyImport:
    __slots__ = ("_module_path", "_attr_name", "_module", "_loaded")

    def __init__(self, module_path: str, attr_name: Optional[str] = None):
        if attr_name is None:
            parts = module_path.rsplit(".", 1)
            if len(parts) == 2:
                module_path, attr_name = parts[0], parts[1]
        self._module_path = module_path
        self._attr_name = attr_name
        self._module: Any = None
        self._loaded = False

    def _load(self):
        if self._loaded:
            return
        try:
            self._module = importlib.import_module(self._module_path)
            self._loaded = True
        except ImportError as e:
            # 加载失败时重置 _loaded，允许下次访问时重试
            self._loaded = False
            self._module = None
            logger.warning("LazyImport failed: %s -> %s", self._module_path, e)
            raise

    def __getattr__(self, name: str) -> Any:
        if self._attr_name is not None:
            self._load()
            obj = getattr(self._module, self._attr_name)
            return getattr(obj, name)
        self._load()
        return getattr(self._module, name)

    def __call__(self, *args, **kwargs):
        if self._attr_name is not None:
            self._load()
            obj = getattr(self._module, self._attr_name)
            return obj(*args, **kwargs)
        raise TypeError(f"module {self._module_path!r} is not callable")

    def __repr__(self):
        status = "loaded" if self._loaded else "lazy"
        return f"<LazyImport {self._module_path}.{self._attr_name or ''} ({status})>"


class ModuleProxy:
    def __init__(self, module_path: str):
        self._path = module_path
        self._mod: Any = None

    def _ensure(self):
        if self._mod is None:
            self._mod = importlib.import_module(self._path)
        return self._mod

    def __getattr__(self, name: str) -> Any:
        return getattr(self._ensure(), name)


class BulkLazyLoader:
    def __init__(self):
        self._registry: dict[str, LazyImport] = {}
        self._loaded: set = set()

    def register(self, alias: str, module_path: str, attr_name: Optional[str] = None):
        self._registry[alias] = LazyImport(module_path, attr_name)

    def preload(self, *aliases: str):
        for alias in aliases:
            if alias in self._registry:
                self._registry[alias]._load()

    def preload_all(self):
        for alias in self._registry:
            try:
                self._registry[alias]._load()
            except Exception as e:
                logger.warning("Preload failed for %s: %s", alias, e)

    def get(self, alias: str) -> Any:
        return self._registry[alias]

    def get_loaded_count(self) -> int:
        return sum(1 for lazy in self._registry.values() if lazy._loaded)

    def get_total_count(self) -> int:
        return len(self._registry)

    def stats(self) -> dict[str, Any]:
        return {
            "total": self.get_total_count(),
            "loaded": self.get_loaded_count(),
            "pending": self.get_total_count() - self.get_loaded_count(),
            "modules": {
                alias: "loaded" if lazy._loaded else "pending"
                for alias, lazy in self._registry.items()
            },
        }


_lazy_loader: Optional[BulkLazyLoader] = None


def get_lazy_loader() -> BulkLazyLoader:
    global _lazy_loader
    if _lazy_loader is None:
        _lazy_loader = BulkLazyLoader()
    return _lazy_loader


def lazy(module_path: str, attr_name: Optional[str] = None) -> LazyImport:
    return LazyImport(module_path, attr_name)
