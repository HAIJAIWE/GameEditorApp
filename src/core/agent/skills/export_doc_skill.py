from __future__ import annotations

import os

from common.logger import get_logger
from core.agent.skill_protocol import BaseSkill
from core.agent.skills.common import normalize_params


class ExportDocSkill(BaseSkill):
    name = "tool.export_doc"
    description = "文档导出: 将游戏数据导出为Markdown/CSV/HTML设计文档"
    version = "1.0.0"
    parameters = [
        {"name": "action", "required": True, "description": "export/format/list_formats"},
        {"name": "data_type", "required": False, "description": "数据类型: role/monster/skill/equip/all"},
        {"name": "format", "required": False, "description": "导出格式: md/csv/html/json"},
        {"name": "output_path", "required": False, "description": "输出路径"},
    ]
    tags = ["export", "document", "markdown", "csv", "report"]

    def execute(self, params: dict, context: dict) -> dict:
        params = normalize_params(params)
        self._logger = get_logger()
        action = params.get("action", "export")

        try:
            if action == "list_formats":
                return {"success": True,
                        "message": "支持格式: md(设计文档) / csv(Excel数据) / html(网页预览) / json(原始数据)",
                        "data": {"formats": ["md", "csv", "html", "json"]}}

            data_type = params.get("data_type", "all")
            fmt = params.get("format", "md")

            dm = context.get("data_manager")
            if not dm:
                main_win = context.get("main_window")
                if main_win:
                    dm = getattr(main_win, 'data_manager', None)
            if not dm:
                return {"success": False, "error": "数据管理器未初始化", "message": ""}

            data = self._collect_data(dm, data_type)
            if not data:
                return {"success": False, "error": f"没有 {data_type} 数据", "message": ""}

            output_path = params.get("output_path", "")
            if not output_path:
                output_path = os.path.join(os.getcwd(), f"game_design_doc.{fmt}")

            if fmt == "md":
                content = self._to_markdown(data, data_type)
            elif fmt == "csv":
                content = self._to_csv(data, data_type)
            elif fmt == "html":
                content = self._to_html(data, data_type)
            else:
                import json
                content = json.dumps(data, ensure_ascii=False, indent=2)

            os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
            with open(output_path, "w", encoding="utf-8") as f:
                f.write(content)

            counts = {k: len(v) for k, v in data.items() if v}
            summary = ", ".join(f"{cn}: {cc}" for cn, cc in counts.items())
            return {"success": True,
                    "message": f"设计文档已导出: {output_path}\n内容: {summary}",
                    "data": {"output_path": output_path, "counts": counts, "format": fmt}}

        except Exception as e:
            self._logger.error(f"导出失败: {e}", exc_info=True)
            return {"success": False, "error": str(e), "message": ""}

    def _collect_data(self, dm, data_type: str) -> dict:
        types = dm.data_types if data_type == "all" else [data_type]
        result = {}
        for dt in types:
            from core.agent.skills.common import _resolve_plural
            plural = _resolve_plural(dt)
            items = dm.data.get(plural, []) if hasattr(dm, 'data') else []
            if items:
                if isinstance(items, list):
                    result[dt] = items
                elif isinstance(items, dict):
                    result[dt] = list(items.values())
        return result

    def _to_markdown(self, data: dict, label: str) -> str:
        lines = [f"# 游戏设计文档 - {label}\n", f"生成时间: {self._now()}\n"]
        for type_name, items in data.items():
            if not items:
                continue
            lines.append(f"\n## {type_name}\n")
            lines.append("| ID | 名称 | 属性 |")
            lines.append("|-----|------|------|")
            for item in items if isinstance(items, list) else list(items.values()):
                item_id = item.get("id", "") if isinstance(item, dict) else str(item)[:20]
                name = item.get("name", "") if isinstance(item, dict) else ""
                attrs = self._format_attrs(item)
                lines.append(f"| {item_id} | {name} | {attrs} |")
        return "\n".join(lines)

    def _to_csv(self, data: dict, label: str) -> str:
        import csv
        import io
        output = io.StringIO()
        writer = csv.writer(output)
        for type_name, items in data.items():
            if not items:
                continue
            items_list = items if isinstance(items, list) else list(items.values())
            if items_list and isinstance(items_list[0], dict):
                keys = list(items_list[0].keys())
                writer.writerow([f"# {type_name}"])
                writer.writerow(keys)
                for item in items_list:
                    writer.writerow([str(item.get(k, "")) for k in keys])
        return output.getvalue()

    def _to_html(self, data: dict, label: str) -> str:
        parts = [f"<html><head><title>游戏设计文档 - {label}</title>",
                 "<style>body{font-family:sans-serif;margin:20px}",
                 "table{border-collapse:collapse;width:100%;margin:10px 0}",
                 "th,td{border:1px solid #ddd;padding:8px;text-align:left}",
                 "th{background:#f0f0f0}h2{color:#333}</style></head><body>",
                 f"<h1>游戏设计文档 - {label}</h1>"]
        for type_name, items in data.items():
            if not items:
                continue
            items_list = items if isinstance(items, list) else list(items.values())
            parts.append(f"<h2>{type_name}</h2>")
            if items_list and isinstance(items_list[0], dict):
                keys = list(items_list[0].keys())
                parts.append("<table><tr>" + "".join(f"<th>{k}</th>" for k in keys) + "</tr>")
                for item in items_list:
                    parts.append("<tr>" + "".join(f"<td>{item.get(k,'')}</td>" for k in keys) + "</tr>")
                parts.append("</table>")
        parts.append("</body></html>")
        return "\n".join(parts)

    def _format_attrs(self, item) -> str:
        if not isinstance(item, dict):
            return ""
        skip = {"id", "name", "description"}
        attrs = {k: v for k, v in item.items() if k not in skip}
        return ", ".join(f"{k}={v}" for k, v in list(attrs.items())[:5])

    def _now(self) -> str:
        from datetime import datetime
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")
