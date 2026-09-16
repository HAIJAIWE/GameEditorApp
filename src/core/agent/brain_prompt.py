"""系统提示词与上下文块构建、意图解析 —— AgentBrain 的 BrainPromptMixin 部分

自 brain.py 拆出，方法体逐行原样搬运（逻辑未改动）。
"""
from __future__ import annotations

import json

from common.logger import get_logger
from core.agent.brain_state import BrainState

logger = get_logger()


class BrainPromptMixin(BrainState):
    """系统提示词与上下文块构建、意图解析"""

    def _build_context(self, extra: dict = None) -> dict:
        ctx = dict(extra or {})
        snap = self._frontend_snapshot
        # 数据引用直接从 snapshot 获取（不再从 main_window 内省）
        ctx.setdefault("data_manager", snap.data_manager)
        ctx.setdefault("config", snap.config or self._config)
        # main_window 仅在向后兼容场景下注入（部分旧 skill 仍读取 context["main_window"]）
        if snap.main_window is not None:
            ctx.setdefault("main_window", snap.main_window)
        # 库信息（原 _inject_library_context 逻辑已迁移到 FrontendSnapshot）
        lib_ctx = snap.get_library_context()
        if lib_ctx:
            ctx.setdefault("active_library", lib_ctx.get("active_library"))
            ctx.setdefault("library_path", lib_ctx.get("library_path", ""))
            ctx.setdefault("all_libraries", lib_ctx.get("all_libraries", []))
            if "data_types" in lib_ctx:
                ctx.setdefault("data_types", lib_ctx["data_types"])
            ctx.setdefault("library_summary", snap.build_library_summary())
        return ctx
    def _get_project_context(self, context: dict) -> str:
        """扫描项目数据结构，生成 AI 可读的上下文摘要"""
        dm = context.get("data_manager") or self._frontend_snapshot.data_manager
        if not dm or not hasattr(dm, "data"):
            return ""
        lines = []
        from config.constants import _type_registry
        # 构建复数→单数反向映射（安全处理不规则复数如 stories→story）
        plural_to_singular = {}
        for sing, plur in _type_registry.plurals.items():
            plural_to_singular[plur] = sing
        for plural, items in dm.data.items():
            # 修复 P3-33 顺手补: rstrip("s") bug 在 brain.py 残留 — 改用 _resolve_singular
            singular = plural_to_singular.get(plural)
            if not singular:
                from core.agent.skills.common import _resolve_singular
                singular = _resolve_singular(plural)
            label = _type_registry.get_name(singular)
            count = len(items)
            fields = []
            if items:
                fields = [k for k in items[0].keys() if k not in ("id", "__type")][:8]
            lines.append(
                f"- {label} (type: '{singular}', {count}条) " +
                (f"字段: {', '.join(fields)}" if fields else "")
            )
        return "\n".join(lines)
    def _build_managed_agents_desc(self) -> str:
        """可委派的专业智能体清单描述。"""
        managed_agents_desc = ""
        if self._agent_manager:
            agents_info = []
            for a in self._agent_manager.list_agents():
                if a.id == "boss":
                    continue
                tools_str = ", ".join(a.tools[:4]) if a.tools else "无"
                agents_info.append(f"  - {a.icon} **{a.name}** (`{a.id}`): {a.description} [{tools_str}]")
            managed_agents_desc = (
                "\n## 可委派的专业智能体\n"
                + "\n".join(agents_info)
                + "\n使用 `delegate_to_agent` 工具委派，传入 agent_id。"
            )

        return managed_agents_desc
    def _build_project_context_block(self, context) -> str:
        """当前项目上下文块。"""
        proj_ctx = self._get_project_context(context)
        base_proj = ""
        if proj_ctx:
            base_proj = (
                "## 当前项目\n"
                + proj_ctx
                + "\n- data_type 取值用上面的英文 type\n"
            )

        return base_proj
    def _build_library_context_block(self, context) -> str:
        """当前库信息块。"""
        library_ctx = ""
        if context:
            lib_summary = context.get("library_summary", "")
            if lib_summary:
                library_ctx = f"## 当前库信息\n{lib_summary}\n\n"

        return library_ctx
    def _build_plan_context_block(self, context) -> str:
        """Agent OS 执行计划块。"""
        # Agent OS: 注入 LLM 生成的执行计划
        plan_ctx = ""
        if context:
            plan = context.get("_plan", {})
            steps = plan.get("steps", [])
            if steps:
                plan_lines = [f"## 执行计划（按步骤执行）\n目标: {plan.get('goal', 'N/A')}\n步骤:"]
                for s in steps:
                    plan_lines.append(f"  {s['step']}. {s['tool']}/{s.get('action','?')} → {s.get('reason','?')}")
                plan_ctx = "\n".join(plan_lines) + "\n\n"

        return plan_ctx
    def _build_learnings_block(self) -> str:
        """历史学习经验块（反思循环）。"""
        # Agent OS: 注入历史学习经验（反思循环）
        learnings = self.memory.get_recent_learnings(3)
        if learnings:
            learn_lines = ["## 历史经验（请参考以避免重复错误）"]
            for learning in learnings:
                learn_lines.append(f"- [{learning.get('category','?')}] {learning.get('content','')[:120]}")
            learn_ctx = "\n".join(learn_lines) + "\n\n"
        else:
            learn_ctx = ""

        return learn_ctx
    def _build_execution_system_prompt(self, plan_ctx: str, learn_ctx: str, library_ctx: str, base_proj: str, base: str) -> str:
        """执行模式的完整系统提示词。"""
        return (
            "## 身份\n"
            + plan_ctx + learn_ctx + "你是游戏数据设计与开发助手，同时也是前端界面的管理者，可以直接操控编辑器的标签页、布局和面板。\n\n"
            "## 核心规则\n"
            "0.  每次收到用户消息，先看系统给你的【前端地图】！地图告诉你：当前位置(标记)、所有标签页及数据量、布局模式、面板状态、当前选中数据。不要盲猜！\n"
            "0b.  地图中的[WARN]（弹窗）和[ERR]（终端错误）优先看！有问题先解决弹窗和日志错误，再处理用户请求。\n"
            "0c. 看到[ERR]错误日志或[WARN]弹窗时，主动排查并修复！读文件→分析→改代码→重启，能自动修的就修，修完再干活。\n"
            "0d. 发现错误时先告诉用户「 发现错误，正在修复中...」，修完后打出完整报告： 错误摘要 → 原因 → 修复了什么 → 当前状态。修复前和修复后都要让用户知道。\n"
            "1. 如果是策划方案/设计文档 → 使用 system.ceshu action=run 生成\n"
            "2. 如果是创建游戏数据(怪物/技能/装备等) → 使用 system.game_data\n"
            "3. 优先并行调用独立工具\n"
            "4. 工具失败后反思参数，不要重复相同错误\n"
            "5. 不确定数据时先查询再操作\n"
            "6. 结果太短时主动补充查询验证\n"
            "7. 复杂多步骤任务可使用 system.workflow 创建工作流自动化执行\n\n"
            "## 前端操控（重要！你必须操控界面）\n"
            "你是前端管家，可以操控编辑器的界面。使用 system.ui_control 来控制：\n"
            "- 用户说「打开角色」→ system.ui_control action=switch_tab target=roles\n"
            "- 用户说「看怪物」→ system.ui_control action=switch_tab target=monsters\n"
            "- 用户说「去技能/装备/道具/任务页」→ system.ui_control action=switch_tab target=skills/equips/items/tasks\n"
            "- 用户说「去策划页」→ system.ui_control action=switch_tab target=planning\n"
            "- 用户说「用三栏布局」→ system.ui_control action=set_layout target=三栏界面\n"
            "- 用户说「换三栏界面」→ system.ui_control action=set_layout target=三栏界面\n"
            "- 用户说「打开智能体」→ system.ui_control action=toggle_panel target=智能体\n"
            "- 用户说「切换到XX库」→ system.ui_control action=switch_library target=库名\n"
            " system.ui_control 调用格式: {\"action\": \"switch_tab\", \"target\": \"roles\"} — target 必填！\n"
            " 切换标签页前先看地图！如果地图显示你已在目标页(标记)，无需重复切换。\n"
            " 收到用户指令后，如果涉及查看/编辑某个数据，必须先切换到对应标签页，再操作数据！\n"
            " 示例：「打开角色编辑器，创建一个法师」→ 先看地图确认位置 → 如不在角色页则第一步 system.ui_control action=switch_tab target=roles，第二步 system.game_data action=create data_type=roles name=法师\n\n"
            "## 终端/日志\n"
            "- 你无法直接看到终端输出，但可以在项目目录执行命令\n"
            "- 如果需要查看终端输出，使用 system.execute 运行所需命令\n"
            "- 启动/停止服务器、运行脚本、检查状态都用 system.execute\n\n"
            "## 文件与代码操作\n"
            "- 先看【项目文件地图】，了解项目结构再操作文件\n"
            "- 读文件: system.file_ops action=read path=src/core/agent/brain.py\n"
            "- 写文件: system.file_ops action=write path=xxx content=内容\n"
            "- 浏览目录: system.file_ops action=list path=src/\n"
            "- 搜索代码: system.file_ops action=grep keyword=关键词 path=src/\n"
            "- 执行命令: system.shell action=exec command=python --version\n"
            "- 生成代码: system.code mode=generate description=需求描述\n"
            "- 调试错误: system.code mode=debug error=错误信息\n\n"
            "## 创建游戏数据时\n"
            "- 直接用 system.game_data action=create，不要先查询再创建\n"
            "- 一次性给全所有参数：data_type、name、以及需要的属性值\n"
            "- 属性参考前端地图中显示的  字段 列表\n"
            "- 创建完直接展示结果，效率第一\n"
            + library_ctx + base_proj + base
        )
    def _build_system_prompt(self, is_plan: bool, context: dict = None) -> str:
        managed_agents_desc = self._build_managed_agents_desc()
        base_proj = self._build_project_context_block(context)
        library_ctx = self._build_library_context_block(context)
        plan_ctx = self._build_plan_context_block(context)
        learn_ctx = self._build_learnings_block()

        base = (
            "## 规则\n"
            "1. 使用提供的工具完成任务，优先并行调用独立工具\n"
            "2. 工具失败后反思参数, 不要重复相同错误\n"
            "3. 不确定数据时先查询再操作\n"
            "4. 结果太短时主动补充查询验证\n"
            f"{managed_agents_desc}"
        )

        if is_plan:
            return (
                "你是游戏策划分析助手。主要职责是分析和规划。\n"
                "- 使用 system.ceshu action=run 来生成完整的策划方案\n"
                "- 只查不改，3轮内出方案\n"
                + plan_ctx + learn_ctx + library_ctx + base_proj + base
            )

        return self._build_execution_system_prompt(plan_ctx, learn_ctx, library_ctx, base_proj, base)
    def _identity_prompt(self) -> str:
        identity = self._workspace.read_persona()
        user_profile = self._workspace.read_user_profile()
        if user_profile:
            identity += f"\n\n## 关于你的用户\n{user_profile}"
        return identity
    def _keyword_engine(self, user_input: str, callback, context: dict) -> dict:
        session_ctx = self.memory.get_session_context()
        intent = self.intent_parser.parse(user_input, session_ctx)
        intent = self.learner.refine(intent)

        if intent is None:
            result = {"success": False, "message": "无法解析意图，请重新描述您的需求"}
            self._logger.warning("[Agent] 意图解析返回 None，使用降级响应")
            if callback:
                callback("done", result)
            return result

        self._logger.info(f"[Agent] 意图={intent.action} 置信度={intent.confidence:.0%}")

        # 闲聊/帮助意图无需调度工具，直接回复
        if intent.action in ("chat", "help"):
            if intent.action == "chat":
                message = "你好！我是你的游戏设计助手，有什么可以帮你的吗？"
            else:
                message = "你可以对我说「创建角色」「打开怪物编辑器」「写一个装备系统策划书」等"
            result = {"success": True, "message": message, "data": None}
            self.learner.observe(intent, result, None)
            self.intent_parser.learn_from_execution(
                intent.action, True, user_input
            )
            if callback:
                callback("done", result)
            return result

        params = dict(intent.params)
        params.update(context)

        result = self.dispatcher.execute(intent.action, params, context)
        self.learner.observe(intent, result, None)
        self.intent_parser.learn_from_execution(
            intent.action, bool(result.get("success", False)), user_input
        )

        if callback:
            callback("done", result)

        return result
    def _parse_with_think(self, raw: str) -> tuple:
        import json as _json
        import re as _re
        think = ""
        data = {}
        try:
            first_brace = raw.find("{")
            if first_brace < 0:
                return ("", {})
            json_str = raw[first_brace:]
            json_str = _re.sub(r'```json\s*|```', '', json_str)
            data = _json.loads(json_str)
        except json.JSONDecodeError as e:
            self._logger.warning(f"[Parse] JSON 解析失败 (pos={e.pos}): raw[:200]={raw[:200]}")
            return ("", {})
        except Exception as e:
            self._logger.warning(f"[Parse] 意外异常: {type(e).__name__}: {e} | raw[:200]={raw[:200]}")
            return ("", {})
        if isinstance(data, dict):
            think = str(data.pop("think", data.pop("reasoning", "")))
        return (think, data)
    def _get_intent_hint(self, user_input: str, cached_intent=None) -> str:
        try:
            intent = cached_intent or self.intent_parser.parse(user_input, None)
            if intent and intent.confidence >= 0.6:
                params_str = ", ".join(f"{k}={v}" for k, v in intent.params.items()
                                       if k in ("data_type", "keyword", "count", "name", "filter"))
                hint = f"[系统提示] 建议 tool=system.{intent.action}"
                if params_str:
                    hint += f" ({params_str})"
                # 策划方案直接告诉 LLM 怎么用
                if "planning" in intent.action:
                    if "create" in intent.action:
                        hint += "。调用 system.ceshu action=write name=方案名 content=方案内容。不要查询数据库"
                    elif "update" in intent.action:
                        hint += "。调用 system.ceshu action=select 或 write"
                return hint
        except json.JSONDecodeError:
            self._logger.debug("[IntentHint] JSON解析异常")
        except Exception as e:
            self._logger.warning(f"[IntentHint] 意图提示生成异常: {e}")
        return ""
