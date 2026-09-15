"""策划书 ↔ 游戏数据 双向同步协调器 (v5.0 工业级)

职责：
  1. systems → data: 策划书启用的系统 → 确保对应数据类型在 type_schema/default.json 中存在
  2. data → systems: 游戏数据条目数 → 回填到策划书 systems[key].config.actual_count
  3. 事件驱动: 订阅 data_changed / ceshu_changed 事件，自动响应
  4. 防循环: _syncing 标志位避免互相触发死循环

设计原则：
  - 策划书优先：systems 配置不被数据覆盖，但可创建空白数据结构
  - 不自动创建具体数据条目（避免污染用户数据）
  - 失败不抛异常，仅记录日志（同步是辅助功能，不应阻塞主流程）
"""
from __future__ import annotations

from typing import Optional

from common.event_bus import EventBus
from common.logger import get_logger


class CeshuDataSync:
    """策划书 ↔ 游戏数据 双向同步协调器"""

    def __init__(self,
                 ceshu_manager,
                 data_manager,
                 library_manager=None,
                 config=None):
        """
        Args:
            ceshu_manager: CeshuManager 实例
            data_manager: OptimizedDataManager 实例
            library_manager: 可选，LibraryManager 实例（用于 type_schema 路径）
            config: 可选，Config 实例（用于 get_type_schema / library_manager）
        """
        self._ceshu_mgr = ceshu_manager
        self._data_mgr = data_manager
        self._lib_mgr = library_manager
        self._config = config
        self._logger = get_logger()
        self._syncing = False  # 防循环标志
        self._current_ceshu_id: Optional[str] = None
        self._current_library: Optional[str] = None

        # 订阅事件
        try:
            EventBus().on("data_changed", self._on_data_changed, weak=False)
            EventBus().on("ceshu_changed", self._on_ceshu_changed, weak=False)
            EventBus().on("library_switched", self._on_library_switched, weak=False)
        except Exception as e:
            self._logger.debug(f"CeshuDataSync 订阅事件失败: {e}")

    # --- 公共 API ---

    def set_current_ceshu(self, ceshu_id: str, library: str) -> None:
        """设置当前活跃的策划书（用于精确响应事件）"""
        self._current_ceshu_id = ceshu_id
        self._current_library = library

    def sync_systems_to_data(self, model, library: str) -> dict:
        """方向 1：策划书 systems → 游戏数据结构

        - 确保启用的系统对应的 data_type 在 type_schema 中存在（动态注册）
        - 确保 default.json 中有对应的复数键数组

        Returns:
            dict: {"added_types": [...], "ensured_keys": [...], "errors": [...]}
        """
        result: dict = {"added_types": [], "ensured_keys": [], "errors": []}
        if self._syncing:
            return result
        self._syncing = True
        try:
            # 1. 收集启用的 data_type
            from core.ceshu.ceshu_model import SYSTEM_LABELS
            enabled_types: list[tuple[str, str]] = []  # (data_type, display_name)
            for sys_key, sys_cfg in model.systems.items():
                if not (isinstance(sys_cfg, dict) and sys_cfg.get("enabled")):
                    continue
                data_type = sys_cfg.get("data_type", sys_key)
                display_name = sys_cfg.get("name", SYSTEM_LABELS.get(sys_key, sys_key))
                enabled_types.append((data_type, display_name))

            if not enabled_types:
                return result

            # 2. 动态注册缺失的 type_schema
            added: list = []
            if self._config is not None:
                added = self._ensure_type_schema(enabled_types)
                result["added_types"] = added

            # 3. 确保 default.json 中有对应复数键
            ensured = self._ensure_data_keys(enabled_types)
            result["ensured_keys"] = ensured

            if added or ensured:
                self._logger.info(
                    f"[CeshuDataSync→data] 新增类型={added}, 确保键={ensured}"
                )
        except Exception as e:
            self._logger.error(f"[CeshuDataSync] sync_systems_to_data 失败: {e}",
                               exc_info=True)
            result["errors"].append(str(e))
        finally:
            self._syncing = False
        return result

    def sync_data_progress_to_ceshu(self, model, library: str,
                                     save: bool = False) -> dict:
        """方向 2：游戏数据条目数 → 策划书 systems 配置

        将 data_manager.data 中各类型的实际条目数回填到
        model.systems[key].config.actual_count

        Args:
            model: CeshuModel 实例
            library: 库名
            save: 是否保存到 ceshu.json（默认 False，仅更新内存模型）

        Returns:
            dict: {sys_key: actual_count}
        """
        result: dict = {}
        if self._syncing:
            return result
        self._syncing = True
        try:
            from config.constants import DATA_TYPE_PLURALS
            for sys_key, sys_cfg in model.systems.items():
                if not isinstance(sys_cfg, dict):
                    continue
                data_type = sys_cfg.get("data_type", sys_key)
                plural = DATA_TYPE_PLURALS.get(data_type, data_type + "s")
                count = len(self._data_mgr.data.get(plural, []))
                # 写入 config（不覆盖用户已有字段，仅更新 actual_count）
                if "config" not in sys_cfg or not isinstance(sys_cfg["config"], dict):
                    sys_cfg["config"] = {}
                sys_cfg["config"]["actual_count"] = count
                result[sys_key] = count

            if save and result:
                # 保存时标记 source="sync" 避免触发反向同步
                self._ceshu_mgr.save_ceshu(model, library)
                self._logger.debug(f"[CeshuDataSync→ceshu] 进度回填: {result}")
        except Exception as e:
            self._logger.error(f"[CeshuDataSync] sync_data_progress_to_ceshu 失败: {e}",
                               exc_info=True)
        finally:
            self._syncing = False
        return result

    def sync_both(self, model, library: str) -> dict:
        """双向同步：先 systems→data，再 data→systems 进度回填

        Returns:
            dict: {"to_data": ..., "to_ceshu": ...}
        """
        to_data = self.sync_systems_to_data(model, library)
        to_ceshu = self.sync_data_progress_to_ceshu(model, library, save=True)
        return {"to_data": to_data, "to_ceshu": to_ceshu}

    # --- 事件回调 ---

    def _on_data_changed(self, **kwargs) -> None:
        """data_changed 事件回调 → 回填进度到策划书"""
        if self._syncing:
            return
        # 防循环：data_changed 由 sync_systems_to_data 触发时跳过
        source = kwargs.get("source", "")
        if source == "sync":
            return
        if not (self._current_ceshu_id and self._current_library):
            return
        try:
            model = self._ceshu_mgr.get_ceshu(
                self._current_ceshu_id, self._current_library
            )
            self.sync_data_progress_to_ceshu(model, self._current_library, save=True)
        except Exception as e:
            self._logger.debug(f"[CeshuDataSync] _on_data_changed 跳过: {e}")

    def _on_ceshu_changed(self, **kwargs) -> None:
        """ceshu_changed 事件回调 → 确保数据结构存在"""
        if self._syncing:
            return
        source = kwargs.get("source", "")
        if source == "sync":
            return
        ceshu_id = kwargs.get("ceshu_id", "")
        library = kwargs.get("library", "")
        if not (ceshu_id and library):
            return
        try:
            model = self._ceshu_mgr.get_ceshu(ceshu_id, library)
            self.sync_systems_to_data(model, library)
        except Exception as e:
            self._logger.debug(f"[CeshuDataSync] _on_ceshu_changed 跳过: {e}")

    def _on_library_switched(self, **kwargs) -> None:
        """库切换 → 重置当前策划书上下文"""
        self._current_ceshu_id = None
        self._current_library = None

    # --- 内部辅助 ---

    def _ensure_type_schema(self, enabled_types: list[tuple[str, str]]) -> list[str]:
        """确保启用的 data_type 在 type_schema 中存在（动态注册）"""
        from core.type_schema import TypeDef, TypeField

        if self._config is None:
            return []
        schema = self._config.get_type_schema()
        if schema is None:
            return []
        existing_ids = set(schema.type_ids)
        added: list[str] = []
        for data_type, display_name in enabled_types:
            if data_type in existing_ids:
                continue
            default_fields = [
                TypeField(name="id", label="ID:", type="entry", editable=False),
                TypeField(name="name", label=f"{display_name}名称:", type="entry", editable=True),
                TypeField(name="desc", label="描述:", type="textarea", editable=True),
            ]
            new_type = TypeDef(
                id=data_type,
                name=display_name,
                plural_key=data_type + "s",
                color="#4CAF50",
                form_fields=default_fields,
                ai_context={},
            )
            schema.types.append(new_type)
            existing_ids.add(data_type)
            added.append(data_type)

        if not added:
            return []
        # 保存 type_schema
        try:
            lm = self._lib_mgr or (self._config.library_manager if self._config else None)
            if lm and lm.active_library:
                schema_path = lm.get_schema_path()
                if schema_path:
                    schema.save(schema_path)
                    lm.set_type_schema(schema, lm.active_library.name)
        except Exception as e:
            self._logger.error(f"[CeshuDataSync] 保存 type_schema 失败: {e}",
                               exc_info=True)
        return added

    def _ensure_data_keys(self, enabled_types: list[tuple[str, str]]) -> list[str]:
        """确保 default.json 中有对应复数键数组（不创建条目）"""
        from config.constants import DATA_TYPE_PLURALS
        ensured: list[str] = []
        dirty = False
        for data_type, _ in enabled_types:
            plural = DATA_TYPE_PLURALS.get(data_type, data_type + "s")
            if plural not in self._data_mgr.data:
                self._data_mgr.data[plural] = []
                ensured.append(plural)
                dirty = True
        if dirty:
            try:
                # 持久化到 default.json
                if self._data_mgr.current_file:
                    self._data_mgr.save_file()
            except Exception as e:
                self._logger.error(f"[CeshuDataSync] 保存 default.json 失败: {e}",
                                   exc_info=True)
        return ensured

    def dispose(self) -> None:
        """清理事件订阅"""
        try:
            EventBus().off("data_changed", self._on_data_changed)
            EventBus().off("ceshu_changed", self._on_ceshu_changed)
            EventBus().off("library_switched", self._on_library_switched)
        except Exception:
            pass
