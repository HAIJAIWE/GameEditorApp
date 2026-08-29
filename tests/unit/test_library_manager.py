"""测试 库管理器"""
import json
import os
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

try:
    from core.library_manager import LibraryManager, LibraryInfo, INITIAL_LIBRARY_NAME
    _HAS_DEP = True
except ImportError:
    _HAS_DEP = False


class TestLibraryInfo:
    """LibraryInfo 数据类测试"""

    def test_create_default(self):
        """测试默认创建"""
        info = LibraryInfo(name="测试库", path=Path("/tmp/test"))
        assert info.name == "测试库"
        assert Path(info.path) == Path("/tmp/test")
        assert info.data_count == 0
        assert not info.is_initial

    def test_can_delete_initial(self):
        """测试初始库不可删除"""
        info = LibraryInfo(name="初始库", path=Path("/tmp/test"), is_initial=True)
        assert not info.can_delete

    def test_can_delete_non_initial(self):
        """测试非初始库可删除"""
        info = LibraryInfo(name="普通库", path=Path("/tmp/test"), is_initial=False)
        assert info.can_delete

    def test_to_dict(self):
        """测试序列化"""
        info = LibraryInfo(
            name="测试库", path=Path("/tmp/test"),
            created_at="2024-01-01", description="描述",
            data_count=10, is_initial=True
        )
        d = info.to_dict()
        assert d["name"] == "测试库"
        assert Path(d["path"]) == Path("/tmp/test")
        assert d["data_count"] == 10
        assert d["is_initial"] is True

    def test_from_dict(self):
        """测试反序列化"""
        data = {
            "name": "测试库", "path": "/tmp/test",
            "created_at": "2024-01-01", "description": "描述",
            "data_count": 10, "is_initial": False,
        }
        info = LibraryInfo.from_dict(data)
        assert info.name == "测试库"
        assert info.data_count == 10


@pytest.mark.skipif(not _HAS_DEP, reason="core.library_manager 模块不可用")
class TestLibraryManager:
    """LibraryManager 模块测试"""

    def test_create_with_base_dir(self, temp_dir):
        """测试创建库管理器"""
        base = Path(temp_dir)
        mgr = LibraryManager(base)
        assert mgr.base_dir == base
        assert mgr.active_library is None
        assert mgr.active_library_name == ""

    def test_scan_empty_dir(self, temp_dir):
        """测试扫描空目录"""
        base = Path(temp_dir)
        mgr = LibraryManager(base)
        mgr.scan_libraries()
        # 应自动创建初始库
        assert INITIAL_LIBRARY_NAME in [lib.name for lib in mgr.get_all_libraries()]
        assert mgr.active_library is not None

    def test_scan_libraries_detects_existing(self, temp_dir):
        """测试扫描检测已有库"""
        base = Path(temp_dir)
        lib_dir = base / "libraries" / "测试库"
        lib_dir.mkdir(parents=True)
        data_file = lib_dir / "default.json"
        data_file.write_text('{"jobs": [], "items": []}', encoding='utf-8')

        mgr = LibraryManager(base)
        mgr.scan_libraries()
        names = [lib.name for lib in mgr.get_all_libraries()]
        assert "测试库" in names

    def test_create_library(self, temp_dir):
        """测试创建库"""
        base = Path(temp_dir)
        mgr = LibraryManager(base)
        mgr.scan_libraries()
        lib = mgr.create_library("新库", "测试描述")
        assert lib is not None
        assert lib.name == "新库"
        assert lib.description == "测试描述"
        assert lib.path.exists()

    def test_switch_library(self, temp_dir):
        """测试切换库"""
        base = Path(temp_dir)
        mgr = LibraryManager(base)
        mgr.scan_libraries()
        mgr.create_library("新库A", "")
        mgr.create_library("新库B", "")
        result = mgr.switch_library("新库A")
        assert result is True
        assert mgr.active_library_name == "新库A"

    def test_switch_nonexistent_library(self, temp_dir):
        """测试切换到不存在的库"""
        base = Path(temp_dir)
        mgr = LibraryManager(base)
        mgr.scan_libraries()
        result = mgr.switch_library("不存在的库")
        assert result is False

    def test_rename_library(self, temp_dir):
        """测试重命名库"""
        base = Path(temp_dir)
        mgr = LibraryManager(base)
        mgr.scan_libraries()
        mgr.create_library("旧名", "")
        result = mgr.rename_library("旧名", "新名")
        assert result is True
        names = [lib.name for lib in mgr.get_all_libraries()]
        assert "新名" in names
        assert "旧名" not in names

    def test_delete_library(self, temp_dir):
        """测试删除库"""
        base = Path(temp_dir)
        mgr = LibraryManager(base)
        mgr.scan_libraries()
        mgr.create_library("要删除的库", "")
        result = mgr.delete_library("要删除的库")
        assert result is True
        names = [lib.name for lib in mgr.get_all_libraries()]
        assert "要删除的库" not in names

    def test_cannot_delete_initial_library(self, temp_dir):
        """测试无法删除初始库"""
        base = Path(temp_dir)
        mgr = LibraryManager(base)
        mgr.scan_libraries()
        # 尝试删除初始库
        result = mgr.delete_library(INITIAL_LIBRARY_NAME)
        assert result is False

    def test_active_planning_dir(self, temp_dir):
        """测试活跃库的策划案目录"""
        base = Path(temp_dir)
        mgr = LibraryManager(base)
        mgr.scan_libraries()
        planning = mgr.active_planning_dir
        assert planning is not None
        assert planning.name == "planning"

    def test_get_type_schema_no_active(self, temp_dir):
        """测试无活跃库时获取模式"""
        base = Path(temp_dir)
        mgr = LibraryManager(base)
        # 尚未扫描，无活跃库
        schema = mgr.get_type_schema()
        assert schema is None

    def test_get_all_libraries(self, temp_dir):
        """测试获取所有库"""
        base = Path(temp_dir)
        mgr = LibraryManager(base)
        mgr.scan_libraries()
        mgr.create_library("库A", "")
        mgr.create_library("库B", "")
        all_libs = mgr.get_all_libraries()
        assert len(all_libs) >= 3  # 初始库 + 库A + 库B

    def test_get_data_path(self, temp_dir):
        """测试获取数据文件路径"""
        base = Path(temp_dir)
        mgr = LibraryManager(base)
        mgr.scan_libraries()
        path = mgr.get_data_path()
        assert path is not None
        assert path.name == "default.json"

    def test_save_library_info(self, temp_dir):
        """测试保存库信息"""
        base = Path(temp_dir)
        mgr = LibraryManager(base)
        mgr.scan_libraries()
        lib = mgr.create_library("保存测试", "")
        # 修改并保存
        lib.description = "更新描述"
        mgr.save_library_info(lib)
        # 验证文件存在
        info_file = Path(lib.path) / "library.json"
        assert info_file.exists()
        with open(info_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        assert data["description"] == "更新描述"
