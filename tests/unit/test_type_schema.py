"""TypeSchema 类型模式模块单元测试

覆盖 TypeField / TypeDef / TypeSchema 的创建、序列化、查询、合并与升级检测。
"""
import os
import sys

_PROJ_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_SRC = os.path.join(_PROJ_ROOT, "src")
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)



from core.type_schema import TypeDef, TypeField, TypeSchema

# ── 辅助工厂 ──

def make_field(name="hp", label="HP:", type="entry", **kwargs):
    return TypeField(name=name, label=label, type=type, **kwargs)


def make_type_def(type_id="character", name="角色", plural_key="characters"):
    return TypeDef(
        id=type_id,
        name=name,
        plural_key=plural_key,
        form_fields=[
            TypeField(name="id", label="ID:", type="entry", editable=False),
            TypeField(name="name", label="名称:", type="entry"),
            TypeField(name="level", label="等级:", type="spinbox", from_=1, to=99),
            TypeField(name="class", label="职业:", type="combobox", values=["战士", "法师", "盗贼"]),
            TypeField(name="desc", label="描述:", type="desc"),
            TypeField(name="image", label="图片:", type="image"),
        ],
    )


# ── TypeField 测试 ──

class TestTypeField:
    """TypeField 数据类测试"""

    def test_creation_with_defaults(self):
        """默认值创建 — 只传必填参数"""
        f = TypeField(name="hp", label="HP:", type="entry")
        assert f.name == "hp"
        assert f.label == "HP:"
        assert f.type == "entry"
        assert f.editable is True
        assert f.values is None
        assert f.from_ is None
        assert f.to is None
        assert f.ref_type is None

    def test_creation_with_all_params(self):
        """全参数创建"""
        f = TypeField(
            name="level", label="等级:", type="spinbox",
            editable=False, from_=1, to=99,
        )
        assert f.editable is False
        assert f.from_ == 1
        assert f.to == 99

    def test_to_dict_basic(self):
        """基本序列化 — 可选字段为 None 时不输出"""
        f = TypeField(name="name", label="名称:", type="entry")
        d = f.to_dict()
        assert d == {"name": "name", "label": "名称:", "type": "entry", "editable": True}

    def test_to_dict_with_optional_fields(self):
        """可选字段有值时出现在序列化结果中"""
        f = TypeField(
            name="type", label="类型:", type="combobox",
            values=["A", "B"], from_=1, to=10, ref_type="item",
        )
        d = f.to_dict()
        assert d["values"] == ["A", "B"]
        assert d["from_"] == 1
        assert d["to"] == 10
        assert d["ref_type"] == "item"

    def test_from_dict_defaults(self):
        """从字典创建 — 缺失字段使用默认值"""
        f = TypeField.from_dict({"name": "x", "label": "X:", "type": "entry"})
        assert f.editable is True
        assert f.values is None
        assert f.from_ is None

    def test_from_dict_empty(self):
        """从空字典创建 — 全部使用默认值"""
        f = TypeField.from_dict({})
        assert f.name == ""
        assert f.label == ""
        assert f.type == "entry"

    def test_roundtrip(self):
        """序列化/反序列化往返一致性"""
        original = TypeField(
            name="type", label="类型:", type="combobox",
            values=["A", "B"], from_=1, to=10, ref_type="item",
            editable=False,
        )
        restored = TypeField.from_dict(original.to_dict())
        assert restored.name == original.name
        assert restored.label == original.label
        assert restored.type == original.type
        assert restored.editable == original.editable
        assert restored.values == original.values
        assert restored.from_ == original.from_
        assert restored.to == original.to
        assert restored.ref_type == original.ref_type


# ── TypeDef 测试 ──

