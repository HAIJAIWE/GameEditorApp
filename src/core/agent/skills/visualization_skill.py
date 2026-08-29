from __future__ import annotations

import json

from core.agent.skill_protocol import BaseSkill


class VisualizationSkill(BaseSkill):
    name = "system.visualization"
    NAME = "system.visualization"
    DESCRIPTION = "推理可视化：导出思维链、工具调用链路、性能统计的可视化数据。用于调试和分析 Agent 行为。"
    PARAMS_SCHEMA = {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["export_think_log", "export_timeline", "export_stats", "diff_sessions"],
                "description": "动作：export_think_log=导出思维链, export_timeline=导出工具调用时间线, export_stats=导出性能统计, diff_sessions=对比两个会话"
            },
            "think_log": {
                "type": "array",
                "description": "思维日志列表 (action=export_think_log)"
            },
            "tool_trace": {
                "type": "array",
                "description": "工具调用追踪列表 (action=export_timeline)"
            },
            "format": {
                "type": "string",
                "enum": ["json", "markdown", "mermaid", "html"],
                "description": "导出格式",
                "default": "markdown"
            },
        },
        "required": ["action"]
    }

    def execute(self, params: dict, context: dict = None) -> dict:
        action = params.get("action", "export_think_log")
        fmt = params.get("format", "markdown")

        if action == "export_think_log":
            return self._export_think_log(params.get("think_log", []), fmt)
        elif action == "export_timeline":
            return self._export_timeline(params.get("tool_trace", []), fmt)
        elif action == "export_stats":
            return self._export_stats(params, fmt)
        elif action == "diff_sessions":
            return self._diff_sessions(params)
        else:
            return {"success": False, "error": f"未知 action: {action}"}

    @staticmethod
    def _export_think_log(think_log: list, fmt: str) -> dict:
        if not think_log:
            return {"success": True, "data": "", "message": "无思维日志"}

        if fmt == "markdown":
            lines = ["# Agent 思维链\n"]
            for i, entry in enumerate(think_log):
                lines.append(f"## 第{i+1}步\n")
                if isinstance(entry, dict):
                    for k, v in entry.items():
                        lines.append(f"- **{k}**: {str(v)[:300]}")
                else:
                    lines.append(str(entry)[:500])
                lines.append("")
            data = "\n".join(lines)

        elif fmt == "mermaid":
            lines = ["```mermaid", "graph TD"]
            for i in range(len(think_log)):
                node_id = f"step_{i+1}"
                label = str(think_log[i])[:50].replace('"', "'")
                lines.append(f"  {node_id}[\"{label}\"]")
                if i > 0:
                    lines.append(f"  step_{i} --> {node_id}")
            lines.append("```")
            data = "\n".join(lines)

        elif fmt == "html":
            items = ""
            for i, entry in enumerate(think_log):
                items += f'<div class="think-step"><h3>步骤{i+1}</h3><pre>{str(entry)[:500]}</pre></div>'
            data = f'<html><body><h1>思维链</h1><div class="think-log">{items}</div></body></html>'
        else:
            data = json.dumps(think_log, ensure_ascii=False, indent=2)

        return {"success": True, "format": fmt, "data": data, "steps": len(think_log)}

    @staticmethod
    def _export_timeline(tool_trace: list, fmt: str) -> dict:
        if not tool_trace:
            return {"success": True, "data": "", "message": "无工具调用记录"}

        if fmt == "markdown":
            lines = ["# 工具调用时间线\n", "| 序号 | 时间 | 工具 | 耗时 | 成功 |", "|------|------|------|------|------|"]
            for i, entry in enumerate(tool_trace):
                if isinstance(entry, dict):
                    lines.append(
                        f"| {i+1} | {entry.get('time','')} | {entry.get('tool','')} | "
                        f"{entry.get('duration','')} | {entry.get('success','')} |"
                    )
            data = "\n".join(lines)
        elif fmt == "mermaid":
            lines = ["```mermaid", "timeline"]
            lines.append("  title 工具调用时间线")
            for i, entry in enumerate(tool_trace):
                ts = entry.get("time", "") if isinstance(entry, dict) else ""
                tool = entry.get("tool", "") if isinstance(entry, dict) else str(entry)
                lines.append(f"  {ts} : {tool}")
            lines.append("```")
            data = "\n".join(lines)
        else:
            data = json.dumps(tool_trace, ensure_ascii=False, indent=2)

        return {"success": True, "format": fmt, "data": data, "total_calls": len(tool_trace)}

    @staticmethod
    def _export_stats(params: dict, fmt: str) -> dict:
        total_llm_calls = params.get("total_llm_calls", 0)
        total_tool_calls = params.get("total_tool_calls", 0)
        total_tokens = params.get("total_tokens", 0)
        avg_iteration = params.get("avg_iteration", 0)
        success_rate = params.get("success_rate", 0)

        if fmt == "markdown":
            data = (
                f"# Agent 性能统计\n\n"
                f"| 指标 | 值 |\n|------|-----|\n"
                f"| LLM 调用次数 | {total_llm_calls} |\n"
                f"| 工具调用次数 | {total_tool_calls} |\n"
                f"| 总 Token 消耗 | {total_tokens} |\n"
                f"| 平均迭代轮数 | {avg_iteration} |\n"
                f"| 成功率 | {success_rate:.0%} |\n"
            )
        else:
            data = json.dumps({
                "total_llm_calls": total_llm_calls,
                "total_tool_calls": total_tool_calls,
                "total_tokens": total_tokens,
                "avg_iteration": avg_iteration,
                "success_rate": success_rate,
            }, ensure_ascii=False, indent=2)

        return {"success": True, "format": fmt, "data": data}

    @staticmethod
    def _diff_sessions(params: dict) -> dict:
        session_a = params.get("session_a", {})
        session_b = params.get("session_b", {})
        diffs = []
        for key in set(session_a.keys()) | set(session_b.keys()):
            a = session_a.get(key, 0)
            b = session_b.get(key, 0)
            if a != b:
                diffs.append({"metric": key, "session_a": a, "session_b": b, "delta": b - a})
        return {
            "success": True,
            "diffs": diffs,
            "message": f"发现 {len(diffs)} 项差异" if diffs else "两个会话指标完全相同",
        }
