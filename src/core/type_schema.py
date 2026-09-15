"""类型模式 — 定义每个库中有哪些数据类型、字段结构、AI上下文"""
from dataclasses import dataclass, field
import json
from pathlib import Path
from typing import Any, Optional

from common.logger import get_logger

SCHEMA_FILENAME = "type_schema.json"


@dataclass
class TypeField:
    name: str
    label: str
    type: str
    editable: bool = True
    values: Optional[list[str]] = None
    from_: Optional[float] = None
    to: Optional[float] = None
    ref_type: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        d = {"name": self.name, "label": self.label, "type": self.type, "editable": self.editable}
        if self.values is not None:
            d["values"] = self.values
        if self.from_ is not None:
            d["from_"] = self.from_
        if self.to is not None:
            d["to"] = self.to
        if self.ref_type is not None:
            d["ref_type"] = self.ref_type
        return d

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> TypeField:
        return cls(
            name=data.get("name", ""),
            label=data.get("label", ""),
            type=data.get("type", "entry"),
            editable=data.get("editable", True),
            values=data.get("values"),
            from_=data.get("from_"),
            to=data.get("to"),
            ref_type=data.get("ref_type"),
        )


@dataclass
class TypeDef:
    id: str
    name: str
    plural_key: str
    color: str = "#4CAF50"
    form_fields: list[TypeField] = field(default_factory=list)
    ai_context: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "plural_key": self.plural_key,
            "color": self.color,
            "form_fields": [f.to_dict() for f in self.form_fields],
            "ai_context": self.ai_context,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> TypeDef:
        fields = [TypeField.from_dict(f) for f in data.get("form_fields", [])]
        return cls(
            id=data.get("id", ""),
            name=data.get("name", ""),
            plural_key=data.get("plural_key", ""),
            color=data.get("color", "#4CAF50"),
            form_fields=fields,
            ai_context=data.get("ai_context", {}),
        )

    def get_field(self, field_name: str) -> Optional[TypeField]:
        for f in self.form_fields:
            if f.name == field_name:
                return f
        return None

    def get_user_fields(self) -> list[TypeField]:
        return [f for f in self.form_fields if f.name != "id"]

    def get_display_fields(self) -> list[TypeField]:
        """返回用于列表显示的字段（排除id、desc、image等）"""
        skip = {"id", "desc", "description", "image", "image_desc", "image_tags", "template", "content"}
        return [f for f in self.form_fields if f.name not in skip and f.name == "name"
                or (f.name not in skip and f.type in ("combobox", "spinbox", "entry"))]


@dataclass
class TypeSchema:
    version: str = "1.9"
    types: list[TypeDef] = field(default_factory=list)

    @property
    def type_ids(self) -> list[str]:
        return [t.id for t in self.types]

    @property
    def type_names(self) -> dict[str, str]:
        return {t.id: t.name for t in self.types}

    @property
    def type_plurals(self) -> dict[str, str]:
        return {t.id: t.plural_key for t in self.types}

    @property
    def plural_keys(self) -> list[str]:
        return [t.plural_key for t in self.types]

    def get_type(self, type_id: str) -> Optional[TypeDef]:
        for t in self.types:
            if t.id == type_id:
                return t
        return None

    def get_type_by_plural(self, plural_key: str) -> Optional[TypeDef]:
        for t in self.types:
            if t.plural_key == plural_key:
                return t
        return None

    def to_dict(self) -> dict[str, Any]:
        return {
            "version": self.version,
            "data_types": [t.to_dict() for t in self.types],
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> TypeSchema:
        types = [TypeDef.from_dict(t) for t in data.get("data_types", [])]
        return cls(
            version=data.get("version", "1.0"),
            types=types,
        )

    def save(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(self.to_dict(), f, ensure_ascii=False, indent=2)

    @classmethod
    def load(cls, path: Path) -> Optional[TypeSchema]:
        if not path.exists():
            return None
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            return cls.from_dict(data)
        except Exception as e:
            get_logger().warning(f"加载类型模式失败: {path} — {e}")
            return None

    def needs_upgrade(self, new_schema: TypeSchema) -> bool:
        """检查是否需要升级到新版本（增强版：检测版本号、类型变化、字段结构变化）"""
        # 1. 版本号不同 → 必须升级
        if self.version != new_schema.version:
            return True

        # 2. 类型数量或ID不同 → 需要升级
        new_ids = set(new_schema.type_ids)
        old_ids = set(self.type_ids)

        if new_ids - old_ids:  # 新增类型
            return True
        if old_ids - new_ids:  # 删除类型
            return True

        # 3. 字段结构变化检测（关键改进！）
        for type_id in new_ids:
            new_type = new_schema.get_type(type_id)
            old_type = self.get_type(type_id)

            if new_type and old_type:
                # 比较字段数量
                new_field_count = len(new_type.form_fields)
                old_field_count = len(old_type.form_fields)
                if new_field_count != old_field_count:
                    get_logger().debug(f"类型「{type_id}」字段数变化: {old_field_count} → {new_field_count}")
                    return True

                # 比较字段名称集合
                new_field_names = {f.name for f in new_type.form_fields}
                old_field_names = {f.name for f in old_type.form_fields}
                if new_field_names != old_field_names:
                    get_logger().debug(f"类型「{type_id}」字段名称变化")
                    return True

        # 4. 所有检查通过，不需要升级
        return False

    def merge_with(self, new_schema: TypeSchema) -> bool:
        """将新schema合并到当前schema（智能处理字段重构）

        Args:
            new_schema: 最新的代码定义的schema

        Returns:
            bool: 是否发生了变更
        """
        changed = False
        existing_type_ids = {t.id for t in self.types}

        for new_type in new_schema.types:
            if new_type.id in existing_type_ids:
                old_type = self.get_type(new_type.id)
                if old_type:
                    # 更新AI上下文
                    if new_type.ai_context and new_type.ai_context != old_type.ai_context:
                        old_type.ai_context = new_type.ai_context
                        changed = True

                    old_names = {f.name for f in old_type.form_fields}
                    new_names = {f.name for f in new_type.form_fields}

                    # 关键判断：字段是否有结构性大改
                    overlap = old_names & new_names
                    old_only = old_names - new_names
                    new_names - old_names

                    # 如果重叠字段少于50%或大量新旧字段不匹配 → 整体替换
                    if len(overlap) < len(new_names) * 0.5 or len(old_only) > 3:
                        old_type.form_fields = new_type.form_fields
                        changed = True
                        get_logger().info(f"类型「{new_type.id}」字段结构大改，已整体替换 ({len(old_names)}→{len(new_names)}字段)")
                    else:
                        # 增量更新：只添加新字段，保留已有字段
                        for new_field in new_type.form_fields:
                            if new_field.name in old_names:
                                old_field = old_type.get_field(new_field.name)
                                if old_field and old_field.label == new_field.label:
                                    if new_field.values and not old_field.values:
                                        old_field.values = new_field.values
                                        changed = True
                                    if new_field.from_ is not None and old_field.from_ is None:
                                        old_field.from_ = new_field.from_
                                        changed = True
                            else:
                                old_type.form_fields.append(new_field)
                                changed = True
            else:
                self.types.append(new_type)
                changed = True

        if self.version != new_schema.version:
            self.version = new_schema.version
            changed = True

        return changed


# 默认 RPG schema 已外置到 core/defaults/rpg_schema.py（避免本文件过长）
def create_default_rpg_schema() -> TypeSchema:
    """向后兼容包装：从 defaults.rpg_schema 延迟导入"""
    from core.defaults.rpg_schema import create_default_rpg_schema as _impl
    return _impl()
