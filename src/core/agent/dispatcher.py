from __future__ import annotations

from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
import importlib
import os
from pathlib import Path
import pkgutil
from typing import Optional

from common.logger import get_logger
from core.agent.skill_protocol import BaseSkill


class ToolDispatcher:
    def __init__(self):
        self._logger = get_logger()
        self._skills: dict[str, BaseSkill] = {}
        self._mcp_tools: dict[str, Callable] = {}
        self._subagent_handler: Optional[Callable] = None
        self._fuzzy_index: dict[str, str] = {}

    @property
    def skill_count(self) -> int:
        return len(self._skills) + len(self._mcp_tools)

    @property
    def list_skills(self) -> list[dict]:
        result = []
        for s in self._skills.values():
            result.append({
                "name": s.name,
                "description": s.description,
                "version": s.version,
                "parameters": s.parameters,
                "source": "skill",
            })
        for name, _ in self._mcp_tools.items():
            result.append({
                "name": name,
                "description": f"MCP 外部工具: {name}",
                "version": "1.0.0",
                "parameters": [],
                "source": "mcp",
            })
        return result

    def set_subagent_handler(self, handler: Callable):
        self._subagent_handler = handler

    def register_skill(self, skill: BaseSkill) -> bool:
        if not skill.name:
            self._logger.warning("Cannot register skill without name")
            return False
        self._skills[skill.name] = skill
        self._build_fuzzy_index()
        self._logger.info(f"Registered skill: {skill.name} v{skill.version}")
        return True

    def register_mcp_tools(self):
        try:
            from core.agent.mcp import get_mcp_registry
            mcp = get_mcp_registry()
            if not mcp.is_available():
                self._logger.info("MCP 未配置，跳过注册")
                return
            for name in mcp._tools:
                self._mcp_tools[name] = mcp.call_tool
            self._logger.info(f"Registered {len(self._mcp_tools)} MCP tools")
        except Exception as e:
            self._logger.warning(f"MCP 注册失败: {e}")

    def discover_skills(self, package_path: str = "core.agent.skills") -> int:
        try:
            package = importlib.import_module(package_path)
            pkg_dir = Path(package.__path__[0])
        except (ImportError, AttributeError) as e:
            self._logger.error(f"Cannot discover skills from '{package_path}': {e}")
            return 0

        count = 0
        for _, module_name, is_pkg in pkgutil.iter_modules([str(pkg_dir)]):
            if is_pkg:
                continue
            try:
                full_module_name = f"{package_path}.{module_name}"
                importlib.import_module(full_module_name)
            except Exception as e:
                self._logger.warning(f"Failed to load skill module '{full_module_name}': {e}")

        for cls in BaseSkill.__subclasses__():
            try:
                skill = cls()
                if skill.name:
                    self.register_skill(skill)
                    count += 1
            except Exception as e:
                self._logger.warning(f"Failed to instantiate skill '{cls.__name__}': {e}")

        self._build_fuzzy_index()
        return count

    def _build_fuzzy_index(self):
        self._fuzzy_index.clear()

        for skill in self._skills.values():
            parts = skill.name.replace("system.", "").replace(".", " ").split()
            for part in parts:
                if len(part) >= 3:
                    self._fuzzy_index[part.lower()] = skill.name
            name_words = skill.name.lower().replace(".", " ").replace("_", " ").split()
            for w in name_words:
                if len(w) >= 3 and w not in self._fuzzy_index:
                    self._fuzzy_index[w] = skill.name

            if skill.description:
                desc_words = skill.description.lower().replace("、", " ").replace("，", " ").split()
                for w in desc_words[:10]:
                    w = w.strip()
                    if len(w) >= 4 and w not in self._fuzzy_index:
                        self._fuzzy_index[w] = skill.name

        mappings = {
            "create_item": "system.game_data",
            "create": "system.game_data",
            "add_item": "system.game_data",
            "update_item": "system.game_data",
            "update": "system.game_data",
            "edit": "system.file_ops",
            "modify": "system.game_data",
            "change": "system.game_data",
            "set_field": "system.game_data",
            "delete_item": "system.game_data",
            "delete": "system.file_system",
            "remove": "system.file_system",
            "game_data": "system.game_data",
            "switch": "system.game_data",
            "tab": "system.game_data",
            "read": "system.file_system",
            "write": "system.file_system",
            "list_files": "system.file_system",
            "glob": "system.file_system",
            "grep": "system.file_system",
            "mkdir": "system.file_system",
            "append": "system.file_system",
            "search_replace": "system.file_system",
            "file_system": "system.file_system",
            "file": "system.file_system",
            "shell": "system.shell",
            "exec": "system.shell",
            "command": "system.shell",
            "terminal": "system.shell",
            "bg": "system.shell",
            "background": "system.shell",
            "kill": "system.shell",
            "process": "system.shell",
            "search": "system.web_search",
            "web_search": "system.web_search",
            "code": "system.code",
            "generate": "system.code",
            "preview": "tool.ui_preview",
            "launch": "tool.ui_preview",
            "planning": "system.ceshu",
            "ceshu": "system.ceshu",
            "策划书": "system.ceshu",
            "策划": "system.ceshu",
            "image": "tool.image",
            "draw": "tool.image",
            "picture": "tool.image",
            "export": "tool.export_doc",
            "document": "tool.export_doc",
            "csv": "tool.export_doc",
            "html": "tool.export_doc",
            "balance": "tool.game_balance",
            "analyze": "tool.game_balance",
            "power": "tool.game_balance",
            "stats": "tool.game_balance",
            "ask": "tool.ask_user",
            "question": "tool.ask_user",
            "dialog": "tool.ask_user",
            "choose": "tool.ask_user",
            "answer": "tool.ask_user",
            "todo": "tool.todo_write",
            "task": "tool.todo_write",
            "schedule": "tool.todo_write",
            "checklist": "tool.todo_write",
            "completed": "tool.todo_write",
            "ui": "system.ui_control",
            "界面": "system.ui_control",
            "前端": "system.ui_control",
            "标签页": "system.ui_control",
            "切换标签": "system.ui_control",
            "切换界面": "system.ui_control",
            "切换页面": "system.ui_control",
            "打开角色": "system.ui_control",
            "打开怪物": "system.ui_control",
            "打开技能": "system.ui_control",
            "打开装备": "system.ui_control",
            "控制界面": "system.ui_control",
            "操控界面": "system.ui_control",
            "switch_tab": "system.ui_control",
            "switch_library": "system.ui_control",
            "set_layout": "system.ui_control",
            "toggle_panel": "system.ui_control",
            "get_state": "system.ui_control",
        }
        for key, mapped in mappings.items():
            if key not in self._fuzzy_index:
                self._fuzzy_index[key] = mapped

    def get(self, name: str) -> Optional[BaseSkill]:
        return self._skills.get(name)

    def fuzzy_match(self, name: str) -> Optional[str]:
        if not name:
            return None
        name_lower = name.lower().strip()

        if name_lower in self._skills:
            return name_lower
        if name_lower in self._mcp_tools:
            return name_lower

        candidates = []
        for key, mapped in self._fuzzy_index.items():
            if key in name_lower:
                candidates.append((len(key), key, mapped))
            elif name_lower in key:
                candidates.append((len(key) // 2, key, mapped))

        if not candidates:
            return None

        candidates.sort(key=lambda x: x[0], reverse=True)
        _, best_key, best_mapped = candidates[0]
        self._logger.info(f"模糊匹配: {name} → {best_mapped}")
        return best_mapped

    def get_tools_description(self) -> str:
        lines = ""
        for s in self._skills.values():
            lines += s.get_tool_description() + "\n\n"

        if self._mcp_tools:
            for name in self._mcp_tools:
                lines += f"  - {name}: MCP 外部工具\n"

        if self._subagent_handler:
            lines += "  - system.subagent: 分叉子Agent独立探索数据（只读）\n"

        return lines

    def get_tools_schema_text(self) -> str:
        sections = []
        for s in self._skills.values():
            schema = s.to_json_schema()
            name = schema["name"]
            desc = schema["description"]
            props = schema["parameters"]["properties"]
            required_fields = schema["parameters"].get("required", [])

            example_params = {}
            for pname, pinfo in props.items():
                if "example" in pinfo:
                    example_params[pname] = pinfo["example"]
                elif "default" in pinfo:
                    example_params[pname] = pinfo["default"]
                elif pinfo.get("type") == "string":
                    example_params[pname] = f"<{pname}>"
                elif pinfo.get("type") == "integer":
                    example_params[pname] = 1
                elif pinfo.get("type") == "boolean":
                    example_params[pname] = False
                elif pinfo.get("enum"):
                    example_params[pname] = pinfo["enum"][0]

            import json as _json
            call_example = _json.dumps({"tool": name, "params": example_params}, ensure_ascii=False)

            lines = [f"### {name}"]
            lines.append(f"{desc}")
            lines.append(f"调用: `{call_example}`")
            lines.append("")

            for pname, pinfo in props.items():
                req_mark = " [必填]" if pname in required_fields else ""
                type_str = pinfo.get("type", "string")
                constraints = []
                if "enum" in pinfo:
                    constraints.append(f"可选值: {'|'.join(str(e) for e in pinfo['enum'])}")
                if "default" in pinfo:
                    constraints.append(f"默认: {pinfo['default']}")
                if "minimum" in pinfo:
                    constraints.append(f"最小: {pinfo['minimum']}")
                if "maximum" in pinfo:
                    constraints.append(f"最大: {pinfo['maximum']}")
                constraint_str = f" ({'; '.join(constraints)})" if constraints else ""
                lines.append(f"  {pname}{req_mark} ({type_str}){constraint_str}: {pinfo.get('description', '')}")

            sections.append("\n".join(lines))

        if self._mcp_tools:
            mcp_lines = ["### MCP 外部工具"]
            for name in self._mcp_tools:
                mcp_lines.append(f"  - {name}: MCP 外部工具")
            sections.append("\n".join(mcp_lines))

        return "\n\n".join(sections)

    def get_tools_json_schema(self) -> list:
        return [s.to_json_schema() for s in self._skills.values()]

    def _check_dangerous(self, tool_name: str, action: str) -> bool:
        """Agent OS §11: 检查是否为 SYSTEM 级别高危操作

        Args:
            tool_name: 工具名 (如 "system.shell")
            action: 操作名 (如 "execute")

        Returns:
            True 表示高危需拦截
        """
        from security.acl import TOOL_RISK_MAP, RiskLevel
        risk_map = TOOL_RISK_MAP.get(tool_name, RiskLevel.READ_ONLY)
        if isinstance(risk_map, dict):
            risk = risk_map.get(action, RiskLevel.READ_ONLY)
        else:
            risk = risk_map
        return risk >= RiskLevel.SYSTEM

    def execute(self, tool_name: str, params: dict, context: dict) -> dict:
        # subagent 不参与模糊匹配，直接走子Agent通道
        is_subagent = "subagent" in tool_name
        if is_subagent:
            return self._execute_subagent(params, context)

        resolved = self.fuzzy_match(tool_name)
        if not resolved:
            return {"success": False, "error": f"未知工具: {tool_name}", "message": ""}

        is_mcp = resolved in self._mcp_tools

        params = self._fix_params(resolved, dict(params or {}))

        # Agent OS 安全层：高危操作确认
        # 修复 P2-28: 读取 brain 写入的 _danger_confirmed，匹配则放行
        action = params.get("action", "")
        if self._check_dangerous(resolved, action):
            confirmed = context.get("_danger_confirmed") if isinstance(context, dict) else None
            if isinstance(confirmed, tuple) and confirmed == (resolved, action):
                # 用户已在 brain 层确认本次危险操作，放行并清除标记避免重复使用
                context["_danger_confirmed"] = None
                self._logger.info(f"[ACL] 已确认危险操作，放行: {resolved}/{action}")
            else:
                self._logger.warning(f"[ACL] 拦截高危操作: {resolved}/{action}")
                return {"success": False, "error": f"高危操作需用户确认: {resolved}/{action}", "message": ""}

        if is_mcp:
            try:
                result = self._mcp_tools[resolved](resolved, params)
                return self._normalize_result(result)
            except Exception as e:
                self._logger.error(f"MCP 工具执行异常: {resolved} {e}")
                return {"success": False, "error": str(e), "message": ""}

        skill = self._skills.get(resolved)
        if not skill:
            return {"success": False, "error": f"未注册技能: {resolved}", "message": ""}

        try:
            result = skill.execute(params, context)
            return self._normalize_result(result)
        except Exception as e:
            self._logger.error(f"工具执行异常: {resolved} {e}", exc_info=True)
            return {"success": False, "error": str(e), "message": ""}

    def execute_parallel(self, tool_requests: list, context: dict) -> str:
        ordered = self._topo_sort(tool_requests)

        # 修复 P2-29: 拆分主线程组（UI 类 skill）与并行组
        # - 主线程组: skill.REQUIRES_MAIN_THREAD=True，必须在 GUI 主线程执行，否则 PyQt 崩
        # - 并行组: 其余 skill 可在 worker 线程并行；每个线程获得 context 浅拷贝避免竞态写入
        main_thread_group: list = []
        parallel_group: list = []
        for tn, tp in ordered:
            skill = self._skills.get(self.fuzzy_match(tn))
            if skill is not None and getattr(skill, "REQUIRES_MAIN_THREAD", False):
                main_thread_group.append((tn, tp))
            else:
                parallel_group.append((tn, tp))

        all_msgs: list = []

        # 1) 主线程组：串行执行
        for tn, tp in main_thread_group:
            try:
                r = self.execute(tn, tp, context)
                msg = r.get("message", "") or ""
                if not r.get("success") and r.get("error"):
                    msg = f"[错误] {r['error']}"
                all_msgs.append(f"[{tn}] {msg[:500]}")
                self._logger.info(f"主线程执行: {tn} → {msg[:80]}")
            except Exception as e:
                all_msgs.append(f"[{tn}] 异常: {e}")

        # 2) 并行组：worker 线程池，每个线程拿到 context 浅拷贝
        def _run_one(tn, tp, ctx_copy):
            orig_tn = tn
            r = self.execute(tn, tp, ctx_copy)
            msg = r.get("message", "") or ""
            if not r.get("success") and r.get("error"):
                msg = f"[错误] {r['error']}"
            return f"[{orig_tn}] {msg[:500]}"

        if parallel_group:
            workers = min(len(parallel_group), max(2, (os.cpu_count() or 4)))
            self._logger.info(
                f"[Parallel] 主线程组 {len(main_thread_group)} / 并行组 {len(parallel_group)} (workers={workers})"
            )
            with ThreadPoolExecutor(max_workers=workers) as pool:
                futures = {}
                for tn, tp in parallel_group:
                    # 浅拷贝 context，避免多线程同时写 _danger_confirmed 等字段
                    ctx_copy = dict(context) if isinstance(context, dict) else context
                    futures[pool.submit(_run_one, tn, tp, ctx_copy)] = tn

                for future in as_completed(futures):
                    tn = futures[future]
                    try:
                        msg = future.result(timeout=30)
                        all_msgs.append(msg)
                        self._logger.info(f"并行完成: {tn} → {msg[:80]}")
                    except Exception as e:
                        all_msgs.append(f"[{tn}] 超时或异常: {e}")

        return "\n".join(all_msgs)

    def _execute_subagent(self, params: dict, context: dict) -> dict:
        if not self._subagent_handler:
            return {"success": False, "error": "SubAgent 功能未初始化", "message": ""}
        task = params.get("task", params.get("prompt", params.get("query", "")))
        if not task:
            return {"success": False, "error": "缺少 task 参数", "message": ""}
        try:
            result = self._subagent_handler(task, context)
            return self._normalize_result(result)
        except Exception as e:
            return {"success": False, "error": f"SubAgent 执行异常: {e}", "message": ""}

    def _topo_sort(self, tool_requests: list) -> list:
        """拓扑排序 — 根据技能 depends_on 声明，有依赖的工具排在依赖之后"""
        if len(tool_requests) <= 1:
            return list(tool_requests)

        ordered: list = []
        visited: set = set()
        temp_mark: set = set()

        def visit(n: str):
            if n in visited:
                return
            if n in temp_mark:
                return
            temp_mark.add(n)
            for dep in dep_map.get(n, ()):
                if dep in visited:
                    continue
                if dep in name_set:
                    visit(dep)
            temp_mark.discard(n)
            visited.add(n)
            ordered.append(n)

        dep_map: dict = {}
        name_set: set = {tn for tn, _ in tool_requests}
        for tn, tp in tool_requests:
            skill = self._skills.get(self.fuzzy_match(tn) or tn)
            if skill and skill.depends_on:
                relevant = [d for d in skill.depends_on if d in name_set]
                if relevant:
                    dep_map[tn] = tuple(relevant)

        for tn, _ in tool_requests:
            if tn not in visited:
                visit(tn)

        lookup = dict(tool_requests)
        return [(tn, lookup[tn]) for tn in ordered if tn in lookup]

    @staticmethod
    def _normalize_result(result) -> dict:
        if isinstance(result, dict):
            if "success" in result and "message" in result:
                normalized = dict(result)
                normalized.setdefault("_raw", result)
                return normalized
            msg = result.get("message", str(result.get("data", str(result))))
            return {
                "success": result.get("success", True),
                "message": msg,
                "data": result.get("data"),
                "_raw": result,
            }

        from core.agent.models import SkillResult
        if isinstance(result, SkillResult):
            raw_data = {"data": result.data, "error": result.error} if hasattr(result, 'data') else {}
            return {
                "success": result.success,
                "message": str(result.data) if result.data else result.error or "",
                "data": result.data,
                "error": result.error or "",
                "_raw": raw_data,
            }

        return {"success": True, "message": str(result), "data": None, "_raw": {"value": str(result)}}

    @staticmethod
    def _fix_params(tool_name: str, params: dict) -> dict:
        params = dict(params) if params else {}

        if "action" not in params:
            if "system.game_data" in tool_name:
                if params.get("keyword") or params.get("sort_by"):
                    params["action"] = "query"
                elif params.get("data_type") and not params.get("item_id"):
                    if params.get("field") or params.get("value"):
                        params["action"] = "update"
                    elif params.get("name"):
                        params["action"] = "create"
                    else:
                        params["action"] = "list"
                elif params.get("item_id"):
                    params["action"] = "update"
            elif "system.shell" in tool_name:
                params["action"] = "exec"
            elif "system.file_ops" in tool_name:
                if params.get("content") or (params.get("path") and not params.get("pattern")):
                    params["action"] = "write"
                elif params.get("pattern"):
                    params["action"] = "grep"
                else:
                    params["action"] = "read"
            elif "system.code" in tool_name:
                params["action"] = "generate"
            elif "system.ui_control" in tool_name:
                if params.get("data_type") or params.get("type") or params.get("category"):
                    params["action"] = "switch_tab"
                elif params.get("lib") or params.get("library"):
                    params["action"] = "switch_library"
                elif params.get("layout") or params.get("mode"):
                    params["action"] = "set_layout"
                elif params.get("panel") or params.get("toggle"):
                    params["action"] = "toggle_panel"
                else:
                    params["action"] = "get_state"

        param_aliases = {
            "data_type": ["data_type", "type", "category", "kind"],
            "field": ["field", "attr", "attribute", "prop", "property", "column"],
            "value": ["value", "val", "new_value"],
            "name": ["name", "title", "label", "item_name", "prefix"],
            "target": ["target"],
            "new_name": ["new_name", "rename_to", "target_name"],
            "filter": ["filter", "condition", "conditions", "where"],
            "sort_by": ["sort_by", "sort", "order_by"],
            "sort_order": ["sort_order", "order", "direction"],
            "confirm": ["confirm", "confirmed", "sure"],
            "keyword": ["keyword", "search", "q", "query"],
            "limit": ["limit", "top", "count", "n"],
        }
        for target, aliases in param_aliases.items():
            if target not in params:
                for alias in aliases:
                    if alias in params:
                        params[target] = params.pop(alias)
                        break

        return params

    def clear(self):
        self._skills.clear()
        self._mcp_tools.clear()
        self._fuzzy_index.clear()
