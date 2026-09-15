"""字段配置编辑 — AI 直接修改数据类型的字段定义（加/删/改字段）"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from common.logger import get_logger
from core.agent.skill_protocol import BaseSkill
from core.agent.skills.common import normalize_params

logger = get_logger()


class SchemaEditSkill(BaseSkill):
    name = "system.schema_edit"
    description = "编辑数据类型：新建类型定义/添加删除修改字段，热加载生效"
    version = "1.1.0"
    parameters: list = []

    PARAMS_SCHEMA = {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["add_field", "remove_field", "rename_field", "change_type", "update_field",
                         "create_type", "delete_type", "list_types", "get_schema"],
                "description": "操作: add_field/remove_field/rename_field/change_type/update_field/create_type/delete_type/list_types/get_schema"
            },
            "data_type": {
                "type": "string",
                "description": "数据类型英文名: role/monster/skill/equip/item/talent/buff/task/achievement/job/title/story/dialog 等"
            },
            "field_name": {
                "type": "string",
                "description": "字段名"
            },
            "field_type": {
                "type": "string",
                "enum": ["string", "number", "integer", "boolean", "array", "object", "enum", "reference"],
                "description": "字段类型"
            },
            "new_name": {
                "type": "string",
                "description": "新名称(rename_field/change_type)"
            },
            "default_value": {
                "type": "string",
                "description": "默认值"
            },
            "description": {
                "type": "string",
                "description": "类型描述(create_type)"
            },
            "parent_type": {
                "type": "string",
                "description": "父类型(create_type，可选)"
            }
        },
        "required": ["action"]
    }

    def execute(self, params: dict, context: dict) -> dict:
        params = normalize_params(params)
        logger = get_logger()
        action = params.get("action", "add_field")
        data_type = params.get("data_type", "")
        field_name = params.get("field", params.get("field_name", params.get("name", "")))
        field_label = params.get("label", field_name)
        field_type = params.get("field_type", params.get("type", "entry"))
        options = params.get("options", params.get("values", []))
        field_min = params.get("min", 0)
        field_max = params.get("max", 99999)

        # list_types / get_schema 不需要 data_type
        if action in ("list_types", "get_schema"):
            schema_path = self._find_schema_path()
            if not schema_path:
                return {"success": False, "error": "无法定位类型配置文件", "message": ""}
            try:
                schema = self._load_schema(schema_path)
                if action == "list_types":
                    return self._list_types(schema)
                return self._get_schema(schema)
            except Exception as e:
                logger.error(f"SchemaEdit 失败: {e}")
                return {"success": False, "error": str(e), "message": ""}

        if not data_type:
            return {"success": False, "error": "缺少 data_type 参数", "message": ""}

        schema_path = self._find_schema_path()
        if not schema_path:
            return {"success": False, "error": "无法定位类型配置文件", "message": ""}

        try:
            schema = self._load_schema(schema_path)

            # create_type / delete_type 不需要预存在 type_def
            if action == "create_type":
                return self._create_new_type(schema, schema_path, params, logger, context)
            if action == "delete_type":
                result = self._delete_type(schema, data_type)
                if result["success"]:
                    self._save_schema(schema_path, schema)
                    mw = context.get("main_window")
                    self._hot_reload(mw=mw)
                return {"success": result["success"], "message": result["message"], "data": {"data_type": data_type}}

            type_def = self._find_type(schema, data_type)
            if type_def is None:
                return {"success": False, "error": f"未找到类型: {data_type}", "message": ""}

            if action == "add_field":
                if not field_name:
                    return {"success": False, "error": "缺少 field 参数", "message": ""}
                result = self._add_field(type_def, field_name, field_label, field_type, options, field_min, field_max)
            elif action == "remove_field":
                if not field_name:
                    return {"success": False, "error": "缺少 field 参数", "message": ""}
                result = self._remove_field(type_def, field_name)
            elif action == "update_field":
                if not field_name:
                    return {"success": False, "error": "缺少 field 参数", "message": ""}
                result = self._update_field(type_def, field_name, field_label, field_type, options)
            elif action == "rename_field":
                new_name = params.get("new_name", "")
                if not field_name or not new_name:
                    return {"success": False, "error": "rename_field 需要 field 和 new_name", "message": ""}
                result = self._rename_field(type_def, field_name, new_name)
            elif action == "change_type":
                new_type = params.get("new_name", params.get("new_type", field_type))
                if not field_name or not new_type:
                    return {"success": False, "error": "change_type 需要 field 和 new_type(或 field_type)", "message": ""}
                result = self._change_field_type(type_def, field_name, new_type, options)
            else:
                return {"success": False, "error": f"未知操作: {action}", "message": ""}

            if result["success"]:
                self._save_schema(schema_path, schema)
                mw = context.get("main_window")
                self._hot_reload(mw=mw)

            return {"success": result["success"], "message": result.get("message", ""), "data": {
                "message": result.get("message", ""),
                "data_type": data_type,
                "field": field_name,
            }}
        except Exception as e:
            logger.error(f"SchemaEdit 失败: {e}")
            return {"success": False, "error": str(e), "message": ""}

    def _create_new_type(self, schema: dict, schema_path: Path, params: dict, logger, context: dict) -> dict:
        type_id = params.get("data_type", params.get("type_id", ""))
        type_name = params.get("name", params.get("label", type_id))
        fields_json = params.get("fields", [])

        if not type_id:
            return {"success": False, "error": "缺少 data_type 参数（新类型的英文ID，如 pet）", "message": ""}

        types = schema.setdefault("data_types", [])
        for t in types:
            if t.get("id") == type_id:
                return {"success": False, "error": f"类型 {type_id} 已存在，请用 add_field", "message": ""}

        if isinstance(fields_json, str):
            try:
                fields_json = json.loads(fields_json)
            except Exception:
                fields_json = []

        default_fields = [
            {"name": "name", "label": "名称", "type": "entry", "editable": True},
            {"name": "description", "label": "描述", "type": "text", "editable": True},
            {"name": "type", "label": "分类", "type": "combobox", "editable": True, "values": [type_name, "普通", "稀有", "史诗"]},
            {"name": "level", "label": "等级", "type": "spinbox", "editable": True, "from_": 1, "to_": 99},
        ]

        all_fields = list(default_fields)
        for f in fields_json:
            if not any(ef.get("name") == f.get("name") for ef in all_fields):
                all_fields.append(f)

        new_type = {
            "id": type_id,
            "name": type_name,
            "plural": f"{type_id}s",
            "color": params.get("color", "#a855f7"),
            "icon": params.get("icon", ""),
            "form_fields": all_fields,
        }
        types.append(new_type)

        self._save_schema(schema_path, schema)

        self._init_empty_data(type_id + "s", schema_path.parent)

        mw = context.get("main_window")
        self._hot_reload(mw)

        return {"success": True, "message": f"[OK] 已创建新数据类型「{type_name}」({type_id})，包含 {len(all_fields)} 个字段。编辑器标签页已添加。", "data": None}

    def _init_empty_data(self, plural_key: str, lib_dir: Path):
        data_file = lib_dir / "default.json"
        if data_file.exists():
            try:
                data = json.loads(data_file.read_text(encoding='utf-8'))
                if plural_key not in data:
                    data[plural_key] = []
                    data_file.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
            except Exception as e:
                logger.warning(f"操作失败: {e}")

    def _find_schema_path(self) -> Optional[Path]:
        project_root = Path(__file__).resolve().parent.parent.parent.parent
        libraries_dir = project_root / "data" / "libraries"
        for lib_dir in libraries_dir.iterdir():
            sf = lib_dir / "type_schema.json"
            if sf.exists():
                return sf
        return None

    def _load_schema(self, path: Path) -> dict:
        with open(path, encoding="utf-8") as f:
            return json.load(f)

    def _save_schema(self, path: Path, schema: dict):
        with open(path, "w", encoding="utf-8") as f:
            json.dump(schema, f, ensure_ascii=False, indent=2)

    def _find_type(self, schema: dict, data_type: str) -> Optional[dict]:
        types = schema.get("data_types", schema.get("types", []))
        for t in types:
            if t.get("id") == data_type:
                return t
        return None

    def _add_field(self, type_def: dict, name: str, label: str, ftype: str,
                   options: list, fmin: int, fmax: int) -> dict:
        fields = type_def.setdefault("form_fields", [])
        for f in fields:
            if f.get("name") == name:
                return {"success": False, "message": f"字段 {name} 已存在"}
        field = {
            "name": name, "label": label, "type": ftype,
            "editable": True,
        }
        if ftype == "combobox" and options:
            field["values"] = options
        if ftype == "spinbox":
            field["from_"] = fmin
            field["to_"] = fmax
        fields.append(field)
        return {"success": True, "message": f"已添加字段 {name}({label})"}

    def _remove_field(self, type_def: dict, name: str) -> dict:
        fields = type_def.get("form_fields", [])
        for i, f in enumerate(fields):
            if f.get("name") == name:
                fields.pop(i)
                return {"success": True, "message": f"已删除字段 {name}"}
        return {"success": False, "message": f"字段 {name} 不存在"}

    def _update_field(self, type_def: dict, name: str, label: str, ftype: str, options: list) -> dict:
        fields = type_def.get("form_fields", [])
        for f in fields:
            if f.get("name") == name:
                if label:
                    f["label"] = label
                if ftype:
                    f["type"] = ftype
                if options:
                    f["values"] = options
                return {"success": True, "message": f"已更新字段 {name}"}
        return {"success": False, "message": f"字段 {name} 不存在"}

    def _rename_field(self, type_def: dict, old_name: str, new_name: str) -> dict:
        """重命名字段（保留其他属性，仅修改 name）"""
        if old_name == new_name:
            return {"success": False, "message": "新旧名称相同"}
        fields = type_def.get("form_fields", [])
        # 新名称不能与已有字段冲突
        if any(f.get("name") == new_name for f in fields):
            return {"success": False, "message": f"字段 {new_name} 已存在"}
        for f in fields:
            if f.get("name") == old_name:
                f["name"] = new_name
                return {"success": True, "message": f"已重命名 {old_name} → {new_name}"}
        return {"success": False, "message": f"字段 {old_name} 不存在"}

    def _change_field_type(self, type_def: dict, name: str, new_type: str, options: list = None) -> dict:
        """修改字段类型，可选择性地更新 values"""
        if not new_type:
            return {"success": False, "message": "new_type 不能为空"}
        fields = type_def.get("form_fields", [])
        for f in fields:
            if f.get("name") == name:
                old_type = f.get("type", "")
                f["type"] = new_type
                # combobox 类型必须提供 values
                if new_type in ("combobox", "enum") and options:
                    f["values"] = options
                # spinbox 类型需要 from_/to_
                if new_type == "spinbox":
                    f.setdefault("from_", 0)
                    f.setdefault("to_", 99999)
                return {"success": True,
                        "message": f"已修改字段 {name} 类型: {old_type} → {new_type}"}
        return {"success": False, "message": f"字段 {name} 不存在"}

    def _delete_type(self, schema: dict, type_id: str) -> dict:
        """删除整个数据类型定义（同时移除 form_fields）"""
        types = schema.get("data_types", schema.get("types", []))
        for i, t in enumerate(types):
            if t.get("id") == type_id:
                # 受保护类型禁止删除（防止误删核心类型）
                protected = {"role", "monster", "skill", "equip", "item"}
                if type_id in protected:
                    return {"success": False,
                            "message": f"核心类型 {type_id} 受保护，禁止删除"}
                removed = types.pop(i)
                return {"success": True,
                        "message": f"已删除类型 {type_id}（含 {len(removed.get('form_fields', []))} 个字段）"}
        return {"success": False, "message": f"类型 {type_id} 不存在"}

    def _list_types(self, schema: dict) -> dict:
        """列出所有数据类型"""
        types = schema.get("data_types", schema.get("types", []))
        type_list = []
        for t in types:
            type_list.append({
                "id": t.get("id", ""),
                "name": t.get("name", ""),
                "plural": t.get("plural", ""),
                "field_count": len(t.get("form_fields", [])),
                "icon": t.get("icon", ""),
                "color": t.get("color", ""),
            })
        return {
            "success": True,
            "message": f"共 {len(type_list)} 个数据类型",
            "data": {"types": type_list, "count": len(type_list)}
        }

    def _get_schema(self, schema: dict) -> dict:
        """获取完整 schema（或单个类型的字段定义）"""
        return {
            "success": True,
            "message": "",
            "data": {"schema": schema, "version": schema.get("version", "unknown")}
        }

    def _hot_reload(self, mw=None):
        if mw and hasattr(mw, 'reload_type_schema'):
            try:
                mw.reload_type_schema()
                mw.show_toast("[OK] 字段配置已更新", 3000)
            except Exception as e:
                logger.warning(f"操作失败: {e}")