class TestTypeDef:
    """TypeDef 数据类测试"""

    def test_creation_with_defaults(self):
        """默认值创建"""
        td = TypeDef(id="item", name="物品", plural_key="items")
        assert td.id == "item"
        assert td.name == "物品"
        assert td.plural_key == "items"
        assert td.color == "#4CAF50"
        assert td.form_fields == []
        assert td.ai_context == {}

    def test_to_dict(self):
        """序列化为字典"""
        td = make_type_def()
        d = td.to_dict()
        assert d["id"] == "character"
        assert d["name"] == "角色"
        assert d["plural_key"] == "characters"
        assert d["color"] == "#4CAF50"
        assert len(d["form_fields"]) == 6
        assert d["ai_context"] == {}

    def test_from_dict(self):
        """从字典创建"""
        data = {
            "id": "monster",
            "name": "怪物",
            "plural_key": "monsters",
            "color": "#FF0000",
            "form_fields": [
                {"name": "id", "label": "ID:", "type": "entry", "editable": False},
                {"name": "name", "label": "名称:", "type": "entry"},
            ],
            "ai_context": {"role": "怪物设计师"},
        }
        td = TypeDef.from_dict(data)
        assert td.id == "monster"
        assert td.name == "怪物"
        assert td.color == "#FF0000"
        assert len(td.form_fields) == 2
        assert td.form_fields[0].name == "id"
        assert td.ai_context == {"role": "怪物设计师"}

    def test_from_dict_minimal(self):
        """从最小字典创建 — 缺失字段使用默认值"""
        td = TypeDef.from_dict({"id": "x"})
        assert td.id == "x"
        assert td.name == ""
        assert td.color == "#4CAF50"
        assert td.form_fields == []

    def test_roundtrip(self):
        """序列化/反序列化往返一致性"""
        original = make_type_def()
        restored = TypeDef.from_dict(original.to_dict())
        assert restored.id == original.id
        assert restored.name == original.name
        assert restored.plural_key == original.plural_key
        assert restored.color == original.color
        assert len(restored.form_fields) == len(original.form_fields)
        for orig_f, rest_f in zip(original.form_fields, restored.form_fields, strict=False):
            assert rest_f.name == orig_f.name
            assert rest_f.type == orig_f.type

    def test_get_field_existing(self):
        """查询存在的字段"""
        td = make_type_def()
        f = td.get_field("name")
        assert f is not None
        assert f.name == "name"
        assert f.type == "entry"

    def test_get_field_nonexistent(self):
        """查询不存在的字段返回 None"""
        td = make_type_def()
        assert td.get_field("nonexistent") is None

    def test_get_field_empty_schema(self):
        """空 form_fields 时查询返回 None"""
        td = TypeDef(id="x", name="x", plural_key="xs")
        assert td.get_field("anything") is None

    def test_get_user_fields(self):
        """get_user_fields 排除 id 字段"""
        td = make_type_def()
        user_fields = td.get_user_fields()
        names = [f.name for f in user_fields]
        assert "id" not in names
        assert "name" in names
        assert "level" in names
        assert len(user_fields) == 5  # 6 total - 1 id

    def test_get_user_fields_no_id(self):
        """没有 id 字段时 get_user_fields 返回全部"""
        td = TypeDef(
            id="x", name="x", plural_key="xs",
            form_fields=[TypeField(name="a", label="A:", type="entry")],
        )
        user_fields = td.get_user_fields()
        assert len(user_fields) == 1

    def test_get_display_fields(self):
        """get_display_fields 排除 id/desc/image 等，保留 name 和 combobox/spinbox/entry 类型"""
        td = make_type_def()
        display = td.get_display_fields()
        names = {f.name for f in display}
        # name (entry), level (spinbox), class (combobox) 应该出现
        assert "name" in names
        assert "level" in names
        assert "class" in names
        # id, desc, image 应该被排除
        assert "id" not in names
        assert "desc" not in names
        assert "image" not in names

    def test_get_display_fields_excludes_non_display_types(self):
        """非展示类型（tags/multiselect/content）应被排除"""
        td = TypeDef(
            id="x", name="x", plural_key="xs",
            form_fields=[
                TypeField(name="name", label="名称:", type="entry"),
                TypeField(name="tags", label="标签:", type="tags"),
                TypeField(name="stages", label="关卡:", type="multiselect", ref_type="level"),
                TypeField(name="content", label="内容:", type="content"),
            ],
        )
        display = td.get_display_fields()
        names = {f.name for f in display}
        assert "name" in names
        assert "tags" not in names
        assert "stages" not in names
        assert "content" not in names


