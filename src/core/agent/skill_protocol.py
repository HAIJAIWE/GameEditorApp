from __future__ import annotations

from abc import ABC, abstractmethod


class BaseSkill(ABC):
    name: str = ""
    description: str = ""
    version: str = "1.0.0"
    parameters: list[dict] = []
    tags: list[str] = []
    depends_on: list[str] = []
    # 修复 P2-29: 标记本 skill 是否必须在 GUI 主线程执行（涉及 PyQt widget 操作）
    # 默认 False — CPU/IO 密集型 skill 可在 worker 线程并行
    # UI 类 skill（ui_control/ui_preview/ask_user/ceshu 等）必须覆写为 True
    REQUIRES_MAIN_THREAD: bool = False

    @abstractmethod
    def execute(self, params: dict, context: dict) -> dict:
        ...

    def rollback(self, result: dict) -> dict:
        return {"success": True, "message": "回滚成功"}

    def to_json_schema(self) -> dict:
        """生成 OpenAI Function Calling 兼容的 JSON Schema"""
        schema = getattr(self, 'PARAMS_SCHEMA', None)
        if schema and isinstance(schema, dict):
            return {
                "name": getattr(self, 'NAME', self.name),
                "description": getattr(self, 'DESCRIPTION', self.description),
                "parameters": schema,
            }

        props = {}
        required = []

        for p in self.parameters:
            name = p.get("name", "")
            if not name:
                continue

            param_schema = {
                "description": p.get("description", ""),
            }

            ptype = p.get("type", "string")
            param_schema["type"] = ptype

            if "enum" in p:
                param_schema["enum"] = p["enum"]
            if "default" in p:
                param_schema["default"] = p["default"]
            if "example" in p:
                param_schema["example"] = p["example"]
            if "minimum" in p:
                param_schema["minimum"] = p["minimum"]
            if "maximum" in p:
                param_schema["maximum"] = p["maximum"]

            props[name] = param_schema
            if p.get("required", False):
                required.append(name)

        return {
            "name": self.name,
            "description": self.description,
            "parameters": {
                "type": "object",
                "properties": props,
                "required": required,
            },
        }

    def get_tool_description(self) -> str:
        """生成 LLM-friendly 工具描述，包含类型/枚举/示例"""
        name = getattr(self, 'NAME', self.name)
        desc = getattr(self, 'DESCRIPTION', self.description)
        lines = [f"- {name}: {desc}"]

        schema = getattr(self, 'PARAMS_SCHEMA', None)
        if schema and isinstance(schema, dict):
            for pname, pschema in schema.get("properties", {}).items():
                constraints = []
                if pschema.get("type"):
                    constraints.append(f"type={pschema['type']}")
                if pschema.get("enum"):
                    constraints.append(f"enum=[{'|'.join(str(e) for e in pschema['enum'])}]")
                if pschema.get("default") is not None:
                    constraints.append(f"default={pschema['default']}")
                req = " *" if pname in schema.get("required", []) else ""
                hint = f" ({', '.join(constraints)})" if constraints else ""
                lines.append(f"    {req}{pname}: {pschema.get('description','')}{hint}")
            return "\n".join(lines)

        for p in self.parameters:
            constraints = []
            if p.get("type"):
                constraints.append(f"type={p['type']}")
            if p.get("enum"):
                constraints.append(f"enum=[{'|'.join(str(e) for e in p['enum'])}]")
            if p.get("default") is not None:
                constraints.append(f"default={p['default']}")
            req = "*" if p.get("required") else ""
            hint = f" ({', '.join(constraints)})" if constraints else ""
            lines.append(f"    {req}{p.get('name','')}: {p.get('description','')}{hint}")
        return "\n".join(lines)
