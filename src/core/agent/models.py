from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional


@dataclass
class Intent:
    action: str
    category: str
    params: dict
    raw_input: str
    confidence: float = 0.0
    alternatives: list = field(default_factory=list)


@dataclass
class SkillResult:
    success: bool
    data: Any = None
    error: Optional[str] = None


@dataclass
class MemoryEntry:
    key: str
    value: Any
    source: str = "session"
    confidence: float = 1.0
    last_accessed: float = 0.0
    access_count: int = 0

    @staticmethod
    def now_timestamp() -> float:
        return datetime.now().timestamp()


@dataclass
class ExecutionContext:
    session_id: str
    data_dir: str = ""
    memory: Any = None
    extra: dict = field(default_factory=dict)


@dataclass
class FeedbackRecord:
    plan_id: str
    rating: int = 0
    comment: str = ""
    timestamp: float = 0.0