# ── TypeSchema 测试 ──

class TestTypeSchemaProperties:
    """TypeSchema 属性与查询方法测试"""

    def test_empty_schema_properties(self):
        """空 schema 的属性"""
        schema = TypeSchema()
        assert schema.types == []
        assert schema.type_ids == []
        assert schema.type_names == {}
        assert schema.type_plurals == {}
        assert schema.plural_keys == []

    def test_type_ids_property(self):
        """type_ids 属性"""
        schema = TypeSchema(types=[make_type_def("a", "A", "as"), make_type_def("b", "B", "bs")])
        assert schema.type_ids == ["a", "b"]

    def test_type_names_property(self):
        """type_names 属性"""
        schema = TypeSchema(types=[make_type_def("a", "角色", "as"), make_type_def("b", "怪物", "bs")])
        assert schema.type_names == {"a": "角色", "b": "怪物"}

    def test_type_plurals_property(self):
        """type_plurals 属性"""
        schema = TypeSchema(types=[make_type_def("a", "A", "chars"), make_type_def("b", "B", "monsters")])
        assert schema.type_plurals == {"a": "chars", "b": "monsters"}

    def test_plural_keys_property(self):
        """plural_keys 属性"""
        schema = TypeSchema(types=[make_type_def("a", "A", "chars"), make_type_def("b", "B", "monsters")])
        assert schema.plural_keys == ["chars", "monsters"]

    def test_get_type_existing(self):
        """get_type 查询存在的类型"""
        schema = TypeSchema(types=[make_type_def("char", "角色", "chars")])
        td = schema.get_type("char")
        assert td is not None
        assert td.name == "角色"

    def test_get_type_nonexistent(self):
        """get_type 查询不存在的类型返回 None"""
        schema = TypeSchema(types=[make_type_def("char", "角色", "chars")])
        assert schema.get_type("nonexistent") is None

    def test_get_type_by_plural_existing(self):
        """get_type_by_plural 查询存在的类型"""
        schema = TypeSchema(types=[make_type_def("char", "角色", "chars")])
        td = schema.get_type_by_plural("chars")
        assert td is not None
        assert td.id == "char"

    def test_get_type_by_plural_nonexistent(self):
        """get_type_by_plural 查询不存在的类型返回 None"""
        schema = TypeSchema(types=[make_type_def("char", "角色", "chars")])
        assert schema.get_type_by_plural("nonexistent") is None


class TestTypeSchemaSerialization:
    """TypeSchema 序列化测试"""

    def test_to_dict(self):
        """序列化为字典"""
        schema = TypeSchema(version="2.0", types=[make_type_def("a", "A", "as")])
        d = schema.to_dict()
        assert d["version"] == "2.0"
        assert len(d["data_types"]) == 1
        assert d["data_types"][0]["id"] == "a"

    def test_from_dict(self):
        """从字典创建"""
        data = {
            "version": "1.5",
            "data_types": [
                {"id": "x", "name": "X", "plural_key": "xs", "form_fields": []},
            ],
        }
        schema = TypeSchema.from_dict(data)
        assert schema.version == "1.5"
        assert len(schema.types) == 1
        assert schema.types[0].id == "x"

    def test_from_dict_empty(self):
        """从空字典创建"""
        schema = TypeSchema.from_dict({})
        assert schema.version == "1.0"
        assert schema.types == []

    def test_roundtrip(self):
        """序列化/反序列化往返一致性"""
        original = TypeSchema(
            version="2.0",
            types=[make_type_def("a", "角色", "chars"), make_type_def("b", "怪物", "monsters")],
        )
        restored = TypeSchema.from_dict(original.to_dict())
        assert restored.version == original.version
        assert restored.type_ids == original.type_ids
        assert restored.type_names == original.type_names

    def test_save_and_load(self, tmp_path):
        """save 后 load 应恢复相同数据"""
        schema = TypeSchema(
            version="2.0",
            types=[make_type_def("a", "角色", "chars")],
        )
        file_path = tmp_path / "type_schema.json"
        schema.save(file_path)
        assert file_path.exists()

        loaded = TypeSchema.load(file_path)
        assert loaded is not None
        assert loaded.version == "2.0"
        assert loaded.type_ids == ["a"]

    def test_save_creates_parent_dirs(self, tmp_path):
        """save 自动创建父目录"""
        schema = TypeSchema()
        file_path = tmp_path / "nested" / "deep" / "type_schema.json"
        schema.save(file_path)
        assert file_path.exists()

    def test_load_nonexistent_file(self, tmp_path):
        """load 不存在的文件返回 None"""
        assert TypeSchema.load(tmp_path / "no_such_file.json") is None

    def test_load_invalid_json(self, tmp_path):
        """load 损坏的 JSON 文件返回 None"""
        file_path = tmp_path / "bad.json"
        file_path.write_text("{invalid json", encoding="utf-8")
        assert TypeSchema.load(file_path) is None


