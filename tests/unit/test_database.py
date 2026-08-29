"""数据库抽象层单元测试"""
import sys
import os

_PROJ_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_SRC = os.path.join(_PROJ_ROOT, 'src')
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)

import pytest
import tempfile
from deployment.database import Database, _validate_identifier


class TestValidateIdentifier:
    """标识符校验测试"""

    def test_validate_identifier_valid(self):
        """合法标识符应该通过校验"""
        assert _validate_identifier("my_table") == "my_table"
        assert _validate_identifier("_private") == "_private"
        assert _validate_identifier("Table1") == "Table1"

    def test_validate_identifier_invalid_chars(self):
        """含特殊字符的标识符应该被拒绝"""
        with pytest.raises(ValueError, match="特殊字符"):
            _validate_identifier("drop table")
        with pytest.raises(ValueError, match="特殊字符"):
            _validate_identifier("table;drop")
        with pytest.raises(ValueError, match="特殊字符"):
            _validate_identifier("1table")

    def test_validate_identifier_empty(self):
        """空标识符应该被拒绝"""
        with pytest.raises(ValueError):
            _validate_identifier("")


class TestDatabaseCRUD:
    """数据库 CRUD 操作测试"""

    @pytest.fixture
    def db(self):
        """创建临时数据库"""
        fd, path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        database = Database(path)
        yield database
        database.close()
        if os.path.exists(path):
            os.unlink(path)

    def test_create_table_and_insert(self, db):
        """建表、插入、查询的完整流程"""
        db.create_table("heroes", "id INTEGER PRIMARY KEY, name TEXT, level INTEGER")
        rowid = db.insert("heroes", {"name": "战士", "level": 10})
        assert rowid > 0
        rows = db.select("heroes")
        assert len(rows) == 1
        assert rows[0]["name"] == "战士"
        assert rows[0]["level"] == 10

    def test_insert_invalid_table(self, db):
        """向未注册的表插入数据应该失败"""
        db.create_table("heroes", "id INTEGER PRIMARY KEY, name TEXT")
        with pytest.raises(ValueError, match="未注册"):
            db.insert("nonexistent", {"name": "test"})

    def test_select_with_columns(self, db):
        """查询指定列"""
        db.create_table("items", "id INTEGER PRIMARY KEY, name TEXT, price REAL")
        db.insert("items", {"name": "长剑", "price": 100.0})
        rows = db.select("items", columns="name,price")
        assert len(rows) == 1
        assert "name" in rows[0]
        assert "price" in rows[0]
        assert "id" not in rows[0]

    def test_update(self, db):
        """更新记录"""
        db.create_table("heroes", "id INTEGER PRIMARY KEY, name TEXT, level INTEGER")
        db.insert("heroes", {"name": "战士", "level": 10})
        db.update("heroes", {"level": 20}, "name=?", ("战士",))
        rows = db.select("heroes", "name=?", ("战士",))
        assert rows[0]["level"] == 20

    def test_delete(self, db):
        """删除记录"""
        db.create_table("heroes", "id INTEGER PRIMARY KEY, name TEXT, level INTEGER")
        db.insert("heroes", {"name": "战士", "level": 10})
        db.insert("heroes", {"name": "法师", "level": 5})
        deleted = db.delete("heroes", "name=?", ("战士",))
        assert deleted == 1
        rows = db.select("heroes")
        assert len(rows) == 1
        assert rows[0]["name"] == "法师"

    def test_upsert(self, db):
        """upsert 应该插入或更新"""
        db.create_table("config", "key TEXT PRIMARY KEY, value TEXT")
        # 首次插入
        db.upsert("config", {"key": "theme", "value": "dark"}, ["key"])
        rows = db.select("config", "key=?", ("theme",))
        assert rows[0]["value"] == "dark"
        # 再次 upsert 更新
        db.upsert("config", {"key": "theme", "value": "light"}, ["key"])
        rows = db.select("config", "key=?", ("theme",))
        assert rows[0]["value"] == "light"
        # 应该只有一条记录
        all_rows = db.select("config")
        assert len(all_rows) == 1

    def test_table_exists(self, db):
        """table_exists 应该返回正确的布尔值"""
        assert db.table_exists("heroes") is False
        db.create_table("heroes", "id INTEGER PRIMARY KEY, name TEXT")
        # sqlite_master 需要在注册表中才能被 select 查询
        # table_exists 内部使用 select("sqlite_master", ...)
        # 需要先将 sqlite_master 加入注册表
        db._registered_tables.add("sqlite_master")
        assert db.table_exists("heroes") is True
        assert db.table_exists("nonexistent") is False

    def test_sql_injection_prevention(self, db):
        """包含 SQL 注入的表名应该被拒绝"""
        with pytest.raises(ValueError):
            db.create_table("users; DROP TABLE heroes--", "id INTEGER PRIMARY KEY")
        with pytest.raises(ValueError):
            db.create_table("1; DROP TABLE", "id INTEGER PRIMARY KEY")
