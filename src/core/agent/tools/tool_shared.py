from __future__ import annotations

from common.event_bus import EventBus
from config.constants import _type_registry

DATA_TYPE_PLURALS = dict(_type_registry.plurals)  # 自动同步中央注册表


def _mark_changed(mw, source: str = "ai"):
    if hasattr(mw, 'mark_data_changed'):
        mw.mark_data_changed()
    EventBus().emit("data_changed", source=source)
