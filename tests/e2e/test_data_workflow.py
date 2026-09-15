"""数据编辑完整工作流 E2E 测试

覆盖数据记录从创建 → 查询 → 更新 → 搜索 → 保存/重载 → 删除的完整生命周期。

基于 OptimizedDataManager 真实 API：
  - add_item(data_type, item) -> item_id   (data_type 为复数形式如 "roles"/"skills")
  - get_item(data_type, item_id) -> dict | None
  - update_item(data_type, item_id, item) -> bool   (item 字段合并到已有记录)
  - delete_item(data_type, item_id) -> bool
  - search_items(data_type, query) -> list[dict]
  - save_file(file_path) / open_file(file_path) -> bool
  - generate_id(data_type) -> str
"""
import json


class TestDataWorkflow:
    """数据编辑完整工作流测试"""

    # ── 创建与查询 ──

    def test_create_record(self, data_manager):
        """测试创建数据记录并查询"""
        record_id = data_manager.add_item("roles", {"name": "测试角色", "level": 1})
        assert record_id is not None
        # add_item 自动生成 ID（前缀+数字）
        assert record_id.startswith("ROLE")

        record = data_manager.get_item("roles", record_id)
        assert record is not None
        assert record["name"] == "测试角色"
        assert record["level"] == 1
        assert record["id"] == record_id

    def test_create_with_explicit_id(self, data_manager):
        """测试使用显式 ID 创建记录"""
        record_id = data_manager.add_item(
            "roles", {"id": "ROLE999", "name": "显式ID角色"}
        )
        assert record_id == "ROLE999"
        record = data_manager.get_item("roles", "ROLE999")
        assert record["name"] == "显式ID角色"

    def test_get_nonexistent_item(self, data_manager):
        """测试获取不存在的记录返回 None"""
        assert data_manager.get_item("roles", "NONEXISTENT") is None

    def test_generate_id(self, data_manager):
        """测试 ID 自动生成与递增"""
        id1 = data_manager.generate_id("role")
        id2 = data_manager.generate_id("role")
        assert id1.startswith("ROLE")
        assert id2.startswith("ROLE")
        assert id1 != id2

    # ── 更新 ──

    def test_update_record(self, data_manager):
        """测试更新数据记录（部分字段更新，未更新字段保持不变）"""
        record_id = data_manager.add_item(
            "roles", {"name": "原名称", "level": 1, "hp": 100}
        )

        ok = data_manager.update_item("roles", record_id, {"level": 5})
        assert ok is True

        record = data_manager.get_item("roles", record_id)
        assert record["level"] == 5
        # 未更新的字段保持不变
        assert record["name"] == "原名称"
        assert record["hp"] == 100

    def test_update_nonexistent_returns_false(self, data_manager):
        """测试更新不存在的记录返回 False"""
        ok = data_manager.update_item("roles", "NONEXISTENT", {"level": 5})
        assert ok is False

    def test_update_multiple_fields(self, data_manager):
        """测试同时更新多个字段"""
        record_id = data_manager.add_item(
            "skills", {"name": "火球术", "damage": 50, "cost": 10}
        )
        data_manager.update_item("skills", record_id, {"damage": 80, "cost": 15})

        record = data_manager.get_item("skills", record_id)
        assert record["damage"] == 80
        assert record["cost"] == 15
        assert record["name"] == "火球术"

    # ── 删除 ──

    def test_delete_record(self, data_manager):
        """测试删除数据记录"""
        record_id = data_manager.add_item("roles", {"name": "删除测试", "level": 1})
        assert data_manager.get_item("roles", record_id) is not None

        ok = data_manager.delete_item("roles", record_id)
        assert ok is True
        assert data_manager.get_item("roles", record_id) is None

    def test_delete_nonexistent_returns_false(self, data_manager):
        """测试删除不存在的记录返回 False"""
        ok = data_manager.delete_item("roles", "NONEXISTENT")
        assert ok is False

    # ── 列表与搜索 ──

    def test_list_records(self, data_manager):
        """测试列出数据记录"""
        for i in range(5):
            data_manager.add_item("roles", {"name": f"角色{i}", "level": i + 1})

        records = data_manager.data.get("roles", [])
        assert len(records) >= 5

    def test_search_records_by_name(self, data_manager):
        """测试按名称搜索数据记录"""
        data_manager.add_item("roles", {"name": "战士", "level": 10})
        data_manager.add_item("roles", {"name": "法师", "level": 10})
        data_manager.add_item("roles", {"name": "战士队长", "level": 20})

        results = data_manager.search_items("roles", "战士")
        # "战士" 和 "战士队长" 都应匹配
        assert len(results) >= 2
        names = [r["name"] for r in results]
        assert "战士" in names
        assert "战士队长" in names
        assert "法师" not in names

    def test_search_empty_query_returns_all(self, data_manager):
        """测试空查询返回全部记录"""
        for i in range(3):
            data_manager.add_item("items", {"name": f"道具{i}"})

        results = data_manager.search_items("items", "")
        assert len(results) >= 3

    def test_search_no_match(self, data_manager):
        """测试搜索无匹配返回空列表"""
        data_manager.add_item("roles", {"name": "测试角色"})
        results = data_manager.search_items("roles", "不存在的关键词XYZ")
        assert len(results) == 0

    def test_search_by_desc_field(self, data_manager):
        """测试按描述字段搜索"""
        data_manager.add_item("skills", {"name": "冰霜", "desc": "冰系攻击技能"})
        data_manager.add_item("skills", {"name": "火焰", "desc": "火系攻击技能"})

        results = data_manager.search_items("skills", "冰系")
        assert len(results) == 1
        assert results[0]["name"] == "冰霜"

    # ── 保存与重载（数据完整性）──

    def test_save_and_reload(self, data_manager, temp_workspace):
        """测试保存到文件后重新加载，验证数据完整性"""
        data_manager.add_item("roles", {"name": "保存角色", "level": 10, "hp": 200})
        data_manager.add_item("skills", {"name": "保存技能", "damage": 50})

        data_file = temp_workspace / "test_data.json"
        assert data_manager.save_file(data_file) is True
        assert data_file.exists()

        # 创建新管理器并加载文件
        from core.data_manager import OptimizedDataManager
        new_mgr = OptimizedDataManager()
        assert new_mgr.open_file(data_file) is True

        roles = new_mgr.data.get("roles", [])
        assert len(roles) >= 1
        assert any(r["name"] == "保存角色" for r in roles)

        skills = new_mgr.data.get("skills", [])
        assert len(skills) >= 1
        assert any(s["name"] == "保存技能" for s in skills)

        # 验证字段完整性
        saved_role = next(r for r in roles if r["name"] == "保存角色")
        assert saved_role["level"] == 10
        assert saved_role["hp"] == 200

        new_mgr._saved_version = new_mgr._data_version
        new_mgr.current_file = None
        new_mgr.shutdown()

    def test_save_file_content_is_valid_json(self, data_manager, temp_workspace):
        """测试保存的文件是合法 JSON 且结构正确"""
        data_manager.add_item("roles", {"name": "JSON验证", "level": 1})

        data_file = temp_workspace / "json_check.json"
        data_manager.save_file(data_file)

        data = json.loads(data_file.read_text(encoding="utf-8"))
        assert isinstance(data, dict)
        assert "roles" in data
        assert isinstance(data["roles"], list)

    # ── 多类型数据 ──

    def test_multiple_data_types(self, data_manager):
        """测试同时管理多种数据类型"""
        data_manager.add_item("roles", {"name": "角色A"})
        data_manager.add_item("skills", {"name": "技能A"})
        data_manager.add_item("items", {"name": "道具A"})
        data_manager.add_item("monsters", {"name": "怪物A"})

        assert len(data_manager.data["roles"]) >= 1
        assert len(data_manager.data["skills"]) >= 1
        assert len(data_manager.data["items"]) >= 1
        assert len(data_manager.data["monsters"]) >= 1

    # ── 清空 ──

    def test_clear_all(self, data_manager):
        """测试清空所有数据"""
        data_manager.add_item("roles", {"name": "角色1"})
        data_manager.add_item("skills", {"name": "技能1"})

        assert len(data_manager.data["roles"]) >= 1

        ok = data_manager.clear_all()
        assert ok is True

        for key in data_manager.data:
            assert len(data_manager.data[key]) == 0

    # ── 完整工作流 ──

    def test_full_workflow(self, data_manager, temp_workspace):
        """测试数据编辑完整生命周期：创建→查询→更新→搜索→保存→重载→删除"""
        # 1. 创建多条记录
        id1 = data_manager.add_item("roles", {"name": "战士", "level": 1, "hp": 100})
        id2 = data_manager.add_item("roles", {"name": "法师", "level": 1, "hp": 80})
        id3 = data_manager.add_item("roles", {"name": "战士队长", "level": 5, "hp": 200})

        # 2. 查询验证
        assert data_manager.get_item("roles", id1)["name"] == "战士"
        assert data_manager.get_item("roles", id2)["name"] == "法师"

        # 3. 更新
        data_manager.update_item("roles", id1, {"level": 10, "hp": 300})
        updated = data_manager.get_item("roles", id1)
        assert updated["level"] == 10
        assert updated["hp"] == 300
        assert updated["name"] == "战士"  # 原字段保留

        # 4. 搜索
        results = data_manager.search_items("roles", "战士")
        assert len(results) == 2  # "战士" 和 "战士队长"

        # 5. 保存并重载
        data_file = temp_workspace / "full_workflow.json"
        data_manager.save_file(data_file)

        from core.data_manager import OptimizedDataManager
        new_mgr = OptimizedDataManager()
        new_mgr.open_file(data_file)
        assert len(new_mgr.data["roles"]) >= 3

        # 6. 重载后删除
        assert new_mgr.delete_item("roles", id3) is True
        assert new_mgr.get_item("roles", id3) is None
        assert len(new_mgr.data["roles"]) >= 2

        new_mgr._saved_version = new_mgr._data_version
        new_mgr.current_file = None
        new_mgr.shutdown()

    # ── 特殊字符与边界 ──

    def test_special_characters(self, data_manager):
        """测试特殊字符在数据中的存取"""
        record_id = data_manager.add_item(
            "roles",
            {"name": "角色@#$%^&", "desc": "包含中文、English和符号!@#$"}
        )
        record = data_manager.get_item("roles", record_id)
        assert record["name"] == "角色@#$%^&"
        assert record["desc"] == "包含中文、English和符号!@#$"

    def test_large_data(self, data_manager):
        """测试大量数据操作"""
        for i in range(50):
            data_manager.add_item("items", {"name": f"道具{i}", "value": i})

        assert len(data_manager.data["items"]) >= 50

        # 搜索应正确过滤
        results = data_manager.search_items("items", "道具4")
        # "道具4", "道具40"-"道具49" 都包含 "道具4"
        assert len(results) >= 1
