import json
import logging
from pathlib import Path
from typing import Any, Optional, cast

logger = logging.getLogger(__name__)


SCHEMA_VERSION = "1.0"


CONFIG_SCHEMA: dict[str, Any] = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "gameeditor-config-schema",
    "title": "GameEditor Configuration Schema",
    "type": "object",
    "required": ["app", "ai", "editor"],
    "properties": {
        "app": {
            "type": "object",
            "required": ["name", "version"],
            "properties": {
                "name": {"type": "string", "minLength": 1},
                "version": {"type": "string", "pattern": r"^\d+\.\d+\.\d+$"},
                "debug": {"type": "boolean"},
                "language": {"type": "string", "enum": ["zh_CN", "en_US"]},
                "theme": {"type": "string", "enum": ["light", "dark", "auto"]},
                "data_dir": {"type": "string"},
                "backup_dir": {"type": "string"},
                "log_level": {
                    "type": "string",
                    "enum": ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"],
                },
                "max_undo_steps": {"type": "integer", "minimum": 10, "maximum": 500},
                "auto_save_interval": {"type": "integer", "minimum": 0},
            },
        },
        "ai": {
            "type": "object",
            "required": ["provider", "model"],
            "properties": {
                "provider": {"type": "string", "enum": ["openai", "qwen", "doubao", "custom"]},
                "model": {"type": "string", "minLength": 1},
                "api_key": {"type": "string"},
                "api_base": {"type": "string", "format": "uri"},
                "temperature": {"type": "number", "minimum": 0, "maximum": 2},
                "max_tokens": {"type": "integer", "minimum": 1, "maximum": 128000},
                "timeout": {"type": "integer", "minimum": 1, "maximum": 300},
                "max_retries": {"type": "integer", "minimum": 0, "maximum": 10},
                "stream": {"type": "boolean"},
            },
        },
        "editor": {
            "type": "object",
            "properties": {
                "font_size": {"type": "integer", "minimum": 8, "maximum": 48},
                "font_family": {"type": "string"},
                "tab_size": {"type": "integer", "minimum": 2, "maximum": 8},
                "word_wrap": {"type": "boolean"},
                "show_line_numbers": {"type": "boolean"},
                "live_preview": {"type": "boolean"},
                "auto_format": {"type": "boolean"},
            },
        },
        "export": {
            "type": "object",
            "properties": {
                "default_format": {"type": "string", "enum": ["json", "csv", "yaml"]},
                "encoding": {"type": "string"},
                "indent": {"type": "integer", "minimum": 0, "maximum": 8},
                "ensure_ascii": {"type": "boolean"},
                "pretty_print": {"type": "boolean"},
            },
        },
        "network": {
            "type": "object",
            "properties": {
                "proxy": {"type": "string", "format": "uri"},
                "user_agent": {"type": "string"},
                "connect_timeout": {"type": "integer", "minimum": 1, "maximum": 60},
                "read_timeout": {"type": "integer", "minimum": 1, "maximum": 300},
                "max_concurrent_requests": {"type": "integer", "minimum": 1, "maximum": 20},
            },
        },
    },
}


