"""协议接口定义 — 解耦控制器与具体实现

控制器依赖抽象而非具体类，便于单元测试 mock 和未来替换实现。
采用 PEP 544 Protocol（结构化子类型），运行时不强制 isinstance 检查。
"""
from __future__ import annotations

from typing import Any, Optional, Protocol, runtime_checkable


@runtime_checkable
class IMainWindow(Protocol):
    """主窗口契约 — 描述 CeshuController 等控制器依赖的最小接口集"""

    @property
    def config(self) -> Any:
        """应用配置对象（含 library_manager / get_type_schema 等方法）"""
        ...

    @property
    def data_manager(self) -> Any:
        """数据管理器（提供数据查询、变更订阅）"""
        ...

    @property
    def ceshu_editor(self) -> Optional[Any]:
        """策划书编辑器实例（None 表示尚未创建）"""
        ...

    @ceshu_editor.setter
    def ceshu_editor(self, value: Optional[Any]) -> None: ...

    @property
    def tab_mgr(self) -> Optional[Any]:
        """标签页管理器"""
        ...

    def _on_ceshu_back(self) -> None: ...
    def _on_ceshu_ai_context(self, *args: Any) -> None: ...
    def _tab_dropdown_open_type_editor(self, *args: Any) -> None: ...
    def _center_stack(self) -> Any: ...


@runtime_checkable
class ILibraryManager(Protocol):
    """库管理器契约 — 描述控制器依赖的库管理接口"""

    @property
    def active_library(self) -> Optional[Any]: ...

    @property
    def active_library_name(self) -> Optional[str]: ...

    def get_type_schema(self, library_name: Optional[str] = None) -> Optional[Any]: ...

    def get_schema_path(self) -> Optional[Any]: ...

    def set_type_schema(self, schema: Any, library_name: Optional[str] = None) -> None:
        """更新内存缓存的类型模式（用于动态注册新类型后）"""
        ...

    def reload_type_schema(self, library_name: Optional[str] = None) -> None: ...


@runtime_checkable
class ITabManager(Protocol):
    """标签页管理器契约"""

    def invalidate_tab_configs(self) -> None: ...

    def get_tab_configs(self) -> list: ...


@runtime_checkable
class IDataManager(Protocol):
    """数据管理器契约"""

    def get_data(self, library: str, data_type: str) -> list: ...

    def save_data(self, library: str, data_type: str, data: list) -> bool: ...