class TestTypeSchemaNeedsUpgrade:
    """needs_upgrade 升级检测测试"""

    def test_same_version_same_structure(self):
        """版本和结构相同 — 不需要升级"""
        schema = TypeSchema(version="2.0", types=[make_type_def("a", "A", "as")])
        new_schema = TypeSchema(version="2.0", types=[make_type_def("a", "A", "as")])
        assert schema.needs_upgrade(new_schema) is False

    def test_different_version(self):
        """版本号不同 — 需要升级"""
        schema = TypeSchema(version="1.0", types=[make_type_def("a", "A", "as")])
        new_schema = TypeSchema(version="2.0", types=[make_type_def("a", "A", "as")])
        assert schema.needs_upgrade(new_schema) is True

    def test_new_type_added(self):
        """新增类型 — 需要升级"""
        schema = TypeSchema(version="2.0", types=[make_type_def("a", "A", "as")])
        new_schema = TypeSchema(version="2.0", types=[
            make_type_def("a", "A", "as"),
            make_type_def("b", "B", "bs"),
        ])
        assert schema.needs_upgrade(new_schema) is True

    def test_type_removed(self):
        """删除类型 — 需要升级"""
        schema = TypeSchema(version="2.0", types=[
            make_type_def("a", "A", "as"),
            make_type_def("b", "B", "bs"),
        ])
        new_schema = TypeSchema(version="2.0", types=[make_type_def("a", "A", "as")])
        assert schema.needs_upgrade(new_schema) is True

    def test_field_count_changed(self):
        """字段数量变化 — 需要升级"""
        td1 = TypeDef(id="a", name="A", plural_key="as", form_fields=[
            TypeField(name="id", label="ID:", type="entry"),
            TypeField(name="name", label="名称:", type="entry"),
        ])
        td2 = TypeDef(id="a", name="A", plural_key="as", form_fields=[
            TypeField(name="id", label="ID:", type="entry"),
            TypeField(name="name", label="名称:", type="entry"),
            TypeField(name="level", label="等级:", type="spinbox"),
        ])
        schema = TypeSchema(version="2.0", types=[td1])
        new_schema = TypeSchema(version="2.0", types=[td2])
        assert schema.needs_upgrade(new_schema) is True

    def test_field_names_changed(self):
        """字段名称变化 — 需要升级（即使数量相同）"""
        td1 = TypeDef(id="a", name="A", plural_key="as", form_fields=[
            TypeField(name="id", label="ID:", type="entry"),
            TypeField(name="name", label="名称:", type="entry"),
        ])
        td2 = TypeDef(id="a", name="A", plural_key="as", form_fields=[
            TypeField(name="id", label="ID:", type="entry"),
            TypeField(name="title", label="标题:", type="entry"),
        ])
        schema = TypeSchema(version="2.0", types=[td1])
        new_schema = TypeSchema(version="2.0", types=[td2])
        assert schema.needs_upgrade(new_schema) is True