class SchemaValidator:
    def __init__(self, schema: Optional[dict[str, Any]] = None):
        self._schema = schema or CONFIG_SCHEMA
        self._errors: list[str] = []
        self._warnings: list[str] = []

    def validate(self, config: dict[str, Any], path: str = "") -> list[str]:
        self._errors.clear()
        self._warnings.clear()
        self._validate_object(config, self._schema, path)
        return list(self._errors)

    def validate_with_warnings(self, config: dict[str, Any], path: str = "") -> tuple[list[str], list[str]]:
        self.validate(config, path)
        return list(self._errors), list(self._warnings)

    def _validate_object(self, config: dict[str, Any], schema: dict[str, Any], path: str):
        if not isinstance(config, dict):
            self._errors.append(f"{path}: 期望 object, 实际 {type(config).__name__}")
            return

        schema_props = schema.get("properties", {})
        required = schema.get("required", [])

        for key in required:
            if key not in config:
                self._errors.append(f"{path}.{key}: 缺少必需配置项")

        for key, value in config.items():
            current_path = f"{path}.{key}" if path else key
            if key in schema_props:
                self._validate_value(value, schema_props[key], current_path)
            else:
                self._warnings.append(f"{current_path}: 未知配置项 (允许但未在 schema 中定义)")

    def _validate_value(self, value: Any, prop_schema: dict[str, Any], path: str):
        expected_type = prop_schema.get("type")

        if expected_type == "object" and isinstance(value, dict):
            self._validate_object(value, prop_schema, path)
            return

        type_map = {
            "string": str,
            "integer": int,
            "number": (int, float),
            "boolean": bool,
            "array": list,
            "object": dict,
        }

        if expected_type in type_map:
            # type_map 的值混合了具体类型与元组，运行时 isinstance 天然支持，cast 仅为类型声明服务
            expected = cast(Any, type_map[expected_type])
            valid = isinstance(value, expected)
            if not valid:
                self._errors.append(f"{path}: 期望 {expected_type}, 实际 {type(value).__name__}")
                return

        if "enum" in prop_schema and value not in prop_schema["enum"]:
            self._errors.append(
                f"{path}: 值 '{value}' 不在允许范围内 {prop_schema['enum']}"
            )

        if "minimum" in prop_schema and isinstance(value, (int, float)):
            if value < prop_schema["minimum"]:
                self._errors.append(
                    f"{path}: {value} < 最小值 {prop_schema['minimum']}"
                )

        if "maximum" in prop_schema and isinstance(value, (int, float)):
            if value > prop_schema["maximum"]:
                self._errors.append(
                    f"{path}: {value} > 最大值 {prop_schema['maximum']}"
                )

        if "minLength" in prop_schema and isinstance(value, str):
            if len(value) < prop_schema["minLength"]:
                self._errors.append(
                    f"{path}: 字符串长度 {len(value)} < {prop_schema['minLength']}"
                )

        if "pattern" in prop_schema and isinstance(value, str):
            import re
            if not re.match(prop_schema["pattern"], value):
                self._errors.append(
                    f"{path}: '{value}' 不匹配模式 {prop_schema['pattern']}"
                )

        if "format" in prop_schema and prop_schema["format"] == "uri" and isinstance(value, str):
            if value and not (value.startswith("http://") or value.startswith("https://")):
                self._warnings.append(f"{path}: '{value}' 可能不是有效 URL")

    def format_report(self, errors: list[str], warnings: Optional[list[str]] = None) -> str:
        lines = []
        lines.append("=" * 50)
        lines.append("配置验证报告")
        lines.append("=" * 50)
        lines.append("")

        if not errors and not (warnings or self._warnings):
            lines.append("[PASS] 配置验证通过，无错误无警告")
            return "\n".join(lines)

        all_warnings = (warnings or []) + list(self._warnings)

        if errors:
            lines.append(f"[FAIL] 发现 {len(errors)} 个错误:")
            for e in errors:
                lines.append(f"  [ERR] {e}")
            lines.append("")

        if all_warnings:
            lines.append(f"[WARN] 发现 {len(all_warnings)} 个警告:")
            for w in all_warnings:
                lines.append(f"  [WRN] {w}")

        return "\n".join(lines)

    @staticmethod
    def validate_config_file(config_path: str, schema_path: Optional[str] = None) -> tuple[list[str], list[str]]:
        if schema_path:
            schema = json.loads(Path(schema_path).read_text(encoding="utf-8"))
        else:
            schema = CONFIG_SCHEMA

        config = json.loads(Path(config_path).read_text(encoding="utf-8"))
        validator = SchemaValidator(schema)
        return validator.validate_with_warnings(config)

    @staticmethod
    def generate_default_config() -> dict[str, Any]:
        def _default_from_schema(schema: dict[str, Any]) -> Any:
            if "default" in schema:
                return schema["default"]
            stype = schema.get("type")
            if stype == "string":
                return schema.get("enum", [""])[0] if "enum" in schema else ""
            if stype == "integer":
                return schema.get("minimum", 0)
            if stype == "number":
                return schema.get("minimum", 0.0)
            if stype == "boolean":
                return False
            if stype == "object" and "properties" in schema:
                return {
                    k: _default_from_schema(v)
                    for k, v in schema["properties"].items()
                }
            if stype == "array":
                return []
            return None

        return _default_from_schema(CONFIG_SCHEMA)


def validate_config(config: dict[str, Any]) -> tuple[bool, str]:
    validator = SchemaValidator()
    errors, warnings = validator.validate_with_warnings(config)
    report = validator.format_report(errors, warnings)
    return len(errors) == 0, report
