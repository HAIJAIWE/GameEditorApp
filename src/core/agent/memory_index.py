"""记忆关键词索引文件读写（自 memory.py 拆出，逻辑未改动）"""
from __future__ import annotations

from datetime import datetime
import hashlib
import json
from pathlib import Path
from typing import Any, Optional

from common.logger import get_logger

logger = get_logger()


class MemoryIndex:
    """基于 JSON 的轻量级持久化索引

    存储格式: {向量目录}/{key_md5}.json → {"vector": [128 floats], "text": "原文", "timestamp": "..."}

    用于 VectorEmbedder 查询加速：搜索时优先从索引文件加载预计算向量，
    避免每次实时 n-gram hash，显著降低 CPU 开销。
    """

    def __init__(self, index_dir: Path):
        self._index_dir = Path(index_dir)
        self._index_dir.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _key_to_filename(key: str) -> str:
        safe = hashlib.md5(key.encode(), usedforsecurity=False).hexdigest()
        return f"{safe}.json"

    def filepath(self, key: str) -> Path:
        return self._index_dir / self._key_to_filename(key)

    def save(self, key: str, vector: list[float], text: str, timestamp: str = ""):
        filepath = self.filepath(key)
        data = {
            "vector": vector,
            "text": text,
            "timestamp": timestamp or datetime.now().isoformat(),
        }
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)

    def load(self, key: str) -> Optional[dict[str, Any]]:
        filepath = self.filepath(key)
        if not filepath.exists():
            return None
        try:
            with open(filepath, encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            return None

    def has(self, key: str) -> bool:
        return self.filepath(key).exists()

    def clear(self):
        for f in self._index_dir.glob("*.json"):
            try:
                f.unlink()
            except OSError as e:
                logger.debug(f"操作失败: {e}")

    def count(self) -> int:
        return len(list(self._index_dir.glob("*.json")))

    def all_keys(self) -> list[str]:
        """返回所有已索引的 key（从文件名反推不可逆，此处返回文件 stem 即 MD5 值）"""
        return [f.stem for f in self._index_dir.glob("*.json")]

    def __repr__(self) -> str:
        return f"MemoryIndex(dir={self._index_dir}, entries={self.count()})"