class TestTypeSchemaMerge:
    """merge_with 合并测试"""

    def test_merge_new_type(self):
        """合并新类型 — changed=True"""
        schema = TypeSchema(version="2.0", types=[make_type_def("a", "A", "as")])
        new_schema = TypeSchema(version="2.0", types=[make_type_def("b", "B", "bs")])
        changed = schema.merge_with(new_schema)
        assert changed is True
        assert "b" in schema.type_ids

    def test_merge_version_update(self):
        """合并版本号变化 — changed=True"""
        schema = TypeSchema(version="1.0", types=[make_type_def("a", "A", "as")])
        new_schema = TypeSchema(version="2.0", types=[make_type_def("a", "A", "as")])
        changed = schema.merge_with(new_schema)
        assert changed is True
        assert schema.version == "2.0"

    def test_merge_no_changes(self):
        """合并相同 schema — changed=False"""
        td = make_type_def("a", "A", "as")
        schema = TypeSchema(version="2.0", types=[td])
        new_schema = TypeSchema(version="2.0", types=[make_type_def("a", "A", "as")])
        changed = schema.merge_with(new_schema)
        assert changed is False

    def test_merge_adds_new_field_incrementally(self):
        """增量合并 — 新字段追加到已有类型"""
        td_old = TypeDef(id="a", name="A", plural_key="as", form_fields=[
            TypeField(name="id", label="ID:", type="entry"),
            TypeField(name="name", label="名称:", type="entry"),
            TypeField(name="level", label="等级:", type="spinbox"),
            TypeField(name="class", label="职业:", type="combobox"),
        ])
        td_new = TypeDef(id="a", name="A", plural_key="as", form_fields=[
            TypeField(name="id", label="ID:", type="entry"),
            TypeField(name="name", label="名称:", type="entry"),
            TypeField(name="level", label="等级:", type="spinbox"),
            TypeField(name="class", label="职业:", type="combobox"),
            TypeField(name="hp", label="生命:", type="spinbox", from_=0, to=9999),
        ])
        schema = TypeSchema(version="2.0", types=[td_old])
        new_schema = TypeSchema(version="2.0", types=[td_new])
        changed = schema.merge_with(new_schema)
        assert changed is True
        merged_td = schema.get_type("a")
        assert merged_td.get_field("hp") is not None
        # 原有字段保留
        assert merged_td.get_field("name") is not None

    def test_merge_major_restructure_replaces_fields(self):
        """字段结构大改 — 整体替换"""
        td_old = TypeDef(id="a", name="A", plural_key="as", form_fields=[
            TypeField(name="id", label="ID:", type="entry"),
            TypeField(name="name", label="名称:", type="entry"),
            TypeField(name="old1", label="旧1:", type="entry"),
            TypeField(name="old2", label="旧2:", type="entry"),
            TypeField(name="old3", label="旧3:", type="entry"),
            TypeField(name="old4", label="旧4:", type="entry"),
        ])
        td_new = TypeDef(id="a", name="A", plural_key="as", form_fields=[
            TypeField(name="id", label="ID:", type="entry"),
            TypeField(name="name", label="名称:", type="entry"),
            TypeField(name="new1", label="新1:", type="entry"),
            TypeField(name="new2", label="新2:", type="entry"),
        ])
        schema = TypeSchema(version="2.0", types=[td_old])
        new_schema = TypeSchema(version="2.0", types=[td_new])
        changed = schema.merge_with(new_schema)
        assert changed is True
        merged_td = schema.get_type("a")
        # old_only 字段 > 3 → 整体替换
        assert merged_td.get_field("old1") is None
        assert merged_td.get_field("new1") is not None

    def test_merge_updates_ai_context(self):
        """合并更新 AI 上下文"""
        td_old = TypeDef(id="a", name="A", plural_key="as", ai_context={"role": "old"})
        td_new = TypeDef(id="a", name="A", plural_key="as", ai_context={"role": "new"})
        schema = TypeSchema(version="2.0", types=[td_old])
        new_schema = TypeSchema(version="2.0", types=[td_new])
        changed = schema.merge_with(new_schema)
        assert changed is True
        assert schema.get_type("a").ai_context == {"role": "new"}
